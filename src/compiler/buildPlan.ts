import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BuildPlan,
  DelphiPlatform,
  DelphiVersion,
  DprojEvaluation,
  ResourceBuildStep
} from "../core/types";
import { DEFAULT_DELPHI_VERSION, getDelphiVersionConfiguration } from "../delphi/versions";
import { localize } from "../localization/localizer";
import {
  BdsEnvironment,
  resolveBdsEnvironment,
  resolveResourceCompilerPath
} from "../environment/bdsLocator";
import { evaluateDprojFile } from "../project/dprojParser";
import { buildDccArguments } from "./dccArgumentBuilder";

export interface CreateBuildPlanOptions {
  version?: DelphiVersion;
  projectFile: string;
  configuration?: string;
  platform?: DelphiPlatform;
  rebuild?: boolean;
  compilerPath?: string;
  resourceBuild?: boolean;
  rsVarsPath?: string;
  brcc32Path?: string;
  additionalArguments?: string[];
  environment?: Record<string, string>;
}

export async function createBuildPlan(options: CreateBuildPlanOptions): Promise<BuildPlan> {
  const projectFile = path.resolve(options.projectFile);
  const version = options.version ?? DEFAULT_DELPHI_VERSION;
  const platform = options.platform ?? "Win32";
  const bds = await resolveBdsEnvironment(
    options.compilerPath,
    options.environment,
    platform,
    version,
    options.rsVarsPath
  );
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  const environment = {
    ...inheritedEnvironment,
    ...bds.variables,
    ...(options.environment ?? {})
  };
  const evaluation = await evaluateDprojFile(projectFile, {
    configuration: options.configuration,
    platform,
    initialProperties: {
      ...environment,
      DCC_UnitSearchPath: bds.libraryPath
    }
  });
  const dcc = buildDccArguments(evaluation, {
    version,
    rebuild: options.rebuild,
    libraryPath: bds.libraryPath,
    debugDcuPath: bds.debugDcuPath,
    additionalArguments: options.additionalArguments
  });
  const warnings = [...new Set([
    ...bds.warnings,
    ...evaluation.warnings,
    ...dcc.warnings
  ])];
  const resourcePlan = await createResourcePlan(
    evaluation,
    bds,
    options,
    warnings
  );

  return {
    version,
    projectFile,
    mainSource: evaluation.mainSource,
    compilerPath: bds.compilerPath,
    workingDirectory: path.dirname(projectFile),
    configuration: evaluation.configuration,
    platform,
    environment,
    arguments: dcc.arguments,
    projectResource: resourcePlan.projectResource,
    resourceBuild: resourcePlan.resourceBuild,
    expectedArtifacts: locateExpectedArtifacts(evaluation),
    warnings
  };
}

async function createResourcePlan(
  evaluation: DprojEvaluation,
  bds: BdsEnvironment,
  options: CreateBuildPlanOptions,
  warnings: string[]
): Promise<Pick<BuildPlan, "projectResource" | "resourceBuild">> {
  const projectResource = await findWildcardProjectResource(evaluation.mainSource);
  const rcCompileItems = evaluation.resourceItems.filter((item) => item.kind === "RcCompile");
  const rcItems = evaluation.resourceItems.filter((item) => item.kind === "RcItem");
  if (!projectResource && evaluation.resourceItems.length === 0) {
    return {};
  }
  if (options.resourceBuild === false) {
    const required = [
      ...evaluation.resourceItems.map((item) => item.include),
      ...(projectResource ? [projectResource.output] : [])
    ];
    warnings.push(localize("buildPlan.warning.resourceDisabled", {
      resources: required.join(", ")
    }));
    return {};
  }

  if (rcItems.length > 0) {
    warnings.push(localize("buildPlan.warning.rcItem", {
      resources: rcItems.map((item) => item.include).join(", ")
    }));
  }
  if (rcCompileItems.length === 0) {
    return rcItems.length === 0 ? { projectResource } : {};
  }

  const compilerToUse = evaluation.properties.BRCC_CompilerToUse?.trim();
  if (compilerToUse && compilerToUse.toLocaleLowerCase() !== "brcc32") {
    throw new Error(localize("buildPlan.error.unsupportedResourceCompiler", {
      compiler: compilerToUse
    }));
  }
  const resolution = await resolveResourceCompilerPath(
    options.brcc32Path,
    bds.rootDir,
    bds.variables
  );
  if (!resolution.path) {
    const settingsSection = getDelphiVersionConfiguration(
      options.version ?? DEFAULT_DELPHI_VERSION
    ).settingsSection;
    const attempted = resolution.candidates.length > 0
      ? resolution.candidates.slice(0, 10).map((candidate) => `  ${candidate}`).join("\n")
      : localize("buildPlan.error.noCandidates");
    throw new Error([
      localize("buildPlan.error.resourceRequired", {
        project: path.basename(evaluation.projectFile)
      }),
      localize("buildPlan.error.rsvars", {
        path: bds.rsVarsPath,
        missing: bds.rsVarsFound ? "" : localize("buildPlan.error.rsvarsMissing")
      }),
      localize("buildPlan.error.tried"),
      attempted,
      localize("buildPlan.error.configure", {
        brccSetting: `${settingsSection}.brcc32Path`,
        rsvarsSetting: `${settingsSection}.rsvarsPath`
      })
    ].join("\n"));
  }

  const projectDirectory = path.dirname(evaluation.projectFile);
  const outputDirectory = resolveOutputDirectory(
    evaluation.properties.BRCC_OutputDir,
    projectDirectory
  );
  const commonArguments: string[] = [];
  const includePath = resolveMergedPathList([
    evaluation.properties.BRCC_IncludePath,
    evaluation.properties.DCC_IncludePath,
    evaluation.properties.DCC_TranslatedLibraryPath,
    evaluation.properties.DCC_UnitSearchPath,
    bds.libraryPath
  ], projectDirectory);
  if (includePath) {
    commonArguments.push(`-i${includePath}`);
  }
  for (const define of mergeDelimitedValues(
    evaluation.properties.BRCC_Defines,
    evaluation.properties.DCC_Define
  )) {
    commonArguments.push(`-d${define}`);
  }
  if (isTrue(evaluation.properties.BRCC_DeleteIncludePath)) {
    commonArguments.push("-x");
  }
  if (isTrue(evaluation.properties.BRCC_EnableMultiByte)) {
    commonArguments.push("-m");
  }
  if (isTrue(evaluation.properties.BRCC_Verbose)) {
    commonArguments.push("-v");
  }
  const codePage = evaluation.properties.BRCC_CodePage?.trim();
  if (codePage) {
    commonArguments.push(`-c${codePage}`);
  }
  const language = evaluation.properties.BRCC_Language?.trim();
  if (language) {
    commonArguments.push(`-l${language}`);
  }
  for (const propertyName of ["BRCC_UserSuppliedOptions", "BRCC_ResponseFilename"]) {
    if (evaluation.properties[propertyName]?.trim()) {
      warnings.push(localize("buildPlan.warning.resourceProperty", { property: propertyName }));
    }
  }

  const resourceBuild = rcCompileItems.map((item) => {
    const input = resolveProjectPath(item.include, projectDirectory);
    const output = path.join(
      outputDirectory,
      `${path.basename(input, path.extname(input))}${item.suffix ?? ""}.res`
    );
    return {
      executable: resolution.path!,
      arguments: [...commonArguments, `-fo${output}`, input],
      input,
      output
    };
  });
  return {
    projectResource: rcItems.length === 0 ? projectResource : undefined,
    resourceBuild
  };
}

