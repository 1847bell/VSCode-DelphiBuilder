import path from "node:path";
import { DelphiPlatform } from "../core/types";
import { localize } from "../localization/localizer";

export const DEFAULT_OUTPUT_PATH_HISTORY_LIMIT = 5;
export const MIN_OUTPUT_PATH_HISTORY_LIMIT = 1;
export const MAX_OUTPUT_PATH_HISTORY_LIMIT = 15;

export type OutputPathHistoryStore = Record<string, string[]>;

export interface UpdateDprojOutputPathOptions {
  configuration: string;
  configurationKey: string;
  platform: DelphiPlatform;
  outputPath: string;
}

export function updateDprojOutputPath(
  content: string,
  options: UpdateDprojOutputPathOptions
): string {
  const outputPath = options.outputPath.trim();
  if (!outputPath) {
    throw new Error(localize("outputPath.error.empty"));
  }

  const groups = [...content.matchAll(/<PropertyGroup\b([^>]*)>[\s\S]*?<\/PropertyGroup\s*>/gi)];
  const target = groups.filter((match) => {
    const condition = readCondition(match[1]);
    return condition !== undefined && targetsConfigurationPlatform(condition, options);
  }).at(-1);

  if (target?.index !== undefined) {
    const updatedGroup = upsertOutputPath(target[0], outputPath, detectNewline(content));
    return content.slice(0, target.index) + updatedGroup + content.slice(target.index + target[0].length);
  }

  return insertOutputPathGroup(content, { ...options, outputPath });
}

export function addOutputPathHistory(
  history: readonly string[],
  outputPath: string,
  limit = DEFAULT_OUTPUT_PATH_HISTORY_LIMIT
): string[] {
  return normalizeOutputPathHistory([outputPath, ...history], limit);
}

export function getProjectOutputPathHistory(
  storedValue: unknown,
  projectFile: string,
  limit = DEFAULT_OUTPUT_PATH_HISTORY_LIMIT
): string[] {
  const history = Array.isArray(storedValue)
    ? storedValue
    : readOutputPathHistoryStore(storedValue)[outputPathHistoryKey(projectFile)] ?? [];
  return normalizeOutputPathHistory(history, limit);
}

export function updateProjectOutputPathHistory(
  storedValue: unknown,
  projectFile: string,
  outputPaths: readonly string[],
  limit = DEFAULT_OUTPUT_PATH_HISTORY_LIMIT
): OutputPathHistoryStore {
  const store = readOutputPathHistoryStore(storedValue);
  let history = getProjectOutputPathHistory(storedValue, projectFile, limit);
  for (const outputPath of outputPaths) {
    history = addOutputPathHistory(history, outputPath, limit);
  }
  return {
    ...store,
    [outputPathHistoryKey(projectFile)]: history
  };
}

function normalizeOutputPathHistory(history: readonly unknown[], limit: number): string[] {
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  if (maximum === 0) {
    return [];
  }
  const normalized = new Set<string>();
  const result: string[] = [];
  for (const item of history) {
    if (typeof item !== "string") {
      continue;
    }
    const value = item.trim();
    const key = value.toLocaleLowerCase();
    if (!value || normalized.has(key)) {
      continue;
    }
    normalized.add(key);
    result.push(value);
    if (result.length >= maximum) {
      break;
    }
  }
  return result;
}

function readOutputPathHistoryStore(value: unknown): OutputPathHistoryStore {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string[]] => (
      Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string")
    ))
  );
}

function outputPathHistoryKey(projectFile: string): string {
  return path.normalize(path.resolve(projectFile)).toLocaleLowerCase();
}

function readCondition(attributes: string): string | undefined {
  const doubleQuoted = attributes.match(/\bCondition\s*=\s*"([^"]*)"/i);
  if (doubleQuoted) {
    return decodeXmlEntities(doubleQuoted[1]);
  }
  const singleQuoted = attributes.match(/\bCondition\s*=\s*'([^']*)'/i);
  return singleQuoted ? decodeXmlEntities(singleQuoted[1]) : undefined;
}

