import path from "node:path";
import { DprojEvaluation } from "../core/types";
import { expandProperties, PropertyBag } from "../project/propertyResolver";

export interface DccArgumentOptions {
  rebuild?: boolean;
  libraryPath?: string;
  debugDcuPath?: string;
  additionalArguments?: string[];
}

export interface DccArgumentResult {
  arguments: string[];
  warnings: string[];
}

const PATH_SWITCHES: Array<[string, string]> = [
  ["DCC_ResourcePath", "-R"],
  ["DCC_ObjPath", "-O"]
];

const VALUE_SWITCHES: Array<[string, string]> = [
  ["DCC_Define", "-D"],
  ["DCC_UnitAlias", "-A"],
  ["DCC_Namespace", "-NS"]
];

const OUTPUT_SWITCHES: Array<[string, string]> = [
  ["DCC_ExeOutput", "-E"],
  ["DCC_DcuOutput", "-N0"],
  ["DCC_BplOutput", "-LE"],
  ["DCC_DcpOutput", "-LN"]
];

const BOOLEAN_DIRECTIVES: Array<[string, string]> = [
  ["DCC_BooleanEvaluation", "B"],
  ["DCC_Assertions", "C"],
  ["DCC_LongStrings", "H"],
  ["DCC_IOChecking", "I"],
  ["DCC_WriteableConst", "J"],
  ["DCC_LocalDebugSymbols", "L"],
  ["DCC_Optimize", "O"],
  ["DCC_OpenStringParams", "P"],
  ["DCC_OverflowChecking", "Q"],
  ["DCC_RangeChecking", "R"],
  ["DCC_TypedAddress", "T"],
  ["DCC_PentiumSafeDivide", "U"],
  ["DCC_StrictVarStrings", "V"],
  ["DCC_GenerateStackFrames", "W"],
  ["DCC_ExtendedSyntax", "X"]
];

const KNOWN_METADATA = new Set([
  "DCC_CBuilderOutput",
  "DCC_DependencyCheckOutputName",
  "DCC_Description",
  "DCC_ImageBase",
  "DCC_OutputType",
  "DCC_Platform",
  "DCC_SanitizedProjectName"
].map((name) => name.toLocaleLowerCase()));

