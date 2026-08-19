import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { createBuildPlan, redactBuildPlan } from "../compiler/buildPlan";
import { CompilerRunner } from "../compiler/compilerRunner";
import { parseCompilerDiagnostics } from "../compiler/diagnosticParser";
import { OutputEncodingSetting, resolveOutputEncoding } from "../compiler/outputEncoding";
import { BuildPlan, DelphiPlatform, DelphiVersion } from "../core/types";
import { localize } from "../localization/localizer";
import {
  getDelphiVersionConfiguration,
  resolveDelphiVersion
} from "../delphi/versions";
import {
  DEFAULT_OUTPUT_PATH_HISTORY_LIMIT,
  getProjectOutputPathHistory,
  MAX_OUTPUT_PATH_HISTORY_LIMIT,
  MIN_OUTPUT_PATH_HISTORY_LIMIT,
  updateDprojOutputPath,
  updateProjectOutputPathHistory
} from "../project/dprojOutputPath";
import { discoverConfigurations, evaluateDproj } from "../project/dprojParser";
import {
  getProjectSelectionHistory,
  updateProjectSelectionHistory
} from "../project/projectSelectionHistory";
import { DiagnosticPublisher } from "../vscode/diagnosticPublisher";

const OUTPUT_PATH_HISTORY_KEY = "delphiXe7.outputPathHistory";
const PROJECT_SELECTION_HISTORY_KEY = "delphiXe7.projectSelectionHistory";

interface BuildCommandOptions {
  project?: string;
  configuration?: string;
  platform?: string;
}

interface ProjectQuickPickItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
}

export class BuildCommands implements vscode.Disposable {
  private readonly runners = new Map<string, CompilerRunner>();
  private readonly diagnostics = new DiagnosticPublisher();
  private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  public constructor(
    private readonly output: vscode.OutputChannel,
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento
  ) {
    this.updateStatusBar();
    this.statusBar.show();
  }

  public refreshLocalizedUi(): void {
    this.updateStatusBar();
  }

