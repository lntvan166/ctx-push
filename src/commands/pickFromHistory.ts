import * as vscode from 'vscode';
import { getConfig } from '../config';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function pickFromHistory(buffer: ContextBuffer, history: History): Promise<void> {
  const items = history.getAll();
  if (items.length === 0) {
    vscode.window.showInformationMessage('No history yet this session.');
    return;
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Pick a reference to append to context buffer',
  });
  if (!picked) return;
  const config = getConfig();
  await pushReference(picked, config, buffer, history, 'append');
}
