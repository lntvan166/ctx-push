import * as vscode from 'vscode';
import { TmuxNotFoundError, SessionNotFoundError } from './tmux';

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
      `ctx-push: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
