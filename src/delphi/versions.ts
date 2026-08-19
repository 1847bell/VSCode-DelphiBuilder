import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DelphiPlatform, DelphiVersion } from "../core/types";
import { localize } from "../localization/localizer";

export interface DccPathSwitchConfiguration {
  switch: string;
  kind: "single" | "list";
}

export interface DccArgumentRuleConfiguration {
  property: string;
  kind: "boolean" | "enum";
  values: Record<string, string[]>;
}

export interface DccArgumentConfiguration {
  baseArguments: string[];
  rebuildArguments: string[];
  specialSwitches: {
    unitSearchPath: string;
    includePath: string;
    resourcePath: string;
    runtimePackages: string;
  };
  valueSwitches: Record<string, string>;
  pathSwitches: Record<string, DccPathSwitchConfiguration>;
  argumentRules: DccArgumentRuleConfiguration[];
  knownMetadata: string[];
}

export interface DelphiVersionConfiguration {
  version: DelphiVersion;
  displayName: string;
  bdsRegistryVersion: string;
  studioDirectoryVersion: string;
  settingsSection: string;
  compilerSettingNames: Record<DelphiPlatform, string>;
  compilerFileNames: Record<DelphiPlatform, string>;
  dcc: DccArgumentConfiguration;
}

export const DEFAULT_DELPHI_VERSION: DelphiVersion = "XE7";

const VERSION_CONFIGURATIONS = loadVersionConfigurations();

export function getSupportedDelphiVersions(): DelphiVersion[] {
  return [...VERSION_CONFIGURATIONS.keys()];
}

export function resolveDelphiVersion(value: string | undefined): DelphiVersion {
  const requested = value?.trim() || DEFAULT_DELPHI_VERSION;
  const normalized = requested.toLocaleLowerCase();
  const configuration = [...VERSION_CONFIGURATIONS.values()].find(
    (item) => item.version.toLocaleLowerCase() === normalized
  );
  if (configuration) {
    return configuration.version;
  }
  throw new Error(localize("version.error.unsupported", {
    version: requested,
    supported: getSupportedDelphiVersions().join(", ")
  }));
}

export function getDelphiVersionConfiguration(
  version: DelphiVersion
): DelphiVersionConfiguration {
  const resolved = resolveDelphiVersion(version);
  return VERSION_CONFIGURATIONS.get(resolved)!;
}

function loadVersionConfigurations(): Map<string, DelphiVersionConfiguration> {
  const directory = findVersionConfigurationDirectory();
  const configurations = new Map<string, DelphiVersionConfiguration>();
  for (const fileName of readdirSync(directory)) {
    if (path.extname(fileName).toLocaleLowerCase() !== ".json"
      || fileName.toLocaleLowerCase() === "schema.json") {
      continue;
    }
    const file = path.join(directory, fileName);
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const configuration = validateVersionConfiguration(value, fileName);
    if (configurations.has(configuration.version)) {
      throw new Error(localize("version.error.duplicate", { version: configuration.version }));
    }
    configurations.set(configuration.version, configuration);
  }
  if (configurations.size === 0) {
    throw new Error(localize("version.error.none", { directory }));
  }
  return configurations;
}

function findVersionConfigurationDirectory(): string {
  const candidates = [
    path.resolve(__dirname, "..", "delphi-versions"),
    path.resolve(__dirname, "..", "..", "delphi-versions")
  ];
  const directory = candidates.find(existsSync);
  if (!directory) {
    throw new Error(localize("version.error.directoryMissing", {
      directories: candidates.join(", ")
    }));
  }
  return directory;
}

function validateVersionConfiguration(
  value: unknown,
  fileName: string
): DelphiVersionConfiguration {
  if (!isRecord(value)) {
    throw new Error(localize("version.error.invalidObject", { file: fileName }));
  }
  const requiredStrings = [
    "version",
    "displayName",
    "bdsRegistryVersion",
    "studioDirectoryVersion",
    "settingsSection"
  ];
  for (const property of requiredStrings) {
    if (typeof value[property] !== "string" || !value[property].trim()) {
      throw new Error(localize("version.error.required", { file: fileName, property }));
    }
  }
  if (!isRecord(value.compilerSettingNames)
    || !isRecord(value.compilerFileNames)
    || !isRecord(value.dcc)) {
    throw new Error(localize("version.error.mappings", { file: fileName }));
  }
  return value as unknown as DelphiVersionConfiguration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
