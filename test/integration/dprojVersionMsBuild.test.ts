import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { updateDprojVersion } from "../../src/project/dprojVersion";

const execute = promisify(execFile);
const msBuild = path.join(process.env.WINDIR ?? "C:\\Windows",
  "Microsoft.NET", "Framework", "v4.0.30319", "MSBuild.exe");

describe("dproj version MSBuild compatibility", () => {
  it("uses the edited original group after migrating an older version override", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "delphi-msbuild-version-"));
    try {
      const projectFile = path.join(directory, "Sample.dproj");
      const original = await readFile(path.resolve("test/fixtures/VersionedSample.dproj"), "utf8");
      const legacy = original.replace("  <Import", `  <PropertyGroup Condition="'$(Config)'=='Release' and '$(Platform)'=='Win32'" Label="DelphiDccBuilderVersion">
    <VerInfo_Build>27</VerInfo_Build>
    <VerInfo_Keys>FileVersion=5.0.0.27;ProductVersion=5.0.0.27</VerInfo_Keys>
  </PropertyGroup>
  <Import`);
      const before = await inspectVersion(legacy, projectFile, "Release");
      expect(before).toContain("Result_Build=27");
      expect(before).toContain("FileVersion=5.0.0.27;");

      const updated = updateDprojVersion(legacy, "5.0.0.28", {
        projectFile,
        configuration: "Release",
        platform: "Win32"
      });
      expect(updated).not.toContain('Label="DelphiDccBuilderVersion"');
      expect(updated.match(/<PropertyGroup\b/g)).toHaveLength(
        original.match(/<PropertyGroup\b/g)!.length
      );
      const release = await inspectVersion(updated, projectFile, "Release");
      expect(release).toContain("Result_Build=28");
      expect(release).toContain("FileVersion=5.0.0.28;");
      const debug = await inspectVersion(updated, projectFile, "Debug");
      expect(debug).toContain("FileVersion=1.0.0.0;");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function inspectVersion(content: string, projectFile: string, configuration: string): Promise<string> {
  const standalone = content.replace(/^[ \t]*<Import\b[^>]*\/>[ \t]*\r?\n?/gm, "")
    .replace("</Project>", `  <Target Name="InspectVersion">
    <Message Importance="high" Text="Result_Build=$(VerInfo_Build)" />
    <Message Importance="high" Text="Result_Keys=$(VerInfo_Keys)" />
  </Target>
</Project>`);
  await writeFile(projectFile, standalone);
  const result = await execute(msBuild, [
    projectFile, "/nologo", "/verbosity:minimal", "/target:InspectVersion",
    `/property:Config=${configuration}`, "/property:Platform=Win32"
  ], { windowsHide: true });
  return result.stdout;
}
