import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  LockfileData, defaultIdeDir, lockfilePath,
  writeLockfile, removeLockfile, cleanStaleLockfiles,
} from '../ideBridge/lockfile';

const data = (over: Partial<LockfileData> = {}): LockfileData => ({
  pid: process.pid,
  workspaceFolders: ['/tmp/proj'],
  ideName: 'ctx-push',
  transport: 'ws',
  runningInWindows: false,
  authToken: 'test-token',
  ...over,
});

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-push-lock-'));
  fs.rmdirSync(dir); // writeLockfile must create it
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('defaultIdeDir', () => {
  it('is <CLAUDE_CONFIG_DIR or ~/.claude>/ide', () => {
    const prev = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(defaultIdeDir()).toBe(path.join(os.homedir(), '.claude', 'ide'));
    process.env.CLAUDE_CONFIG_DIR = '/custom/claude';
    expect(defaultIdeDir()).toBe(path.join('/custom/claude', 'ide'));
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
  });
});

describe('writeLockfile', () => {
  it('creates the dir and writes <port>.lock with the exact JSON shape', () => {
    writeLockfile(dir, 12345, data());
    const parsed = JSON.parse(fs.readFileSync(lockfilePath(dir, 12345), 'utf8'));
    expect(parsed).toEqual({
      pid: process.pid,
      workspaceFolders: ['/tmp/proj'],
      ideName: 'ctx-push',
      transport: 'ws',
      runningInWindows: false,
      authToken: 'test-token',
    });
  });

  it('sets restrictive permissions (0700 dir, 0600 file)', () => {
    writeLockfile(dir, 12345, data());
    // Permission bits are POSIX-only; skip assertion on Windows
    if (process.platform !== 'win32') {
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(lockfilePath(dir, 12345)).mode & 0o777).toBe(0o600);
    }
  });

  it('tightens permissions on a pre-existing dir', () => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    writeLockfile(dir, 12345, data());
    if (process.platform !== 'win32') {
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    }
  });

  it('overwrites an existing lockfile (workspace folder updates)', () => {
    writeLockfile(dir, 12345, data());
    writeLockfile(dir, 12345, data({ workspaceFolders: ['/tmp/other'] }));
    const parsed = JSON.parse(fs.readFileSync(lockfilePath(dir, 12345), 'utf8'));
    expect(parsed.workspaceFolders).toEqual(['/tmp/other']);
  });
});

describe('removeLockfile', () => {
  it('removes the lockfile and tolerates it already being gone', () => {
    writeLockfile(dir, 12345, data());
    removeLockfile(dir, 12345);
    expect(fs.existsSync(lockfilePath(dir, 12345))).toBe(false);
    expect(() => removeLockfile(dir, 12345)).not.toThrow();
  });
});

describe('cleanStaleLockfiles', () => {
  it('removes only our orphans: matching ideName AND dead pid', () => {
    writeLockfile(dir, 1001, data({ pid: 1 }));                          // ours, pid 1 alive (init)
    writeLockfile(dir, 1002, data({ pid: 999999 }));                     // ours, dead
    writeLockfile(dir, 1003, data({ pid: 999999, ideName: 'Cursor' })); // NOT ours — untouched
    cleanStaleLockfiles(dir, 'ctx-push', pid => pid === 1);
    expect(fs.existsSync(lockfilePath(dir, 1001))).toBe(true);
    expect(fs.existsSync(lockfilePath(dir, 1002))).toBe(false);
    expect(fs.existsSync(lockfilePath(dir, 1003))).toBe(true);
  });

  it('leaves unreadable lockfiles alone and tolerates a missing dir', () => {
    writeLockfile(dir, 1001, data());
    fs.writeFileSync(lockfilePath(dir, 1004), '{corrupt');
    expect(() => cleanStaleLockfiles(dir, 'ctx-push', () => false)).not.toThrow();
    expect(fs.existsSync(lockfilePath(dir, 1004))).toBe(true);
    expect(() => cleanStaleLockfiles('/nonexistent/dir', 'ctx-push', () => false)).not.toThrow();
  });
});
