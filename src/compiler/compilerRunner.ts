import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import iconv from "iconv-lite";
import { BuildPlan, BuildResult } from "../core/types";

export class CompilerRunner {
  private child: ChildProcessWithoutNullStreams | undefined;
  private cancellationRequested = false;

  public get running(): boolean {
    return this.child !== undefined;
  }

  public async run(
    plan: BuildPlan,
    encoding: string,
    onOutput: (text: string) => void
  ): Promise<BuildResult> {
    if (this.child) {
      throw new Error("This compiler runner is already running.");
    }
    await assertFileExists(plan.compilerPath, "DCC32.exe");
    await assertFileExists(plan.mainSource, "Main source");
    await prepareOutputDirectories(plan);

    this.cancellationRequested = false;
    const startedAt = Date.now();
    const output: string[] = [];
    const child = spawn(plan.compilerPath, plan.arguments, {
      cwd: plan.workingDirectory,
      env: plan.environment,
      shell: false,
      windowsHide: true
    });
    this.child = child;

    const stdoutDecoder = iconv.decodeStream(encoding);
    const stderrDecoder = iconv.decodeStream(encoding);
    const capture = (text: string): void => {
      output.push(text);
      onOutput(text);
    };
    stdoutDecoder.on("data", capture);
    stderrDecoder.on("data", capture);
    child.stdout.pipe(stdoutDecoder);
    child.stderr.pipe(stderrDecoder);

    try {
      const { exitCode, signal } = await waitForProcess(child);
      await Promise.allSettled([finished(stdoutDecoder), finished(stderrDecoder)]);
      return {
        exitCode,
        signal,
        output: output.join(""),
        durationMs: Date.now() - startedAt,
        cancelled: this.cancellationRequested
      };
    } finally {
      this.child = undefined;
    }
  }

  public async cancel(): Promise<boolean> {
    const child = this.child;
    if (!child?.pid) {
      return false;
    }
    this.cancellationRequested = true;

    if (process.platform !== "win32") {
      return child.kill("SIGTERM");
    }
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore"
      });
      killer.once("error", () => {
        child.kill();
        resolve();
      });
      killer.once("close", () => resolve());
    });
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
    throw new Error(`${label} was not found: ${file}`);
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
  await Promise.all([...directories].map((directory) => mkdir(directory, { recursive: true })));
}
