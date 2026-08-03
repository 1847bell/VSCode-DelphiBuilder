import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseRsVarsContent, resolveBdsEnvironment } from "../../src/environment/bdsLocator";

vi.mock("../../src/environment/registryReader", () => ({
  queryRegistry: vi.fn(async (key: string) => {
    if (key.endsWith("Library\\Win32") && key.startsWith("HKLM")) {
      return {
        "Search Path": "$(BDSLIB)\\win32\\release;%SDKROOT%\\units",
        "Debug DCU Path": "$(BDSLIB)\\win32\\debug;$(MISSING_DEBUG_PATH)"
      };
    }
    return {};
  })
}));

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

  it("expands the Win32 library and Debug DCU registry paths", async () => {
    const root = path.resolve("test/fixtures/fake-bds");
    const result = await resolveBdsEnvironment(path.join(root, "bin", "DCC32.exe"), {
      SDKROOT: "D:\\SDK"
    });

    expect(result.libraryPath).toBe(
      `${path.join(root, "lib", "win32", "release")};D:\\SDK\\units`
    );
    expect(result.debugDcuPath).toBe(
      `${path.join(root, "lib", "win32", "debug")};$(MISSING_DEBUG_PATH)`
    );
    expect(result.warnings).toContain(
      "Unresolved BDS Debug DCU Path property: $(MISSING_DEBUG_PATH)."
    );
  });
});
