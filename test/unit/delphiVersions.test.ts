import { describe, expect, it } from "vitest";
import {
  getSupportedDelphiVersions,
  getDelphiVersionConfiguration,
  resolveDelphiVersion
} from "../../src/delphi/versions";

describe("Delphi versions", () => {
  it("resolves XE7 and its BDS configuration", () => {
    expect(resolveDelphiVersion(undefined)).toBe("XE7");
    expect(resolveDelphiVersion("xe7")).toBe("XE7");
    expect(getDelphiVersionConfiguration("XE7")).toMatchObject({
      bdsRegistryVersion: "15.0",
      studioDirectoryVersion: "15.0",
      settingsSection: "delphiXe7",
      compilerSettingNames: {
        Win32: "compilerPath",
        Win64: "compiler64Path"
      },
      dcc: {
        baseArguments: ["--no-config"],
        rebuildArguments: ["-B"]
      }
    });
    expect(getSupportedDelphiVersions()).toEqual(["XE7"]);
    expect(getDelphiVersionConfiguration("XE7").dcc.argumentRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "DCC_Optimize", kind: "boolean" }),
        expect.objectContaining({ property: "DCC_DebugInformation", kind: "enum" })
      ])
    );
  });

  it("rejects versions without an implementation", () => {
    expect(() => resolveDelphiVersion("Unsupported")).toThrow("Unsupported Delphi version");
  });
});
