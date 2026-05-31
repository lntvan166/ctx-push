import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatSelection, formatPath } from '../pathResolver';
import { sendToTmux } from '../tmux';
import { showTmuxError, showSuccess } from '../notify';

export async function addSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }

  const config = getConfig();
  const absolutePath = editor.document.uri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);

  const selection = editor.selection;
  const reference = selection.isEmpty
    ? formatPath(resolvedPath)
    : formatSelection(resolvedPath, selection.start.line + 1, selection.end.line + 1);

  try {
    await sendToTmux(config.tmuxSession, reference);
    showSuccess(reference, config.tmuxSession, config.showNotifications);
  } catch (err) {
    showTmuxError(err, config.tmuxSession);
  }
}
