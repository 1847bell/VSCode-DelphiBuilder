import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuildPlan } from "../../src/core/types";
import { BuildJobs, BuildJobStatus } from "../../src/mcp/buildJobs";
import { ProjectAccess } from "../../src/mcp/config";

let root: string;
let project: string;
let access: ProjectAccess;
let jobs: BuildJobs;

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), "dcc-mcp-jobs-")));
  project = path.join(root, "App.dproj");
  await writeFile(project, "<Project />");
  await writeFile(path.join(root, "App.dpr"), "program App; begin end.");
  access = new ProjectAccess([root]);
  jobs = new BuildJobs(access, "utf8");
});

afterEach(async () => {
  await jobs.close();
  await rm(root, { recursive: true, force: true });
});

function plan(code: string): BuildPlan {
  return {
    version: "XE7", projectFile: project, mainSource: path.join(root, "App.dpr"),
    compilerPath: process.execPath, workingDirectory: root, configuration: "Debug", platform: "Win32",
    environment: Object.fromEntries(Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined)),
    arguments: ["-e", code], expectedArtifacts: [], warnings: []
  };
}

async function until(jobId: string, condition: (status: BuildJobStatus) => boolean) {
  const deadline = Date.now() + 8000;
  for (;;) {
    const status = jobs.get(jobId);
    if (condition(status)) return status;
    if (Date.now() > deadline) throw new Error(`Job did not reach expected state: ${JSON.stringify(status)}`);
    // Real child-process events require yielding to libuv; no guessed wall-clock delay.
    await setImmediate();
  }
}

const terminal = (status: BuildJobStatus): boolean =>
  ["succeeded", "failed", "cancelled"].includes(status.state);

describe("MCP asynchronous build lifecycle", () => {
  it("reports nonzero process exit as failure and releases the project lock", async () => {
    const started = jobs.start(plan("process.exitCode = 7"));
    const done = await until(started.jobId, terminal);
    expect(done.state).toBe("failed");
    expect(done.result?.exitCode).toBe(7);
    const next = jobs.start(plan("process.exitCode = 0"));
    expect((await until(next.jobId, terminal)).state).toBe("succeeded");
  });

  it("cancels before spawn without allowing a second project operation to overlap", async () => {
    const started = jobs.start(plan("process.stdin.resume()"));
    expect(() => jobs.start(plan("process.exitCode = 0"))).toThrow("busy");
    expect(() => access.lock(project)).toThrow("busy");
    await jobs.cancel(started.jobId);
    expect((await until(started.jobId, terminal)).state).toBe("cancelled");
    const release = access.lock(project);
    release();
  });

  it("terminates a running child and settles cancellation before releasing its lock", async () => {
    const started = jobs.start(plan("console.log('CHILD_PID=' + process.pid); process.stdin.resume()"));
    const running = await until(started.jobId, (status) => /CHILD_PID=\d+/.test(status.log));
    const pid = Number(running.log.match(/CHILD_PID=(\d+)/)![1]);
    await jobs.cancel(started.jobId);
    expect((await until(started.jobId, terminal)).state).toBe("cancelled");
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("shutdown settles pending jobs and prevents starting work afterward", async () => {
    const started = jobs.start(plan("process.stdin.resume()"));
    await jobs.close();
    expect(jobs.get(started.jobId).state).toBe("cancelled");
    expect(() => jobs.start(plan("process.exitCode = 0"))).toThrow();
    const release = access.lock(project);
    release();
  });
});
