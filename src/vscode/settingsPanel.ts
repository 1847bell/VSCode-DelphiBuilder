import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { getLanguage, localize } from "../localization/localizer";
import {
  parseSettingValue,
  renderSettingsPage,
  SETTING_DEFINITIONS,
  SettingsValues
} from "./settingsPage";

interface UpdateSettingMessage {
  type: "updateSetting";
  key: string;
  value: unknown;
}

export class DelphiSettingsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "delphiDccSettings",
      this.panelTitle(),
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    this.refresh();
  }

  public refresh(): void {
    if (!this.panel) {
      return;
    }
    this.panel.title = this.panelTitle();
    this.panel.webview.html = renderSettingsPage(
      getLanguage(),
      readSettings(),
      crypto.randomBytes(16).toString("base64")
    );
  }

  public dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private panelTitle(): string {
    return `Delphi DCC Builder: ${localize("settings.title")}`;
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isUpdateSettingMessage(message)) {
      return;
    }

    let value: unknown;
    try {
      value = parseSettingValue(message.key, message.value);
    } catch {
      const definition = SETTING_DEFINITIONS.find((candidate) => candidate.key === message.key);
      const label = definition ? localize(definition.label) : message.key;
      void vscode.window.showErrorMessage(localize("settings.error.invalidValue", { setting: label }));
      return;
    }

    const separator = message.key.indexOf(".");
    const section = message.key.slice(0, separator);
    const name = message.key.slice(separator + 1);
    const target = hasWorkspace() ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await vscode.workspace.getConfiguration(section, firstWorkspaceUri()).update(name, value, target);
  }
}

function readSettings(): SettingsValues {
  const values: SettingsValues = {};
  for (const definition of SETTING_DEFINITIONS) {
    const separator = definition.key.indexOf(".");
    const section = definition.key.slice(0, separator);
    const name = definition.key.slice(separator + 1);
    values[definition.key] = vscode.workspace
      .getConfiguration(section, firstWorkspaceUri())
      .get(name, definition.defaultValue);
  }
  return values;
}

function isUpdateSettingMessage(message: unknown): message is UpdateSettingMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as Partial<UpdateSettingMessage>;
  return candidate.type === "updateSetting"
    && typeof candidate.key === "string"
    && SETTING_DEFINITIONS.some((definition) => definition.key === candidate.key);
}

function firstWorkspaceUri(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function hasWorkspace(): boolean {
  return vscode.workspace.workspaceFile !== undefined || vscode.workspace.workspaceFolders !== undefined;
}
