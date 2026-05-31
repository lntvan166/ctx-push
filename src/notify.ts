import * as vscode from 'vscode';
import { TmuxNotFoundError, SessionNotFoundError } from './tmux';

export function showSuccess(reference: string, session: string, enabled: boolean): void {
  if (!enabled) return;
  vscode.window.showInformationMessage(`${reference} → tmux:${session}`);
}

export function showTmuxError(err: unknown, session: string): void {
  if (err instanceof TmuxNotFoundError) {
    vscode.window.showErrorMessage(
      'tmux not found. Install tmux and run Claude Code with `tmux new -s claude`'
    );
  } else if (err instanceof SessionNotFoundError) {
    vscode.window.showErrorMessage(
      `tmux session '${session}' not found. Start it with \`tmux new -s ${session}\``
    );
  } else {
    vscode.window.showErrorMessage(
      `claude-context: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
