import path from "node:path";
import { CompilerDiagnostic, DiagnosticLevel } from "../core/types";

const BRACKET_FORMAT = /^\[dcc32\s+(Error|Fatal|Warning|Hint)\]\s+(.+?)\((\d+)(?:,(\d+))?\):\s*(?:(\w\d+)\s+)?(.*)$/i;
const CLASSIC_FORMAT = /^(.+?)\((\d+)(?:,(\d+))?\)\s+(Error|Fatal|Warning|Hint):\s*(?:(\w\d+)\s+)?(.*)$/i;
const GLOBAL_FORMAT = /^(Error|Fatal|Warning|Hint):\s*(?:(\w\d+)\s+)?(.*)$/i;
const PROGRESS_PREFIXED_FORMAT = /(Error|Fatal|Warning|Hint):\s*(\w\d+)\s+(.*)$/i;

export function parseCompilerDiagnostics(
  output: string,
  workingDirectory: string,
  fallbackFile?: string
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const raw of output.split(/[\r\n]+/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const bracket = line.match(BRACKET_FORMAT);
    if (bracket) {
      diagnostics.push(createDiagnostic({
        level: bracket[1],
        file: bracket[2],
        line: bracket[3],
        column: bracket[4],
        code: bracket[5],
        message: bracket[6],
        raw,
        workingDirectory
      }));
      continue;
    }
    const classic = line.match(CLASSIC_FORMAT);
    if (classic) {
      diagnostics.push(createDiagnostic({
        file: classic[1],
        line: classic[2],
        column: classic[3],
        level: classic[4],
        code: classic[5],
        message: classic[6],
        raw,
        workingDirectory
      }));
      continue;
    }
    const global = line.match(GLOBAL_FORMAT) ?? line.match(PROGRESS_PREFIXED_FORMAT);
    if (global && fallbackFile) {
      diagnostics.push(createDiagnostic({
        file: fallbackFile,
        line: "1",
        level: global[1],
        code: global[2],
        message: global[3],
        raw,
        workingDirectory
      }));
    }
  }
  return diagnostics;
}

interface DiagnosticParts {
  file: string;
  line: string;
  column?: string;
  level: string;
  code?: string;
  message: string;
  raw: string;
  workingDirectory: string;
}

function createDiagnostic(parts: DiagnosticParts): CompilerDiagnostic {
  const file = path.isAbsolute(parts.file)
    ? path.normalize(parts.file)
    : path.resolve(parts.workingDirectory, parts.file);
  return {
    file,
    line: Number(parts.line),
    column: parts.column ? Number(parts.column) : undefined,
    level: normalizeLevel(parts.level),
    code: parts.code,
    message: parts.message.trim(),
    raw: parts.raw
  };
}

function normalizeLevel(level: string): DiagnosticLevel {
  const normalized = level.toLocaleLowerCase();
  if (normalized === "warning") {
    return "warning";
  }
  if (normalized === "hint") {
    return "hint";
  }
  return "error";
}
