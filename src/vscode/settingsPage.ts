import {
  ExtensionLanguage,
  localizeFor,
  MessageKey
} from "../localization/localizer";

type SettingKind = "boolean" | "integer" | "json-array" | "json-object" | "select" | "text";

interface SettingOption {
  value: string;
  label?: MessageKey;
}

interface SettingDefinition {
  key: string;
  section: "general" | "compiler";
  kind: SettingKind;
  label: MessageKey;
  description: MessageKey;
  defaultValue: unknown;
  options?: readonly SettingOption[];
  minimum?: number;
  maximum?: number;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: "delphiDcc.language",
    section: "general",
    kind: "select",
    label: "settings.language.label",
    description: "settings.language.description",
    defaultValue: "en",
    options: [
      { value: "en", label: "settings.option.english" },
      { value: "zh-cn", label: "settings.option.chinese" }
    ]
  },
  {
    key: "delphiDcc.version",
    section: "general",
    kind: "select",
    label: "settings.version.label",
    description: "settings.version.description",
    defaultValue: "XE7",
    options: [{ value: "XE7" }]
  },
  {
    key: "delphiDcc.resourceBuild",
    section: "general",
    kind: "boolean",
    label: "settings.resourceBuild.label",
    description: "settings.resourceBuild.description",
    defaultValue: true
  },
  {
    key: "delphiXe7.compilerPath",
    section: "compiler",
    kind: "text",
    label: "settings.compilerPath.label",
    description: "settings.compilerPath.description",
    defaultValue: ""
  },
  {
    key: "delphiXe7.compiler64Path",
    section: "compiler",
    kind: "text",
    label: "settings.compiler64Path.label",
    description: "settings.compiler64Path.description",
    defaultValue: ""
  },
  {
    key: "delphiXe7.rsvarsPath",
    section: "compiler",
    kind: "text",
    label: "settings.rsvarsPath.label",
    description: "settings.rsvarsPath.description",
    defaultValue: ""
  },
  {
    key: "delphiXe7.brcc32Path",
    section: "compiler",
    kind: "text",
    label: "settings.brcc32Path.label",
    description: "settings.brcc32Path.description",
    defaultValue: ""
  },
  {
    key: "delphiXe7.showBuildPlanMenu",
    section: "compiler",
    kind: "select",
    label: "settings.showBuildPlanMenu.label",
    description: "settings.showBuildPlanMenu.description",
    defaultValue: "hide",
    options: [
      { value: "hide", label: "settings.option.hide" },
      { value: "show", label: "settings.option.show" }
    ]
  },
  {
    key: "delphiXe7.outputPathHistoryLimit",
    section: "compiler",
    kind: "integer",
    label: "settings.outputPathHistoryLimit.label",
    description: "settings.outputPathHistoryLimit.description",
    defaultValue: 5,
    minimum: 1,
    maximum: 15
  },
  {
    key: "delphiXe7.outputEncoding",
    section: "compiler",
    kind: "select",
    label: "settings.outputEncoding.label",
    description: "settings.outputEncoding.description",
    defaultValue: "system",
    options: [
      { value: "system", label: "settings.option.systemEncoding" },
      { value: "cp936" },
      { value: "utf8" }
    ]
  },
  {
    key: "delphiXe7.additionalArguments",
    section: "compiler",
    kind: "json-array",
    label: "settings.additionalArguments.label",
    description: "settings.additionalArguments.description",
    defaultValue: []
  },
  {
    key: "delphiXe7.environment",
    section: "compiler",
    kind: "json-object",
    label: "settings.environment.label",
    description: "settings.environment.description",
    defaultValue: {}
  }
];

export type SettingsValues = Record<string, unknown>;

export function parseSettingValue(key: string, rawValue: unknown): unknown {
  const definition = SETTING_DEFINITIONS.find((candidate) => candidate.key === key);
  if (!definition) {
    throw new Error("Unknown setting");
  }

  if (definition.kind === "boolean") {
    if (typeof rawValue !== "boolean") {
      throw new Error("Expected boolean");
    }
    return rawValue;
  }

  if (definition.kind === "integer") {
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (
      !Number.isInteger(value)
      || (definition.minimum !== undefined && value < definition.minimum)
      || (definition.maximum !== undefined && value > definition.maximum)
    ) {
      throw new Error("Expected integer in range");
    }
    return value;
  }

  if (definition.kind === "json-array") {
    const value = parseJson(rawValue);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error("Expected string array");
    }
    return value;
  }

  if (definition.kind === "json-object") {
    const value = parseJson(rawValue);
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || Object.values(value).some((item) => typeof item !== "string")
    ) {
      throw new Error("Expected string map");
    }
    return value;
  }

  if (typeof rawValue !== "string") {
    throw new Error("Expected string");
  }
  if (definition.kind === "select" && !definition.options?.some((option) => option.value === rawValue)) {
    throw new Error("Unknown option");
  }
  return rawValue;
}