export function buildDccArguments(
  evaluation: DprojEvaluation,
  options: DccArgumentOptions = {}
): DccArgumentResult {
  const properties = new PropertyBag(evaluation.properties);
  const projectDirectory = path.dirname(evaluation.projectFile);
  const warnings: string[] = [];
  const args: string[] = ["--no-config"];
  const handled = new Set<string>();

  for (const [propertyName, flag] of VALUE_SWITCHES) {
    addValueSwitch(args, handled, properties, propertyName, flag);
  }

  const usePackageList = getExpanded(properties, "DCC_UsePackage");
  const usePackages = ["UsePackages", "DCC_EnabledPackages"]
    .some((propertyName) => parseBoolean(getExpanded(properties, propertyName) ?? "") === true);
  if (usePackages && usePackageList) {
    args.push(`-LU${usePackageList}`);
  }
  handled.add("dcc_usepackage");
  handled.add("dcc_enabledpackages");

  const debugDcus = getExpanded(properties, "DCC_DebugDCUs");
  const debugDcusEnabled = parseOptionalBoolean(debugDcus, "DCC_DebugDCUs", warnings);
  handled.add("dcc_debugdcus");

  const unitSearchPath = mergePathLists(
    debugDcusEnabled ? getExpanded(properties, "DCC_TranslatedDebugLibraryPath") : undefined,
    debugDcusEnabled ? options.debugDcuPath : undefined,
    getExpanded(properties, "DCC_TranslatedLibraryPath"),
    getExpanded(properties, "DCC_UnitSearchPath"),
    options.libraryPath
  );
  if (unitSearchPath) {
    args.push(`-U${resolvePathList(unitSearchPath, projectDirectory)}`);
  }
  handled.add("dcc_unitsearchpath");
  handled.add("dcc_translateddebuglibrarypath");
  handled.add("dcc_translatedlibrarypath");

  const includePath = mergePathLists(
    getExpanded(properties, "DCC_IncludePath"),
    unitSearchPath
  );
  if (includePath) {
    args.push(`-I${resolvePathList(includePath, projectDirectory)}`);
  }
  handled.add("dcc_includepath");

  for (const [propertyName, flag] of PATH_SWITCHES) {
    const value = getExpanded(properties, propertyName);
    if (value) {
      args.push(`${flag}${resolvePathList(value, projectDirectory)}`);
    }
    handled.add(propertyName.toLocaleLowerCase());
  }

  for (const [propertyName, flag] of OUTPUT_SWITCHES) {
    const value = getExpanded(properties, propertyName);
    if (value) {
      args.push(`${flag}${resolveSinglePath(value, projectDirectory)}`);
    }
    handled.add(propertyName.toLocaleLowerCase());
  }

  for (const [propertyName, directive] of BOOLEAN_DIRECTIVES) {
    const value = getExpanded(properties, propertyName);
    if (value !== undefined && value !== "") {
      const enabled = parseBoolean(value);
      if (enabled === undefined) {
        warnings.push(`Unsupported boolean value for ${propertyName}: ${value}`);
      } else {
        args.push(`-$${directive}${enabled ? "+" : "-"}`);
      }
    }
    handled.add(propertyName.toLocaleLowerCase());
  }

  addEnumDirective(args, handled, properties, "DCC_DebugInformation", {
    "0": "-$D0",
    "1": "-$D1",
    "2": "-$D2"
  }, warnings);
  addEnumDirective(args, handled, properties, "DCC_SymbolReferenceInfo", {
    "0": "-$Y-",
    "1": "-$YD",
    "2": "-$Y+"
  }, warnings);

  const debugInfoInExe = getExpanded(properties, "DCC_DebugInfoInExe");
  const debugInfoInExeEnabled = parseOptionalBoolean(
    debugInfoInExe,
    "DCC_DebugInfoInExe",
    warnings
  );
  if (debugInfoInExeEnabled) {
    args.push("-V", "-VN");
  }
  handled.add("dcc_debuginfoinexe");

  const mapFile = getExpanded(properties, "DCC_MapFile");
  if (mapFile && mapFile !== "0") {
    const mapSwitch = ({ "1": "-GS", "2": "-GP", "3": "-GD" } as Record<string, string>)[mapFile];
    if (mapSwitch) {
      args.push(mapSwitch);
    } else {
      warnings.push(`Unsupported DCC_MapFile value: ${mapFile}`);
    }
  }
  handled.add("dcc_mapfile");

  const minEnumSize = getExpanded(properties, "DCC_MinEnumSize");
  if (minEnumSize && ["1", "2", "4"].includes(minEnumSize)) {
    args.push(`-$Z${minEnumSize}`);
  } else if (minEnumSize && minEnumSize !== "0") {
    warnings.push(`Unsupported DCC_MinEnumSize value: ${minEnumSize}`);
  }
  handled.add("dcc_minenumsize");

  const alignment = getExpanded(properties, "DCC_Align");
  if (alignment && ["1", "2", "4", "8", "16"].includes(alignment)) {
    args.push(`-$A${alignment}`);
  } else if (alignment) {
    warnings.push(`Unsupported DCC_Align value: ${alignment}`);
  }
  handled.add("dcc_align");

  if (options.rebuild) {
    args.push("-B");
  }
  args.push(...(options.additionalArguments ?? []));

  for (const name of Object.keys(evaluation.properties)) {
    const normalized = name.toLocaleLowerCase();
    if (normalized.startsWith("dcc_") && !handled.has(normalized) && !KNOWN_METADATA.has(normalized)) {
      warnings.push(`DCC property is not mapped to a compiler argument: ${name}`);
    }
  }

  const relativeSource = path.relative(projectDirectory, evaluation.mainSource);
  args.push(relativeSource && !relativeSource.startsWith("..") ? relativeSource : evaluation.mainSource);
  return { arguments: args, warnings };
}

function addValueSwitch(
  args: string[],
  handled: Set<string>,
  properties: PropertyBag,
  propertyName: string,
  flag: string
): void {
  const value = getExpanded(properties, propertyName);
  if (value) {
    args.push(`${flag}${value}`);
  }
  handled.add(propertyName.toLocaleLowerCase());
}

function addEnumDirective(
  args: string[],
  handled: Set<string>,
  properties: PropertyBag,
  propertyName: string,
  mappings: Record<string, string>,
  warnings: string[]
): void {
  const value = getExpanded(properties, propertyName);
  if (value) {
    const directive = mappings[value];
    if (directive) {
      args.push(directive);
    } else {
      warnings.push(`Unsupported ${propertyName} value: ${value}`);
    }
  }
  handled.add(propertyName.toLocaleLowerCase());
}

function getExpanded(properties: PropertyBag, propertyName: string): string | undefined {
  const value = properties.get(propertyName);
  return value === undefined ? undefined : expandProperties(value, properties).value.trim();
}

function resolvePathList(value: string, baseDirectory: string): string {
  return value.split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolveSinglePath(entry, baseDirectory))
    .join(";");
}

function resolveSinglePath(value: string, baseDirectory: string): string {
  const unquoted = value.replace(/^"(.*)"$/, "$1");
  return path.isAbsolute(unquoted) ? path.normalize(unquoted) : path.resolve(baseDirectory, unquoted);
}

function mergePathLists(...values: Array<string | undefined>): string {
  const entries = values
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(";"))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const normalized = entry.toLocaleLowerCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  }).join(";");
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseOptionalBoolean(
  value: string | undefined,
  propertyName: string,
  warnings: string[]
): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const enabled = parseBoolean(value);
  if (enabled === undefined) {
    warnings.push(`Unsupported boolean value for ${propertyName}: ${value}`);
  }
  return enabled;
}
