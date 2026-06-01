import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addSelectionAppend } from './commands/addSelectionAppend';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';
import { pickFromHistory } from './commands/pickFromHistory';
import { ContextBuffer } from './contextBuffer';
import { History } from './history';

export function activate(context: vscode.ExtensionContext): void {
  const buffer = new ContextBuffer();
  const history = new History();

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claude-context.pickFromHistory';
  statusBar.tooltip = 'Click to browse context history';

  buffer.onChange(count => {
    if (count === 0) {
      statusBar.hide();
    } else {
      statusBar.text = `$(clippy) ${count} ${count === 1 ? 'ref' : 'refs'}`;
      statusBar.show();
    }
  });

  context.subscriptions.push(
    buffer,
    statusBar,
    vscode.commands.registerCommand('claude-context.addSelection',
      () => addSelection(buffer, history)),
    vscode.commands.registerCommand('claude-context.addSelectionAppend',
      () => addSelectionAppend(buffer, history)),
    vscode.commands.registerCommand('claude-context.addFile',
      (uri, allUris) => addFile(buffer, history, uri, allUris)),
    vscode.commands.registerCommand('claude-context.addFolder',
      (uri, allUris) => addFolder(buffer, history, uri, allUris)),
    vscode.commands.registerCommand('claude-context.clearContext',
      () => buffer.clear()),
    vscode.commands.registerCommand('claude-context.pickFromHistory',
      () => pickFromHistory(buffer, history)),
  );
}

export function deactivate(): void {}
