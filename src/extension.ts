import * as vscode from "vscode";
import { BuildCommands, CancellationError } from "./commands/buildCommands";
import { DelphiProjectTreeProvider } from "./vscode/projectTreeProvider";

let commands: BuildCommands | undefined;
let projectTree: DelphiProjectTreeProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Delphi DCC Builder");
  commands = new BuildCommands(output, context.globalState, context.workspaceState);
  projectTree = new DelphiProjectTreeProvider(context.workspaceState);
  const treeView = vscode.window.createTreeView("delphiDccProjects", {
    treeDataProvider: projectTree,
    showCollapseAll: true
  });

  context.subscriptions.push(
    output,
    commands,
    projectTree,
    treeView,
    vscode.commands.registerCommand("delphiDcc.createGroup", () => runSafely(output, () => projectTree!.createGroup())),
    vscode.commands.registerCommand("delphiDcc.renameGroup", (argument) => runSafely(output, () => projectTree!.renameGroup(argument))),
    vscode.commands.registerCommand("delphiDcc.moveGroupUp", (argument) => runSafely(output, () => projectTree!.moveGroup(argument, "up"))),
    vscode.commands.registerCommand("delphiDcc.moveGroupDown", (argument) => runSafely(output, () => projectTree!.moveGroup(argument, "down"))),
    vscode.commands.registerCommand("delphiDcc.sortGroups", () => runSafely(output, () => projectTree!.sortGroups())),
    vscode.commands.registerCommand("delphiDcc.addProjects", (argument) => runSafely(output, () => projectTree!.addProjects(argument))),
    vscode.commands.registerCommand("delphiDcc.refreshProjects", () => projectTree!.refresh()),
    vscode.commands.registerCommand("delphiDcc.activateConfiguration", (argument) => runSafely(output, () => projectTree!.activateConfiguration(argument))),
    vscode.commands.registerCommand("delphiDcc.showOutputPaths", (argument) => runSafely(output, () => projectTree!.showOutputPaths(argument))),
    vscode.commands.registerCommand("delphiXe7.buildProject", (argument) => runSafely(output, () => commands!.build(argument, false))),
    vscode.commands.registerCommand("delphiXe7.buildProjectWin64", (argument) => runSafely(output, () => commands!.build(argument, false, "Win64"))),
    vscode.commands.registerCommand("delphiXe7.rebuildProject", (argument) => runSafely(output, () => commands!.build(argument, true))),
    vscode.commands.registerCommand("delphiXe7.cancelBuild", (argument) => runSafely(output, () => commands!.cancel(argument))),
    vscode.commands.registerCommand("delphiXe7.showBuildPlan", (argument) => runSafely(output, () => commands!.showBuildPlan(argument))),
    vscode.commands.registerCommand("delphiXe7.changeOutputPath", (argument) => runSafely(output, () => commands!.changeOutputPath(argument)))
  );
}

export async function deactivate(): Promise<void> {
  await commands?.cancelAll();
  commands = undefined;
  projectTree = undefined;
}

async function runSafely(output: vscode.OutputChannel, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof CancellationError) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Error: ${message}`);
    output.show(true);
    void vscode.window.showErrorMessage(`Delphi DCC Builder: ${message}`);
  }
}