  public async build(
    argument: unknown,
    rebuild: boolean,
    forcedPlatform?: DelphiPlatform
  ): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      throw new Error(localize("build.error.trustedWorkspace"));
    }

    const commandOptions = parseCommandOptions(argument);
    const platform = forcedPlatform ?? resolvePlatform(commandOptions.platform);
    const projectFile = await this.resolveProject(argument, commandOptions);
    const version = this.resolveVersion(projectFile);
    const projectKey = normalizeProjectKey(projectFile);
    if (this.runners.has(projectKey)) {
      throw new Error(localize("build.error.alreadyRunning", {
        project: path.basename(projectFile)
      }));
    }

    const compilerPath = this.resolveCompilerPath(projectFile, platform, version);
    const action = localize(rebuild ? "build.action.rebuild" : "build.action.build", { platform });
    const configuration = await this.resolveConfiguration(
      projectFile,
      commandOptions.configuration,
      action,
      platform
    );
    const plan = await this.makePlan(
      projectFile,
      configuration,
      rebuild,
      compilerPath,
      platform,
      version
    );
    this.diagnostics.clear(projectFile);
    this.writePlanSummary(plan, rebuild);
    this.output.show(true);

    const runner = new CompilerRunner();
    this.runners.set(projectKey, runner);
    this.updateStatusBar();
    try {
      const resource = vscode.Uri.file(projectFile);
      const encodingSetting = vscode.workspace
        .getConfiguration(getDelphiVersionConfiguration(version).settingsSection, resource)
        .get<OutputEncodingSetting>("outputEncoding", "system");
      const encoding = await resolveOutputEncoding(encodingSetting);
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: localize(rebuild ? "build.progress.rebuilding" : "build.progress.building", {
          project: path.basename(projectFile)
        }),
        cancellable: true
      }, async (_progress, cancellationToken) => {
        const cancellation = cancellationToken.onCancellationRequested(() => void runner.cancel());
        try {
          return await runner.run(plan, encoding, (text) => this.output.append(text));
        } finally {
          cancellation.dispose();
        }
      });

      const parsed = result.stage === "compiler"
        ? parseCompilerDiagnostics(result.output, plan.workingDirectory, plan.projectFile)
        : [];
      this.diagnostics.publish(projectFile, parsed);
      const errors = parsed.filter((item) => item.level === "error").length;
      const warnings = parsed.filter((item) => item.level === "warning").length;
      const duration = (result.durationMs / 1000).toFixed(1);

      if (result.cancelled) {
        this.output.appendLine(`\n${localize("build.cancelled.output", { duration })}`);
        void vscode.window.showInformationMessage(localize("build.cancelled.notification"));
      } else if (result.exitCode !== 0) {
        const stage = localize(
          result.stage === "resource" ? "build.failure.stage.resource" : "build.failure.stage.compiler"
        );
        this.output.appendLine(
          `\n${localize("build.failure.output", {
            stage,
            exitCode: result.exitCode ?? "",
            errors,
            warnings
          })}`
        );
        void vscode.window.showErrorMessage(
          result.stage === "resource"
            ? localize("build.failure.resourceNotification")
            : localize("build.failure.compilerNotification", { errors, warnings })
        );
      } else {
        const artifact = plan.expectedArtifacts.find(existsSync);
        if (!artifact && plan.expectedArtifacts.length > 0) {
          this.output.appendLine(localize("build.output.expectedMissing", {
            paths: plan.expectedArtifacts.join(", ")
          }));
        }
        this.output.appendLine(`\n${localize("build.success.output", {
          duration,
          artifact: artifact ? `: ${artifact}` : "."
        })}`);
        const message = localize("build.success.notification", {
          duration,
          artifact: artifact ? `: ${artifact}` : ""
        });
        if (artifact) {
          const showOutput = localize("build.showOutput");
          void vscode.window.showInformationMessage(message, showOutput).then((action) => {
            if (action === showOutput) {
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
    const platform = resolvePlatform(commandOptions.platform);
    const projectFile = await this.resolveProject(argument, commandOptions);
    const version = this.resolveVersion(projectFile);
    const compilerPath = this.resolveCompilerPath(projectFile, platform, version);
    const configuration = await this.resolveConfiguration(
      projectFile,
      commandOptions.configuration,
      localize("build.action.showPlan"),
      platform
    );
    const plan = await this.makePlan(
      projectFile,
      configuration,
      false,
      compilerPath,
      platform,
      version
    );
    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(redactBuildPlan(plan), null, 2)
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  public async changeOutputPath(argument: unknown): Promise<void> {
    const commandOptions = parseCommandOptions(argument);
    const projectFile = await this.resolveProject(argument, commandOptions);
    const version = this.resolveVersion(projectFile);
    const platform = commandOptions.platform
      ? resolvePlatform(commandOptions.platform)
      : await this.resolveOutputPathPlatform(projectFile, version);
    const initialContent = await this.readProjectContent(projectFile);
    const configuration = await this.resolveConfiguration(
      projectFile,
      commandOptions.configuration,
      localize("build.action.changeOutputPath"),
      platform,
      initialContent
    );
    const initialEvaluation = evaluateDproj(initialContent, projectFile, {
      configuration,
      platform
    });
    const currentOutputPath = initialEvaluation.properties.DCC_ExeOutput?.trim() || ".";
    const historyLimit = this.resolveOutputPathHistoryLimit(projectFile, version);
    const history = getProjectOutputPathHistory(
      this.globalState.get<unknown>(OUTPUT_PATH_HISTORY_KEY),
      projectFile,
      historyLimit
    );
    const outputPath = await this.pickOutputPath(
      projectFile,
      configuration,
      platform,
      currentOutputPath,
      history
    );

    const latestContent = await this.readProjectContent(projectFile);
    const configurationDefinition = discoverConfigurations(latestContent).find((item) => (
      item.name.toLocaleLowerCase() === configuration.toLocaleLowerCase()
    ));
    if (!configurationDefinition) {
      throw new Error(localize("build.error.configurationMissing", {
        configuration,
        project: path.basename(projectFile)
      }));
    }

    const latestEvaluation = evaluateDproj(latestContent, projectFile, {
      configuration: configurationDefinition.name,
      platform
    });
    const previousOutputPath = latestEvaluation.properties.DCC_ExeOutput?.trim() || ".";

    const updatedContent = updateDprojOutputPath(latestContent, {
      configuration: configurationDefinition.name,
      configurationKey: configurationDefinition.key,
      platform,
      outputPath
    });
    const updatedEvaluation = evaluateDproj(updatedContent, projectFile, {
      configuration: configurationDefinition.name,
      platform
    });
    const effectiveOutputPath = updatedEvaluation.properties.DCC_ExeOutput?.trim();
    if (!effectiveOutputPath) {
      throw new Error(localize("build.error.outputPathIneffective"));
    }

    await this.writeProjectContent(projectFile, latestContent, updatedContent);
    await this.globalState.update(
      OUTPUT_PATH_HISTORY_KEY,
      updateProjectOutputPathHistory(
        this.globalState.get<unknown>(OUTPUT_PATH_HISTORY_KEY),
        projectFile,
        [previousOutputPath, outputPath],
        historyLimit
      )
    );
    void vscode.window.showInformationMessage(
      localize("build.outputPath.updated", {
        configuration: configurationDefinition.name,
        platform,
        path: outputPath
      })
    );
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
      void vscode.window.showInformationMessage(localize("build.noRunning"));
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
    compilerPath: string,
    platform: DelphiPlatform,
    version: DelphiVersion
  ): Promise<BuildPlan> {
    const resource = vscode.Uri.file(projectFile);
    const settings = vscode.workspace.getConfiguration(
      getDelphiVersionConfiguration(version).settingsSection,
      resource
    );
    const commonSettings = vscode.workspace.getConfiguration("delphiDcc", resource);
    return createBuildPlan({
      version,
      projectFile,
      configuration,
      platform,
      rebuild,
      compilerPath,
      resourceBuild: commonSettings.get<boolean>("resourceBuild", true),
      rsVarsPath: settings.get<string>("rsvarsPath", ""),
      brcc32Path: settings.get<string>("brcc32Path", ""),
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
        throw new Error(localize("build.error.expectedDproj", { project }));
      }
      return project;
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri;
    if (activeFile?.scheme === "file" && isDproj(activeFile.fsPath)) {
      return path.resolve(activeFile.fsPath);
    }

    const projects = await vscode.workspace.findFiles("**/*.dproj", "**/{node_modules,.git}/**");
    if (projects.length === 0) {
      throw new Error(localize("build.error.noProject"));
    }
    if (projects.length === 1) {
      return this.rememberProject(projects[0].fsPath);
    }

    const items = projects.map((uri): ProjectQuickPickItem => ({
      label: vscode.workspace.asRelativePath(uri),
      description: uri.fsPath,
      uri
    }));
    const itemsByProject = new Map(
      items.map((item) => [normalizeProjectKey(item.uri.fsPath), item])
    );
    const historyItems = getProjectSelectionHistory(
      this.workspaceState.get<unknown>(PROJECT_SELECTION_HISTORY_KEY),
      projects.map((uri) => uri.fsPath)
    ).flatMap((projectFile) => {
      const item = itemsByProject.get(normalizeProjectKey(projectFile));
      return item ? [item] : [];
    });
    const selected = await this.pickProject(items, historyItems);
    return this.rememberProject(selected.uri.fsPath);
  }

  private async pickProject(
    items: readonly ProjectQuickPickItem[],
    historyItems: readonly ProjectQuickPickItem[]
  ): Promise<ProjectQuickPickItem> {
    const picker = vscode.window.createQuickPick<ProjectQuickPickItem>();
    picker.placeholder = localize("build.projectPicker.placeholder");
    picker.items = historyItems;

    return new Promise<ProjectQuickPickItem>((resolve, reject) => {
      let accepted = false;
      const disposables = [
        picker.onDidChangeValue((value) => {
          picker.items = value ? items : historyItems;
        }),
        picker.onDidAccept(() => {
          const selected = picker.selectedItems[0] ?? picker.activeItems[0];
          if (!selected) {
            return;
          }
          accepted = true;
          picker.hide();
          resolve(selected);
        }),
        picker.onDidHide(() => {
          if (!accepted) {
            reject(new CancellationError());
          }
          for (const disposable of disposables) {
            disposable.dispose();
          }
          picker.dispose();
        })
      ];
      picker.show();
    });
  }

  private async rememberProject(projectFile: string): Promise<string> {
    const resolved = path.resolve(projectFile);
    await this.workspaceState.update(
      PROJECT_SELECTION_HISTORY_KEY,
      updateProjectSelectionHistory(
        this.workspaceState.get<unknown>(PROJECT_SELECTION_HISTORY_KEY),
        resolved
      )
    );
    return resolved;
  }

  private async resolveConfiguration(
    projectFile: string,
    requested: string | undefined,
    action: string,
    platform: DelphiPlatform,
    projectContent?: string
  ): Promise<string> {
    if (requested) {
      return requested;
    }
    const configurations = discoverConfigurations(projectContent ?? await readFile(projectFile, "utf8"))
      .filter((item) => item.name.toLocaleLowerCase() !== "base");
    if (configurations.length === 0) {
      throw new Error(localize("build.error.noConfigurations", {
        project: path.basename(projectFile)
      }));
    }
    if (configurations.length === 1) {
      return configurations[0].name;
    }

    const selected = await vscode.window.showQuickPick(
      configurations.map((item) => ({
        label: localize("build.configurationPicker.label", {
          action,
          configuration: item.name
        }),
        description: `${item.name}|${platform}`,
        configuration: item.name
      })),
      {
        placeHolder: localize("build.configurationPicker.placeholder", {
          project: path.basename(projectFile)
        })
      }
    );
    if (!selected) {
      throw new CancellationError();
    }
    return selected.configuration;
  }

  private async resolveOutputPathPlatform(
    projectFile: string,
    version: DelphiVersion
  ): Promise<DelphiPlatform> {
    const versionConfiguration = getDelphiVersionConfiguration(version);
    const compiler64Path = vscode.workspace
      .getConfiguration(versionConfiguration.settingsSection, vscode.Uri.file(projectFile))
      .get<string>(versionConfiguration.compilerSettingNames.Win64, "")
      .trim();
    if (!compiler64Path) {
      return "Win32";
    }

    const selected = await vscode.window.showQuickPick<{
      label: DelphiPlatform;
      description: string;
      platform: DelphiPlatform;
    }>([
      { label: "Win32", description: localize("build.platformPicker.win32"), platform: "Win32" },
      { label: "Win64", description: localize("build.platformPicker.win64"), platform: "Win64" }
    ], {
      placeHolder: localize("build.platformPicker.placeholder", {
        project: path.basename(projectFile)
      })
    });
    if (!selected) {
      throw new CancellationError();
    }
    return selected.platform;
  }

  private resolveOutputPathHistoryLimit(
    projectFile: string,
    version: DelphiVersion
  ): number {
    const configured = vscode.workspace
      .getConfiguration(
        getDelphiVersionConfiguration(version).settingsSection,
        vscode.Uri.file(projectFile)
      )
      .get<number>("outputPathHistoryLimit", DEFAULT_OUTPUT_PATH_HISTORY_LIMIT);
    if (!Number.isFinite(configured)) {
      return DEFAULT_OUTPUT_PATH_HISTORY_LIMIT;
    }
    return Math.min(
      MAX_OUTPUT_PATH_HISTORY_LIMIT,
      Math.max(MIN_OUTPUT_PATH_HISTORY_LIMIT, Math.trunc(configured))
    );
  }

  private async pickOutputPath(
    projectFile: string,
    configuration: string,
    platform: DelphiPlatform,
    currentOutputPath: string,
    history: readonly string[]
  ): Promise<string> {
    interface OutputPathItem extends vscode.QuickPickItem {
      outputPath: string;
    }

    const picker = vscode.window.createQuickPick<OutputPathItem>();
    picker.title = localize("build.outputPath.title", { project: path.basename(projectFile) });
    picker.placeholder = localize("build.outputPath.placeholder", { configuration, platform });
    picker.matchOnDescription = true;

    const refreshItems = (value: string): void => {
      const input = value.trim();
      const inputItem = input
        ? [{ label: input, description: localize("build.outputPath.currentInput"), outputPath: input }]
        : [];
      const normalizedInput = input.toLocaleLowerCase();
      const historyItems = history
        .filter((item) => item.trim() && item.trim().toLocaleLowerCase() !== normalizedInput)
        .map((item) => ({
          label: item,
          description: localize("build.outputPath.recent"),
          outputPath: item,
          alwaysShow: true
        }));
      picker.items = [...inputItem, ...historyItems];
      picker.activeItems = inputItem;
    };

    picker.value = currentOutputPath;
    refreshItems(currentOutputPath);
    return new Promise<string>((resolve, reject) => {
      let accepted = false;
      const disposables = [
        picker.onDidChangeValue(refreshItems),
        picker.onDidAccept(() => {
          const outputPath = picker.activeItems[0]?.outputPath ?? picker.value.trim();
          if (!outputPath) {
            picker.placeholder = localize("build.outputPath.empty");
            return;
          }
          accepted = true;
          picker.hide();
          resolve(outputPath);
        }),
        picker.onDidHide(() => {
          if (!accepted) {
            reject(new CancellationError());
          }
          for (const disposable of disposables) {
            disposable.dispose();
          }
          picker.dispose();
        })
      ];
      picker.show();
    });
  }

  private async readProjectContent(projectFile: string): Promise<string> {
    const document = findOpenDocument(projectFile);
    return document ? document.getText() : readFile(projectFile, "utf8");
  }

  private async writeProjectContent(
    projectFile: string,
    originalContent: string,
    updatedContent: string
  ): Promise<void> {
    const document = findOpenDocument(projectFile);
    if (document) {
      if (document.getText() !== originalContent) {
        throw new Error(localize("build.error.projectChanged", {
          project: path.basename(projectFile)
        }));
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(originalContent.length)),
        updatedContent
      );
      if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error(localize("build.error.projectUpdate", {
          project: path.basename(projectFile)
        }));
      }
      if (!await document.save()) {
        throw new Error(localize("build.error.projectSave", {
          project: path.basename(projectFile)
        }));
      }
      return;
    }

    const diskContent = await readFile(projectFile, "utf8");
    if (diskContent !== originalContent) {
      throw new Error(localize("build.error.projectChanged", {
        project: path.basename(projectFile)
      }));
    }
    await writeFile(projectFile, updatedContent, "utf8");
  }

  private resolveVersion(projectFile: string): DelphiVersion {
    const configured = vscode.workspace
      .getConfiguration("delphiDcc", vscode.Uri.file(projectFile))
      .get<string>("version", "XE7");
    return resolveDelphiVersion(configured);
  }

  private resolveCompilerPath(
    projectFile: string,
    platform: DelphiPlatform,
    version: DelphiVersion
  ): string {
    const versionConfiguration = getDelphiVersionConfiguration(version);
    const settingName = versionConfiguration.compilerSettingNames[platform];
    const compilerName = platform === "Win64" ? "DCC64" : "DCC32";
    const compilerPath = vscode.workspace
      .getConfiguration(versionConfiguration.settingsSection, vscode.Uri.file(projectFile))
      .get<string>(settingName, "")
      .trim();
    if (!compilerPath) {
      throw new Error(localize("build.error.compilerRequired", {
        setting: `${versionConfiguration.settingsSection}.${settingName}`,
        compiler: compilerName
      }));
    }
    return compilerPath;
  }

  private writePlanSummary(plan: BuildPlan, rebuild: boolean): void {
    this.output.appendLine("");
    const heading = localize(
      rebuild ? "build.summary.heading.rebuild" : "build.summary.heading.build"
    );
    this.output.appendLine(`=== Delphi DCC Builder ${heading}: ${path.basename(plan.projectFile)} ===`);
    this.output.appendLine(localize("build.summary.version", { version: plan.version }));
    this.output.appendLine(localize("build.summary.configuration", {
      configuration: plan.configuration,
      platform: plan.platform
    }));
    this.output.appendLine(localize("build.summary.workingDirectory", { path: plan.workingDirectory }));
    this.output.appendLine(localize("build.summary.compiler", { path: plan.compilerPath }));
    this.output.appendLine(localize("build.summary.arguments", {
      arguments: plan.arguments.map(quoteForDisplay).join(" ")
    }));
    if (plan.projectResource) {
      this.output.appendLine(localize("build.summary.projectResource", {
        path: plan.projectResource.output
      }));
    }
    if (plan.resourceBuild) {
      for (const step of plan.resourceBuild) {
        this.output.appendLine(localize("build.summary.resourceBuilder", { path: step.executable }));
        this.output.appendLine(localize("build.summary.resourceInput", { path: step.input }));
        this.output.appendLine(localize("build.summary.resourceOutput", { path: step.output }));
        this.output.appendLine(
          localize("build.summary.resourceArguments", {
            arguments: step.arguments.map(quoteForDisplay).join(" ")
          })
        );
      }
    }
    for (const warning of plan.warnings) {
      this.output.appendLine(localize("common.warning", { message: warning }));
    }
    this.output.appendLine("");
  }

  private updateStatusBar(): void {
    if (this.runners.size > 0) {
      this.statusBar.text = "$(sync~spin) Delphi DCC Builder";
      this.statusBar.tooltip = localize(
        this.runners.size === 1 ? "status.running.one" : "status.running.other",
        { count: this.runners.size }
      );
      this.statusBar.command = "delphiXe7.cancelBuild";
    } else {
      this.statusBar.text = "$(tools) Delphi DCC Builder";
      this.statusBar.tooltip = localize("status.ready");
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
    throw new Error(localize("build.error.relativeProject", { path: value }));
  }
  return path.resolve(workspace.uri.fsPath, value);
}

function isDproj(file: string): boolean {
  return path.extname(file).toLocaleLowerCase() === ".dproj";
}

function normalizeProjectKey(file: string): string {
  return path.normalize(file).toLocaleLowerCase();
}

function findOpenDocument(file: string): vscode.TextDocument | undefined {
  const key = normalizeProjectKey(file);
  return vscode.workspace.textDocuments.find((document) => (
    document.uri.scheme === "file" && normalizeProjectKey(document.uri.fsPath) === key
  ));
}

function resolvePlatform(platform: string | undefined): DelphiPlatform {
  if (!platform || platform.toLocaleLowerCase() === "win32") {
    return "Win32";
  }
  if (platform.toLocaleLowerCase() === "win64") {
    return "Win64";
  }
  throw new Error(localize("build.error.unsupportedPlatform", { platform }));
}

function quoteForDisplay(argument: string): string {
  return /\s|"/.test(argument) ? JSON.stringify(argument) : argument;
}
