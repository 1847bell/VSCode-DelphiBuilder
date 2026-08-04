import { DelphiPlatform } from "../core/types";

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
    throw new Error("Output path cannot be empty.");
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
  limit = 10
): string[] {
  const value = outputPath.trim();
  if (!value || limit <= 0) {
    return [];
  }
  const normalized = value.toLocaleLowerCase();
  return [value, ...history.filter((item) => (
    item.trim() && item.trim().toLocaleLowerCase() !== normalized
  ))].slice(0, limit);
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
    throw new Error("Invalid dproj PropertyGroup: closing element was not found.");
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
    throw new Error("Invalid dproj file: Project closing element was not found.");
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