export function renderSettingsPage(
  language: ExtensionLanguage,
  values: SettingsValues,
  nonce: string
): string {
  const t = (key: MessageKey): string => localizeFor(language, key);
  const general = SETTING_DEFINITIONS
    .filter((definition) => definition.section === "general")
    .map((definition) => renderSetting(definition, values, language))
    .join("");
  const compiler = SETTING_DEFINITIONS
    .filter((definition) => definition.section === "compiler")
    .map((definition) => renderSetting(definition, values, language))
    .join("");
  const title = t("settings.title");

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${escapeHtml(title)}</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    main { width: min(820px, calc(100% - 48px)); margin: 0 auto; padding: 32px 0 56px; }
    h1 { margin: 0 0 28px; font-size: 26px; font-weight: 600; letter-spacing: 0; }
    h2 { margin: 30px 0 4px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-settings-headerBorder, var(--vscode-panel-border)); font-size: 18px; font-weight: 600; letter-spacing: 0; }
    .setting { padding: 16px 0; border-bottom: 1px solid var(--vscode-settings-rowHoverBackground, transparent); }
    .setting label { display: block; margin-bottom: 6px; font-weight: 600; }
    .description { margin: 0 0 9px; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    input[type="text"], input[type="number"], select, textarea { box-sizing: border-box; width: 100%; color: var(--vscode-settings-textInputForeground, var(--vscode-input-foreground)); background: var(--vscode-settings-textInputBackground, var(--vscode-input-background)); border: 1px solid var(--vscode-settings-textInputBorder, var(--vscode-input-border, transparent)); border-radius: 2px; font: inherit; outline: none; }
    input[type="text"], input[type="number"], select { min-height: 28px; padding: 4px 7px; }
    select { max-width: 360px; }
    input[type="number"] { max-width: 140px; }
    textarea { min-height: 92px; padding: 7px; resize: vertical; font-family: var(--vscode-editor-font-family); }
    input:focus, select:focus, textarea:focus { border-color: var(--vscode-focusBorder); }
    .checkbox-row { display: flex; align-items: center; min-height: 28px; }
    .checkbox-row input { margin: 0 8px 0 0; }
    .checkbox-row label { margin: 0; }
    @media (max-width: 520px) { main { width: calc(100% - 28px); padding-top: 22px; } }
  </style>
</head>
<body>
  <main>
    <h1>Delphi DCC Builder: ${escapeHtml(title)}</h1>
    <section><h2>${escapeHtml(t("settings.section.general"))}</h2>${general}</section>
    <section><h2>${escapeHtml(t("settings.section.compiler"))}</h2>${compiler}</section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-setting]').forEach((control) => {
      control.addEventListener('change', () => {
        let value = control.value;
        if (control.dataset.kind === 'boolean') value = control.checked;
        vscode.postMessage({ type: 'updateSetting', key: control.dataset.setting, value });
      });
    });
  </script>
</body>
</html>`;
}

function renderSetting(
  definition: SettingDefinition,
  values: SettingsValues,
  language: ExtensionLanguage
): string {
  const value = values[definition.key] ?? definition.defaultValue;
  const label = escapeHtml(localizeFor(language, definition.label));
  const description = escapeHtml(localizeFor(language, definition.description));
  const id = `setting-${definition.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  let control: string;

  if (definition.kind === "boolean") {
    control = `<div class="checkbox-row"><input id="${id}" type="checkbox" data-setting="${definition.key}" data-kind="boolean"${value === true ? " checked" : ""}><label for="${id}">${label}</label></div>`;
    return `<div class="setting" data-section="${definition.section}">${control}<p class="description">${description}</p></div>`;
  }

  if (definition.kind === "select") {
    const options = definition.options!.map((option) => {
      const optionLabel = option.label ? localizeFor(language, option.label) : option.value;
      return `<option value="${escapeHtml(option.value)}"${option.value === value ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`;
    }).join("");
    control = `<select id="${id}" data-setting="${definition.key}" data-kind="select">${options}</select>`;
  } else if (definition.kind === "integer") {
    control = `<input id="${id}" type="number" data-setting="${definition.key}" data-kind="integer" value="${escapeHtml(String(value))}" min="${definition.minimum}" max="${definition.maximum}">`;
  } else if (definition.kind === "json-array" || definition.kind === "json-object") {
    control = `<textarea id="${id}" data-setting="${definition.key}" data-kind="${definition.kind}" spellcheck="false">${escapeHtml(JSON.stringify(value, null, 2))}</textarea>`;
  } else {
    control = `<input id="${id}" type="text" data-setting="${definition.key}" data-kind="text" value="${escapeHtml(String(value))}" spellcheck="false">`;
  }

  return `<div class="setting" data-section="${definition.section}"><label for="${id}">${label}</label><p class="description">${description}</p>${control}</div>`;
}

function parseJson(rawValue: unknown): unknown {
  if (typeof rawValue !== "string") {
    return rawValue;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error("Invalid JSON");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]!);
}
