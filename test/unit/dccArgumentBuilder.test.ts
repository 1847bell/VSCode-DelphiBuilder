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
      DCC_ExeOutput: ".\\bin\\Debug",
      DCC_DcuOutput: ".\\dcu\\Debug",
      DCC_Optimization: "false",
      DCC_Align: "8"
    }), {
      rebuild: true,
      libraryPath: "library;src",
      additionalArguments: ["-Q"]
    });

    const base = path.dirname(projectFile);
    expect(result.arguments).toEqual([
      "-DBASE;DEBUG",
      `-U${path.resolve(base, "src")};${path.resolve(base, "common")};${path.resolve(base, "library")}`,
      `-I${path.resolve(base, "headers")};${path.resolve(base, "src")};${path.resolve(base, "common")};${path.resolve(base, "library")}`,
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
