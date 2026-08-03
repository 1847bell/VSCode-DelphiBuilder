import * as vscode from "vscode";
import { BuildCommands, CancellationError } from "./commands/buildCommands";

let commands: BuildCommands | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Delphi XE7 DCC Builder");
  commands = new BuildCommands(output);

  context.subscriptions.push(
    output,
    commands,
    vscode.commands.registerCommand("delphiXe7.buildProject", (argument) => runSafely(output, () => commands!.build(argument, false))),
    vscode.commands.registerCommand("delphiXe7.buildProjectWin64", (argument) => runSafely(output, () => commands!.build(argument, false, "Win64"))),
    vscode.commands.registerCommand("delphiXe7.rebuildProject", (argument) => runSafely(output, () => commands!.build(argument, true))),
    vscode.commands.registerCommand("delphiXe7.cancelBuild", (argument) => runSafely(output, () => commands!.cancel(argument))),
    vscode.commands.registerCommand("delphiXe7.showBuildPlan", (argument) => runSafely(output, () => commands!.showBuildPlan(argument)))
  );
}

export async function deactivate(): Promise<void> {
  await commands?.cancelAll();
  commands = undefined;
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
    void vscode.window.showErrorMessage(`Delphi XE7 DCC Builder: ${message}`);
  }
}
