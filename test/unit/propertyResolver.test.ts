import { describe, expect, it } from "vitest";
import {
  expandMsBuildProperties,
  expandProperties,
  PropertyBag
} from "../../src/project/propertyResolver";

describe("expandProperties", () => {
  it("expands properties recursively and case-insensitively", () => {
    const properties = new PropertyBag({ Root: "C:\\Delphi", Bin: "$(ROOT)\\bin" });
    expect(expandProperties("$(bin)\\dcc32.exe", properties)).toEqual({
      value: "C:\\Delphi\\bin\\dcc32.exe",
      unresolved: []
    });
  });

  it("reports unresolved and cyclic property references", () => {
    const properties = new PropertyBag({ A: "$(B)", B: "$(A)" });
    expect(expandProperties("$(A);$(Missing)", properties).unresolved).toEqual(["A", "Missing"]);
  });

  it("uses an empty string for undefined MSBuild properties", () => {
    expect(expandMsBuildProperties("RELEASE;$(DCC_Define)", new PropertyBag())).toEqual({
      value: "RELEASE;",
      unresolved: ["DCC_Define"]
    });
  });
});
