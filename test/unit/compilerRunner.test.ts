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
    expect(result.cancelled).toBe(false);
    expect(result.output).toBe("runner-ok");
    expect(chunks.join("")).toBe("runner-ok");
  });

  it("checks the main source before starting the compiler", async () => {
    await expect(new CompilerRunner().run(
      plan({ mainSource: path.resolve("test/fixtures/Missing.dpr") }),
      "utf8",
      () => undefined
    )).rejects.toThrow("Main source was not found");
  });
});
