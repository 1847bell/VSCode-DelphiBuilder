import { mkdtemp, readFile, realpath, rm, writeFile, readdir, stat, chmod } from "node:fs/promises";
import { watch } from "node:fs";
import { once } from "node:events";
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
  it("keeps concurrent readers on complete snapshots during atomic saves", async () => {
    const selection = { projectFile, configuration: "Debug", platform: "Win32" as const };
    const source = `\uFEFF<Project>\r\n<!--${"x".repeat(16 * 1024 * 1024)}-->\r\n<PropertyGroup><VerInfo_Keys>FileVersion=1.0.0.0;ProductVersion=1.0.0.0</VerInfo_Keys></PropertyGroup>\r\n</Project>\r\n`;
    await writeFile(projectFile, source);
    if (process.platform !== "win32") await chmod(projectFile, 0o640);
    const mode = (await stat(projectFile)).mode;
    const watcher = watch(root);
    const temporaryCreated = once(watcher, "change");
    try {
      const saving = projects.setVersion({ ...selection, version: "3.4.5.6" });
      const [, filename] = await Promise.race([temporaryCreated, saving.then(() => ["saved", ""])]);
      expect(filename.toString()).toMatch(/\.tmp$/);
      await Promise.all([saving, ...Array.from({ length: 3 }, async () => {
        const info = await projects.getInfo(selection);
        expect(["1.0.0.0", "3.4.5.6"]).toContain(info.version);
      })]);
    } finally {
      watcher.close();
    }
    const saved = await readFile(projectFile);
    expect(saved.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(saved.toString("utf8").replace(/\r\n/g, "")).not.toContain("\n");
    expect((await stat(projectFile)).mode).toBe(mode);
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect((await projects.getInfo(selection)).version).toBe("3.4.5.6");
  }, 30000);

  it("uses configured environment and rsvars/BDS context for queries, builds and version saves", async () => {
    const rsvarsPath = path.join(root, "rsvars.bat");
    await writeFile(rsvarsPath, "set REVIEW_VERSION=2.0.0.0\r\nset REVIEW_COPYRIGHT=Customer copyright\r\n");
    await writeFile(path.join(root, "Sample.dpr"), "program Sample; {$R *.res} begin end.");
    const source = `<Project>
  <PropertyGroup><MainSource>Sample.dpr</MainSource><VerInfo_IncludeVerInfo>true</VerInfo_IncludeVerInfo><VerInfo_Keys>CompanyName=BaseCo;ProductName=BaseApp;FileVersion=1;ProductVersion=1</VerInfo_Keys></PropertyGroup>
  <PropertyGroup Condition="'$(Config)'=='Debug' and '$(Platform)'=='Win32'"><VerInfo_Build>0</VerInfo_Build></PropertyGroup>
  <PropertyGroup Condition="'$(REVIEW_FLAVOR)'=='customer' and '$(BDS)'!='' and '$(Config)'=='Debug' and '$(Platform)'=='Win32'">
    <VerInfo_Keys>CompanyName=CustomerCo;ProductName=$(Config);FileVersion=$(REVIEW_VERSION);ProductVersion=$(REVIEW_VERSION);LegalCopyright=$(REVIEW_COPYRIGHT)</VerInfo_Keys>
  </PropertyGroup>
  <PropertyGroup Condition="'$(DCC_UnitSearchPath)'=='review-sentinel'"><VerInfo_Keys>FileVersion=99;ProductVersion=99</VerInfo_Keys></PropertyGroup>
</Project>`;
    await writeFile(projectFile, source);
    projects = new ProjectService({
      roots: [root], compilerPath: path.join(root, "bin", "missing-dcc32.exe"), version: "XE7",
      rsvarsPath, resourceBuild: true, additionalArguments: [], environment: { REVIEW_FLAVOR: "customer", DCC_UnitSearchPath: "review-sentinel" }, outputEncoding: "utf8"
    }, access);
    const selection = { projectFile, configuration: "Debug", platform: "Win32" as const };
    expect((await projects.getInfo(selection)).version).toBe("2.0.0.0");
    const plan = await projects.getBuildPlan(selection);
    expect(plan.projectResource?.versionInfo?.fileVersion).toEqual([2, 0, 0, 0]);
    await projects.setVersion({ ...selection, version: "3.4.5.6" });
    expect((await projects.getInfo(selection)).version).toBe("3.4.5.6");
    const updatedPlan = await projects.getBuildPlan(selection);
    expect(updatedPlan.projectResource?.versionInfo?.strings.CompanyName).toBe("CustomerCo");
    expect(updatedPlan.projectResource?.versionInfo?.strings.LegalCopyright).toBe("Customer copyright");
    const saved = await readFile(projectFile, "utf8");
    expect(saved).toContain("ProductName=$(Config)");
    expect(saved).toContain("LegalCopyright=$(REVIEW_COPYRIGHT)");
    expect((await projects.getInfo({ ...selection, configuration: "Release" })).version).toBe("1");
    expect((await projects.getInfo({ ...selection, platform: "Win64" })).version).toBe("1");
  });

  it("freezes inherited output self references while retaining other expressions", async () => {
    await writeFile(projectFile, `<Project>
  <PropertyGroup><DCC_ExeOutput>bin</DCC_ExeOutput></PropertyGroup>
  <PropertyGroup Condition="'$(Config)'=='Debug' and '$(Platform)'=='Win32'"><DCC_ExeOutput>$(DCC_ExeOutput)/old</DCC_ExeOutput></PropertyGroup>
</Project>`);
    const selection = { projectFile, configuration: "Debug", platform: "Win32" as const };
    const edited = await projects.setOutputPath({ ...selection, outputPath: "$( dcc_exeoutput )/$(Config)/$(Platform)/nested" });
    expect(edited.outputPath).toBe(path.join(root, "bin", "old", "Debug", "Win32", "nested"));
    expect((await projects.getInfo(selection)).outputPath).toBe(edited.outputPath);
    const saved = await readFile(projectFile, "utf8");
    expect(saved).toContain("bin/old/$(Config)/$(Platform)/nested");
    expect((await projects.getInfo({ ...selection, configuration: "Release" })).outputPath).toBe(path.join(root, "bin"));
  });

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
