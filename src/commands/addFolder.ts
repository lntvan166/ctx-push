import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

function rootFor(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

export async function addFolder(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[]
): Promise<void> {
  const config = getConfig();

  if (Array.isArray(allUris) && allUris.length > 1) {
    const refs = allUris.map(u => formatPath(resolvePath(u.fsPath, rootFor(u), config.pathStyle)));
    await pushManyReferences(refs, config, buffer, history);
    return;
  }

  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }
  const reference = formatPath(resolvePath(uri.fsPath, rootFor(uri), config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace');
}
