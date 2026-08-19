import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import { DelphiPlatform, DelphiVersion } from "../core/types";
import { localize } from "../localization/localizer";
import {
  DEFAULT_DELPHI_VERSION,
  getDelphiVersionConfiguration
} from "../delphi/versions";
import { expandProperties, PropertyBag } from "../project/propertyResolver";
import { queryRegistry } from "./registryReader";

export interface BdsEnvironment {
  rootDir: string;
  compilerPath: string;
  rsVarsPath: string;
  rsVarsFound: boolean;
  variables: Record<string, string>;
  libraryPath: string;
  debugDcuPath: string;
  warnings: string[];
}

export async function resolveBdsEnvironment(
  compilerOverride: string | undefined,
  environmentOverrides: Record<string, string> = {},
  platform: DelphiPlatform = "Win32",
  version: DelphiVersion = DEFAULT_DELPHI_VERSION,
  rsVarsOverride?: string
): Promise<BdsEnvironment> {
  const versionConfiguration = getDelphiVersionConfiguration(version);
  const bdsKey = `Software\\Embarcadero\\BDS\\${versionConfiguration.bdsRegistryVersion}`;
  const warnings: string[] = [];
  const userRoot = await readRoot("HKCU", bdsKey);
  const machineRoot = await readRoot("HKLM", bdsKey);
  const registryRoot = userRoot || machineRoot;
  const fallbackRoot = defaultRootDirectory(versionConfiguration.studioDirectoryVersion);
  const compilerName = versionConfiguration.compilerFileNames[platform];

  const compilerPath = compilerOverride?.trim()
    ? path.resolve(compilerOverride.trim())
    : registryRoot
      ? path.join(registryRoot, "bin", compilerName)
      : path.join(fallbackRoot, "bin", compilerName);

  const rootDir = (compilerOverride?.trim() ? inferRootFromCompiler(compilerPath) : undefined)
    || registryRoot
    || inferRootFromCompiler(compilerPath)
    || fallbackRoot;

  const configuredRsVarsPath = rsVarsOverride?.trim();
  const rsVarsPath = configuredRsVarsPath
    ? path.resolve(configuredRsVarsPath)
    : path.join(rootDir, "bin", "rsvars.bat");
  const rsVarsContent = await readOptionalFile(rsVarsPath);
  if (configuredRsVarsPath && rsVarsContent === undefined) {
    throw new Error(localize("bds.error.rsvarsMissing", { path: rsVarsPath }));
  }
  const rsVars = rsVarsContent === undefined
    ? {}
    : parseRsVarsContent(iconv.decode(rsVarsContent, "cp936"));
  const bdsUserDir = await readBdsUserDirectory(versionConfiguration.studioDirectoryVersion);

  const registryVariables = {
    ...await queryRegistry(`HKLM\\${bdsKey}\\Environment Variables`),
    ...await queryRegistry(`HKCU\\${bdsKey}\\Environment Variables`)
  };
  const derivedVariables: Record<string, string> = {
    BDS: rootDir,
    BDSBIN: path.join(rootDir, "bin"),
    BDSINCLUDE: path.join(rootDir, "include"),
    BDSLIB: path.join(rootDir, "lib"),
    BDSUSERDIR: bdsUserDir,
    DELPHI: rootDir,
  };
  const variables = mergeVariables(
    [derivedVariables, rsVars, derivedVariables, registryVariables, environmentOverrides],
    process.env
  );

  const libraryValues = {
    ...await queryRegistry(`HKLM\\${bdsKey}\\Library\\${platform}`),
    ...await queryRegistry(`HKCU\\${bdsKey}\\Library\\${platform}`)
  };
  const libraryPropertyBag = new PropertyBag({ ...process.env, ...variables, Platform: platform });
  const expandedLibraryPath = expandBdsPath(libraryValues["Search Path"] ?? "", libraryPropertyBag);
  const expandedDebugDcuPath = expandBdsPath(
    libraryValues["Debug DCU Path"] ?? "",
    libraryPropertyBag
  );
  const libraryPath = expandedLibraryPath.value;
  const debugDcuPath = expandedDebugDcuPath.value;

  if (!registryRoot && !compilerOverride?.trim()) {
    warnings.push(localize("bds.warning.root", {
      registryVersion: versionConfiguration.bdsRegistryVersion,
      version
    }));
  }
  if (rsVarsContent === undefined) {
    warnings.push(localize("bds.warning.rsvars", { path: rsVarsPath }));
  }
  if (!await exists(compilerPath)) {
    warnings.push(localize("bds.warning.compiler", {
      compiler: compilerName,
      path: compilerPath
    }));
  }
  if (!libraryPath) {
    warnings.push(localize("bds.warning.libraryPath", {
      registryVersion: versionConfiguration.bdsRegistryVersion,
      platform
    }));
  }
  for (const name of expandedLibraryPath.unresolved) {
    warnings.push(localize("bds.warning.libraryProperty", { name }));
  }
  for (const name of expandedDebugDcuPath.unresolved) {
    warnings.push(localize("bds.warning.debugProperty", { name }));
  }
  for (const [name, value] of Object.entries(variables)) {
    if (/\$\([^)]+\)|%[^%]+%/.test(value)) {
      warnings.push(localize("bds.warning.environment", { name, value }));
    }
  }

  return {
    rootDir,
    compilerPath,
    rsVarsPath,
    rsVarsFound: rsVarsContent !== undefined,
    variables,
    libraryPath,
    debugDcuPath,
    warnings
  };
}

