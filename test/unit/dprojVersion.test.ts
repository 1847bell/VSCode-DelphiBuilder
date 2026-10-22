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

  it("reuses the selected version override on repeated edits", () => {
    const first = updateDprojVersion(scopedContent, "5.0.0.27", releaseOptions);
    const updated = updateDprojVersion(first, "5.0.0.28", releaseOptions);

    expect(readDprojVersion(updated, releaseOptions)).toBe("5.0.0.28");
    expect(updated.match(/Label="DelphiDccBuilderVersion"/g)).toHaveLength(1);
    expect(updated.indexOf('Label="DelphiDccBuilderVersion"')).toBeLessThan(
      updated.indexOf("<Import")
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
