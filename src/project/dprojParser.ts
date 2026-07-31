import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { DprojEvaluation, ProjectConfiguration } from "../core/types";
import { ConditionSyntaxError, evaluateCondition } from "./conditionEvaluator";
import { expandMsBuildProperties, expandProperties, PropertyBag } from "./propertyResolver";

type OrderedNode = Record<string, unknown>;

export interface EvaluateDprojOptions {
  configuration?: string;
  platform?: "Win32";
  initialProperties?: Record<string, string | undefined>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false
});

export async function evaluateDprojFile(
  projectFile: string,
  options: EvaluateDprojOptions = {}
): Promise<DprojEvaluation> {
  const content = await readFile(projectFile, "utf8");
  return evaluateDproj(content, path.resolve(projectFile), options);
}

export function evaluateDproj(
  content: string,
  projectFile: string,
  options: EvaluateDprojOptions = {}
): DprojEvaluation {
  const document = parser.parse(content) as OrderedNode[];
  const projectNode = findElement(document, "Project");
  if (!projectNode) {
    throw new Error(`Invalid dproj file: Project root element was not found in ${projectFile}`);
  }

  const projectChildren = getChildren(projectNode);
  const configurations = readConfigurations(projectChildren);
  const configuration = selectConfiguration(configurations, options.configuration);
  const platform = options.platform ?? "Win32";
  const properties = new PropertyBag(options.initialProperties);
  seedConfigurationProperties(properties, configurations, configuration, platform);

  const warnings: string[] = [];
  for (const node of projectChildren) {
    const name = getElementName(node);
    if (name === "PropertyGroup") {
      evaluatePropertyGroup(node, properties, warnings);
    } else if (name === "Import") {
      const project = getAttribute(node, "Project") ?? "(unknown)";
      warnings.push(`MSBuild import is not executed: ${project}`);
    } else if (name === "Target") {
      warnings.push("MSBuild Target elements are not executed by direct DCC32 builds.");
    }
  }

  const projectDirectory = path.dirname(projectFile);
  let mainSourceValue = properties.get("MainSource")?.trim();
  if (!mainSourceValue) {
    mainSourceValue = `${path.basename(projectFile, path.extname(projectFile))}.dpr`;
    warnings.push(`MainSource is missing; using ${mainSourceValue}.`);
  }
  const expandedMainSource = expandProperties(mainSourceValue, properties);
  addUnresolvedWarnings(expandedMainSource.unresolved, "MainSource", warnings);
  const mainSource = path.isAbsolute(expandedMainSource.value)
    ? path.normalize(expandedMainSource.value)
    : path.resolve(projectDirectory, expandedMainSource.value);

  for (const [name, value] of Object.entries(properties.toObject())) {
    addUnresolvedWarnings(expandProperties(value, properties).unresolved, name, warnings);
  }

  return {
    projectFile,
    mainSource,
    configuration,
    platform,
    configurations,
    properties: properties.toObject(),
    warnings: [...new Set(warnings)]
  };
}

export function discoverConfigurations(content: string): ProjectConfiguration[] {
  const document = parser.parse(content) as OrderedNode[];
  const projectNode = findElement(document, "Project");
  return projectNode ? readConfigurations(getChildren(projectNode)) : [];
}

function readConfigurations(projectChildren: OrderedNode[]): ProjectConfiguration[] {
  const configurations: ProjectConfiguration[] = [];
  for (const itemGroup of findElements(projectChildren, "ItemGroup")) {
    for (const item of getChildren(itemGroup)) {
      if (getElementName(item) !== "BuildConfiguration") {
        continue;
      }
      const name = getAttribute(item, "Include")?.trim();
      if (!name) {
        continue;
      }
      const children = getChildren(item);
      configurations.push({
        name,
        key: getChildText(children, "Key")?.trim() || name,
        parentKey: getChildText(children, "CfgParent")?.trim() || undefined
      });
    }
  }
  return configurations;
}

function selectConfiguration(
  configurations: ProjectConfiguration[],
  requested: string | undefined
): string {
  const selectable = configurations.filter((item) => item.name.toLocaleLowerCase() !== "base");
  if (requested) {
    const match = selectable.find(
      (item) => item.name.toLocaleLowerCase() === requested.toLocaleLowerCase()
    );
    if (!match && selectable.length > 0) {
      throw new Error(
        `Configuration '${requested}' is not defined. Available configurations: ${selectable.map((item) => item.name).join(", ")}`
      );
    }
    return match?.name ?? requested;
  }
  return selectable.find((item) => item.name.toLocaleLowerCase() === "debug")?.name
    ?? selectable[0]?.name
    ?? "Debug";
}

