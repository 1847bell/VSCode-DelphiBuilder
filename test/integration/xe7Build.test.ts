import { existsSync } from "node:fs";
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
});

async function createXe7Plan() {
  const options = {
    projectFile: path.resolve("test/fixtures/Sample.dproj"),
    configuration: "Debug",
    rebuild: true
  };
  const discoveredPlan = await createBuildPlan(options);
  const originalCompiler = path.join(path.dirname(discoveredPlan.compilerPath), "DCC32.EXE.old");
  return existsSync(originalCompiler)
    ? createBuildPlan({ ...options, compilerPath: originalCompiler })
    : discoveredPlan;
}
