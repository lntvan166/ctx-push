import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

function rootFor(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

export async function addFile(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[],
  getBridge?: BridgeProvider
): Promise<void> {
  const config = getConfig();

  if (Array.isArray(allUris) && allUris.length > 1) {
    const items = allUris.map(u => ({
      label: formatPath(resolvePath(u.fsPath, rootFor(u), config.pathStyle)),
      ref: { fsPath: u.fsPath },
    }));
    await pushManyReferences(items, config, buffer, history, getBridge?.());
    return;
  }

  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  if (targetUri.scheme !== 'file') {
    vscode.window.showErrorMessage('Save the file first — unsaved buffers have no path to reference');
    return;
  }
  const reference = formatPath(resolvePath(targetUri.fsPath, rootFor(targetUri), config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace', {
    ref: { fsPath: targetUri.fsPath },
    bridge: getBridge?.(),
  });
}
