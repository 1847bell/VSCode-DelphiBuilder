import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getProjectVersionInfo,
  MINIMAL_PROJECT_RESOURCE,
  updateVersionResource
} from "../../src/compiler/versionResource";
import { ProjectVersionInfo } from "../../src/core/types";
import { evaluateDproj } from "../../src/project/dprojParser";

const projectFile = path.resolve("test/fixtures/VersionResourceSample.dproj");
const content = readFileSync(projectFile, "utf8");
const evaluation = evaluateDproj(content, projectFile, { configuration: "Release", platform: "Win32" });
const info: ProjectVersionInfo = {
  fileVersion: [5, 0, 0, 27],
  productVersion: [5, 0, 0, 27],
  languageId: 1033,
  fileType: 2,
  strings: { FileVersion: "5.0.0.27", ProductVersion: "5.0.0.27", CompanyName: "中文公司" }
};

describe("version resource", () => {
  it("uses the evaluated project version, locale, type, and string metadata", () => {
    expect(getProjectVersionInfo(evaluation)).toMatchObject({
      fileVersion: [5, 0, 0, 26],
      productVersion: [5, 0, 0, 26],
      languageId: 1033,
      fileType: 2,
      strings: { CompanyName: "Version Test", Comments: "Preserve metadata" }
    });
  });

  it("does not update version resources when version information is disabled", () => {
    expect(getProjectVersionInfo({
      ...evaluation,
      properties: { ...evaluation.properties, VerInfo_IncludeVerInfo: "false" }
    })).toBeUndefined();
  });

  it("uses independent numeric version fields when string versions are missing", () => {
    expect(getProjectVersionInfo({
      ...evaluation,
      properties: { ...evaluation.properties, VerInfo_Keys: "CompanyName=Example" }
    })).toMatchObject({
      fileVersion: [5, 0, 0, 26],
      productVersion: [5, 0, 0, 26],
      strings: { CompanyName: "Example", FileVersion: "5.0.0.26" }
    });
  });

  it("replaces every old version entry and preserves icons, manifests, and custom data byte for byte", () => {
    const preserved = [
      resourceRecord(3, 1, Buffer.from([0, 1, 2, 3, 4])),
      resourceRecord(14, 1, Buffer.from([5, 6, 7, 8])),
      resourceRecord(24, 1, Buffer.from("<assembly>manifest</assembly>")),
      resourceRecord(10, 101, Buffer.from("custom project data"))
    ];
    const oldInfo: ProjectVersionInfo = {
      ...info,
      fileVersion: [5, 0, 0, 26],
      strings: { FileVersion: "5.0.0.26" }
    };
    const oldEnglish = updateVersionResource(MINIMAL_PROJECT_RESOURCE, oldInfo).subarray(32);
    const oldChinese = updateVersionResource(MINIMAL_PROJECT_RESOURCE, {
      ...oldInfo,
      languageId: 2052
    }).subarray(32);
    const original = Buffer.concat([
      MINIMAL_PROJECT_RESOURCE, preserved[0], oldEnglish,
      ...preserved.slice(1), oldChinese
    ]);
    const snapshot = Buffer.from(original);
    const updated = updateVersionResource(original, info);

    for (const record of preserved) {
      expect(updated.includes(record)).toBe(true);
    }
    expect(updated.includes(Buffer.from("5.0.0.26", "utf16le"))).toBe(false);
    expect(updated.includes(Buffer.from("5.0.0.27", "utf16le"))).toBe(true);
    expect(updated.includes(Buffer.from("中文公司", "utf16le"))).toBe(true);
    expect(updateVersionResource(updated, info)).toEqual(updated);
    expect(original).toEqual(snapshot);
  });

  it("rejects truncated and malformed resources without changing the source buffer", () => {
    const invalid = resourceRecord(3, 1, Buffer.from("icon"));
    invalid.writeUInt32LE(5000, 0);
    const snapshot = Buffer.from(invalid);

    expect(() => updateVersionResource(invalid, info)).toThrow(".res file is invalid");
    expect(() => updateVersionResource(Buffer.from("broken"), info)).toThrow(".res file is invalid");
    expect(invalid).toEqual(snapshot);
  });

  it("preserves descriptive string versions while using numeric fields for fixed version data", () => {
    expect(getProjectVersionInfo({
      ...evaluation,
      properties: {
        ...evaluation.properties,
        VerInfo_Keys: "FileVersion=5.0 build 26;ProductVersion=Release 5"
      }
    })).toMatchObject({
      fileVersion: [5, 0, 0, 26],
      productVersion: [5, 0, 0, 26],
      strings: { FileVersion: "5.0 build 26", ProductVersion: "Release 5" }
    });
  });

  it("rejects version numbers that cannot fit in a Windows version resource", () => {
    expect(() => getProjectVersionInfo({
      ...evaluation,
      properties: {
        ...evaluation.properties,
        VerInfo_Keys: "FileVersion=5.0.0.65536;ProductVersion=5.0.0.27"
      }
    })).toThrow("between 0 and 65535");
  });
});

function resourceRecord(type: number, id: number, data: Buffer): Buffer {
  const record = Buffer.alloc(Math.ceil((32 + data.length) / 4) * 4);
  record.writeUInt32LE(data.length, 0);
  record.writeUInt32LE(32, 4);
  record.writeUInt16LE(0xffff, 8);
  record.writeUInt16LE(type, 10);
  record.writeUInt16LE(0xffff, 12);
  record.writeUInt16LE(id, 14);
  record.writeUInt16LE(0x30, 20);
  record.writeUInt16LE(1033, 22);
  data.copy(record, 32);
  return record;
}
