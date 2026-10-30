import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { createBuildPlan } from "../compiler/buildPlan";
import { BuildPlan, DelphiPlatform, DprojEvaluation, ProjectConfiguration, ProjectResourceItem } from "../core/types";
import { evaluateDproj } from "../project/dprojParser";
import { readDprojVersion, updateDprojVersion } from "../project/dprojVersion";
import { updateDprojOutputPath } from "../project/dprojOutputPath";
import { expandProperties, PropertyBag } from "../project/propertyResolver";
import { McpConfig, ProjectAccess } from "./config";

export interface ProjectSelection {
  projectFile: string;
  configuration?: string;
  platform?: DelphiPlatform;
}

export interface ProjectServiceResult {
  projectFile: string;
  configuration: string;
  platform: DelphiPlatform;
  configurations: ProjectConfiguration[];
  mainSource: string;
  outputPath?: string;
  version?: string;
  resources: ProjectResourceItem[];
  warnings: string[];
}

export class ProjectService {
  public constructor(private readonly config: McpConfig, private readonly access: ProjectAccess) {}

  public async getInfo(selection: ProjectSelection): Promise<ProjectServiceResult> {
    const projectFile = await this.access.resolveProject(selection.projectFile);
    const before = await readFile(projectFile);
    const text = decodeUtf8(before);
    const evaluation = evaluateDproj(text, projectFile, {
      ...selection, initialProperties: { ...process.env, ...this.config.environment }
    });
    return this.infoFromEvaluation(evaluation, projectFile, text);
  }

  public async getBuildPlan(selection: ProjectSelection & { rebuild?: boolean }): Promise<BuildPlan> {
    const projectFile = await this.access.resolveProject(selection.projectFile);
    const release = this.access.lock(projectFile);
    try {
      const platform = selection.platform ?? "Win32";
      const compilerPath = platform === "Win64" ? this.config.compiler64Path : this.config.compilerPath;
      if (!compilerPath) throw new Error(`No compiler configured for ${platform}`);
      const plan = await createBuildPlan({
        projectFile,
        configuration: selection.configuration,
        platform,
        rebuild: selection.rebuild,
        version: this.config.version,
        compilerPath,
        resourceBuild: this.config.resourceBuild,
        rsVarsPath: this.config.rsvarsPath,
        brcc32Path: this.config.brcc32Path,
        additionalArguments: this.config.additionalArguments,
        environment: this.config.environment
      });
      await this.access.assertBuildPaths(plan);
      return plan;
    } finally {
      release();
    }
  }

  public async setOutputPath(selection: ProjectSelection & {
    configuration: string;
    platform: DelphiPlatform;
    outputPath: string;
  }): Promise<ProjectServiceResult> {
    const projectFile = await this.access.resolveProject(selection.projectFile);
    const release = this.access.lock(projectFile);
    try {
      const before = await readFile(projectFile);
      const text = decodeUtf8(before);
      const evaluationOptions = {
        ...selection, initialProperties: { ...process.env, ...this.config.environment }
      };
      const evaluation = evaluateDproj(text, projectFile, evaluationOptions);
      const configurationKey = evaluation.configurations.find((item) => item.name.toLocaleLowerCase() === evaluation.configuration.toLocaleLowerCase())?.key ?? evaluation.configuration;
      const updated = updateDprojOutputPath(text, {
        configuration: evaluation.configuration,
        configurationKey,
        platform: selection.platform,
        outputPath: selection.outputPath
      });
      const edited = evaluateDproj(updated, projectFile, evaluationOptions);
      const requested = expandProperties(selection.outputPath.trim(), new PropertyBag(edited.properties));
      if (requested.unresolved.length > 0) {
        throw new Error(`Unresolved output path properties: ${requested.unresolved.join(", ")}`);
      }
      const effective = effectiveOutputPath(edited);
      const requestedPath = path.resolve(path.dirname(projectFile), requested.value.replace(/^"(.*)"$/, "$1"));
      if (path.relative(effective, requestedPath) !== "") throw new Error("Edited output path is not effective");
      await this.access.assertPath(effective);
      await writeIfUnchanged(projectFile, before, Buffer.from(updated, "utf8"));
      return this.infoFromEvaluation(edited, projectFile, updated);
    } finally {
      release();
    }
  }

  public async setVersion(selection: ProjectSelection & {
    configuration: string;
    platform: DelphiPlatform;
    version: string;
  }): Promise<ProjectServiceResult> {
    validateVersion(selection.version);
    const projectFile = await this.access.resolveProject(selection.projectFile);
    const release = this.access.lock(projectFile);
    try {
      const before = await readFile(projectFile);
      const text = decodeUtf8(before);
      const updated = updateDprojVersion(text, selection.version, {
        projectFile,
        configuration: selection.configuration,
        platform: selection.platform
      });
      await writeIfUnchanged(projectFile, before, Buffer.from(updated, "utf8"));
      const edited = evaluateDproj(updated, projectFile, {
        ...selection, initialProperties: { ...process.env, ...this.config.environment }
      });
      return this.infoFromEvaluation(edited, projectFile, updated);
    } finally {
      release();
    }
  }
  private infoFromEvaluation(evaluation: DprojEvaluation, projectFile: string, content: string): ProjectServiceResult {
    const outputPath = effectiveOutputPath(evaluation);
    return {
      projectFile,
      configuration: evaluation.configuration,
      platform: evaluation.platform,
      configurations: evaluation.configurations,
      mainSource: evaluation.mainSource,
      outputPath,
      version: readDprojVersion(content, { projectFile, configuration: evaluation.configuration, platform: evaluation.platform }),
      resources: evaluation.resourceItems,
      warnings: evaluation.warnings
    };
  }
}

function decodeUtf8(bytes: Buffer): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function writeIfUnchanged(file: string, original: Buffer, updated: Buffer): Promise<void> {
  const current = await readFile(file);
  if (!current.equals(original)) throw new Error(`Project changed while editing: ${file}`);
  await writeFile(file, preserveEncoding(original, updated));
}

function preserveEncoding(original: Buffer, updated: Buffer): Buffer {
  return original.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), updated.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? updated.subarray(3) : updated])
    : updated;
}

function effectiveOutputPath(evaluation: DprojEvaluation): string {
  const value = expandProperties(
    evaluation.properties.DCC_ExeOutput?.trim() || ".", new PropertyBag(evaluation.properties)
  ).value.replace(/^"(.*)"$/, "$1");
  return path.resolve(path.dirname(evaluation.projectFile), value);
}


function validateVersion(value: string): void {
  const parts = value.trim().split(".");
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 65535)) {
    throw new Error("Version must contain 1 to 4 WORD-sized numeric segments");
  }
}
