import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { DelphiPlatform } from "../core/types";
import { localize } from "../localization/localizer";
import { discoverConfigurations, evaluateDproj } from "../project/dprojParser";
import {
  addProjectGroup,
  addProjectToGroup,
  GroupedProject,
  GroupMoveDirection,
  moveProjectGroup,
  normalizeProjectGroups,
  PROJECT_GROUPS_STATE_KEY,
  ProjectGroup,
  renameProjectGroup,
  setActiveProjectConfiguration,
  sortProjectGroups
} from "../project/projectGroups";

const PLATFORMS: readonly DelphiPlatform[] = ["Win32", "Win64"];

interface ProjectDetails {
  activeConfiguration: string;
  configurations: string[];
  outputPaths: Record<DelphiPlatform, string>;
  error?: string;
}

interface GroupNode {
  kind: "group";
  group: ProjectGroup;
}

interface ProjectNode {
  kind: "project";
  groupId: string;
  project: GroupedProject;
  details: ProjectDetails;
}

interface ActionNode {
  kind: "action";
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon: string;
  command?: vscode.Command;
}

interface ConfigurationsNode {
  kind: "configurations";
  groupId: string;
  project: GroupedProject;
  details: ProjectDetails;
}

interface ConfigurationNode {
  kind: "configuration";
  groupId: string;
  project: GroupedProject;
  configuration: string;
  active: boolean;
}

export type DelphiProjectTreeNode =
  | GroupNode
  | ProjectNode
  | ActionNode
  | ConfigurationsNode
  | ConfigurationNode;

interface ProjectReference {
  groupId: string;
  projectFile: string;
}

interface ConfigurationReference extends ProjectReference {
  configuration: string;
}

type TreeItemWithReference = vscode.TreeItem & {
  groupId?: string;
  projectFile?: string;
};

