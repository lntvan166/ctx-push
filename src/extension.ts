import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addSelectionAppend } from './commands/addSelectionAppend';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';
import { pickFromHistory } from './commands/pickFromHistory';
import { manageBuffer } from './commands/manageBuffer';
import { ContextBuffer } from './contextBuffer';
import { History } from './history';
import { syncClipboard } from './pushReference';

export function activate(context: vscode.ExtensionContext): void {
  const buffer = new ContextBuffer();
  const rawHistory = context.workspaceState.get<unknown>('claude-context.history');
  const persisted = (Array.isArray(rawHistory) ? rawHistory : [])
    .filter((x): x is string => typeof x === 'string');
  const history = new History(persisted);
  history.onDidChange = items => {
    void context.workspaceState.update('claude-context.history', items);
  };

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claude-context.manageBuffer';
  statusBar.tooltip = 'Click to manage the context buffer';

  const onChangeDisposable = buffer.onChange(count => {
    if (count === 0) {
      statusBar.hide();
    } else {
      statusBar.text = `$(clippy) ${count} ${count === 1 ? 'ref' : 'refs'}`;
      statusBar.show();
    }
  });

  context.subscriptions.push(
    statusBar,
    onChangeDisposable,
    buffer,
    vscode.commands.registerCommand('claude-context.addSelection',
      () => addSelection(buffer, history)),
    vscode.commands.registerCommand('claude-context.addSelectionAppend',
      () => addSelectionAppend(buffer, history)),
    vscode.commands.registerCommand('claude-context.addFile',
      (uri, allUris) => addFile(buffer, history, uri, allUris)),
    vscode.commands.registerCommand('claude-context.addFolder',
      (uri, allUris) => addFolder(buffer, history, uri, allUris)),
    vscode.commands.registerCommand('claude-context.clearContext',
      async () => { buffer.clear(); await syncClipboard(buffer); }),
    vscode.commands.registerCommand('claude-context.pickFromHistory',
      () => pickFromHistory(buffer, history)),
    vscode.commands.registerCommand('claude-context.manageBuffer',
      () => manageBuffer(buffer, history)),
  );
}

export function deactivate(): void {}
