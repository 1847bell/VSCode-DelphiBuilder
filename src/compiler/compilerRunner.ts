import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import iconv from "iconv-lite";
import { BuildPlan, BuildResult } from "../core/types";
import { localize } from "../localization/localizer";

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
      throw new Error(localize("compiler.error.alreadyRunning"));
    }
    await assertFileExists(
      plan.compilerPath,
      path.basename(plan.compilerPath) || localize("compiler.label.delphi")
    );
    await assertFileExists(plan.mainSource, localize("compiler.label.mainSource"));
    if (plan.resourceBuild) {
      for (const step of plan.resourceBuild) {
        await assertFileExists(step.executable, "BRCC32.exe");
        await assertFileExists(step.input, localize("compiler.label.resourceSource"));
      }
    }
    await prepareOutputDirectories(plan);

    this.cancellationRequested = false;
    const startedAt = Date.now();
    const output: string[] = [];
    const capture = (text: string): void => {
      output.push(text);
      onOutput(text);
    };

    if (plan.projectResource) {
      const created = await ensureProjectResource(plan.projectResource.output);
      capture(`${localize("compiler.output.projectResource", {
        action: localize(created ? "compiler.output.created" : "compiler.output.existing"),
        path: plan.projectResource.output
      })}\n`);
    }

    for (const step of plan.resourceBuild ?? []) {
      capture(`${localize("compiler.output.resourceBuild", {
        source: path.basename(step.input)
      })}\n`);
      const resourceResult = await this.runProcess(
        step.executable,
        step.arguments,
        plan,
        encoding,
        capture
      );
      if (resourceResult.exitCode !== 0 || this.cancellationRequested) {
        return {
          stage: "resource",
          ...resourceResult,
          output: output.join(""),
          durationMs: Date.now() - startedAt,
          cancelled: this.cancellationRequested
        };
      }
    }

    capture(`${localize("compiler.output.delphiCompile", {
      compiler: path.basename(plan.compilerPath)
    })}\n`);
    const compilerResult = await this.runProcess(
      plan.compilerPath,
      plan.arguments,
      plan,
      encoding,
      capture
    );
    return {
      stage: "compiler",
      ...compilerResult,
      output: output.join(""),
      durationMs: Date.now() - startedAt,
      cancelled: this.cancellationRequested
    };
  }

  private async runProcess(
    executable: string,
    arguments_: string[],
    plan: BuildPlan,
    encoding: string,
    capture: (text: string) => void
  ): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    const child = spawn(executable, arguments_, {
      cwd: plan.workingDirectory,
      env: plan.environment,
      shell: false,
      windowsHide: true
    });
    this.child = child;
    const stdoutDecoder = iconv.decodeStream(encoding);
    const stderrDecoder = iconv.decodeStream(encoding);
    stdoutDecoder.on("data", capture);
    stderrDecoder.on("data", capture);
    child.stdout.pipe(stdoutDecoder);
    child.stderr.pipe(stderrDecoder);
    try {
      const result = await waitForProcess(child);
      await Promise.allSettled([finished(stdoutDecoder), finished(stderrDecoder)]);
      return result;
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

async function ensureProjectResource(output: string): Promise<boolean> {
  try {
    await access(output);
    return false;
  } catch {
    // Continue and create the missing project resource without replacing an existing file.
  }
  try {
    await writeFile(output, MINIMAL_PROJECT_RESOURCE, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

// Standard empty Win32 .res null header.
const MINIMAL_PROJECT_RESOURCE = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00,
  0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);