export class DelphiProjectTreeProvider
implements vscode.TreeDataProvider<DelphiProjectTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<DelphiProjectTreeNode | undefined>();
  private readonly watcher = vscode.workspace.createFileSystemWatcher("**/*.dproj");
  private groups: ProjectGroup[];

  public readonly onDidChangeTreeData = this.changed.event;

  public constructor(private readonly workspaceState: vscode.Memento) {
    this.groups = normalizeProjectGroups(workspaceState.get<unknown>(PROJECT_GROUPS_STATE_KEY));
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  public dispose(): void {
    this.watcher.dispose();
    this.changed.dispose();
  }

  public refresh(): void {
    this.changed.fire(undefined);
  }

  public async createGroup(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: localize("tree.newGroup.title"),
      prompt: localize("tree.newGroup.prompt"),
      validateInput: (value) => this.validateGroupName(value)
    });
    if (name === undefined) {
      return;
    }
    await this.save(addProjectGroup(this.groups, randomUUID(), name));
  }

  public async renameGroup(argument: unknown): Promise<void> {
    const group = await this.resolveGroup(argument);
    if (!group) {
      return;
    }
    const name = await vscode.window.showInputBox({
      title: localize("tree.renameGroup.title"),
      prompt: localize("tree.renameGroup.prompt"),
      value: group.name,
      valueSelection: [0, group.name.length],
      validateInput: (value) => this.validateGroupName(value, group.id)
    });
    if (name === undefined) {
      return;
    }
    await this.save(renameProjectGroup(this.groups, group.id, name));
  }

  public async moveGroup(argument: unknown, direction: GroupMoveDirection): Promise<void> {
    const group = await this.resolveGroup(argument);
    if (!group) {
      return;
    }
    await this.save(moveProjectGroup(this.groups, group.id, direction));
  }

  public async sortGroups(): Promise<void> {
    await this.save(sortProjectGroups(this.groups));
  }

  public async addProjects(argument: unknown): Promise<void> {
    const group = await this.resolveGroup(argument);
    if (!group) {
      return;
    }
    const selected = await vscode.window.showOpenDialog({
      title: localize("tree.addProjects.title", { group: group.name }),
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: { [localize("tree.addProjects.filter")]: ["dproj"] }
    });
    if (!selected?.length) {
      return;
    }

    let updated = this.groups;
    const skipped: string[] = [];
    for (const uri of selected) {
      try {
        updated = addProjectToGroup(updated, group.id, uri.fsPath);
      } catch (error) {
        skipped.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (updated !== this.groups) {
      await this.save(updated);
    }
    if (skipped.length > 0) {
      void vscode.window.showWarningMessage(skipped.join(" "));
    }
  }

  public async activateConfiguration(argument: unknown): Promise<void> {
    const reference = readConfigurationReference(argument);
    if (!reference) {
      throw new Error(localize("tree.error.configurationUnavailable"));
    }
    const project = this.findProject(reference);
    if (!project) {
      throw new Error(localize("tree.error.projectNotInView"));
    }
    const content = await readProjectContent(project.filePath);
    const configuration = discoverConfigurations(content).find((item) => (
      item.name.toLocaleLowerCase() === reference.configuration.toLocaleLowerCase()
      && item.name.toLocaleLowerCase() !== "base"
    ));
    if (!configuration) {
      throw new Error(localize("tree.error.configurationMissing", {
        configuration: reference.configuration
      }));
    }
    await this.save(setActiveProjectConfiguration(
      this.groups,
      reference.groupId,
      project.filePath,
      configuration.name
    ));
  }

  public async showOutputPaths(argument: unknown): Promise<void> {
    const reference = readProjectReference(argument);
    if (!reference) {
      throw new Error(localize("tree.error.projectUnavailable"));
    }
    const project = this.findProject(reference);
    if (!project) {
      throw new Error(localize("tree.error.projectNotInView"));
    }
    const details = await this.readProjectDetails(project);
    if (details.error) {
      throw new Error(details.error);
    }
    await vscode.window.showQuickPick(
      PLATFORMS.map((platform) => ({
        label: platform,
        description: details.outputPaths[platform],
        detail: `${details.activeConfiguration}|${platform}`
      })),
      {
        title: localize("tree.outputPaths.title", { project: path.basename(project.filePath) }),
        placeHolder: localize("tree.outputPaths.placeholder"),
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
  }

  public getTreeItem(element: DelphiProjectTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case "group":
        return this.getGroupTreeItem(element);
      case "project":
        return this.getProjectTreeItem(element);
      case "action":
        return this.getActionTreeItem(element);
      case "configurations":
        return this.getConfigurationsTreeItem(element);
      case "configuration":
        return this.getConfigurationTreeItem(element);
    }
  }

  public async getChildren(element?: DelphiProjectTreeNode): Promise<DelphiProjectTreeNode[]> {
    if (!element) {
      return this.groups.map((group) => ({ kind: "group", group }));
    }
    switch (element.kind) {
      case "group":
        return Promise.all(element.group.projects.map(async (project) => ({
          kind: "project" as const,
          groupId: element.group.id,
          project,
          details: await this.readProjectDetails(project)
        })));
      case "project":
        return this.getProjectChildren(element);
      case "configurations":
        return element.details.configurations.map((configuration) => ({
          kind: "configuration",
          groupId: element.groupId,
          project: element.project,
          configuration,
          active: configuration.toLocaleLowerCase()
            === element.details.activeConfiguration.toLocaleLowerCase()
        }));
      default:
        return [];
    }
  }

  private getGroupTreeItem(node: GroupNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.group.name, vscode.TreeItemCollapsibleState.Collapsed);
    (item as TreeItemWithReference).groupId = node.group.id;
    item.id = `delphi-group:${node.group.id}`;
    item.description = localize(
      node.group.projects.length === 1 ? "tree.projectCount.one" : "tree.projectCount.other",
      { count: node.group.projects.length }
    );
    item.contextValue = "delphiProjectGroup";
    item.iconPath = new vscode.ThemeIcon("folder-library");
    return item;
  }

  private getProjectTreeItem(node: ProjectNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      path.basename(node.project.filePath),
      vscode.TreeItemCollapsibleState.Collapsed
    );
    item.id = `delphi-project:${node.groupId}:${projectKey(node.project.filePath)}`;
    (item as TreeItemWithReference).groupId = node.groupId;
    (item as TreeItemWithReference).projectFile = node.project.filePath;
    item.resourceUri = vscode.Uri.file(node.project.filePath);
    item.description = node.details.error
      ? localize("common.unavailable")
      : node.details.activeConfiguration || localize("tree.noConfigurations");
    item.tooltip = node.details.error
      ? `${node.project.filePath}\n${node.details.error}`
      : `${node.project.filePath}\n${localize("tree.activeConfiguration", {
        configuration: node.details.activeConfiguration
      })}`;
    item.contextValue = "delphiGroupedProject";
    if (node.details.error) {
      item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground"));
    }
    return item;
  }

  private getActionTreeItem(node: ActionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = node.id;
    item.description = node.description;
    item.tooltip = node.tooltip;
    item.iconPath = new vscode.ThemeIcon(node.icon);
    item.command = node.command;
    item.contextValue = "delphiProjectAction";
    return item;
  }

  private getConfigurationsTreeItem(node: ConfigurationsNode): vscode.TreeItem {
    const collapsibleState = node.details.configurations.length > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(localize("tree.configurations"), collapsibleState);
    item.id = `delphi-configurations:${node.groupId}:${projectKey(node.project.filePath)}`;
    item.description = node.details.configurations.length > 0
      ? node.details.activeConfiguration
      : localize("common.noneFound");
    item.iconPath = new vscode.ThemeIcon("settings-gear");
    item.contextValue = "delphiConfigurations";
    return item;
  }

  private getConfigurationTreeItem(node: ConfigurationNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.configuration, vscode.TreeItemCollapsibleState.None);
    item.id = `delphi-configuration:${node.groupId}:${projectKey(node.project.filePath)}:${node.configuration}`;
    item.description = node.active ? localize("common.active") : undefined;
    item.iconPath = new vscode.ThemeIcon(node.active ? "check" : "circle-outline");
    item.contextValue = node.active ? "delphiConfigurationActive" : "delphiConfiguration";
    item.command = {
      command: "delphiDcc.activateConfiguration",
      title: localize("tree.activateConfiguration"),
      arguments: [{
        groupId: node.groupId,
        projectFile: node.project.filePath,
        configuration: node.configuration
      }]
    };
    return item;
  }

  private getProjectChildren(node: ProjectNode): DelphiProjectTreeNode[] {
    const reference: ProjectReference = {
      groupId: node.groupId,
      projectFile: node.project.filePath
    };
    const buildOptions = (platform: DelphiPlatform): Record<string, string> => ({
      project: node.project.filePath,
      configuration: node.details.activeConfiguration,
      platform
    });
    const key = `${node.groupId}:${projectKey(node.project.filePath)}`;
    return [
      {
        kind: "action",
        id: `delphi-build-win32:${key}`,
        label: localize("tree.buildWin32"),
        description: node.details.activeConfiguration,
        icon: "tools",
        command: {
          command: "delphiXe7.buildProject",
          title: localize("tree.buildWin32"),
          arguments: [buildOptions("Win32")]
        }
      },
      {
        kind: "action",
        id: `delphi-build-win64:${key}`,
        label: localize("tree.buildWin64"),
        description: node.details.activeConfiguration,
        icon: "tools",
        command: {
          command: "delphiXe7.buildProjectWin64",
          title: localize("tree.buildWin64"),
          arguments: [buildOptions("Win64")]
        }
      },
      {
        kind: "action",
        id: `delphi-output-path:${key}`,
        label: localize("tree.currentOutputPath"),
        description: node.details.error ? localize("common.unavailable") : node.details.outputPaths.Win32,
        tooltip: node.details.error
          ? node.details.error
          : `${node.details.activeConfiguration}|Win32: ${node.details.outputPaths.Win32}\n`
            + `${node.details.activeConfiguration}|Win64: ${node.details.outputPaths.Win64}`,
        icon: "folder-opened",
        command: {
          command: "delphiDcc.showOutputPaths",
          title: localize("tree.showOutputPaths"),
          arguments: [reference]
        }
      },
      {
        kind: "action",
        id: `delphi-change-output-path:${key}`,
        label: localize("tree.changeOutputPath"),
        description: node.details.activeConfiguration,
        icon: "edit",
        command: {
          command: "delphiXe7.changeOutputPath",
          title: localize("tree.changeOutputPath"),
          arguments: [{
            project: node.project.filePath,
            configuration: node.details.activeConfiguration
          }]
        }
      },
      {
        kind: "configurations",
        groupId: node.groupId,
        project: node.project,
        details: node.details
      }
    ];
  }

  private async readProjectDetails(project: GroupedProject): Promise<ProjectDetails> {
    try {
      const content = await readProjectContent(project.filePath);
      const configurations = discoverConfigurations(content)
        .filter((item) => item.name.toLocaleLowerCase() !== "base")
        .map((item) => item.name);
      const requested = configurations.find((item) => (
        item.toLocaleLowerCase() === project.activeConfiguration?.toLocaleLowerCase()
      )) ?? configurations.find((item) => item.toLocaleLowerCase() === "debug")
        ?? configurations[0];
      const evaluations = PLATFORMS.map((platform) => evaluateDproj(content, project.filePath, {
        configuration: requested,
        platform
      }));
      return {
        activeConfiguration: evaluations[0].configuration,
        configurations,
        outputPaths: {
          Win32: resolveOutputPath(project.filePath, evaluations[0].properties.DCC_ExeOutput),
          Win64: resolveOutputPath(project.filePath, evaluations[1].properties.DCC_ExeOutput)
        }
      };
    } catch (error) {
      return {
        activeConfiguration: project.activeConfiguration ?? "",
        configurations: [],
        outputPaths: { Win32: "Unavailable", Win64: "Unavailable" },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async resolveGroup(argument: unknown): Promise<ProjectGroup | undefined> {
    const groupId = readGroupId(argument);
    if (groupId) {
      const group = this.groups.find((item) => item.id === groupId);
      if (!group) {
        throw new Error(localize("tree.error.groupMissing"));
      }
      return group;
    }
    if (this.groups.length === 0) {
      void vscode.window.showInformationMessage(localize("tree.group.createFirst"));
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(
      this.groups.map((group) => ({
        label: group.name,
        description: localize(
          group.projects.length === 1 ? "tree.projectCount.one" : "tree.projectCount.other",
          { count: group.projects.length }
        ),
        group
      })),
      { placeHolder: localize("tree.group.select") }
    );
    return selected?.group;
  }

  private findProject(reference: ProjectReference): GroupedProject | undefined {
    const key = projectKey(reference.projectFile);
    return this.groups.find((group) => group.id === reference.groupId)?.projects.find((project) => (
      projectKey(project.filePath) === key
    ));
  }

  private validateGroupName(value: string, excludedGroupId?: string): string | undefined {
    const name = value.trim();
    if (!name) {
      return localize("group.error.nameEmpty");
    }
    if (this.groups.some((group) => (
      group.id !== excludedGroupId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))) {
      return localize("group.error.nameDuplicate", { name });
    }
    return undefined;
  }

  private async save(groups: ProjectGroup[]): Promise<void> {
    await this.workspaceState.update(PROJECT_GROUPS_STATE_KEY, groups);
    this.groups = groups;
    this.refresh();
  }
}

async function readProjectContent(projectFile: string): Promise<string> {
  const key = projectKey(projectFile);
  const document = vscode.workspace.textDocuments.find((item) => (
    item.uri.scheme === "file" && projectKey(item.uri.fsPath) === key
  ));
  return document ? document.getText() : readFile(projectFile, "utf8");
}

function resolveOutputPath(projectFile: string, configuredPath: string | undefined): string {
  const value = configuredPath?.trim() || ".";
  if (/\$\([^)]+\)/.test(value)) {
    return value;
  }
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(path.dirname(projectFile), value));
}

function readGroupId(argument: unknown): string | undefined {
  if (!isRecord(argument)) {
    return undefined;
  }
  if (argument.kind === "group" && isRecord(argument.group)) {
    return readString(argument.group.id);
  }
  const treeItemGroupId = readString(argument.groupId);
  if (treeItemGroupId) {
    return treeItemGroupId;
  }
  return readString(argument.groupId);
}

function readProjectReference(argument: unknown): ProjectReference | undefined {
  if (!isRecord(argument)) {
    return undefined;
  }
  if (argument.kind === "project") {
    const groupId = readString(argument.groupId);
    const project = isRecord(argument.project) ? argument.project : undefined;
    const projectFile = project ? readString(project.filePath) : undefined;
    return groupId && projectFile ? { groupId, projectFile } : undefined;
  }
  const groupId = readString(argument.groupId);
  const projectFile = readString(argument.projectFile)
    ?? (argument.resourceUri instanceof vscode.Uri ? argument.resourceUri.fsPath : undefined);
  return groupId && projectFile ? { groupId, projectFile } : undefined;
}

function readConfigurationReference(argument: unknown): ConfigurationReference | undefined {
  const reference = readProjectReference(argument);
  const configuration = isRecord(argument) ? readString(argument.configuration) : undefined;
  return reference && configuration ? { ...reference, configuration } : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function projectKey(filePath: string): string {
  return path.normalize(path.resolve(filePath)).toLocaleLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
