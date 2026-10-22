import { DelphiPlatform } from "../core/types";
import { localize } from "../localization/localizer";
import { evaluateDproj } from "./dprojParser";

const VERSION_COMPONENT_NAMES = [
  "VerInfo_MajorVer",
  "VerInfo_MinorVer",
  "VerInfo_Release",
  "VerInfo_Build"
] as const;
const VERSION_GROUP_LABEL = "DelphiDccBuilderVersion";

export interface DprojVersionOptions {
  projectFile: string;
  configuration: string;
  platform: DelphiPlatform;
}

export function readDprojVersion(
  content: string,
  options: DprojVersionOptions
): string | undefined {
  const { properties } = evaluateDproj(content, options.projectFile, options);
  const versionInfo = properties.VerInfo_Keys;
  if (versionInfo) {
    const fileVersion = readVersionKey(versionInfo, "FileVersion");
    const productVersion = readVersionKey(versionInfo, "ProductVersion");
    if (fileVersion || productVersion) {
      return fileVersion ?? productVersion;
    }
  }

  const components = VERSION_COMPONENT_NAMES.map((name) => properties[name]);
  if (components.some((value) => value !== undefined && value.trim() !== "")) {
    return components.map((value) => value?.trim() || "0").join(".");
  }
  return undefined;
}

export function isValidDprojVersion(value: string): boolean {
  const parts = value.trim().split(".");
  return parts.length >= 1
    && parts.length <= VERSION_COMPONENT_NAMES.length
    && parts.every((part) => /^\d+$/.test(part));
}

export function updateDprojVersion(
  content: string,
  version: string,
  options: DprojVersionOptions
): string {
  const normalized = version.trim();
  if (!normalized) {
    throw new Error(localize("projectVersion.error.empty"));
  }
  if (!isValidDprojVersion(normalized)) {
    throw new Error(localize("projectVersion.error.invalid"));
  }

  const evaluation = evaluateDproj(content, options.projectFile, options);
  const components = normalized.split(".");
  const properties: Array<[string, string]> = VERSION_COMPONENT_NAMES.map((name, index) => (
    [name, components[index] ?? "0"]
  ));
  properties.push(
    ["VerInfo_IncludeVerInfo", evaluation.properties.VerInfo_IncludeVerInfo?.trim() || "true"],
    ["VerInfo_Keys", updateVersionKeys(evaluation.properties.VerInfo_Keys ?? "", normalized)]
  );

  const condition = `'$(Config)'=='${evaluation.configuration}' and '$(Platform)'=='${options.platform}'`;
  const groups = [...content.matchAll(/<PropertyGroup\b([^>]*)>[\s\S]*?<\/PropertyGroup\s*>/gi)];
  const target = groups.filter((match) => (
    readAttribute(match[1], "Label") === VERSION_GROUP_LABEL
      && readAttribute(match[1], "Condition") === condition
  )).at(-1);
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const indent = content.match(/(?:^|\r?\n)([ \t]*)<PropertyGroup\b/i)?.[1] ?? "  ";
  const body = properties.map(([name, value]) => (
    `${indent}  <${name}>${escapeXmlText(value)}</${name}>${newline}`
  )).join("");
  const group = `<PropertyGroup Condition="${escapeXmlAttribute(condition)}" Label="${VERSION_GROUP_LABEL}">${newline}`
    + `${body}${indent}</PropertyGroup>`;

  if (target?.index !== undefined) {
    return content.slice(0, target.index) + group + content.slice(target.index + target[0].length);
  }

  const closing = [...content.matchAll(/<\/Project\s*>/gi)].at(-1);
  if (closing?.index === undefined) {
    throw new Error(localize("projectVersion.error.projectClosing"));
  }
  let insertionIndex = /<Import\b/i.exec(content)?.index ?? closing.index;
  const lineStart = content.lastIndexOf("\n", insertionIndex - 1) + 1;
  if (!content.slice(lineStart, insertionIndex).trim()) {
    insertionIndex = lineStart;
  }
  const prefix = insertionIndex > 0 && content[insertionIndex - 1] !== "\n" ? newline : "";
  return content.slice(0, insertionIndex) + `${prefix}${indent}${group}${newline}`
    + content.slice(insertionIndex);
}

function updateVersionKeys(value: string, version: string): string {
  let updated = upsertVersionKey(value, "FileVersion", version);
  updated = upsertVersionKey(updated, "ProductVersion", version);
  return updated;
}

function upsertVersionKey(value: string, name: string, version: string): string {
  const pattern = new RegExp(`(^|;)(([ \\t]*)${name}([ \\t]*=[ \\t]*))[^;]*`, "i");
  if (pattern.test(value)) {
    return value.replace(pattern, (_match, separator: string, assignment: string) => (
      `${separator}${assignment}${version}`
    ));
  }

  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? "";
  const body = value.slice(0, value.length - trailingWhitespace.length);
  const separator = body && !body.endsWith(";") ? ";" : "";
  return `${body}${separator}${name}=${version}${trailingWhitespace}`;
}

function readVersionKey(value: string, name: string): string | undefined {
  const pattern = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;]*)`, "i");
  return pattern.exec(value)?.[1]?.trim() || undefined;
}

function readAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return pattern.exec(attributes)?.[2]
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}
