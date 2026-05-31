import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { sendToTmux } from '../tmux';
import { showTmuxError } from '../errors';

export async function addFolder(uri: vscode.Uri): Promise<void> {
  const config = getConfig();
  const absolutePath = uri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const reference = formatPath(resolvedPath);

  try {
    await sendToTmux(config.tmuxSession, reference);
  } catch (err) {
    showTmuxError(err, config.tmuxSession);
  }
}
