import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Lockfile advertising our WS server to the Claude CLI. The CLI scans
// $CLAUDE_CONFIG_DIR/ide/*.lock (default ~/.claude/ide) and parses the
// port from the FILENAME — the JSON carries auth + workspace matching.
export interface LockfileData {
  pid: number;
  workspaceFolders: string[];
  ideName: string;
  transport: 'ws';
  runningInWindows: boolean;
  authToken: string;
}

export function defaultIdeDir(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
  return path.join(configDir, 'ide');
}

export function lockfilePath(dir: string, port: number): string {
  return path.join(dir, `${port}.lock`);
}

export function writeLockfile(dir: string, port: number, data: LockfileData): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700); // mkdirSync's mode only applies when it creates the dir
  fs.writeFileSync(lockfilePath(dir, port), JSON.stringify(data), { mode: 0o600 });
}

export function removeLockfile(dir: string, port: number): void {
  try {
    fs.unlinkSync(lockfilePath(dir, port));
  } catch {
    // already gone — fine
  }
}

// Removes orphaned lockfiles from crashed windows. Only touches OUR files
// (matching ideName) with a dead pid — other IDEs' lockfiles are sacred.
export function cleanStaleLockfiles(
  dir: string,
  ideName: string,
  pidAlive: (pid: number) => boolean
): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith('.lock')) continue;
    const full = path.join(dir, name);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8')) as Partial<LockfileData>;
      if (data.ideName === ideName && typeof data.pid === 'number' && !pidAlive(data.pid)) {
        fs.unlinkSync(full);
      }
    } catch {
      // unreadable or vanished mid-scan — leave it alone
    }
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
