import { access } from "node:fs/promises";
import path from "node:path";
import { BuildPlan, DprojEvaluation } from "../core/types";
import { resolveBdsEnvironment } from "../environment/bdsLocator";
import { evaluateDprojFile } from "../project/dprojParser";
import { buildDccArguments } from "./dccArgumentBuilder";

export interface CreateBuildPlanOptions {
  projectFile: string;
  configuration?: string;
  rebuild?: boolean;
  compilerPath?: string;
  additionalArguments?: string[];
  environment?: Record<string, string>;
}

export async function createBuildPlan(options: CreateBuildPlanOptions): Promise<BuildPlan> {
  const projectFile = path.resolve(options.projectFile);
  const bds = await resolveBdsEnvironment(options.compilerPath, options.environment);
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
    platform: "Win32",
    initialProperties: {
      ...environment,
      DCC_UnitSearchPath: bds.libraryPath
    }
  });
  const dcc = buildDccArguments(evaluation, {
    rebuild: options.rebuild,
    libraryPath: bds.libraryPath,
    additionalArguments: options.additionalArguments
  });
  const configWarnings = await detectCompilerConfigs(bds.compilerPath, evaluation);

  return {
    projectFile,
    mainSource: evaluation.mainSource,
    compilerPath: bds.compilerPath,
    workingDirectory: path.dirname(projectFile),
    configuration: evaluation.configuration,
    platform: "Win32",
    environment,
    arguments: dcc.arguments,
    expectedArtifacts: locateExpectedArtifacts(evaluation),
    warnings: [...new Set([
      ...bds.warnings,
      ...evaluation.warnings,
      ...dcc.warnings,
      ...configWarnings
    ])]
  };
}

async function detectCompilerConfigs(
  compilerPath: string,
  evaluation: DprojEvaluation
): Promise<string[]> {
  const projectDirectory = path.dirname(evaluation.projectFile);
  const candidates = [
    path.join(path.dirname(compilerPath), "dcc32.cfg"),
    path.join(projectDirectory, "dcc32.cfg"),
    path.join(projectDirectory, `${path.basename(evaluation.projectFile, path.extname(evaluation.projectFile))}.cfg`),
    path.join(projectDirectory, `${path.basename(evaluation.mainSource, path.extname(evaluation.mainSource))}.cfg`)
  ];
  const warnings: string[] = [];
  for (const candidate of [...new Set(candidates.map(path.normalize))]) {
    if (await exists(candidate)) {
      warnings.push(`DCC32 may load implicit compiler arguments from: ${candidate}`);
    }
  }
  return warnings;
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

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
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
