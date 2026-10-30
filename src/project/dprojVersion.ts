import { DelphiPlatform } from "../core/types";
import { localize } from "../localization/localizer";
import { evaluateDproj } from "./dprojParser";
import { expandProperties, PropertyBag } from "./propertyResolver";

const VERSION_COMPONENT_NAMES = [
  "VerInfo_MajorVer",
  "VerInfo_MinorVer",
  "VerInfo_Release",
  "VerInfo_Build"
] as const;
const VERSION_PROPERTY_NAMES = [...VERSION_COMPONENT_NAMES, "VerInfo_IncludeVerInfo", "VerInfo_Keys"];
const LEGACY_VERSION_GROUP_LABEL = "DelphiDccBuilderVersion";
const PROPERTY_GROUP_PATTERN = /(?:^[ \t]*)?<PropertyGroup\b(?![^>]*\/\s*>)([^>]*)>[\s\S]*?<\/PropertyGroup\s*>(?:[ \t]*\r?\n)?/gim;

export interface DprojVersionOptions {
  projectFile: string;
  configuration: string;
  platform: DelphiPlatform;
  initialProperties?: Record<string, string | undefined>;
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
  const configurationKey = evaluation.configurations.find((item) => (
    item.name.toLocaleLowerCase() === evaluation.configuration.toLocaleLowerCase()
  ))?.key ?? evaluation.configuration;
  const isTarget = (attributes: string): boolean => targetsConfigurationPlatform(
    readAttribute(attributes, "Condition"), evaluation.configuration, configurationKey, options.platform
  );
  const cleaned = content.replace(PROPERTY_GROUP_PATTERN, (group: string, attributes: string) => {
    if (readAttribute(attributes, "Label") !== LEGACY_VERSION_GROUP_LABEL || !isTarget(attributes)) {
      return group;
    }
    const properties = VERSION_PROPERTY_NAMES.join("|");
    const stripped = group.replace(new RegExp(
      `[ \\t]*<(${properties})\\b[^>]*?(?:\\/\\s*>|>[\\s\\S]*?<\\/\\1\\s*>)[ \\t]*(?:\\r?\\n)?`,
      "gi"
    ), "");
    const body = stripped.slice(stripped.indexOf(">") + 1, stripped.lastIndexOf("</"));
    return body.trim() ? stripped : "";
  });
  const candidates = [...cleaned.matchAll(PROPERTY_GROUP_PATTERN)].filter((match) => (
    readAttribute(match[1], "Label") !== LEGACY_VERSION_GROUP_LABEL && isTarget(match[1])
  ));
  const target = candidates.filter((match) => VERSION_PROPERTY_NAMES.some((name) => (
    readPropertyXml(match[0], name) !== undefined
  ))).at(-1) ?? candidates.at(-1);
  const currentKeys = escapeXmlText(preserveMetadataExpressions(evaluation.rawVersionInfoKeys ?? "", evaluation.properties));
  const components = normalized.split(".");
  const properties: Array<[string, string]> = VERSION_COMPONENT_NAMES.map((name, index) => (
    [name, components[index] ?? "0"]
  ));
  properties.push(
    ["VerInfo_IncludeVerInfo", escapeXmlText(evaluation.properties.VerInfo_IncludeVerInfo?.trim() || "true")],
    ["VerInfo_Keys", updateVersionKeys(currentKeys, normalized)]
  );
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  let updated: string;
  if (target?.index !== undefined) {
    let group = target[0];
    for (const [name, value] of properties) {
      group = upsertProperty(group, name, value, newline);
    }
    updated = cleaned.slice(0, target.index) + group + cleaned.slice(target.index + target[0].length);
  } else {
    updated = insertVersionGroup(cleaned, evaluation.configuration, options.platform, properties, newline);
  }
  const scoped = insertVersionGroup(cleaned, evaluation.configuration, options.platform, properties, newline);
  const expected = evaluateDproj(scoped, options.projectFile, options).properties;
  const actual = evaluateDproj(updated, options.projectFile, options).properties;
  if (VERSION_PROPERTY_NAMES.some((name) => actual[name] !== expected[name])) updated = scoped;
  if (readDprojVersion(updated, options) !== normalized) {
    throw new Error(localize("projectVersion.error.ineffective", {
      configuration: evaluation.configuration,
      platform: options.platform
    }));
  }
  return updated;
}

