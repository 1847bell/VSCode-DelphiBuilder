import { describe, expect, it } from "vitest";
import { isDelphiSourceName, parseRegionRanges } from "../../src/vscode/delphiRegionParser";

describe("delphi region folding", () => {
  describe("parseRegionRanges", () => {
    it("finds a single region between the directives", () => {
      const lines = [
        "unit MyUnit;",
        "{$REGION 'implementation'}",
        "procedure DoIt;",
        "{$ENDREGION}"
      ];
      expect(parseRegionRanges(lines)).toEqual([{ start: 1, end: 3 }]);
    });

    it("matches directives case-insensitively and without a region name", () => {
      const lines = [
        "{$region}",
        "{$endregion}"
      ];
      expect(parseRegionRanges(lines)).toEqual([{ start: 0, end: 1 }]);
    });

    it("allows leading indentation and no space before the name", () => {
      const lines = [
        "  {$REGION'Init'}",
        "  {$ENDREGION}"
      ];
      expect(parseRegionRanges(lines)).toEqual([{ start: 0, end: 1 }]);
    });

    it("pairs nested regions correctly", () => {
      const lines = [
        "{$REGION 'outer'}", // 0
        "  {$REGION 'inner'}", // 1
        "  {$ENDREGION}", // 2
        "{$ENDREGION}" // 3
      ];
      expect(parseRegionRanges(lines)).toEqual([
        { start: 1, end: 2 },
        { start: 0, end: 3 }
      ]);
    });

    it("drops an unmatched region start", () => {
      const lines = [
        "{$REGION 'orphan'}"
      ];
      expect(parseRegionRanges(lines)).toEqual([]);
    });

    it("ignores an unmatched region end", () => {
      const lines = [
        "{$ENDREGION}",
        "{$REGION 'ok'}",
        "{$ENDREGION}"
      ];
      expect(parseRegionRanges(lines)).toEqual([{ start: 1, end: 2 }]);
    });

    it("ignores REGION mentions that are not directives", () => {
      const lines = [
        "// {$REGION 'commented out'}",
        "  s := '{$REGION}';",
        "(* {$ENDREGION} *)",
        "procedure KeepGoing;"
      ];
      expect(parseRegionRanges(lines)).toEqual([]);
    });

    it("does not match a word that merely starts with REGION", () => {
      const lines = [
        "{$REGIONAL planning}",
        "{$ENDREGIONS}"
      ];
      expect(parseRegionRanges(lines)).toEqual([]);
    });

    it("returns no ranges for an empty file", () => {
      expect(parseRegionRanges([])).toEqual([]);
    });
  });

  describe("isDelphiSourceName", () => {
    it("accepts Delphi language ids", () => {
      for (const id of ["pascal", "delphi", "objectpascal"]) {
        expect(isDelphiSourceName(id, "anything.txt")).toBe(true);
      }
    });

    it("accepts Delphi file extensions case-insensitively", () => {
      for (const name of ["Main.pas", "MyApp.DPR", "Project.dpk", "Includes.INC", "lib.pp"]) {
        expect(isDelphiSourceName("plaintext", name)).toBe(true);
      }
    });

    it("rejects other languages and file types", () => {
      expect(isDelphiSourceName("typescript", "main.ts")).toBe(false);
      expect(isDelphiSourceName("plaintext", "readme.md")).toBe(false);
      expect(isDelphiSourceName("plaintext", "notes")).toBe(false);
      expect(isDelphiSourceName("plaintext", ".pas")).toBe(false);
    });
  });
});
