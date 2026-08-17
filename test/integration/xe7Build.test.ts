import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBuildPlan } from "../../src/compiler/buildPlan";
import { CompilerRunner } from "../../src/compiler/compilerRunner";
import { parseCompilerDiagnostics } from "../../src/compiler/diagnosticParser";
import { resolveOutputEncoding } from "../../src/compiler/outputEncoding";

describe("Delphi XE7 integration", () => {
  it("builds the fixture with the discovered DCC32.exe", async () => {
    const plan = await createXe7Plan();
    expect(existsSync(plan.compilerPath), `DCC32.exe was not found: ${plan.compilerPath}`).toBe(true);
    expect(plan.arguments.join(";")).not.toContain("$(");

    const output: string[] = [];
    const result = await new CompilerRunner().run(
      plan,
      await resolveOutputEncoding("system"),
      (text) => output.push(text)
    );
    expect(result.exitCode, output.join("")).toBe(0);
    expect(plan.expectedArtifacts.some(existsSync)).toBe(true);
  });

  it("parses a real DCC32 compilation error", async () => {
    const plan = await createXe7Plan();
    const brokenSource = path.resolve("test/fixtures/Broken.dpr");
    const brokenPlan = {
      ...plan,
      mainSource: brokenSource,
      arguments: [...plan.arguments.slice(0, -1), "Broken.dpr"],
      expectedArtifacts: []
    };
    const result = await new CompilerRunner().run(
      brokenPlan,
      await resolveOutputEncoding("system"),
      () => undefined
    );
    const diagnostics = parseCompilerDiagnostics(result.output, plan.workingDirectory);
    expect(result.exitCode).not.toBe(0);
    expect(diagnostics, result.output).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: brokenSource, level: "error" })
    ]));
  });

  it("builds the fixture with DCC64 and Win64 library paths", async () => {
    const plan = await createBuildPlan({
      projectFile: path.resolve("test/fixtures/Sample.dproj"),
      configuration: "Debug",
      platform: "Win64",
      rebuild: true
    });
    expect(path.basename(plan.compilerPath).toLocaleLowerCase()).toBe("dcc64.exe");
    expect(existsSync(plan.compilerPath), `DCC64.exe was not found: ${plan.compilerPath}`).toBe(true);
    expect(plan.platform).toBe("Win64");
    expect(plan.arguments.join(";")).not.toContain("$(");

    const output: string[] = [];
    const result = await new CompilerRunner().run(
      plan,
      await resolveOutputEncoding("system"),
      (text) => output.push(text)
    );
    expect(result.exitCode, output.join("")).toBe(0);
    expect(plan.expectedArtifacts.some(existsSync)).toBe(true);
  });

  it("builds an RcCompile resource before a clean DCC32 build", async () => {
    const resourceFile = path.resolve("test/fixtures/generated/ResourceUnit.res");
    const resourceSource = path.resolve("test/fixtures/ResourceUnit.rc");
    await rm(resourceFile, { force: true });
    const plan = await createXe7Plan(path.resolve("test/fixtures/ResourceSample.dproj"));
    expect(plan.resourceBuild?.[0]).toMatchObject({
      input: path.resolve("test/fixtures/ResourceUnit.rc"),
      output: resourceFile
    });

    const output: string[] = [];
    const result = await new CompilerRunner().run(
      plan,
      await resolveOutputEncoding("system"),
      (text) => output.push(text)
    );
    expect(result.exitCode, output.join("")).toBe(0);
    expect(result.stage).toBe("compiler");
    expect(existsSync(resourceFile)).toBe(true);
    expect(plan.expectedArtifacts.some(existsSync)).toBe(true);

    const originalSource = await readFile(resourceSource, "utf8");
    const originalResource = await readFile(resourceFile);
    try {
      await writeFile(resourceSource, originalSource.replace("resource-ok", "resource-updated"), "utf8");
      const updatedOutput: string[] = [];
      const updatedResult = await new CompilerRunner().run(
        await createXe7Plan(path.resolve("test/fixtures/ResourceSample.dproj")),
        await resolveOutputEncoding("system"),
        (text) => updatedOutput.push(text)
      );
      expect(updatedResult.exitCode, updatedOutput.join("")).toBe(0);
      expect((await readFile(resourceFile)).equals(originalResource)).toBe(false);
    } finally {
      await writeFile(resourceSource, originalSource, "utf8");
    }
  });

  it("creates a missing wildcard project resource before DCC32", async () => {
    const resourceFile = path.resolve("test/fixtures/ProjectResourceSample.res");
    await rm(resourceFile, { force: true });
    try {
      const plan = await createXe7Plan(path.resolve("test/fixtures/ProjectResourceSample.dproj"));
      expect(plan.projectResource).toEqual({
        output: resourceFile,
        createIfMissing: true
      });

      const output: string[] = [];
      const result = await new CompilerRunner().run(
        plan,
        await resolveOutputEncoding("system"),
        (text) => output.push(text)
      );
      expect(result.exitCode, output.join("")).toBe(0);
      expect(result.stage).toBe("compiler");
      expect(existsSync(resourceFile)).toBe(true);
      expect(plan.expectedArtifacts.some(existsSync)).toBe(true);
    } finally {
      await rm(resourceFile, { force: true });
    }
  });
});

async function createXe7Plan(projectFile = path.resolve("test/fixtures/Sample.dproj")) {
  const options = {
    projectFile,
    configuration: "Debug",
    rebuild: true
  };
  const discoveredPlan = await createBuildPlan(options);
  const originalCompiler = path.join(path.dirname(discoveredPlan.compilerPath), "DCC32.EXE.old");
  return existsSync(originalCompiler)
    ? createBuildPlan({ ...options, compilerPath: originalCompiler })
    : discoveredPlan;
}
