import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import iconv from "iconv-lite";
import { BuildPlan, BuildResult } from "../core/types";
import { localize } from "../localization/localizer";
import { MINIMAL_PROJECT_RESOURCE, updateVersionResource } from "./versionResource";

export class CompilerRunner {
  private child?: ChildProcessWithoutNullStreams;
  private cancellationInFlight?: Promise<void>;
  private cancellationRequested = false;
  private active = false;

  public get running(): boolean { return this.active; }

  public async run(plan: BuildPlan, encoding: string, onOutput: (text: string) => void, signal?: AbortSignal): Promise<BuildResult> {
    if (this.active) throw new Error(localize("compiler.error.alreadyRunning"));
    this.active = true;
    this.cancellationRequested = signal?.aborted ?? false;
    const onAbort = (): void => { void this.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const startedAt = Date.now();
    const output: string[] = [];
    const capture = (text: string): void => { output.push(text); onOutput(text); };
    const cancelled = (stage: "resource" | "compiler"): BuildResult => ({ stage, exitCode: null, signal: null, output: output.join(""), durationMs: Date.now() - startedAt, cancelled: true });
    try {
      if (this.cancellationRequested) return cancelled("resource");
      await assertFileExists(plan.compilerPath, path.basename(plan.compilerPath) || localize("compiler.label.delphi"));
      if (this.cancellationRequested) return cancelled("resource");
      await assertFileExists(plan.mainSource, localize("compiler.label.mainSource"));
      if (this.cancellationRequested) return cancelled("resource");
      for (const step of plan.resourceBuild ?? []) {
        await assertFileExists(step.executable, "BRCC32.exe");
        if (this.cancellationRequested) return cancelled("resource");
        await assertFileExists(step.input, localize("compiler.label.resourceSource"));
        if (this.cancellationRequested) return cancelled("resource");
      }
      await prepareOutputDirectories(plan);
      if (this.cancellationRequested) return cancelled("resource");
      if (plan.projectResource) {
        const created = await ensureProjectResource(plan.projectResource.output, () => this.cancellationRequested);
        if (this.cancellationRequested) return cancelled("resource");
        capture(`${localize("compiler.output.projectResource", { action: localize(created ? "compiler.output.created" : "compiler.output.existing"), path: plan.projectResource.output })}\n`);
      }
      for (const step of plan.resourceBuild ?? []) {
        if (this.cancellationRequested) return cancelled("resource");
        capture(`${localize("compiler.output.resourceBuild", { source: path.basename(step.input) })}\n`);
        const resourceResult = await this.runProcess(step.executable, step.arguments, plan, encoding, capture);
        if (resourceResult.exitCode !== 0 || this.cancellationRequested) return { stage: "resource", ...resourceResult, output: output.join(""), durationMs: Date.now() - startedAt, cancelled: this.cancellationRequested };
      }
      if (plan.projectResource?.versionInfo) {
        if (this.cancellationRequested) return cancelled("resource");
        const { output: resourceFile, versionInfo } = plan.projectResource;
        const original = await readFile(resourceFile);
        if (this.cancellationRequested) return cancelled("resource");
        const updated = updateVersionResource(original, versionInfo);
        if (this.cancellationRequested) return cancelled("resource");
        if (!original.equals(updated)) await writeFile(resourceFile, updated);
        if (this.cancellationRequested) return cancelled("resource");
        capture(`${localize("compiler.output.versionResource", { version: versionInfo.fileVersion.join("."), path: resourceFile })}\n`);
      }
      if (this.cancellationRequested) return cancelled("compiler");
      capture(`${localize("compiler.output.delphiCompile", { compiler: path.basename(plan.compilerPath) })}\n`);
      const compilerResult = await this.runProcess(plan.compilerPath, plan.arguments, plan, encoding, capture);
      return { stage: "compiler", ...compilerResult, output: output.join(""), durationMs: Date.now() - startedAt, cancelled: this.cancellationRequested };
    } finally {
      signal?.removeEventListener("abort", onAbort);
      try {
        await this.cancellationInFlight;
      } finally {
        this.cancellationInFlight = undefined;
        this.active = false;
      }
    }
  }

  private async runProcess(executable: string, arguments_: string[], plan: BuildPlan, encoding: string, capture: (text: string) => void): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    if (this.cancellationRequested) return { exitCode: null, signal: null };
    const child = spawn(executable, arguments_, { cwd: plan.workingDirectory, env: plan.environment, shell: false, windowsHide: true });
    this.child = child;
    const stdoutDecoder = iconv.decodeStream(encoding);
    const stderrDecoder = iconv.decodeStream(encoding);
    stdoutDecoder.on("data", capture); stderrDecoder.on("data", capture);
    child.stdout.pipe(stdoutDecoder); child.stderr.pipe(stderrDecoder);
    try {
      const result = await waitForProcess(child);
      await Promise.allSettled([finished(stdoutDecoder), finished(stderrDecoder)]);
      return result;
    } finally { this.child = undefined; }
  }

  public async cancel(): Promise<boolean> {
    if (!this.active) return false;
    this.cancellationRequested = true;
    const child = this.child;
    if (!child?.pid) return true;
    if (process.platform !== "win32") {
      child.kill("SIGTERM");
      return true;
    }
    this.cancellationInFlight ??= new Promise<void>((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
      killer.once("error", () => { child.kill(); resolve(); });
      killer.once("close", () => resolve());
    });
    await this.cancellationInFlight;
    return true;
  }
}

function waitForProcess(
  child: ChildProcessWithoutNullStreams
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

async function assertFileExists(file: string, label: string): Promise<void> {
  try {
    await access(file);
  } catch {
    throw new Error(localize("compiler.error.fileMissing", { label, file }));
  }
}

async function prepareOutputDirectories(plan: BuildPlan): Promise<void> {
  const directories = new Set<string>();
  for (const artifact of plan.expectedArtifacts) {
    directories.add(path.dirname(artifact));
  }
  for (const argument of plan.arguments) {
    const match = argument.match(/^-(?:E|N0|LE|LN)(.+)$/i);
    if (match) {
      directories.add(match[1]);
    }
  }
  for (const step of plan.resourceBuild ?? []) {
    directories.add(path.dirname(step.output));
  }
  if (plan.projectResource) {
    directories.add(path.dirname(plan.projectResource.output));
  }
  await Promise.all([...directories].map((directory) => mkdir(directory, { recursive: true })));
}

async function ensureProjectResource(output: string, cancelled: () => boolean): Promise<boolean> {
  if (cancelled()) return false;
  try {
    await access(output);
    return false;
  } catch {
    // Continue and create the missing project resource without replacing an existing file.
  }
  if (cancelled()) return false;
  try {
    await writeFile(output, MINIMAL_PROJECT_RESOURCE, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}
