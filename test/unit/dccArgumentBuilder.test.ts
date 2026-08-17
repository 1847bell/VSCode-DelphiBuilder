import path from "node:path";
import { describe, expect, it } from "vitest";
import { DprojEvaluation } from "../../src/core/types";
import { buildDccArguments } from "../../src/compiler/dccArgumentBuilder";

const projectFile = path.resolve("test/fixtures/Sample.dproj");

function evaluation(properties: Record<string, string>): DprojEvaluation {
  return {
    projectFile,
    mainSource: path.resolve("test/fixtures/Sample.dpr"),
    configuration: "Debug",
    platform: "Win32",
    configurations: [],
    resourceItems: [],
    properties,
    warnings: []
  };
}

describe("buildDccArguments", () => {
  it("keeps ordered search paths and puts the source last", () => {
    const result = buildDccArguments(evaluation({
      DCC_Define: "BASE;DEBUG",
      DCC_UnitSearchPath: "src;common",
      DCC_IncludePath: "headers",
      DCC_ResourcePath: "resources",
      DCC_TranslatedResourcePath: "translated-resources",
      BRCC_OutputDir: "brcc",
      DCC_ExeOutput: ".\\bin\\Debug",
      DCC_DcuOutput: ".\\dcu\\Debug",
      DCC_Optimize: "false",
      DCC_Align: "8"
    }), {
      rebuild: true,
      libraryPath: "library;src",
      additionalArguments: ["-Q"]
    });

    const base = path.dirname(projectFile);
    expect(result.arguments).toEqual([
      "--no-config",
      "-DBASE;DEBUG",
      `-U${path.resolve(base, "src")};${path.resolve(base, "common")};${path.resolve(base, "library")}`,
      `-I${path.resolve(base, "headers")};${path.resolve(base, "src")};${path.resolve(base, "common")};${path.resolve(base, "library")}`,
      `-R${path.resolve(base, "translated-resources")};${path.resolve(base, "brcc")};${path.resolve(base, "src")};${path.resolve(base, "common")};${path.resolve(base, "resources")};${path.resolve(base, "library")}`,
      `-E${path.resolve(base, "bin/Debug")}`,
      `-N0${path.resolve(base, "dcu/Debug")}`,
      "-$O-",
      "-$A8",
      "-B",
      "-Q",
      "Sample.dpr"
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("adds Debug DCU paths without enabling debug information in the executable", () => {
    const result = buildDccArguments(evaluation({
      DCC_DebugDCUs: "true",
      DCC_TranslatedDebugLibraryPath: "translated-debug",
      DCC_TranslatedLibraryPath: "translated-release",
      DCC_UnitSearchPath: "project-units"
    }), {
      debugDcuPath: "debug-dcus",
      libraryPath: "library"
    });

    const base = path.dirname(projectFile);
    expect(result.arguments[0]).toBe("--no-config");
    expect(result.arguments).toContain(
      `-U${path.resolve(base, "translated-debug")};${path.resolve(base, "debug-dcus")};${path.resolve(base, "translated-release")};${path.resolve(base, "project-units")};${path.resolve(base, "library")}`
    );
    expect(result.arguments).not.toContain("-V");
    expect(result.arguments).not.toContain("-V-");
    expect(result.warnings).toEqual([]);
  });

  it("uses the unit and BDS library paths to find resources without an explicit Resource Path", () => {
    const result = buildDccArguments(evaluation({
      DCC_UnitSearchPath: "project-units"
    }), {
      libraryPath: "library"
    });

    const base = path.dirname(projectFile);
    expect(result.arguments).toContain(
      `-R${path.resolve(base, "project-units")};${path.resolve(base, "library")}`
    );
  });

  it("maps XE7 debug information properties to their official arguments", () => {
    const result = buildDccArguments(evaluation({
      DCC_DebugInformation: "2",
      DCC_SymbolReferenceInfo: "1",
      DCC_DebugInfoInExe: "true"
    }));

    expect(result.arguments).toEqual([
      "--no-config",
      "-$D2",
      "-$YD",
      "-V",
      "-VN",
      "Sample.dpr"
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("does not emit executable debug switches when DCC_DebugInfoInExe is false", () => {
    const result = buildDccArguments(evaluation({ DCC_DebugInfoInExe: "false" }));
    expect(result.arguments).not.toContain("-V");
    expect(result.arguments).not.toContain("-VN");
    expect(result.warnings).toEqual([]);
  });

  it.each([
    ["true", "-$O+"],
    ["false", "-$O-"]
  ])("maps DCC_Optimize=%s to %s", (value, expected) => {
    const result = buildDccArguments(evaluation({ DCC_Optimize: value }));
    expect(result.arguments).toContain(expected);
    expect(result.warnings).toEqual([]);
  });

  it("warns about unsupported XE7 enum and boolean values", () => {
    const result = buildDccArguments(evaluation({
      DCC_DebugDCUs: "maybe",
      DCC_DebugInfoInExe: "sometimes",
      DCC_DebugInformation: "9",
      DCC_SymbolReferenceInfo: "3",
      DCC_Optimize: "fast"
    }));

    expect(result.warnings).toEqual(expect.arrayContaining([
      "Unsupported boolean value for DCC_DebugDCUs: maybe",
      "Unsupported boolean value for DCC_DebugInfoInExe: sometimes",
      "Unsupported DCC_DebugInformation value: 9",
      "Unsupported DCC_SymbolReferenceInfo value: 3",
      "Unsupported boolean value for DCC_Optimize: fast"
    ]));
    expect(result.warnings).toHaveLength(5);
  });

  it("warns when a DCC property has no mapping", () => {
    const result = buildDccArguments(evaluation({ DCC_CustomSwitch: "true" }));
    expect(result.warnings).toEqual([
      "DCC property is not mapped to a compiler argument: DCC_CustomSwitch"
    ]);
  });

  it("does not use runtime packages when only a package list is present", () => {
    const result = buildDccArguments(evaluation({
      DCC_UsePackage: "rtl;vcl;CodeSiteExpressPkg"
    }));

    expect(result.arguments).not.toContain("-LUrtl;vcl;CodeSiteExpressPkg");
  });

  it("uses runtime packages when UsePackages is true", () => {
    const result = buildDccArguments(evaluation({
      DCC_UsePackage: "rtl;vcl;CodeSiteExpressPkg",
      UsePackages: "TrUe"
    }));

    expect(result.arguments).toContain("-LUrtl;vcl;CodeSiteExpressPkg");
  });

  it("uses runtime packages when DCC_EnabledPackages is true", () => {
    const result = buildDccArguments(evaluation({
      DCC_UsePackage: "rtl;vcl;CodeSiteExpressPkg",
      DCC_EnabledPackages: "TRUE"
    }));

    expect(result.arguments).toContain("-LUrtl;vcl;CodeSiteExpressPkg");
    expect(result.warnings).toEqual([]);
  });
});
