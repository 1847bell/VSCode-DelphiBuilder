import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import { DelphiPlatform, DelphiVersion } from "../core/types";
import {
  DEFAULT_DELPHI_VERSION,
  getDelphiVersionConfiguration
} from "../delphi/versions";
import { expandProperties, PropertyBag } from "../project/propertyResolver";
import { queryRegistry } from "./registryReader";

export interface BdsEnvironment {
  rootDir: string;
  compilerPath: string;
  variables: Record<string, string>;
  libraryPath: string;
  debugDcuPath: string;
  warnings: string[];
}

export async function resolveBdsEnvironment(
  compilerOverride: string | undefined,
  environmentOverrides: Record<string, string> = {},
  platform: DelphiPlatform = "Win32",
  version: DelphiVersion = DEFAULT_DELPHI_VERSION
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

  const rsVars = await readRsVars(rootDir);
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
    warnings.push(
      `BDS ${versionConfiguration.bdsRegistryVersion} RootDir was not found in the 32-bit registry view; using the default ${version} path.`
    );
  }
  if (!await exists(compilerPath)) {
    warnings.push(`${compilerName} was not found: ${compilerPath}`);
  }
  if (!libraryPath) {
    warnings.push(
      `The BDS ${versionConfiguration.bdsRegistryVersion} ${platform} Library Search Path was not found in the registry.`
    );
  }
  for (const name of expandedLibraryPath.unresolved) {
    warnings.push(`Unresolved BDS Library Path property: $(${name}).`);
  }
  for (const name of expandedDebugDcuPath.unresolved) {
    warnings.push(`Unresolved BDS Debug DCU Path property: $(${name}).`);
  }
  for (const [name, value] of Object.entries(variables)) {
    if (/\$\([^)]+\)|%[^%]+%/.test(value)) {
      warnings.push(`Unresolved BDS environment variable reference in ${name}: ${value}`);
    }
  }

  return { rootDir, compilerPath, variables, libraryPath, debugDcuPath, warnings };
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

async function readRsVars(rootDir: string): Promise<Record<string, string>> {
  try {
    const content = iconv.decode(await readFile(path.join(rootDir, "bin", "rsvars.bat")), "cp936");
    return parseRsVarsContent(content);
  } catch {
    return {};
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
