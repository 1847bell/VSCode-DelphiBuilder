import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { CompilerRunner } from "../compiler/compilerRunner";
import { parseCompilerDiagnostics } from "../compiler/diagnosticParser";
import { resolveOutputEncoding } from "../compiler/outputEncoding";
import { BuildPlan, CompilerDiagnostic } from "../core/types";
import { ProjectAccess } from "./config";

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface BuildJobSummary {
  jobId: string;
  state: JobState;
}

export interface BuildJobStatus extends BuildJobSummary {
  log: string;
  totalLength: number;
  nextOffset: number;
  result?: JobResult;
  diagnostics: CompilerDiagnostic[];
  expectedArtifacts: string[];
  existingArtifacts: string[];
  error?: string;
}

export interface JobResult {
  stage: "resource" | "compiler" | "preparation";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  cancelled: boolean;
}

interface Job {
  id: string;
  plan: BuildPlan;
  state: JobState;
  logs: string;
  diagnostics: CompilerDiagnostic[];
  result?: JobResult;
  error?: string;
  release: () => void;
  runner: CompilerRunner;
  cancelRequested: boolean;
  cancelTimer?: NodeJS.Timeout;
  cancellationInFlight?: Promise<void>;
  task?: Promise<void>;
}

export class BuildJobs {
  private readonly jobs = new Map<string, Job>();
  private closed = false;
  private closing?: Promise<void>;
  private readonly completed: string[] = [];

  public constructor(
    private readonly access: ProjectAccess,
    private readonly outputEncoding: "system" | "cp936" | "utf8"
  ) {}

  public start(plan: BuildPlan): BuildJobSummary {
    if (this.closed) throw new Error("Build service is closed");
    const release = this.access.lock(plan.projectFile);
    const job: Job = {
      id: randomUUID(),
      plan,
      state: "queued",
      logs: "",
      diagnostics: [],
      release,
      runner: new CompilerRunner(),
      cancelRequested: false
    };
    this.jobs.set(job.id, job);
    job.task = Promise.resolve().then(() => this.execute(job));
    return { jobId: job.id, state: job.state };
  }

  public get(jobId: string, offset = 0, limit = 16384): BuildJobStatus {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("Log offset must be non-negative and limit must be positive integers");
    }
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown build job: ${jobId}`);
    const start = Math.min(offset, job.logs.length);
    const end = Math.min(start + limit, job.logs.length);
    const response: BuildJobStatus = {
      jobId: job.id,
      state: job.state,
      log: job.logs.slice(start, end),
      totalLength: job.logs.length,
      nextOffset: end,
      diagnostics: job.diagnostics,
      expectedArtifacts: [...job.plan.expectedArtifacts],
      existingArtifacts: job.plan.expectedArtifacts.filter(existsSync)
    };
    if (job.result) response.result = job.result;
    if (job.error) response.error = job.error;
    return response;
  }

  public async cancel(jobId: string): Promise<{ jobId: string; state: JobState; cancelled: boolean }> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown build job: ${jobId}`);
    if (job.state === "succeeded" || job.state === "failed" || job.state === "cancelled") {
      return { jobId, state: job.state, cancelled: false };
    }
    job.cancelRequested = true;
    await this.requestCancel(job);
    return { jobId, state: job.state, cancelled: true };
  }

  public close(): Promise<void> {
    this.closed = true;
    this.closing ??= (async () => {
      const active = [...this.jobs.values()].filter((job) => !this.isTerminal(job.state));
      await Promise.allSettled(active.map((job) => this.cancel(job.id)));
      await Promise.allSettled(active.map((job) => job.task));
    })();
    return this.closing;
  }

  private async execute(job: Job): Promise<void> {
    const startedAt = Date.now();
    let terminalState: JobState = "failed";
    job.state = "running";
    try {
      const encoding = await resolveOutputEncoding(this.outputEncoding);
      await this.access.assertBuildPaths(job.plan);
      if (job.cancelRequested) {
        job.result = {
          stage: "preparation", exitCode: null, signal: null,
          durationMs: Date.now() - startedAt, cancelled: true
        };
        terminalState = "cancelled";
        return;
      }
      const coreResult = await job.runner.run(job.plan, encoding, (text) => {
        job.logs += text;
      });
      job.result = {
        stage: coreResult.stage,
        exitCode: coreResult.exitCode,
        signal: coreResult.signal,
        durationMs: coreResult.durationMs,
        cancelled: coreResult.cancelled || job.cancelRequested
      };
      job.diagnostics = coreResult.stage === "compiler"
        ? parseCompilerDiagnostics(coreResult.output, job.plan.workingDirectory, job.plan.projectFile)
        : [];
      terminalState = coreResult.cancelled || job.cancelRequested
        ? "cancelled"
        : coreResult.exitCode === 0 ? "succeeded" : "failed";
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.result = {
        stage: "preparation",
        exitCode: null,
        signal: null,
        durationMs: Date.now() - startedAt,
        cancelled: job.cancelRequested
      };
      terminalState = job.cancelRequested ? "cancelled" : "failed";
    } finally {
      clearInterval(job.cancelTimer);
      job.cancelTimer = undefined;
      await job.cancellationInFlight;
      job.release();
      job.state = terminalState;
      this.completed.push(job.id);
      while (this.completed.length > 50) this.jobs.delete(this.completed.shift()!);
    }
  }

  private async requestCancel(job: Job): Promise<void> {
    if (!job.cancelTimer && !this.isTerminal(job.state)) {
      job.cancelTimer = setInterval(() => {
        void this.cancelChild(job);
      }, 25);
    }
    await this.cancelChild(job);
  }

  private async cancelChild(job: Job): Promise<void> {
    if (!job.runner.running || this.isTerminal(job.state)) return;
    if (!job.cancellationInFlight) {
      job.cancellationInFlight = job.runner.cancel().then(() => undefined).catch((error: unknown) => {
        job.error = error instanceof Error ? error.message : String(error);
      }).finally(() => {
        job.cancellationInFlight = undefined;
      });
    }
    await job.cancellationInFlight;
  }

  private isTerminal(state: JobState): boolean {
    return state === "succeeded" || state === "failed" || state === "cancelled";
  }

}
