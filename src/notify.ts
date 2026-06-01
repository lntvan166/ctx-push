import * as vscode from 'vscode';

export function showClipboardSuccess(reference: string, bufferCount: number, enabled: boolean): void {
  if (!enabled) return;
  const suffix = bufferCount > 1 ? ` (+${bufferCount - 1} more)` : '';
  vscode.window.showInformationMessage(`Copied: ${reference}${suffix}`);
}

export function showPushError(err: unknown): void {
  vscode.window.showErrorMessage(
    `claude-context: ${err instanceof Error ? err.message : String(err)}`
  );
}
