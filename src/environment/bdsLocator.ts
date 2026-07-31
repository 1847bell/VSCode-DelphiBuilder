import { access, readFile } from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import { expandProperties, PropertyBag } from "../project/propertyResolver";
import { queryRegistry } from "./registryReader";

const BDS_KEY = "Software\\Embarcadero\\BDS\\15.0";

export interface BdsEnvironment {
  rootDir: string;
  compilerPath: string;
  variables: Record<string, string>;
  libraryPath: string;
  warnings: string[];
}

export async function resolveBdsEnvironment(
  compilerOverride: string | undefined,
  environmentOverrides: Record<string, string> = {}
): Promise<BdsEnvironment> {
  const warnings: string[] = [];
  const userRoot = await readRoot("HKCU");
  const machineRoot = await readRoot("HKLM");
  const registryRoot = userRoot || machineRoot;
  const fallbackRoot = defaultRootDirectory();

  const compilerPath = compilerOverride?.trim()
    ? path.resolve(compilerOverride.trim())
    : registryRoot
      ? path.join(registryRoot, "bin", "DCC32.exe")
      : path.join(fallbackRoot, "bin", "DCC32.exe");

  const rootDir = (compilerOverride?.trim() ? inferRootFromCompiler(compilerPath) : undefined)
    || registryRoot
    || inferRootFromCompiler(compilerPath)
    || fallbackRoot;

  const rsVars = await readRsVars(rootDir);

  const registryVariables = {
    ...await queryRegistry(`HKLM\\${BDS_KEY}\\Environment Variables`),
    ...await queryRegistry(`HKCU\\${BDS_KEY}\\Environment Variables`)
  };
  const derivedVariables: Record<string, string> = {
    BDS: rootDir,
    BDSBIN: path.join(rootDir, "bin"),
    BDSINCLUDE: path.join(rootDir, "include"),
    BDSLIB: path.join(rootDir, "lib"),
    DELPHI: rootDir,
  };
  const variables = mergeVariables(
    [derivedVariables, rsVars, derivedVariables, registryVariables, environmentOverrides],
    process.env
  );

  const libraryValues = {
    ...await queryRegistry(`HKLM\\${BDS_KEY}\\Library\\Win32`),
    ...await queryRegistry(`HKCU\\${BDS_KEY}\\Library\\Win32`)
  };
  const libraryPropertyBag = new PropertyBag({ ...process.env, ...variables, Platform: "Win32" });
  const percentExpandedLibraryPath = expandPercentValue(
    libraryValues["Search Path"] ?? "",
    libraryPropertyBag
  );
  const expandedLibraryPath = expandProperties(
    percentExpandedLibraryPath,
    libraryPropertyBag
  );
  const libraryPath = expandedLibraryPath.value;

  if (!registryRoot && !compilerOverride?.trim()) {
    warnings.push("BDS 15.0 RootDir was not found in the 32-bit registry view; using the default XE7 path.");
  }
  if (!await exists(compilerPath)) {
    warnings.push(`DCC32.exe was not found: ${compilerPath}`);
  }
  if (!libraryPath) {
    warnings.push("The BDS 15.0 Win32 Library Search Path was not found in the registry.");
  }
  for (const name of expandedLibraryPath.unresolved) {
    warnings.push(`Unresolved BDS Library Path property: $(${name}).`);
  }
  for (const [name, value] of Object.entries(variables)) {
    if (/\$\([^)]+\)|%[^%]+%/.test(value)) {
      warnings.push(`Unresolved BDS environment variable reference in ${name}: ${value}`);
    }
  }

  return { rootDir, compilerPath, variables, libraryPath, warnings };
}

async function readRoot(hive: "HKCU" | "HKLM"): Promise<string> {
  const values = await queryRegistry(`${hive}\\${BDS_KEY}`, "RootDir");
  return values.RootDir?.replace(/[\\/]+$/, "") ?? "";
}

function defaultRootDirectory(): string {
  const programFiles = process.env["ProgramFiles(x86)"] ?? process.env.ProgramFiles ?? "C:\\Program Files (x86)";
  return path.join(programFiles, "Embarcadero", "Studio", "15.0");
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
