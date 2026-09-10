const REGION_START_PATTERN = /^\s*\{\$REGION\b/i;
const REGION_END_PATTERN = /^\s*\{\$ENDREGION\b/i;

const DELPHI_LANGUAGE_IDS: ReadonlySet<string> = new Set(["pascal", "delphi", "objectpascal"]);
const DELPHI_FILE_EXTENSIONS: ReadonlySet<string> = new Set(["pas", "dpr", "dpk", "inc", "pp"]);

export interface RegionRange {
  /** 0-based line of the {$REGION ...} directive (inclusive). */
  start: number;
  /** 0-based line of the matching {$ENDREGION} directive (inclusive). */
  end: number;
}

/**
 * Whether the given language id or file name identifies a Delphi source file.
 * Falls back to the file extension so files work even without a Delphi syntax extension.
 */
export function isDelphiSourceName(languageId: string, fileName: string): boolean {
  if (DELPHI_LANGUAGE_IDS.has(languageId)) {
    return true;
  }
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) {
    return false;
  }
  return DELPHI_FILE_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase());
}

/**
 * Finds matching {$REGION ...} / {$ENDREGION} pairs. Directives are case-insensitive and
 * regions may nest. Unmatched starts are dropped and unmatched ends ignored.
 */
export function parseRegionRanges(lines: string[]): RegionRange[] {
  const ranges: RegionRange[] = [];
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (REGION_START_PATTERN.test(lines[i])) {
      starts.push(i);
    } else if (REGION_END_PATTERN.test(lines[i])) {
      const start = starts.pop();
      if (start !== undefined) {
        ranges.push({ start, end: i });
      }
    }
  }
  return ranges;
}
