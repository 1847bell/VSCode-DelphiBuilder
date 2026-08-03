import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { createBuildPlan, redactBuildPlan } from "../compiler/buildPlan";
import { CompilerRunner } from "../compiler/compilerRunner";
import { parseCompilerDiagnostics } from "../compiler/diagnosticParser";
import { OutputEncodingSetting, resolveOutputEncoding } from "../compiler/outputEncoding";
import { BuildPlan } from "../core/types";
import { discoverConfigurations } from "../project/dprojParser";
import { DiagnosticPublisher } from "../vscode/diagnosticPublisher";

interface BuildCommandOptions {
  project?: string;
  configuration?: string;
  platform?: string;
}

export class BuildCommands implements vscode.Disposable {
  private readonly runners = new Map<string, CompilerRunner>();
  private readonly diagnostics = new DiagnosticPublisher();
  private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  public constructor(private readonly output: vscode.OutputChannel) {
    this.statusBar.text = "$(tools) DCC Builder";
    this.statusBar.tooltip = "Build a Delphi project with DCC32";
    this.statusBar.command = "delphiXe7.buildProject";
    this.statusBar.show();
  }

  public async build(argument: unknown, rebuild: boolean): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      throw new Error("Building requires a Trusted Workspace.");
    }

    const commandOptions = parseCommandOptions(argument);
    assertWin32(commandOptions.platform);
    const projectFile = await this.resolveProject(argument, commandOptions);
    const projectKey = normalizeProjectKey(projectFile);
    if (this.runners.has(projectKey)) {
      throw new Error(`A build is already running for ${path.basename(projectFile)}.`);
    }

    const compilerPath = this.resolveCompilerPath(projectFile);
    const action = rebuild ? "Rebuild Project" : "Build Project";
    const configuration = await this.resolveConfiguration(projectFile, commandOptions.configuration, action);
    const plan = await this.makePlan(projectFile, configuration, rebuild, compilerPath);
    this.diagnostics.clear(projectFile);
    this.writePlanSummary(plan, rebuild);
    this.output.show(true);

    const runner = new CompilerRunner();
    this.runners.set(projectKey, runner);
    this.updateStatusBar();
    try {
      const resource = vscode.Uri.file(projectFile);
      const encodingSetting = vscode.workspace.getConfiguration("delphiXe7", resource)
        .get<OutputEncodingSetting>("outputEncoding", "system");
      const encoding = await resolveOutputEncoding(encodingSetting);
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${rebuild ? "Rebuilding" : "Building"} ${path.basename(projectFile)}`,
        cancellable: true
      }, async (_progress, cancellationToken) => {
        const cancellation = cancellationToken.onCancellationRequested(() => void runner.cancel());
        try {
          return await runner.run(plan, encoding, (text) => this.output.append(text));
        } finally {
          cancellation.dispose();
        }
      });

      const parsed = parseCompilerDiagnostics(result.output, plan.workingDirectory, plan.projectFile);
      this.diagnostics.publish(projectFile, parsed);
      const errors = parsed.filter((item) => item.level === "error").length;
      const warnings = parsed.filter((item) => item.level === "warning").length;
      const duration = (result.durationMs / 1000).toFixed(1);

      if (result.cancelled) {
        this.output.appendLine(`\nBuild cancelled after ${duration}s.`);
        void vscode.window.showInformationMessage("Delphi build cancelled.");
      } else if (result.exitCode !== 0) {
        this.output.appendLine(`\nBuild failed with exit code ${result.exitCode}: ${errors} errors, ${warnings} warnings.`);
        void vscode.window.showErrorMessage(`Delphi build failed: ${errors} errors, ${warnings} warnings`);
      } else {
        const artifact = plan.expectedArtifacts.find(existsSync);
        if (!artifact && plan.expectedArtifacts.length > 0) {
          this.output.appendLine(`Expected output was not found: ${plan.expectedArtifacts.join(", ")}`);
        }
        this.output.appendLine(`\nBuild succeeded in ${duration}s${artifact ? `: ${artifact}` : "."}`);
        const message = `Delphi build succeeded in ${duration}s${artifact ? `: ${artifact}` : ""}`;
        if (artifact) {
          void vscode.window.showInformationMessage(message, "Show Output").then((action) => {
            if (action === "Show Output") {
              return vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(artifact));
            }
            return undefined;
          });
        } else {
          void vscode.window.showInformationMessage(message);
        }
      }
    } finally {
      this.runners.delete(projectKey);
      this.updateStatusBar();
    }
  }

  public async showBuildPlan(argument: unknown): Promise<void> {
    const commandOptions = parseCommandOptions(argument);
    assertWin32(commandOptions.platform);
    const projectFile = await this.resolveProject(argument, commandOptions);
    const compilerPath = this.resolveCompilerPath(projectFile);
    const configuration = await this.resolveConfiguration(
      projectFile,
      commandOptions.configuration,
      "Show Build Plan"
    );
    const plan = await this.makePlan(projectFile, configuration, false, compilerPath);
    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(redactBuildPlan(plan), null, 2)
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  public async cancel(argument: unknown): Promise<void> {
    const options = parseCommandOptions(argument);
    const project = argument instanceof vscode.Uri
      ? argument.fsPath
      : options.project ? resolveConfiguredPath(options.project) : undefined;
    const targets = project
      ? [this.runners.get(normalizeProjectKey(path.resolve(project)))].filter((runner): runner is CompilerRunner => Boolean(runner))
      : [...this.runners.values()];
    const cancelled = await Promise.all(targets.map((runner) => runner.cancel()));
    if (!cancelled.some(Boolean)) {
      void vscode.window.showInformationMessage("No Delphi build is currently running.");
    }
  }

  public async cancelAll(): Promise<void> {
    await Promise.all([...this.runners.values()].map((runner) => runner.cancel()));
  }

  public dispose(): void {
    void this.cancelAll();
    this.diagnostics.dispose();
    this.statusBar.dispose();
  }

  private async makePlan(
    projectFile: string,
    configuration: string,
    rebuild: boolean,
    compilerPath: string
  ): Promise<BuildPlan> {
    const resource = vscode.Uri.file(projectFile);
    const settings = vscode.workspace.getConfiguration("delphiXe7", resource);
    return createBuildPlan({
      projectFile,
      configuration,
      rebuild,
      compilerPath,
      additionalArguments: settings.get<string[]>("additionalArguments", []),
      environment: settings.get<Record<string, string>>("environment", {})
    });
  }

  private async resolveProject(argument: unknown, options: BuildCommandOptions): Promise<string> {
    if (argument instanceof vscode.Uri && argument.scheme === "file" && isDproj(argument.fsPath)) {
      return path.resolve(argument.fsPath);
    }
    if (options.project) {
      const project = resolveConfiguredPath(options.project);
      if (!isDproj(project)) {
        throw new Error(`Expected a .dproj project file, received: ${project}`);
      }
      return project;
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri;
    if (activeFile?.scheme === "file" && isDproj(activeFile.fsPath)) {
      return path.resolve(activeFile.fsPath);
    }

    const projects = await vscode.workspace.findFiles("**/*.dproj", "**/{node_modules,.git}/**");
    if (projects.length === 0) {
      throw new Error("No .dproj file was found in the workspace.");
    }
    if (projects.length === 1) {
      return projects[0].fsPath;
    }
    const selected = await vscode.window.showQuickPick(
      projects.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri),
        description: uri.fsPath,
        uri
      })),
      { placeHolder: "Select a Delphi project" }
    );
    if (!selected) {
      throw new CancellationError();
    }
    return selected.uri.fsPath;
  }

  private async resolveConfiguration(
    projectFile: string,
    requested: string | undefined,
    action: string
  ): Promise<string> {
    if (requested) {
      return requested;
    }
    const configurations = discoverConfigurations(await readFile(projectFile, "utf8"))
      .filter((item) => item.name.toLocaleLowerCase() !== "base");
    if (configurations.length === 0) {
      throw new Error(`No build configurations were found in ${path.basename(projectFile)}.`);
    }
    if (configurations.length === 1) {
      return configurations[0].name;
    }

    const selected = await vscode.window.showQuickPick(
      configurations.map((item) => ({
        label: `${action} ${item.name}`,
        description: `${item.name}|Win32`,
        configuration: item.name
      })),
      { placeHolder: `Select a configuration for ${path.basename(projectFile)}` }
    );
    if (!selected) {
      throw new CancellationError();
    }
    return selected.configuration;
  }

  private resolveCompilerPath(projectFile: string): string {
    const compilerPath = vscode.workspace
      .getConfiguration("delphiXe7", vscode.Uri.file(projectFile))
      .get<string>("compilerPath", "")
      .trim();
    if (!compilerPath) {
      throw new Error("DCC32 compiler path is not configured. Set 'delphiXe7.compilerPath' before building.");
    }
    return compilerPath;
  }

  private writePlanSummary(plan: BuildPlan, rebuild: boolean): void {
    this.output.appendLine("");
    this.output.appendLine(`=== Delphi DCC Builder ${rebuild ? "Rebuild" : "Build"}: ${path.basename(plan.projectFile)} ===`);
    this.output.appendLine(`Configuration: ${plan.configuration}|${plan.platform}`);
    this.output.appendLine(`Working directory: ${plan.workingDirectory}`);
    this.output.appendLine(`Compiler: ${plan.compilerPath}`);
    this.output.appendLine(`Arguments: ${plan.arguments.map(quoteForDisplay).join(" ")}`);
    for (const warning of plan.warnings) {
      this.output.appendLine(`Warning: ${warning}`);
    }
    this.output.appendLine("");
  }

  private updateStatusBar(): void {
    if (this.runners.size > 0) {
      this.statusBar.text = "$(sync~spin) DCC Builder";
      this.statusBar.tooltip = `${this.runners.size} Delphi build${this.runners.size === 1 ? "" : "s"} running`;
      this.statusBar.command = "delphiXe7.cancelBuild";
    } else {
      this.statusBar.text = "$(tools) DCC Builder";
      this.statusBar.tooltip = "Build a Delphi project with DCC32";
      this.statusBar.command = "delphiXe7.buildProject";
    }
  }
}

export class CancellationError extends Error {}

function parseCommandOptions(argument: unknown): BuildCommandOptions {
  if (!argument || argument instanceof vscode.Uri || typeof argument !== "object") {
    return {};
  }
  const value = argument as Record<string, unknown>;
  return {
    project: typeof value.project === "string" ? value.project : undefined,
    configuration: typeof value.configuration === "string" ? value.configuration : undefined,
    platform: typeof value.platform === "string" ? value.platform : undefined
  };
}

function resolveConfiguredPath(value: string): string {
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error(`A relative project path requires an open workspace: ${value}`);
  }
  return path.resolve(workspace.uri.fsPath, value);
}

function isDproj(file: string): boolean {
  return path.extname(file).toLocaleLowerCase() === ".dproj";
}

function normalizeProjectKey(file: string): string {
  return path.normalize(file).toLocaleLowerCase();
}

function assertWin32(platform: string | undefined): void {
  if (platform && platform.toLocaleLowerCase() !== "win32") {
    throw new Error(`Only the Win32 platform is supported, received '${platform}'.`);
  }
}

function quoteForDisplay(argument: string): string {
  return /\s|"/.test(argument) ? JSON.stringify(argument) : argument;
}
