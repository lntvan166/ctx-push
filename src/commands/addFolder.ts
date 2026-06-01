import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function addFolder(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[]
): Promise<void> {
  const config = getConfig();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (Array.isArray(allUris) && allUris.length > 1) {
    const refs = allUris.map(u => formatPath(resolvePath(u.fsPath, workspaceRoot, config.pathStyle)));
    await pushManyReferences(refs, config, buffer, history);
    return;
  }

  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }
  const reference = formatPath(resolvePath(uri.fsPath, workspaceRoot, config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace');
}
