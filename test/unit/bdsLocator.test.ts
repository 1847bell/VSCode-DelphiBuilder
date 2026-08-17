import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseRsVarsContent,
  resolveBdsEnvironment,
  resolveResourceCompilerPath
} from "../../src/environment/bdsLocator";

vi.mock("../../src/environment/registryReader", () => ({
  queryRegistry: vi.fn(async (key: string) => {
    if (key.endsWith("Explorer\\User Shell Folders")) {
      return { Personal: "D:\\RedirectedDocuments" };
    }
    if (key.endsWith("Library\\Win32") && key.startsWith("HKLM")) {
      return {
        "Search Path": "$(BDSLIB)\\win32\\release;%SDKROOT%\\units",
        "Debug DCU Path": "$(BDSLIB)\\win32\\debug;$(MISSING_DEBUG_PATH)"
      };
    }
    if (key.endsWith("Library\\Win64") && key.startsWith("HKLM")) {
      return {
        "Search Path": "$(BDSLIB)\\win64\\release;%SDKROOT%\\units64",
        "Debug DCU Path": "$(BDSLIB)\\win64\\debug"
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
    expect(result.variables.BDSUSERDIR).toBe(
      path.join("D:\\RedirectedDocuments", "Embarcadero", "Studio", "15.0")
    );
    expect(result.warnings).toContain(
      "Unresolved BDS Debug DCU Path property: $(MISSING_DEBUG_PATH)."
    );
  });

  it("uses the Win64 compiler and Win64 registry library paths", async () => {
    const root = path.resolve("test/fixtures/fake-bds");
    const compiler = path.join(root, "bin", "DCC64.exe");
    const result = await resolveBdsEnvironment(compiler, { SDKROOT: "D:\\SDK" }, "Win64");

    expect(result.compilerPath).toBe(compiler);
    expect(result.libraryPath).toBe(
      `${path.join(root, "lib", "win64", "release")};D:\\SDK\\units64`
    );
    expect(result.debugDcuPath).toBe(path.join(root, "lib", "win64", "debug"));
  });

  it("uses an explicit rsvars.bat path and rejects a missing override", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "delphi-rsvars-"));
    const rsVarsPath = path.join(directory, "rsvars.bat");
    await writeFile(rsVarsPath, "@SET FrameworkDir=C:\\Framework\r\n", "utf8");
    try {
      const root = path.resolve("test/fixtures/fake-bds");
      const result = await resolveBdsEnvironment(
        path.join(root, "bin", "DCC32.exe"),
        {},
        "Win32",
        "XE7",
        rsVarsPath
      );
      expect(result.rsVarsPath).toBe(rsVarsPath);
      expect(result.rsVarsFound).toBe(true);
      expect(result.variables.FrameworkDir).toBe("C:\\Framework");

      await expect(resolveBdsEnvironment(
        path.join(root, "bin", "DCC32.exe"),
        {},
        "Win32",
        "XE7",
        path.join(directory, "missing.bat")
      )).rejects.toThrow("Configured rsvars.bat was not found");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("discovers BRCC32.exe from the BDS root and validates an explicit path", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "delphi-brcc-"));
    const binDirectory = path.join(directory, "bin");
    const brcc32Path = path.join(binDirectory, "brcc32.exe");
    await mkdir(binDirectory, { recursive: true });
    await writeFile(brcc32Path, "", "utf8");
    try {
      expect(await resolveResourceCompilerPath(undefined, directory, {})).toMatchObject({
        path: brcc32Path
      });
      expect(await resolveResourceCompilerPath(brcc32Path, directory, {})).toEqual({
        path: brcc32Path,
        candidates: [brcc32Path]
      });
      await expect(resolveResourceCompilerPath(path.join(directory, "missing.exe"), directory, {}))
        .rejects.toThrow("Configured BRCC32.exe was not found");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
