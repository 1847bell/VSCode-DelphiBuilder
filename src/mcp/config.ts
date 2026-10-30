import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BuildPlan } from "../core/types";

const configSchema = z.object({
  roots: z.array(z.string().min(1)).min(1),
  compilerPath: z.string().min(1).optional(),
  compiler64Path: z.string().min(1).optional(),
  version: z.string().min(1).default("XE7"),
  resourceBuild: z.boolean().default(true),
  rsvarsPath: z.string().min(1).optional(),
  brcc32Path: z.string().min(1).optional(),
  additionalArguments: z.array(z.string()).default([]),
  environment: z.record(z.string(), z.string()).default({}),
  outputEncoding: z.enum(["system", "cp936", "utf8"]).default("system")
}).strict();

export type McpConfig = z.infer<typeof configSchema>;

export async function loadConfig(file: string): Promise<McpConfig> {
  const absolute = path.resolve(file);
  const config = configSchema.parse(JSON.parse(await readFile(absolute, "utf8")));
  const base = path.dirname(absolute);
  config.roots = await Promise.all(config.roots.map(async (root) => {
    const resolved = await realpath(path.resolve(base, root));
    if (!(await stat(resolved)).isDirectory()) {
      throw new Error(`Project root is not a directory: ${resolved}`);
    }
    return resolved;
  }));
  for (const key of ["compilerPath", "compiler64Path", "rsvarsPath", "brcc32Path"] as const) {
    if (config[key]) config[key] = path.resolve(base, config[key]);
  }
  return config;
}

export class ProjectAccess {
  private readonly locked = new Set<string>();

  public constructor(private readonly roots: readonly string[]) {}

  public async assertPath(file: string): Promise<string> {
    const absolute = path.resolve(this.roots[0], file);
    const missing: string[] = [];
    let ancestor = absolute;
    let canonical: string;
    for (;;) {
      try {
        canonical = path.join(await realpath(ancestor), ...missing.reverse());
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const entry = await lstat(ancestor).catch((lookupError: NodeJS.ErrnoException) => {
          if (lookupError.code !== "ENOENT") throw lookupError;
          return undefined;
        });
        if (entry?.isSymbolicLink()) throw new Error(`Unresolved symbolic link in project path: ${ancestor}`);
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw error;
        missing.push(path.basename(ancestor));
        ancestor = parent;
      }
    }
    if (!this.roots.some((root) => {
      const relative = path.relative(root, canonical);
      return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
    })) {
      throw new Error(`Path is outside configured project roots: ${absolute}`);
    }
    return canonical;
  }

  public async resolveProject(file: string): Promise<string> {
    const resolved = await this.assertPath(file);
    if (path.extname(resolved).toLowerCase() !== ".dproj" || !(await stat(resolved)).isFile()) {
      throw new Error(`Expected an existing .dproj file: ${resolved}`);
    }
    return resolved;
  }

  public lock(projectFile: string): () => void {
    const key = process.platform === "win32" ? projectFile.toLowerCase() : projectFile;
    if (this.locked.has(key)) throw new Error(`Project is busy: ${projectFile}`);
    this.locked.add(key);
    return () => this.locked.delete(key);
  }

  public async assertBuildPaths(plan: BuildPlan): Promise<void> {
    const paths = [plan.mainSource, ...plan.expectedArtifacts];
    if (plan.projectResource) paths.push(plan.projectResource.output);
    for (const step of plan.resourceBuild ?? []) paths.push(step.input, step.output);
    for (const argument of plan.arguments) {
      const match = argument.match(/^-(?:E|N0|LE|LN)(.+)$/i);
      if (match) paths.push(path.resolve(plan.workingDirectory, match[1]));
    }
    await Promise.all(paths.map((file) => this.assertPath(file)));
  }
}
