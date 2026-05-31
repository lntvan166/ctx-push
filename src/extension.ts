import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-context.addSelection', addSelection),
    vscode.commands.registerCommand('claude-context.addFile', addFile),
    vscode.commands.registerCommand('claude-context.addFolder', addFolder)
  );
}

export function deactivate(): void {}
