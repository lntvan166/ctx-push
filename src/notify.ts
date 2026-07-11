import * as vscode from 'vscode';

export function showClipboardSuccess(reference: string, extraCount: number, enabled: boolean): void {
  if (!enabled) return;
  const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Copied: ${reference}${suffix}`, cancellable: false },
    () => new Promise<void>(resolve => setTimeout(resolve, 3000))
  );
}

export function showPushError(err: unknown): void {
  vscode.window.showErrorMessage(
    `claude-context: ${err instanceof Error ? err.message : String(err)}`
  );
}