function preserveMetadataExpressions(raw: string, properties: Record<string, string>): string {
  const entries = (properties.VerInfo_Keys ?? "").split(";");
  const bag = new PropertyBag(properties);
  return raw.split(";").map((entry, index) => (
    expandProperties(entry, bag).value === entries[index] ? entry : entries[index] ?? entry
  )).join(";");
}

function targetsConfigurationPlatform(
  condition: string | undefined,
  configuration: string,
  configurationKey: string,
  platform: DelphiPlatform
): boolean {
  if (!condition) {
    return false;
  }
  const platformCondition = `'$(Platform)'=='${platform}'`;
  const configurationConditions = [
    `'$(Config)'=='${configuration}'`, `'$(Configuration)'=='${configuration}'`,
    `'$(${configurationKey})'!=''`, `'$(${configurationKey})'=='true'`
  ];
  const conditions = [
    `'$(${configurationKey}_${platform})'!=''`,
    `'$(${configurationKey}_${platform})'=='true'`,
    ...configurationConditions.flatMap((value) => [
      `${value} and ${platformCondition}`, `${platformCondition} and ${value}`
    ])
  ];
  const normalized = normalizeCondition(condition);
  return conditions.some((value) => normalizeCondition(value) === normalized);
}

function normalizeCondition(value: string): string {
  const singleQuoted = value.replace(/"([^"]*)"/g, (_match, text: string) => `'${text}'`);
  return (singleQuoted.match(/'[^']*'|[^']+/g) ?? []).map((part) => (
    part.startsWith("'") ? part.toLocaleLowerCase() : part.replace(/[\s()]/g, "").toLocaleLowerCase()
  )).join("");
}

function propertyPattern(name: string): RegExp {
  return new RegExp(
    `(<${name}\\b(?![^>]*\\/\\s*>)[^>]*>)([\\s\\S]*?)(<\\/${name}\\s*>)|(<${name}\\b[^>]*\\/\\s*>)`, "gi"
  );
}

function readPropertyXml(group: string, name: string): string | undefined {
  const match = propertyPattern(name).exec(group);
  return match ? match[2] ?? "" : undefined;
}

function upsertProperty(group: string, name: string, value: string, newline: string): string {
  const pattern = propertyPattern(name);
  if (pattern.test(group)) {
    return group.replace(pattern, (_match, opening: string, _value: string, closing: string, empty: string) => (
      opening ? `${opening}${value}${closing}` : `${empty.replace(/\/\s*>$/, ">")}${value}</${name}>`
    ));
  }
  const closing = /<\/PropertyGroup\s*>/i.exec(group)!;
  const openingEnd = group.indexOf(">");
  const body = group.slice(openingEnd + 1, closing.index);
  const trailing = body.match(/(?:\r?\n)([ \t]*)$/);
  const closingIndent = trailing?.[1] ?? "";
  const childIndent = body.match(/(?:^|\r?\n)([ \t]+)<[A-Za-z_]/)?.[1] ?? `${closingIndent}  `;
  const trimmedBody = trailing ? body.slice(0, -trailing[0].length) : body;
  return `${group.slice(0, openingEnd + 1)}${trimmedBody}${newline}`
    + `${childIndent}<${name}>${value}</${name}>${newline}${closingIndent}${group.slice(closing.index)}`;
}

function insertVersionGroup(
  content: string,
  configuration: string,
  platform: DelphiPlatform,
  properties: Array<[string, string]>,
  newline: string
): string {
  const indent = content.match(/(?:^|\r?\n)([ \t]*)<PropertyGroup\b/i)?.[1] ?? "  ";
  const condition = `'$(Config)'=='${configuration}' and '$(Platform)'=='${platform}'`;
  const body = properties.map(([name, value]) => (
    `${indent}  <${name}>${value}</${name}>${newline}`
  )).join("");
  const group = `${indent}<PropertyGroup Condition="${escapeXmlAttribute(condition)}">${newline}`
    + `${body}${indent}</PropertyGroup>${newline}`;
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
  return content.slice(0, insertionIndex) + prefix + group + content.slice(insertionIndex);
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
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}
