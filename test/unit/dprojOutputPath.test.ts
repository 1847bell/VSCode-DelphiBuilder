import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addOutputPathHistory, updateDprojOutputPath } from "../../src/project/dprojOutputPath";
import { evaluateDproj } from "../../src/project/dprojParser";

const projectFile = path.resolve("test/fixtures/Sample.dproj");
const content = readFileSync(projectFile, "utf8");

describe("dprojOutputPath", () => {
  it("adds a configuration and platform override without changing other configurations", () => {
    const updated = updateDprojOutputPath(content, {
      configuration: "Release",
      configurationKey: "Cfg_2",
      platform: "Win32",
      outputPath: "D:\\Build & Release"
    });

    expect(evaluateDproj(updated, projectFile, {
      configuration: "Release",
      platform: "Win32"
    }).properties.DCC_ExeOutput).toBe("D:\\Build & Release");
    expect(evaluateDproj(updated, projectFile, {
      configuration: "Debug",
      platform: "Win32"
    }).properties.DCC_ExeOutput).toBe(".\\bin\\Debug");
    expect(evaluateDproj(updated, projectFile, {
      configuration: "Release",
      platform: "Win64"
    }).properties.DCC_ExeOutput).toBe(".\\bin\\Release");
    expect(updated).toContain("D:\\Build &amp; Release");
    expect(updated).toContain('Label="DelphiDccBuilderOutput"');
    expect(updated.indexOf('Label="DelphiDccBuilderOutput"')).toBeLessThan(
      updated.indexOf("<Import")
    );
  });

  it("updates an existing platform group without creating duplicates", () => {
    const first = updateDprojOutputPath(content, {
      configuration: "Debug",
      configurationKey: "Cfg_1",
      platform: "Win64",
      outputPath: "D:\\First"
    });
    const updated = updateDprojOutputPath(first, {
      configuration: "Debug",
      configurationKey: "Cfg_1",
      platform: "Win64",
      outputPath: "D:\\Second"
    });

    expect(evaluateDproj(updated, projectFile, {
      configuration: "Debug",
      platform: "Win64"
    }).properties.DCC_ExeOutput).toBe("D:\\Second");
    expect(updated.match(/<DCC_ExeOutput\b/g)).toHaveLength(2);
  });

  it("preserves CRLF line endings when adding an override", () => {
    const crlf = content.replace(/\r?\n/g, "\r\n");
    const updated = updateDprojOutputPath(crlf, {
      configuration: "Release",
      configurationKey: "Cfg_2",
      platform: "Win64",
      outputPath: ".\\output"
    });
    expect(updated.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("stores the newest unique history entries first", () => {
    expect(addOutputPathHistory([
      "D:\\One",
      "d:\\two",
      "D:\\Three"
    ], "D:\\TWO", 3)).toEqual([
      "D:\\TWO",
      "D:\\One",
      "D:\\Three"
    ]);
  });
});
