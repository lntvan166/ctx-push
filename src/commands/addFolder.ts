import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference } from '../pushReference';

export async function addFolder(uri?: vscode.Uri): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }

  const config = getConfig();
  const absolutePath = uri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const reference = formatPath(resolvedPath);

  await pushReference(reference, config);
}
