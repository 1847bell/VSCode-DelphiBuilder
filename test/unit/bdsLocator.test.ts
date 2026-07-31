import { describe, expect, it } from "vitest";
import { parseRsVarsContent } from "../../src/environment/bdsLocator";

describe("parseRsVarsContent", () => {
  it("reads ordered SET declarations without executing the batch file", () => {
    expect(parseRsVarsContent([
      "@SET BDS=D:\\Embarcadero\\Studio\\15.0",
      "@SET BDSCOMMONDIR=C:\\Users\\Public\\Documents\\Embarcadero\\Studio\\15.0",
      "@SET PATH=%BDS%\\bin;%PATH%"
    ].join("\r\n"))).toEqual({
      BDS: "D:\\Embarcadero\\Studio\\15.0",
      BDSCOMMONDIR: "C:\\Users\\Public\\Documents\\Embarcadero\\Studio\\15.0",
      PATH: "%BDS%\\bin;%PATH%"
    });
  });
});
