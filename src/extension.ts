import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addSelectionAppend } from './commands/addSelectionAppend';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';
import { pickFromHistory } from './commands/pickFromHistory';
import { manageBuffer } from './commands/manageBuffer';
import { ContextBuffer } from './contextBuffer';
import { History, HistoryEntry } from './history';
import { syncClipboard } from './pushReference';
import { getConfig } from './config';
import { IdeBridge } from './ideBridge';

let bridge: IdeBridge | undefined;
let deactivated = false;

export function activate(context: vscode.ExtensionContext): void {
  deactivated = false;
  const buffer = new ContextBuffer();
  const rawHistory = context.workspaceState.get<unknown>('claude-context.history');
  const history = new History(hydrateHistory(rawHistory));
  history.onDidChange = items => {
    void context.workspaceState.update('claude-context.history', items);
  };

  const output = vscode.window.createOutputChannel('Context Push');
  const getBridge = (): IdeBridge | undefined => bridge;

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claude-context.manageBuffer';

  const updateStatusBar = (): void => {
    const count = buffer.count;
    if (count === 0) {
      statusBar.hide();
      return;
    }
    const sessions = bridge?.registry.count ?? 0;
    const icon = sessions > 0 ? '$(plug)' : '$(clippy)';
    statusBar.text = `${icon} ${count} ${count === 1 ? 'ref' : 'refs'}`;
    const targetPid = bridge?.registry.target?.pid;
    statusBar.tooltip = sessions > 0
      ? `Pushing refs to Claude session${targetPid ? ` (pid ${targetPid})` : ''} — click to manage`
      : 'Click to manage the context buffer';
    statusBar.show();
  };
  updateStatusBar();

  const onChangeDisposable = buffer.onChange(() => updateStatusBar());

  if (getConfig().directPush) {
    const folders = (): string[] =>
      (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
    void IdeBridge.start({
      workspaceFolders: folders(),
      version: (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
      log: msg => output.appendLine(msg),
    }).then(started => {
      if (deactivated) {
        // Teardown ran while the bridge was still starting — dispose it now so
        // the server closes and the lockfile is removed instead of orphaned.
        void started?.dispose();
        return;
      }
      bridge = started;
      if (!bridge) return;
      bridge.registry.onDidChange = () => updateStatusBar();
      updateStatusBar();
      context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => bridge?.updateWorkspaceFolders(folders()))
      );
    });
  }

  context.subscriptions.push(
    statusBar,
    onChangeDisposable,
    buffer,
    output,
    { dispose: () => { deactivated = true; void bridge?.dispose(); bridge = undefined; } },
    vscode.commands.registerCommand('claude-context.addSelection',
      () => addSelection(buffer, history, getBridge)),
    vscode.commands.registerCommand('claude-context.addSelectionAppend',
      () => addSelectionAppend(buffer, history, getBridge)),
    vscode.commands.registerCommand('claude-context.addFile',
      (uri, allUris) => addFile(buffer, history, uri, allUris, getBridge)),
    vscode.commands.registerCommand('claude-context.addFolder',
      (uri, allUris) => addFolder(buffer, history, uri, allUris, getBridge)),
    vscode.commands.registerCommand('claude-context.clearContext',
      async () => { buffer.clear(); await syncClipboard(buffer); }),
    vscode.commands.registerCommand('claude-context.pickFromHistory',
      () => pickFromHistory(buffer, history, getBridge)),
    vscode.commands.registerCommand('claude-context.manageBuffer',
      () => manageBuffer(buffer, history, getBridge)),
  );
}

export function deactivate(): Promise<void> | undefined {
  deactivated = true;
  const pending = bridge?.dispose();
  bridge = undefined;
  return pending;
}

// Accepts both the pre-1.4 string[] format and the current HistoryEntry[]
// format; anything unrecognized is dropped.
function hydrateHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      entries.push({ label: item });
    } else if (item !== null && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
      const candidate = item as { label: string; ref?: { fsPath?: unknown; lineStart?: unknown; lineEnd?: unknown } };
      const ref = candidate.ref;
      entries.push({
        label: candidate.label,
        ref: ref && typeof ref.fsPath === 'string'
          ? {
              fsPath: ref.fsPath,
              lineStart: typeof ref.lineStart === 'number' ? ref.lineStart : undefined,
              lineEnd: typeof ref.lineEnd === 'number' ? ref.lineEnd : undefined,
            }
          : undefined,
      });
    }
  }
  return entries;
}