export interface ResourceCompilerResolution {
  path?: string;
  candidates: string[];
}

export async function resolveResourceCompilerPath(
  configuredPath: string | undefined,
  rootDir: string,
  variables: Record<string, string>
): Promise<ResourceCompilerResolution> {
  const configured = configuredPath?.trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (!await exists(resolved)) {
      throw new Error(localize("bds.error.brccMissing", { path: resolved }));
    }
    return { path: resolved, candidates: [resolved] };
  }

  const candidates = [path.join(rootDir, "bin", "brcc32.exe")];
  const bdsBin = getVariable(variables, "BDSBIN")?.trim();
  if (bdsBin) {
    candidates.push(path.join(trimQuotes(bdsBin), "brcc32.exe"));
  }
  const pathValue = getVariable(variables, "PATH") ?? process.env.PATH ?? "";
  for (const directory of pathValue.split(path.delimiter)) {
    const value = trimQuotes(directory.trim());
    if (value) {
      candidates.push(path.join(value, "brcc32.exe"));
    }
  }

  const uniqueCandidates = [...new Map(
    candidates.map((candidate) => [path.normalize(candidate).toLocaleLowerCase(), path.normalize(candidate)])
  ).values()];
  for (const candidate of uniqueCandidates) {
    if (await exists(candidate)) {
      return { path: candidate, candidates: uniqueCandidates };
    }
  }
  return { candidates: uniqueCandidates };
}

function expandBdsPath(value: string, properties: PropertyBag): ReturnType<typeof expandProperties> {
  return expandProperties(expandPercentValue(value, properties), properties);
}

async function readRoot(hive: "HKCU" | "HKLM", bdsKey: string): Promise<string> {
  const values = await queryRegistry(`${hive}\\${bdsKey}`, "RootDir");
  return values.RootDir?.replace(/[\\/]+$/, "") ?? "";
}

async function readBdsUserDirectory(studioDirectoryVersion: string): Promise<string> {
  const values = await queryRegistry(
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
    "Personal"
  );
  const documents = values.Personal?.trim()
    ? expandPercentValue(values.Personal.trim(), new PropertyBag(process.env))
    : path.join(os.homedir(), "Documents");
  return path.join(documents, "Embarcadero", "Studio", studioDirectoryVersion);
}

function defaultRootDirectory(studioDirectoryVersion: string): string {
  const programFiles = process.env["ProgramFiles(x86)"] ?? process.env.ProgramFiles ?? "C:\\Program Files (x86)";
  return path.join(programFiles, "Embarcadero", "Studio", studioDirectoryVersion);
}

function inferRootFromCompiler(compilerPath: string): string | undefined {
  const parent = path.dirname(compilerPath);
  return path.basename(parent).toLocaleLowerCase() === "bin" ? path.dirname(parent) : undefined;
}

function mergeVariables(
  stages: Record<string, string>[],
  inherited: NodeJS.ProcessEnv
): Record<string, string> {
  const properties = new PropertyBag(inherited);
  const touched = new Map<string, string>();
  for (const stage of stages) {
    for (const [name, rawValue] of Object.entries(stage)) {
      const percentExpanded = expandPercentValue(rawValue, properties);
      const value = expandProperties(percentExpanded, properties).value;
      properties.set(name, value);
      touched.set(name.toLocaleLowerCase(), name);
    }
  }
  return Object.fromEntries(
    [...touched.values()].map((name) => [name, properties.get(name) ?? ""])
  );
}

function expandPercentValue(value: string, properties: PropertyBag): string {
  let result = value;
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    const next = result.replace(/%([^%]+)%/g, (match, name: string) => {
      const replacement = properties.get(name);
      if (replacement === undefined) {
        return match;
      }
      changed = true;
      return replacement;
    });
    result = next;
    if (!changed) {
      break;
    }
  }
  return result;
}

async function readOptionalFile(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch {
    return undefined;
  }
}

export function parseRsVarsContent(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*@?SET\s+([^=]+)=(.*)$/i);
    if (match) {
      values[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, "$1");
    }
  }
  return values;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function getVariable(variables: Record<string, string>, name: string): string | undefined {
  const match = Object.keys(variables).find((key) => key.toLocaleLowerCase() === name.toLocaleLowerCase());
  return match ? variables[match] : undefined;
}

function trimQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, "$1");
}
