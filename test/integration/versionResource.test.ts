import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createBuildPlan } from "../../src/compiler/buildPlan";
import { CompilerRunner } from "../../src/compiler/compilerRunner";
import { resolveOutputEncoding } from "../../src/compiler/outputEncoding";
import { DelphiPlatform } from "../../src/core/types";
import { updateDprojVersion } from "../../src/project/dprojVersion";

const execute = promisify(execFile);
const fixtureDirectory = path.resolve("test/fixtures");

const oldVersionResource = `101 RCDATA BEGIN "preserve-project-resource" END
1 VERSIONINFO
FILEVERSION 5,0,0,26
PRODUCTVERSION 5,0,0,26
FILEOS 0x40004
FILETYPE 2
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904e4"
    BEGIN
      VALUE "FileVersion", "5.0.0.26\\0"
      VALUE "ProductVersion", "5.0.0.26\\0"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x409, 1252
  END
END
`;

describe("Delphi version resource integration", () => {
  for (const platform of ["Win32", "Win64"] as const) {
    it(`embeds the edited version in a ${platform} DLL while preserving other resources`, async () => {
      await verifyEditedVersion(platform);
    });
  }
});

async function verifyEditedVersion(platform: DelphiPlatform): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "delphi-version-"));
  try {
    const projectFile = path.join(directory, "VersionResourceSample.dproj");
    const resourceFile = path.join(directory, "VersionResourceSample.res");
    const resourceSource = path.join(directory, "VersionResourceSample.rc");
    await copyFile(path.join(fixtureDirectory, "VersionResourceSample.dpr"),
      path.join(directory, "VersionResourceSample.dpr"));
    const content = await readFile(path.join(fixtureDirectory, "VersionResourceSample.dproj"), "utf8");
    await writeFile(projectFile, updateDprojVersion(content, "5.0.0.27", {
      projectFile,
      configuration: "Release",
      platform
    }));
    const options = { projectFile, configuration: "Release", platform };
    let plan = await createBuildPlan(options);
    const originalCompiler = path.join(path.dirname(plan.compilerPath), "DCC32.EXE.old");
    if (platform === "Win32" && existsSync(originalCompiler)) {
      plan = await createBuildPlan({ ...options, compilerPath: originalCompiler });
    }
    await writeFile(resourceSource, oldVersionResource);
    await execute(path.join(path.dirname(plan.compilerPath), "brcc32.exe"),
      [`-fo${resourceFile}`, resourceSource], { windowsHide: true });
    const before = await readFile(resourceFile);
    expect(before.includes(Buffer.from("5.0.0.26", "utf16le"))).toBe(true);
    expect(before.includes(Buffer.from("preserve-project-resource"))).toBe(true);

    const result = await new CompilerRunner().run(
      plan,
      await resolveOutputEncoding("system"),
      () => undefined
    );
    expect(result.exitCode, result.output).toBe(0);
    const artifact = plan.expectedArtifacts[0];
    expect(existsSync(artifact), artifact).toBe(true);
    const literalPath = artifact.replace(/'/g, "''");
    const script = `$version = [Diagnostics.FileVersionInfo]::GetVersionInfo('${literalPath}'); `
      + `@{ FileVersion = $version.FileVersion; ProductVersion = $version.ProductVersion; `
      + `Major = $version.FileMajorPart; Build = $version.FilePrivatePart; `
      + `CompanyName = $version.CompanyName } | ConvertTo-Json -Compress`;
    const nativeVersion = await execute("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64")
    ], { windowsHide: true });
    expect(JSON.parse(nativeVersion.stdout)).toEqual({
      FileVersion: "5.0.0.27",
      ProductVersion: "5.0.0.27",
      Major: 5,
      Build: 27,
      CompanyName: "Version Test"
    });
    const after = await readFile(resourceFile);
    expect(after.includes(Buffer.from("preserve-project-resource"))).toBe(true);
    expect(after.includes(Buffer.from("5.0.0.26", "utf16le"))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
