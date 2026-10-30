import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isValidDprojVersion,
  readDprojVersion,
  updateDprojVersion
} from "../../src/project/dprojVersion";
import { evaluateDproj } from "../../src/project/dprojParser";

const projectFile = path.resolve("test/fixtures/Sample.dproj");
const content = readFileSync(projectFile, "utf8");
const options = { projectFile, configuration: "Debug", platform: "Win32" as const };
const scopedProjectFile = path.resolve("test/fixtures/VersionedSample.dproj");
const scopedContent = readFileSync(scopedProjectFile, "utf8");
const releaseOptions = {
  projectFile: scopedProjectFile,
  configuration: "Release",
  platform: "Win32" as const
};

describe("dprojVersion", () => {
  it("preserves effective conditional and inherited raw metadata with initial properties", () => {
    const source = `<Project>
  <PropertyGroup><Company>BaseCo</Company><VerInfo_Keys>CompanyName=$(Company);ProductName=$(Config);FileVersion=1;ProductVersion=1</VerInfo_Keys></PropertyGroup>
  <PropertyGroup Condition="'$(Config)'=='Debug' and '$(Platform)'=='Win32'"><VerInfo_Build>1</VerInfo_Build></PropertyGroup>
  <PropertyGroup Condition="'$(REVIEW_FLAVOR)'=='customer' and '$(Config)'=='Debug' and '$(Platform)'=='Win32'">
    <Company>CustomerCo</Company><VerInfo_Keys>$(VerInfo_Keys);LegalCopyright=$(Company) copyright</VerInfo_Keys>
  </PropertyGroup>
</Project>`;
    const selected = { ...options, initialProperties: { REVIEW_FLAVOR: "customer" } };
    const updated = updateDprojVersion(source, "3.4.5.6", selected);
    const result = evaluateDproj(updated, projectFile, selected);
    expect(readDprojVersion(updated, selected)).toBe("3.4.5.6");
    expect(result.properties.VerInfo_Keys).toContain("CompanyName=BaseCo");
    expect(result.properties.VerInfo_Keys).toContain("LegalCopyright=CustomerCo copyright");
    expect(updated).toContain("ProductName=$(Config)");
    expect(updated).toContain("LegalCopyright=$(Company) copyright");
    expect(readDprojVersion(updated, { ...selected, configuration: "Release" })).toBe("1");
    expect(readDprojVersion(updated, { ...selected, platform: "Win64" })).toBe("1");
  });

  it("reads FileVersion when ProductVersion has a different value", () => {
    const versioned = content.replace(
      "    <MainSource>Sample.dpr</MainSource>",
      [
        "    <MainSource>Sample.dpr</MainSource>",
        "    <VerInfo_Keys>CompanyName=;FileDescription=;FileVersion=5.0.0.26;InternalName=;LegalCopyright=;LegalTrademarks=;OriginalFilename=;ProductName=;ProductVersion=1.0.0.0;Comments=</VerInfo_Keys>"
      ].join("\n")
    );

    expect(readDprojVersion(versioned, options)).toBe("5.0.0.26");
  });

  it("reads the effective Release version after Base and platform overrides", () => {
    expect(readDprojVersion(scopedContent, releaseOptions)).toBe("5.0.0.26");
    expect(readDprojVersion(scopedContent, {
      ...releaseOptions,
      configuration: "Debug"
    })).toBe("1.0.0.0");
    expect(readDprojVersion(scopedContent, {
      ...releaseOptions,
      platform: "Win64"
    })).toBe("1.0.0.0");
  });

  it("updates only the selected configuration and platform", () => {
    const updated = updateDprojVersion(scopedContent, "5.0.0.27", releaseOptions);
    const release = evaluateDproj(updated, scopedProjectFile, releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.27");
    expect(release.properties.VerInfo_MajorVer).toBe("5");
    expect(release.properties.VerInfo_MinorVer).toBe("0");
    expect(release.properties.VerInfo_Release).toBe("0");
    expect(release.properties.VerInfo_Build).toBe("27");
    expect(release.properties.VerInfo_Keys).toContain("ProductVersion=5.0.0.27");
    expect(readDprojVersion(updated, {
      ...releaseOptions,
      configuration: "Debug"
    })).toBe("1.0.0.0");
    expect(readDprojVersion(updated, {
      ...releaseOptions,
      platform: "Win64"
    })).toBe("1.0.0.0");
    expect(evaluateDproj(updated, scopedProjectFile, {
      configuration: "Debug",
      platform: "Win32"
    }).properties.VerInfo_Build).toBeUndefined();
  });

  it("updates the existing configuration group without adding override groups", () => {
    const first = updateDprojVersion(scopedContent, "5.0.0.27", releaseOptions);
    const updated = updateDprojVersion(first, "5.0.0.28", releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.28");
    expect(updated.match(/<PropertyGroup\b/g)).toHaveLength(
      scopedContent.match(/<PropertyGroup\b/g)!.length
    );
    expect(updated).not.toContain('Label="DelphiDccBuilderVersion"');
    expect(updated).toContain("<VerInfo_Build>28</VerInfo_Build>");
  });

  it("merges a legacy override back into the original group even when the version is unchanged", () => {
    const legacy = withLegacyOverride(scopedContent);
    const updated = updateDprojVersion(legacy, "5.0.0.27", releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.27");
    expect(updated).not.toContain('Label="DelphiDccBuilderVersion"');
    expect(updated.match(/<PropertyGroup\b/g)).toHaveLength(
      scopedContent.match(/<PropertyGroup\b/g)!.length
    );
    expect(updated).toContain("<VerInfo_Build>27</VerInfo_Build>");
    expect(updated).not.toContain("<VerInfo_Build>26</VerInfo_Build>");
    expect(updated).toContain("CompanyName=Legacy &amp; Company;");
    expect(updated).toContain("ProductName=$(Config)");
    expect(readDprojVersion(updated, { ...releaseOptions, configuration: "Debug" })).toBe("1.0.0.0");
  });

  it("preserves unrelated properties inside a legacy override when migrating version fields", () => {
    const legacy = withLegacyOverride(scopedContent, "      <DCC_Define>KEEP_CUSTOM_DEFINE</DCC_Define>\n");
    const updated = updateDprojVersion(legacy, "5.0.0.28", releaseOptions);
    const result = evaluateDproj(updated, scopedProjectFile, releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.28");
    expect(result.properties.DCC_Define).toBe("KEEP_CUSTOM_DEFINE");
    expect(updated).toContain("<DCC_Define>KEEP_CUSTOM_DEFINE</DCC_Define>");
    expect(updated.match(/<VerInfo_Build>/g)).toHaveLength(1);
  });

  it("preserves output paths, manifests, and raw metadata expressions in the existing group", () => {
    const original = scopedContent.replace(
      "    <VerInfo_Build>26</VerInfo_Build>",
      "    <VerInfo_Build>26</VerInfo_Build>\n"
        + "    <DCC_ExeOutput>$(HIS50)</DCC_ExeOutput>\n"
        + "    <Manifest_File>None</Manifest_File>"
    ).replace(/(FileVersion=5\.0\.0\.26;[^<]*?ProductName=);/,
      (_match, prefix: string) => `${prefix}$(Config);`);
    const updated = updateDprojVersion(original, "5.0.0.27", releaseOptions);

    expect(updated).toContain("<DCC_ExeOutput>$(HIS50)</DCC_ExeOutput>");
    expect(updated).toContain("<Manifest_File>None</Manifest_File>");
    expect(updated).toContain("ProductName=$(Config);ProductVersion=5.0.0.27");
    expect(updated.match(/<PropertyGroup\b/g)).toHaveLength(
      original.match(/<PropertyGroup\b/g)!.length
    );
  });

  it("adds a standard scoped group only when that configuration and platform have no existing group", () => {
    const win64Options = { ...releaseOptions, platform: "Win64" as const };
    const first = updateDprojVersion(scopedContent, "6.0.0.1", win64Options);
    const updated = updateDprojVersion(first, "6.0.0.2", win64Options);

    expect(readDprojVersion(updated, win64Options)).toBe("6.0.0.2");
    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.26");
    expect(updated).not.toContain('Label="DelphiDccBuilderVersion"');
    expect(updated.match(/<PropertyGroup\b/g)).toHaveLength(
      scopedContent.match(/<PropertyGroup\b/g)!.length + 1
    );
  });

  it("does not mistake a self-closing group for the next configuration group", () => {
    const original = scopedContent.replace(
      "  <PropertyGroup Condition=\"'$(Cfg_2_Win32)'!=''\">",
      "  <PropertyGroup Condition=\"'$(Cfg_1_Win32)'!=''\" />\n"
        + "  <PropertyGroup Condition=\"'$(Cfg_2_Win32)'!=''\">"
    );
    const updated = updateDprojVersion(original, "5.0.0.27", releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.27");
    expect(readDprojVersion(updated, { ...releaseOptions, configuration: "Debug" })).toBe("1.0.0.0");
    expect(updated.match(/<PropertyGroup\b/g)).toHaveLength(
      original.match(/<PropertyGroup\b/g)!.length
    );
  });

  it("keeps independent edits for Release and Debug", () => {
    const debugOptions = { ...releaseOptions, configuration: "Debug" };
    const releaseUpdated = updateDprojVersion(scopedContent, "5.0.0.27", releaseOptions);
    const debugUpdated = updateDprojVersion(releaseUpdated, "2.0.0.1", debugOptions);
    const updated = updateDprojVersion(debugUpdated, "5.0.0.28", releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.28");
    expect(readDprojVersion(updated, debugOptions)).toBe("2.0.0.1");
    expect(readDprojVersion(updated, {
      ...releaseOptions,
      platform: "Win64"
    })).toBe("1.0.0.0");
  });

  it("preserves other version metadata and XML entities", () => {
    const versioned = content.replace(
      "    <MainSource>Sample.dpr</MainSource>",
      "    <MainSource>Sample.dpr</MainSource>\n"
        + "    <VerInfo_Keys>CompanyName=A &amp; B;FileVersion=1.0.0.0;ProductVersion=1.0.0.0;Comments=Keep &lt;text&gt;</VerInfo_Keys>"
    );
    const updated = updateDprojVersion(versioned, "2.3.4.5", options);
    const properties = evaluateDproj(updated, projectFile, options).properties;

    expect(properties.VerInfo_Keys).toBe(
      "CompanyName=A & B;FileVersion=2.3.4.5;ProductVersion=2.3.4.5;Comments=Keep <text>"
    );
    expect(updated).toContain("CompanyName=A &amp; B;");
  });

  it("reads and updates independent version components", () => {
    const versioned = content.replace(
      "    <MainSource>Sample.dpr</MainSource>",
      [
        "    <MainSource>Sample.dpr</MainSource>",
        "    <VerInfo_MajorVer>1</VerInfo_MajorVer>",
        "    <VerInfo_MinorVer>2</VerInfo_MinorVer>",
        "    <VerInfo_Release>3</VerInfo_Release>",
        "    <VerInfo_Build>4</VerInfo_Build>"
      ].join("\n")
    );

    expect(readDprojVersion(versioned, options)).toBe("1.2.3.4");
    const updated = updateDprojVersion(versioned, "2.3.4.5", options);
    const properties = evaluateDproj(updated, projectFile, options).properties;

    expect(readDprojVersion(updated, options)).toBe("2.3.4.5");
    expect(properties.VerInfo_MajorVer).toBe("2");
    expect(properties.VerInfo_MinorVer).toBe("3");
    expect(properties.VerInfo_Release).toBe("4");
    expect(properties.VerInfo_Build).toBe("5");
  });

  it("adds version metadata when the project has none", () => {
    const updated = updateDprojVersion(content, "3.4.5.6", options);
    const properties = evaluateDproj(updated, projectFile, options).properties;

    expect(readDprojVersion(updated, options)).toBe("3.4.5.6");
    expect(properties.VerInfo_IncludeVerInfo).toBe("true");
    expect(properties.VerInfo_Keys).toBe("FileVersion=3.4.5.6;ProductVersion=3.4.5.6");
  });

  it("preserves CRLF line endings when adding version information", () => {
    const crlf = scopedContent.replace(/\r?\n/g, "\r\n");
    const updated = updateDprojVersion(crlf, "5.0.0.27", releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.27");
    expect(updated.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("accepts one to four numeric version components", () => {
    expect(isValidDprojVersion("1")).toBe(true);
    expect(isValidDprojVersion("1.2.3.4")).toBe(true);
    expect(isValidDprojVersion("1.2.3.4.5")).toBe(false);
    expect(isValidDprojVersion("1.2.beta")).toBe(false);
    expect(isValidDprojVersion("  ")).toBe(false);
  });
});

function withLegacyOverride(value: string, extra = ""): string {
  const legacy = `  <PropertyGroup Condition="'$(Config)'=='Release' and '$(Platform)'=='Win32'" Label="DelphiDccBuilderVersion">
    <VerInfo_MajorVer>5</VerInfo_MajorVer>
    <VerInfo_MinorVer>0</VerInfo_MinorVer>
    <VerInfo_Release>0</VerInfo_Release>
    <VerInfo_Build>27</VerInfo_Build>
    <VerInfo_IncludeVerInfo>true</VerInfo_IncludeVerInfo>
    <VerInfo_Keys>CompanyName=Legacy &amp; Company;FileVersion=5.0.0.27;ProductVersion=5.0.0.27;ProductName=$(Config)</VerInfo_Keys>
${extra}  </PropertyGroup>
`;
  return value.replace("  <Import", legacy + "  <Import");
}