async function findWildcardProjectResource(
  mainSource: string
): Promise<BuildPlan["projectResource"]> {
  let content: string;
  try {
    content = await readFile(mainSource, "latin1");
  } catch {
    return undefined;
  }
  if (!/\{\$\s*(?:R|RESOURCE)\s+\*\.res\s*\}/i.test(content)) {
    return undefined;
  }
  return {
    output: path.join(
      path.dirname(mainSource),
      `${path.basename(mainSource, path.extname(mainSource))}.res`
    ),
    createIfMissing: true
  };
}

function mergeDelimitedValues(...values: Array<string | undefined>): string[] {
  return [...new Set(values
    .flatMap((value) => value?.split(";") ?? [])
    .map((value) => value.trim())
    .filter(Boolean))];
}

function resolveMergedPathList(
  values: Array<string | undefined>,
  projectDirectory: string
): string {
  return [...new Map(mergeDelimitedValues(...values).map((value) => {
    const resolved = resolveProjectPath(value.replace(/^"(.*)"$/, "$1"), projectDirectory);
    return [resolved.toLocaleLowerCase(), resolved];
  })).values()].join(";");
}

function resolveProjectPath(value: string, projectDirectory: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(projectDirectory, value);
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase() === "true";
}

function locateExpectedArtifacts(evaluation: DprojEvaluation): string[] {
  const projectDirectory = path.dirname(evaluation.projectFile);
  const outputDirectory = resolveOutputDirectory(
    evaluation.properties.DCC_ExeOutput,
    projectDirectory
  );
  const configuredName = evaluation.properties.DCC_DependencyCheckOutputName?.trim();
  if (configuredName) {
    return [path.isAbsolute(configuredName)
      ? path.normalize(configuredName)
      : path.join(outputDirectory, configuredName)];
  }

  const baseName = path.basename(evaluation.mainSource, path.extname(evaluation.mainSource));
  const extension = path.extname(evaluation.mainSource).toLocaleLowerCase() === ".dpk"
    ? ".bpl"
    : evaluation.properties.DCC_OutputType?.toLocaleLowerCase() === "library"
      ? ".dll"
      : ".exe";
  const packageDirectory = extension === ".bpl"
    ? resolveOutputDirectory(evaluation.properties.DCC_BplOutput, projectDirectory)
    : outputDirectory;
  return [path.join(packageDirectory, `${baseName}${extension}`)];
}

function resolveOutputDirectory(value: string | undefined, projectDirectory: string): string {
  if (!value?.trim()) {
    return projectDirectory;
  }
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(projectDirectory, value);
}

export function redactBuildPlan(plan: BuildPlan): BuildPlan {
  const environment = Object.fromEntries(
    Object.entries(plan.environment).map(([name, value]) => [
      name,
      /(token|secret|password|passwd|api[_-]?key)/i.test(name) ? "<redacted>" : value
    ])
  );
  return { ...plan, environment };
}
