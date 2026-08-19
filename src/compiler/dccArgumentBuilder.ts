import path from "node:path";
import { DelphiVersion, DprojEvaluation } from "../core/types";
import {
  DEFAULT_DELPHI_VERSION,
  getDelphiVersionConfiguration
} from "../delphi/versions";
import { expandProperties, PropertyBag } from "../project/propertyResolver";
import { localize } from "../localization/localizer";

export interface DccArgumentOptions {
  version?: DelphiVersion;
  rebuild?: boolean;
  libraryPath?: string;
  debugDcuPath?: string;
  additionalArguments?: string[];
}

export interface DccArgumentResult {
  arguments: string[];
  warnings: string[];
}

export function buildDccArguments(
  evaluation: DprojEvaluation,
  options: DccArgumentOptions = {}
): DccArgumentResult {
  const properties = new PropertyBag(evaluation.properties);
  const dccConfiguration = getDelphiVersionConfiguration(
    options.version ?? DEFAULT_DELPHI_VERSION
  ).dcc;
  const projectDirectory = path.dirname(evaluation.projectFile);
  const warnings: string[] = [];
  const args: string[] = [...dccConfiguration.baseArguments];
  const handled = new Set<string>();

  for (const [propertyName, flag] of Object.entries(dccConfiguration.valueSwitches)) {
    addValueSwitch(args, handled, properties, propertyName, flag);
  }

  const usePackageList = getExpanded(properties, "DCC_UsePackage");
  const usePackages = ["UsePackages", "DCC_EnabledPackages"]
    .some((propertyName) => parseBoolean(getExpanded(properties, propertyName) ?? "") === true);
  if (usePackages && usePackageList) {
    args.push(`${dccConfiguration.specialSwitches.runtimePackages}${usePackageList}`);
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
    args.push(
      `${dccConfiguration.specialSwitches.unitSearchPath}${resolvePathList(unitSearchPath, projectDirectory)}`
    );
  }
  handled.add("dcc_unitsearchpath");
  handled.add("dcc_translateddebuglibrarypath");
  handled.add("dcc_translatedlibrarypath");

  const includePath = mergePathLists(
    getExpanded(properties, "DCC_IncludePath"),
    unitSearchPath
  );
  if (includePath) {
    args.push(
      `${dccConfiguration.specialSwitches.includePath}${resolvePathList(includePath, projectDirectory)}`
    );
  }
  handled.add("dcc_includepath");

  const resourcePath = mergePathLists(
    getExpanded(properties, "DCC_TranslatedResourcePath"),
    getExpanded(properties, "BRCC_OutputDir"),
    getExpanded(properties, "DCC_UnitSearchPath"),
    getExpanded(properties, "DCC_ResourcePath"),
    options.libraryPath
  );
  if (resourcePath) {
    args.push(
      `${dccConfiguration.specialSwitches.resourcePath}${resolvePathList(resourcePath, projectDirectory)}`
    );
  }
  handled.add("dcc_translatedresourcepath");
  handled.add("dcc_resourcepath");

  for (const [propertyName, mapping] of Object.entries(dccConfiguration.pathSwitches)) {
    const value = getExpanded(properties, propertyName);
    if (value) {
      const resolved = mapping.kind === "list"
        ? resolvePathList(value, projectDirectory)
        : resolveSinglePath(value, projectDirectory);
      args.push(`${mapping.switch}${resolved}`);
    }
    handled.add(propertyName.toLocaleLowerCase());
  }

  for (const rule of dccConfiguration.argumentRules) {
    addConfiguredArguments(args, handled, properties, rule, warnings);
  }

  if (options.rebuild) {
    args.push(...dccConfiguration.rebuildArguments);
  }
  args.push(...(options.additionalArguments ?? []));

  for (const name of Object.keys(evaluation.properties)) {
    const normalized = name.toLocaleLowerCase();
    const knownMetadata = dccConfiguration.knownMetadata
      .some((item) => item.toLocaleLowerCase() === normalized);
    if (normalized.startsWith("dcc_") && !handled.has(normalized) && !knownMetadata) {
      warnings.push(localize("dcc.warning.unmapped", { property: name }));
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

function addConfiguredArguments(
  args: string[],
  handled: Set<string>,
  properties: PropertyBag,
  rule: {
    property: string;
    kind: "boolean" | "enum";
    values: Record<string, string[]>;
  },
  warnings: string[]
): void {
  const value = getExpanded(properties, rule.property);
  if (value) {
    const mappingKey = rule.kind === "boolean"
      ? String(parseBoolean(value))
      : value;
    const mappedArguments = rule.values[mappingKey];
    if (mappedArguments) {
      args.push(...mappedArguments);
    } else {
      warnings.push(rule.kind === "boolean"
        ? localize("dcc.warning.unsupportedBoolean", { property: rule.property, value })
        : localize("dcc.warning.unsupportedEnum", {
          property: rule.property,
          value
        }));
    }
  }
  handled.add(rule.property.toLocaleLowerCase());
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
    warnings.push(localize("dcc.warning.unsupportedBoolean", {
      property: propertyName,
      value
    }));
  }
  return enabled;
}