function targetsConfigurationPlatform(
  condition: string,
  options: UpdateDprojOutputPathOptions
): boolean {
  const compact = condition.replace(/[\s'"]/g, "").toLocaleLowerCase();
  const configuration = options.configuration.replace(/\s/g, "").toLocaleLowerCase();
  const configurationKey = options.configurationKey.replace(/\s/g, "").toLocaleLowerCase();
  const platform = options.platform.toLocaleLowerCase();
  const platformMatch = compact.includes(`$(platform)==${platform}`);
  const configurationMatch = compact.includes(`$(config)==${configuration}`)
    || compact.includes(`$(configuration)==${configuration}`);
  const keyedConfigurationMatch = compact.includes(`$(${configurationKey})`);
  const keyedPlatformMatch = compact.includes(`$(${configurationKey}_${platform})`);
  return keyedPlatformMatch || (platformMatch && (configurationMatch || keyedConfigurationMatch));
}

function upsertOutputPath(group: string, outputPath: string, newline: string): string {
  const escaped = escapeXmlText(outputPath);
  const property = /(<DCC_ExeOutput\b[^>]*>)[\s\S]*?(<\/DCC_ExeOutput\s*>)/i;
  if (property.test(group)) {
    return group.replace(property, (_match, opening: string, closing: string) => (
      `${opening}${escaped}${closing}`
    ));
  }

  const selfClosing = /<DCC_ExeOutput\b[^>]*\/>/i;
  if (selfClosing.test(group)) {
    return group.replace(selfClosing, `<DCC_ExeOutput>${escaped}</DCC_ExeOutput>`);
  }

  const closing = /<\/PropertyGroup\s*>/i.exec(group);
  if (!closing?.index) {
    throw new Error(localize("outputPath.error.propertyGroup"));
  }
  const openingEnd = group.indexOf(">");
  const body = group.slice(openingEnd + 1, closing.index);
  const trailing = body.match(/(?:\r?\n)([ \t]*)$/);
  const closingIndent = trailing?.[1] ?? "";
  const childIndent = body.match(/(?:^|\r?\n)([ \t]+)<[A-Za-z_]/)?.[1]
    ?? `${closingIndent}  `;
  const bodyWithoutTrailing = trailing ? body.slice(0, -trailing[0].length) : body;
  return `${group.slice(0, openingEnd + 1)}${bodyWithoutTrailing}${newline}`
    + `${childIndent}<DCC_ExeOutput>${escaped}</DCC_ExeOutput>${newline}`
    + `${closingIndent}${group.slice(closing.index)}`;
}

function insertOutputPathGroup(
  content: string,
  options: UpdateDprojOutputPathOptions
): string {
  const closingMatches = [...content.matchAll(/<\/Project\s*>/gi)];
  const closing = closingMatches.at(-1);
  if (closing?.index === undefined) {
    throw new Error(localize("outputPath.error.projectClosing"));
  }

  const newline = detectNewline(content);
  const groupIndent = content.match(/(?:^|\r?\n)([ \t]*)<PropertyGroup\b/i)?.[1] ?? "  ";
  const propertyIndent = `${groupIndent}  `;
  const condition = `'$(Config)'=='${escapeXmlAttribute(options.configuration)}' and `
    + `'$(Platform)'=='${options.platform}'`;
  const group = `${groupIndent}<PropertyGroup Condition="${condition}" Label="DelphiDccBuilderOutput">${newline}`
    + `${propertyIndent}<DCC_ExeOutput>${escapeXmlText(options.outputPath)}</DCC_ExeOutput>${newline}`
    + `${groupIndent}</PropertyGroup>${newline}`;
  const firstImport = /<Import\b/i.exec(content);
  const insertionIndex = firstImport?.index ?? closing.index;
  const lineStart = content.lastIndexOf("\n", insertionIndex - 1) + 1;
  return content.slice(0, lineStart) + group + content.slice(lineStart);
}

function detectNewline(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}
