import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { CompilerDiagnostic, DiagnosticLevel } from "../core/types";

export class DiagnosticPublisher implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("delphi-xe7");
  private readonly projectUris = new Map<string, vscode.Uri[]>();

  public clear(projectFile: string): void {
    for (const uri of this.projectUris.get(projectFile) ?? []) {
      this.collection.delete(uri);
    }
    this.projectUris.delete(projectFile);
  }

  public publish(projectFile: string, diagnostics: CompilerDiagnostic[]): number {
    this.clear(projectFile);
    const byFile = new Map<string, CompilerDiagnostic[]>();
    for (const diagnostic of diagnostics) {
      if (!existsSync(diagnostic.file)) {
        continue;
      }
      const list = byFile.get(diagnostic.file) ?? [];
      list.push(diagnostic);
      byFile.set(diagnostic.file, list);
    }

    const uris: vscode.Uri[] = [];
    let published = 0;
    for (const [file, fileDiagnostics] of byFile) {
      const uri = vscode.Uri.file(file);
      const values = fileDiagnostics.map(toVscodeDiagnostic);
      this.collection.set(uri, values);
      uris.push(uri);
      published += values.length;
    }
    this.projectUris.set(projectFile, uris);
    return published;
  }

  public dispose(): void {
    this.collection.dispose();
  }
}

function toVscodeDiagnostic(value: CompilerDiagnostic): vscode.Diagnostic {
  const line = Math.max(0, value.line - 1);
  const column = Math.max(0, (value.column ?? 1) - 1);
  const range = new vscode.Range(line, column, line, column + 1);
  const diagnostic = new vscode.Diagnostic(range, value.message, toSeverity(value.level));
  diagnostic.source = "dcc32";
  diagnostic.code = value.code;
  return diagnostic;
}

function toSeverity(level: DiagnosticLevel): vscode.DiagnosticSeverity {
  switch (level) {
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "hint":
      return vscode.DiagnosticSeverity.Hint;
    default:
      return vscode.DiagnosticSeverity.Error;
  }
}
