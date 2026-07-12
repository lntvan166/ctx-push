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

export async function addFolder(
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

  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }
  const reference = formatPath(resolvePath(uri.fsPath, rootFor(uri), config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace', {
    ref: { fsPath: uri.fsPath },
    bridge: getBridge?.(),
  });
}
