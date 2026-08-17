import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBuildPlan } from "../../src/compiler/buildPlan";

const resourceProject = path.resolve("test/fixtures/ResourceSample.dproj");
const sampleProject = path.resolve("test/fixtures/Sample.dproj");

describe("createBuildPlan resource preprocessing", () => {
  it("adds a BRCC32 step when RcCompile resource items exist", async () => {
    const plan = await createBuildPlan({
      projectFile: resourceProject,
      configuration: "Debug",
      compilerPath: process.execPath,
      brcc32Path: process.execPath,
      rebuild: true
    });

    expect(plan.resourceBuild).toHaveLength(1);
    expect(plan.resourceBuild?.[0]).toMatchObject({
      executable: process.execPath,
      input: path.resolve("test/fixtures/ResourceUnit.rc"),
      output: path.resolve("test/fixtures/generated/ResourceUnit.res")
    });
    expect(plan.resourceBuild?.[0].arguments).toContain(
      `-fo${path.resolve("test/fixtures/generated/ResourceUnit.res")}`
    );
    expect(plan.resourceBuild?.[0].arguments.at(-1)).toBe(
      path.resolve("test/fixtures/ResourceUnit.rc")
    );
  });

  it("allows resource preprocessing to be disabled with an explicit warning", async () => {
    const plan = await createBuildPlan({
      projectFile: resourceProject,
      configuration: "Debug",
      compilerPath: process.execPath,
      resourceBuild: false
    });

    expect(plan.resourceBuild).toBeUndefined();
    expect(plan.warnings).toContain(
      "Resource preprocessing is disabled; existing .res files are required for: ResourceUnit.rc"
    );
  });

  it("does not require BRCC32 for projects without resource items", async () => {
    const plan = await createBuildPlan({
      projectFile: sampleProject,
      configuration: "Debug",
      compilerPath: process.execPath,
      brcc32Path: path.resolve("missing-BRCC32.exe")
    });

    expect(plan.resourceBuild).toBeUndefined();
  });

  it("reports an invalid explicit BRCC32 path for resource projects", async () => {
    await expect(createBuildPlan({
      projectFile: resourceProject,
      configuration: "Debug",
      compilerPath: process.execPath,
      brcc32Path: path.resolve("missing-BRCC32.exe")
    })).rejects.toThrow("Configured BRCC32.exe was not found");
  });
});
