import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverConfigurations, evaluateDproj } from "../../src/project/dprojParser";

const projectFile = path.resolve("test/fixtures/Sample.dproj");
const content = readFileSync(projectFile, "utf8");

describe("dprojParser", () => {
  it("discovers project configurations", () => {
    expect(discoverConfigurations(content).map((item) => item.name)).toEqual([
      "Base",
      "Debug",
      "Release"
    ]);
  });

  it("applies ordered base and Debug properties", () => {
    const result = evaluateDproj(content, projectFile, {
      configuration: "Debug",
      initialProperties: { DCC_UnitSearchPath: "common" }
    });

    expect(result.mainSource).toBe(path.resolve("test/fixtures/Sample.dpr"));
    expect(result.properties.DCC_Define).toBe("BASE;DEBUG");
    expect(result.properties.DCC_Namespace).toBe("Winapi;System.Win;System;Xml;");
    expect(result.properties.DCC_UsePackage).toBe("rtl;vcl;");
    expect(result.properties.DCC_UnitSearchPath).toBe("src;common");
    expect(result.properties.DCC_ExeOutput).toBe(".\\bin\\Debug");
    expect(result.properties.DCC_DcuOutput).toBe(".\\dcu\\Win32\\Debug");
    expect(result.warnings).toContain(
      "MSBuild import is not executed: $(BDS)\\Bin\\CodeGear.Delphi.Targets"
    );
  });

  it("selects Release without applying Debug properties", () => {
    const result = evaluateDproj(content, projectFile, { configuration: "release" });
    expect(result.configuration).toBe("Release");
    expect(result.properties.DCC_Define).toBe("BASE;RELEASE");
    expect(result.properties.DCC_Namespace).not.toContain("$(DCC_Namespace)");
    expect(result.properties.DCC_UsePackage).not.toContain("$(DCC_UsePackage)");
    expect(result.properties.DCC_DcuOutput).toBeUndefined();
  });

  it("rejects a configuration that the project does not define", () => {
    expect(() => evaluateDproj(content, projectFile, { configuration: "Staging" }))
      .toThrow("Configuration 'Staging' is not defined");
  });
});
