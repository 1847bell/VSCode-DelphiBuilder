import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompilerRunner } from "../../src/compiler/compilerRunner";
import { BuildPlan } from "../../src/core/types";

const fixture = path.resolve("test/fixtures/Sample.dproj");

function plan(overrides: Partial<BuildPlan> = {}): BuildPlan {
  return {
    version: "XE7",
    projectFile: fixture,
    mainSource: fixture,
    compilerPath: process.execPath,
    workingDirectory: path.dirname(fixture),
    configuration: "Debug",
    platform: "Win32",
    environment: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    arguments: ["-e", "process.stdout.write('runner-ok')"],
    expectedArtifacts: [],
    warnings: [],
    ...overrides
  };
}

describe("CompilerRunner", () => {
  it("runs an executable without a shell and decodes its output", async () => {
    const chunks: string[] = [];
    const result = await new CompilerRunner().run(plan(), "utf8", (text) => chunks.push(text));
    expect(result.exitCode).toBe(0);
    expect(result.stage).toBe("compiler");
    expect(result.cancelled).toBe(false);
    expect(result.output).toContain("runner-ok");
    expect(chunks.join("")).toContain("runner-ok");
  });

  it("checks the main source before starting the compiler", async () => {
    await expect(new CompilerRunner().run(
      plan({ mainSource: path.resolve("test/fixtures/Missing.dpr") }),
      "utf8",
      () => undefined
    )).rejects.toThrow("Main source was not found");
  });

  it("runs resource preprocessing before the compiler", async () => {
    const chunks: string[] = [];
    const result = await new CompilerRunner().run(plan({
      resourceBuild: [{
        executable: process.execPath,
        arguments: ["-e", "process.stdout.write('resource-ok')"],
        input: fixture,
        output: path.resolve("test/fixtures/generated/Resource.res")
      }]
    }), "utf8", (text) => chunks.push(text));

    expect(result.exitCode).toBe(0);
    expect(result.stage).toBe("compiler");
    expect(result.output.indexOf("resource-ok")).toBeLessThan(result.output.indexOf("runner-ok"));
  });

  it("creates a missing wildcard project resource without overwriting an existing file", async () => {
    const output = path.resolve("test/fixtures/generated/ProjectResource.res");
    await rm(output, { force: true });
    const runner = new CompilerRunner();
    const buildPlan = plan({
      projectResource: { output, createIfMissing: true }
    });

    const firstResult = await runner.run(buildPlan, "utf8", () => undefined);
    expect(firstResult.exitCode).toBe(0);
    expect((await readFile(output)).length).toBe(32);

    const existing = Buffer.from("existing-project-resource");
    await writeFile(output, existing);
    const secondResult = await runner.run(buildPlan, "utf8", () => undefined);
    expect(secondResult.exitCode).toBe(0);
    expect(await readFile(output)).toEqual(existing);
  });

  it("does not start the compiler when resource preprocessing fails", async () => {
    const result = await new CompilerRunner().run(plan({
      resourceBuild: [{
        executable: process.execPath,
        arguments: ["-e", "process.stderr.write('resource-failed'); process.exit(7)"],
        input: fixture,
        output: path.resolve("test/fixtures/generated/Resource.res")
      }]
    }), "utf8", () => undefined);

    expect(result.exitCode).toBe(7);
    expect(result.stage).toBe("resource");
    expect(result.output).toContain("resource-failed");
    expect(result.output).not.toContain("runner-ok");
  });

  it("cancels resource preprocessing without starting the compiler", async () => {
    const runner = new CompilerRunner();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const running = runner.run(plan({
      resourceBuild: [{
        executable: process.execPath,
        arguments: ["-e", "process.stdout.write('resource-started'); setInterval(() => {}, 1000)"],
        input: fixture,
        output: path.resolve("test/fixtures/generated/Resource.res")
      }]
    }), "utf8", (text) => {
      if (text.includes("resource-started")) {
        markStarted?.();
      }
    });

    await started;
    expect(await runner.cancel()).toBe(true);
    const result = await running;
    expect(result.stage).toBe("resource");
    expect(result.cancelled).toBe(true);
    expect(result.output).not.toContain("runner-ok");
  });
});
