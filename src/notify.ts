import * as vscode from 'vscode';

export function showClipboardSuccess(reference: string, bufferCount: number, enabled: boolean): void {
  if (!enabled) return;
  const suffix = bufferCount > 1 ? ` (+${bufferCount - 1} more)` : '';
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Copied: ${reference}${suffix}`, cancellable: false },
    () => new Promise<void>(resolve => setTimeout(resolve, 3000))
  );
}

export function showPushError(err: unknown): void {
  vscode.window.showErrorMessage(
    `claude-context: ${err instanceof Error ? err.message : String(err)}`
  );
}
