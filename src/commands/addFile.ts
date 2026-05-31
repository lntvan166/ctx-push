import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { sendToTmux } from '../tmux';
import { showTmuxError } from '../errors';

export async function addFile(uri?: vscode.Uri): Promise<void> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }

  const config = getConfig();
  const absolutePath = targetUri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const reference = formatPath(resolvedPath);

  try {
    await sendToTmux(config.tmuxSession, reference);
  } catch (err) {
    showTmuxError(err, config.tmuxSession);
  }
}
