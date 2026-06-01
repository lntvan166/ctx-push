import * as vscode from 'vscode';

const PASTE_HINT = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+Shift+V';

export function showClipboardSuccess(reference: string, enabled: boolean): void {
  if (!enabled) return;
  vscode.window.showInformationMessage(`${reference} copied — paste in Claude (${PASTE_HINT})`);
}

export function showPushError(err: unknown): void {
  vscode.window.showErrorMessage(
    `claude-context: ${err instanceof Error ? err.message : String(err)}`
  );
}
