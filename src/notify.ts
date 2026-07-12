import * as vscode from 'vscode';

export type Delivery = 'pushed' | 'copied' | 'copied-no-session';

const TITLE_PREFIX: Record<Delivery, string> = {
  pushed: 'Pushed',
  copied: 'Copied',
  'copied-no-session': 'Copied (no session)',
};

export function showClipboardSuccess(
  reference: string,
  extraCount: number,
  enabled: boolean,
  delivery: Delivery = 'copied'
): void {
  if (!enabled) return;
  const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
  void vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${TITLE_PREFIX[delivery]}: ${reference}${suffix}`,
      cancellable: false,
    },
    () => new Promise<void>(resolve => setTimeout(resolve, 3000))
  );
}

export function showPushError(err: unknown): void {
  vscode.window.showErrorMessage(
    `claude-context: ${err instanceof Error ? err.message : String(err)}`
  );
}
