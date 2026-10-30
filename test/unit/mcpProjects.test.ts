import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpConfig, ProjectAccess } from "../../src/mcp/config";
import { ProjectService } from "../../src/mcp/projects";
import { evaluateDproj } from "../../src/project/dprojParser";
import { readDprojVersion } from "../../src/project/dprojVersion";

let root: string;
let projectFile: string;
let original: Buffer;
let access: ProjectAccess;
let projects: ProjectService;

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), "dcc-mcp-projects-")));
  projectFile = path.join(root, "Sample.dproj");
  const fixture = await readFile(path.resolve("test/fixtures/Sample.dproj"), "utf8");
  original = Buffer.from(`\uFEFF${fixture.replace(/\r?\n/g, "\r\n")}`, "utf8");
  await writeFile(projectFile, original);
  access = new ProjectAccess([root]);
  const config: McpConfig = {
    roots: [root], version: "XE7", resourceBuild: true, additionalArguments: [], environment: {}, outputEncoding: "utf8"
  };
  projects = new ProjectService(config, access);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("MCP project mutations", () => {
  it("persists scoped output and version edits while preserving other configurations and UTF8 BOM", async () => {
    const selection = { projectFile, configuration: "Debug", platform: "Win64" as const };
    await projects.setOutputPath({ ...selection, outputPath: "build/$(Platform)/$(Config)" });
    await projects.setVersion({ ...selection, version: "12.34.56.78" });
    const bytes = await readFile(projectFile);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const content = bytes.toString("utf8");
    expect(content.replace(/\r\n/g, "")).not.toContain("\n");
    expect(evaluateDproj(content, projectFile, selection).properties.DCC_ExeOutput).toBe("build/Win64/Debug");
    expect(readDprojVersion(content, selection)).toBe("12.34.56.78");
    expect(evaluateDproj(content, projectFile, { configuration: "Release", platform: "Win64" }).properties.DCC_ExeOutput).toBe(".\\bin\\Release");
    expect(readDprojVersion(content, { ...selection, platform: "Win32" })).toBeUndefined();
  });

  it("rejects output directory escape without changing project bytes", async () => {
    await expect(projects.setOutputPath({
      projectFile, configuration: "Debug", platform: "Win32", outputPath: "../outside"
    })).rejects.toThrow();
    expect(await readFile(projectFile)).toEqual(original);
  });

  it("rejects version components that cannot fit binary version resource fields", async () => {
    await expect(projects.setVersion({
      projectFile, configuration: "Debug", platform: "Win32", version: "1.2.65536.4"
    })).rejects.toThrow();
    expect(await readFile(projectFile)).toEqual(original);
  });

  it("rejects invalid UTF8 rather than silently replacing project data", async () => {
    const invalid = Buffer.concat([original, Buffer.from([0xff])]);
    await writeFile(projectFile, invalid);
    await expect(projects.setVersion({
      projectFile, configuration: "Debug", platform: "Win32", version: "1.2.3.4"
    })).rejects.toThrow();
    expect(await readFile(projectFile)).toEqual(invalid);
  });

  it("prevents project writes while a build holds its lock", async () => {
    const release = access.lock(projectFile);
    try {
      await expect(projects.setVersion({
        projectFile, configuration: "Debug", platform: "Win32", version: "1.2.3.4"
      })).rejects.toThrow("busy");
      expect(await readFile(projectFile)).toEqual(original);
    } finally {
      release();
    }
  });
});
