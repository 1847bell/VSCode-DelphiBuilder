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
  warnings: string[];
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

  public start(plan: BuildPlan, signal?: AbortSignal): BuildJobSummary {
    if (this.closed) throw new Error("Build service is closed");
    const release = this.access.lock(plan.projectFile);
    const job: Job = {
      id: randomUUID(), plan, state: "queued", logs: "", diagnostics: [], release,
      runner: new CompilerRunner(), cancelRequested: signal?.aborted ?? false
    };
    this.jobs.set(job.id, job);
    job.task = Promise.resolve().then(() => this.execute(job, signal));
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
      warnings: [...job.plan.warnings],
      expectedArtifacts: [...job.plan.expectedArtifacts],
      existingArtifacts: job.plan.expectedArtifacts.filter((file) => existsSync(file))
    };
    if (job.result) response.result = job.result;
    if (job.error) response.error = job.error;
    return response;
  }

  public async cancel(jobId: string): Promise<{ jobId: string; state: JobState; cancelled: boolean }> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown build job: ${jobId}`);
    if (this.isTerminal(job.state)) return { jobId, state: job.state, cancelled: false };
    job.cancelRequested = true;
    if (!job.cancellationInFlight) {
      job.cancellationInFlight = job.runner.cancel().then(() => undefined).catch((error: unknown) => {
        job.error = error instanceof Error ? error.message : String(error);
      }).finally(() => { job.cancellationInFlight = undefined; });
    }
    await job.cancellationInFlight;
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

  private async execute(job: Job, signal?: AbortSignal): Promise<void> {
    const startedAt = Date.now();
    let terminalState: JobState = "failed";
    job.state = "running";
    const onAbort = (): void => { void this.cancel(job.id).catch(() => undefined); };
    signal?.addEventListener("abort", onAbort, { once: true });
    job.cancelRequested ||= signal?.aborted ?? false;
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
      }, signal);
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
      signal?.removeEventListener("abort", onAbort);
      await job.cancellationInFlight;
      job.release();
      job.state = terminalState;
      this.completed.push(job.id);
      while (this.completed.length > 50) this.jobs.delete(this.completed.shift()!);
    }
  }

  private isTerminal(state: JobState): boolean {
    return state === "succeeded" || state === "failed" || state === "cancelled";
  }

}
