import * as vscode from 'vscode';
import { getConfig } from '../config';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

export async function pickFromHistory(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): Promise<void> {
  const entries = history.getAll();
  if (entries.length === 0) {
    vscode.window.showInformationMessage('No history yet this session.');
    return;
  }
  const picked = await vscode.window.showQuickPick(entries.map(e => e.label), {
    placeHolder: 'Pick a reference to append to context buffer',
  });
  if (!picked) return;
  const entry = entries.find(e => e.label === picked);
  const config = getConfig();
  await pushReference(picked, config, buffer, history, 'append', {
    ref: entry?.ref,
    bridge: getBridge?.(),
  });
}
