import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCompilerDiagnostics } from "../../src/compiler/diagnosticParser";

describe("parseCompilerDiagnostics", () => {
  it("parses classic and bracketed DCC32 messages", () => {
    const cwd = path.resolve("test/fixtures");
    const output = [
      "MainForm.pas(128) Error: E2003 Undeclared identifier: 'CustomerId'",
      "MainForm.pas(24,7) Warning: W1036 Variable might not have been initialized",
      "[dcc32 Fatal] Project.dpr(1): F2613 Unit 'Xxx' not found",
      "[dcc32 Hint] Unit1.pas(42): H2164 Variable is declared but never used"
    ].join("\r\n");

    const result = parseCompilerDiagnostics(output, cwd);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      file: path.join(cwd, "MainForm.pas"),
      line: 128,
      level: "error",
      code: "E2003"
    });
    expect(result[1]).toMatchObject({ line: 24, column: 7, level: "warning" });
    expect(result[2]).toMatchObject({ level: "error", code: "F2613" });
    expect(result[3]).toMatchObject({ level: "hint", code: "H2164" });
  });

  it("ignores unrelated compiler output", () => {
    expect(parseCompilerDiagnostics("Embarcadero Delphi for Win32 compiler", ".")).toEqual([]);
  });

  it("separates DCC32 carriage-return progress records", () => {
    const result = parseCompilerDiagnostics(
      "\rBroken.dpr(1) \rBroken.dpr(4) Error: E2003 Undeclared identifier: 'X'\r",
      path.resolve("test/fixtures")
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ line: 4, code: "E2003", level: "error" });
  });

  it("attaches global fatal errors to the fallback project file", () => {
    const cwd = path.resolve("test/fixtures");
    const projectFile = path.join(cwd, "Sample.dproj");
    for (const [output, code] of [
      ["Fatal: E2202 Required package 'CodeSiteExpressPkg' not found", "E2202"],
      ["D:\\FastReports\\Source\\FireDAC\\frxFDComponents.paFatal: F1026 File not found: 'frx.inc'", "F1026"]
    ]) {
      const result = parseCompilerDiagnostics(output, cwd, projectFile);
      expect(result).toEqual([expect.objectContaining({
        file: projectFile,
        line: 1,
        level: "error",
        code
      })]);
    }
  });
});
