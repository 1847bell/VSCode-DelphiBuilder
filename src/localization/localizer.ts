import en from "./locales/en.json";
import zhCn from "./locales/zh-cn.json";

export type ExtensionLanguage = "en" | "zh-cn";
export type MessageKey = keyof typeof en;
export type MessageArguments = Record<string, string | number>;

const messages: Record<ExtensionLanguage, Record<MessageKey, string>> = {
  en,
  "zh-cn": zhCn
};

let activeLanguage: ExtensionLanguage = "en";

export function getLanguage(): ExtensionLanguage {
  return activeLanguage;
}

export function resolveLanguage(value: unknown): ExtensionLanguage {
  return typeof value === "string" && value.toLocaleLowerCase() === "zh-cn" ? "zh-cn" : "en";
}

export function setLanguage(language: ExtensionLanguage): void {
  activeLanguage = language;
}

export function localize(key: MessageKey, arguments_: MessageArguments = {}): string {
  return localizeFor(activeLanguage, key, arguments_);
}

export function localizeFor(
  language: ExtensionLanguage,
  key: MessageKey,
  arguments_: MessageArguments = {}
): string {
  const template = messages[language][key] ?? messages.en[key];
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(arguments_, name)
      ? String(arguments_[name])
      : placeholder
  ));
}