function seedConfigurationProperties(
  properties: PropertyBag,
  configurations: ProjectConfiguration[],
  configurationName: string,
  platform: "Win32"
): void {
  properties.set("Config", configurationName);
  properties.set("Configuration", configurationName);
  properties.set("Platform", platform);

  const byKey = new Map(configurations.map((item) => [item.key.toLocaleLowerCase(), item]));
  let current = configurations.find(
    (item) => item.name.toLocaleLowerCase() === configurationName.toLocaleLowerCase()
  );
  const visited = new Set<string>();
  while (current && !visited.has(current.key.toLocaleLowerCase())) {
    visited.add(current.key.toLocaleLowerCase());
    properties.set(current.key, "true");
    properties.set(`${current.key}_${platform}`, "true");
    current = current.parentKey ? byKey.get(current.parentKey.toLocaleLowerCase()) : undefined;
  }

  const base = configurations.find((item) => item.name.toLocaleLowerCase() === "base");
  if (base) {
    properties.set(base.key, "true");
    properties.set(`${base.key}_${platform}`, "true");
  }
}

function evaluatePropertyGroup(
  group: OrderedNode,
  properties: PropertyBag,
  warnings: string[]
): void {
  const condition = getAttribute(group, "Condition");
  if (!tryEvaluateCondition(condition, properties, warnings)) {
    return;
  }

  for (const propertyNode of getChildren(group)) {
    const propertyName = getElementName(propertyNode);
    if (!propertyName || propertyName.startsWith("#")) {
      continue;
    }
    const propertyCondition = getAttribute(propertyNode, "Condition");
    if (!tryEvaluateCondition(propertyCondition, properties, warnings)) {
      continue;
    }
    const rawValue = getText(getChildren(propertyNode));
    const expanded = expandMsBuildProperties(rawValue, properties);
    for (const name of expanded.unresolved) {
      if (name.toLocaleLowerCase() !== propertyName.toLocaleLowerCase()) {
        warnings.push(`Undefined property $(${name}) was treated as empty while evaluating ${propertyName}.`);
      }
    }
    properties.set(propertyName, expanded.value);
  }
}

function tryEvaluateCondition(
  condition: string | undefined,
  properties: PropertyBag,
  warnings: string[]
): boolean {
  try {
    return evaluateCondition(condition, properties);
  } catch (error) {
    if (error instanceof ConditionSyntaxError) {
      warnings.push(`Unsupported Condition '${condition}': ${error.message}`);
      return false;
    }
    throw error;
  }
}

function addUnresolvedWarnings(names: string[], source: string, warnings: string[]): void {
  for (const name of names) {
    warnings.push(`Unresolved property $(${name}) in ${source}.`);
  }
}

function findElement(nodes: OrderedNode[], name: string): OrderedNode | undefined {
  return nodes.find((node) => getElementName(node) === name);
}

function findElements(nodes: OrderedNode[], name: string): OrderedNode[] {
  return nodes.filter((node) => getElementName(node) === name);
}

function getElementName(node: OrderedNode): string | undefined {
  return Object.keys(node).find((key) => key !== ":@" && key !== "#text");
}

function getChildren(node: OrderedNode): OrderedNode[] {
  const name = getElementName(node);
  const children = name ? node[name] : undefined;
  return Array.isArray(children) ? children as OrderedNode[] : [];
}

function getAttribute(node: OrderedNode, name: string): string | undefined {
  const attributes = node[":@"] as Record<string, unknown> | undefined;
  const value = attributes?.[`@_${name}`];
  return typeof value === "string" ? value : value === undefined ? undefined : String(value);
}

function getChildText(nodes: OrderedNode[], name: string): string | undefined {
  const node = findElement(nodes, name);
  return node ? getText(getChildren(node)) : undefined;
}

function getText(nodes: OrderedNode[]): string {
  return nodes.map((node) => {
    const text = node["#text"];
    if (typeof text === "string" || typeof text === "number") {
      return String(text);
    }
    return getText(getChildren(node));
  }).join("");
}
