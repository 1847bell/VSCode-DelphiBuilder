import * as vscode from "vscode";
import { isDelphiSourceName, parseRegionRanges } from "./delphiRegionParser";

const DELPHI_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "pascal" },
  { language: "delphi" },
  { language: "objectpascal" },
  { pattern: "**/*.pas" },
  { pattern: "**/*.dpr" },
  { pattern: "**/*.dpk" },
  { pattern: "**/*.inc" },
  { pattern: "**/*.pp" }
];

const FOLD_ALL_REGIONS_COMMAND = "editor.foldAllMarkerRegions";

/** Retry delays (ms) while the editor folding model finishes initializing. */
const FOLD_RETRY_DELAYS_MS: readonly number[] = [0, 50, 200, 500];

/**
 * Makes {$REGION} / {$ENDREGION} blocks foldable in Delphi source files and collapses
 * them automatically when a file is opened.
 */
export class DelphiFolding implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  /** Document uri -> version that was already auto-folded. */
  private readonly autoFolded = new Map<string, number>();

  public constructor() {
    this.subscriptions.push(
      vscode.languages.registerFoldingRangeProvider(DELPHI_DOCUMENT_SELECTOR, {
        provideFoldingRanges: (document) =>
          parseRegionRanges(this.lineTexts(document)).map(
            (range) => new vscode.FoldingRange(range.start, range.end, vscode.FoldingRangeKind.Region)
          )
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        void this.autoFold(editor);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.autoFolded.delete(document.uri.toString());
      })
    );
    void this.autoFold(vscode.window.activeTextEditor);
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private lineTexts(document: vscode.TextDocument): string[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }
    return lines;
  }

  private async autoFold(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor || !isDelphiSourceName(editor.document.languageId, editor.document.fileName)) {
      return;
    }
    const enabled = vscode.workspace.getConfiguration("delphiDcc.folding").get("autoFoldRegions", true);
    if (!enabled) {
      return;
    }
    const document = editor.document;
    const key = document.uri.toString();
    if (this.autoFolded.get(key) === document.version) {
      return;
    }
    this.autoFolded.set(key, document.version);
    await this.foldAllRegions(editor);
  }

  private async foldAllRegions(editor: vscode.TextEditor): Promise<void> {
    for (const delay of FOLD_RETRY_DELAYS_MS) {
      if (delay > 0) {
        await sleep(delay);
      }
      if (editor.document !== vscode.window.activeTextEditor?.document) {
        return;
      }
      await vscode.commands.executeCommand(FOLD_ALL_REGIONS_COMMAND);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
