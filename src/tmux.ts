import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class TmuxNotFoundError extends Error {
  constructor() {
    super('tmux not found');
    this.name = 'TmuxNotFoundError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly session: string) {
    super(`tmux session '${session}' not found`);
    this.name = 'SessionNotFoundError';
  }
}

export async function sendToTmux(session: string, text: string): Promise<void> {
  try {
    await execFileAsync('tmux', ['send-keys', '-t', session, text + ' ']);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new TmuxNotFoundError();
    }
    if (
      typeof err.stderr === 'string' &&
      (err.stderr.includes("can't find session") || err.stderr.includes('session not found'))
    ) {
      throw new SessionNotFoundError(session);
    }
    throw err;
  }
}
