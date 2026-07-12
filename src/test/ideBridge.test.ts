import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WebSocket } from 'ws';
import { IdeBridge } from '../ideBridge';

function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

let dir: string;
let bridge: IdeBridge | undefined;
let sockets: WebSocket[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-push-bridge-'));
  sockets = [];
});

afterEach(async () => {
  for (const s of sockets) s.terminate();
  await bridge?.dispose();
  bridge = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function startBridge(): Promise<IdeBridge> {
  const b = await IdeBridge.start({
    workspaceFolders: ['/tmp/proj'],
    version: '9.9.9',
    ideDir: dir,
    lockfilePid: process.pid,
  });
  if (!b) throw new Error('bridge failed to start');
  bridge = b;
  return b;
}

function lockfile(b: IdeBridge): { authToken: string; [k: string]: unknown } {
  return JSON.parse(fs.readFileSync(path.join(dir, `${b.port}.lock`), 'utf8'));
}

async function connectFakeCli(b: IdeBridge, pid = 4242): Promise<WebSocket> {
  // Baseline captured BEFORE connecting: the server's SessionRegistry.add()
  // runs synchronously in its 'connection' handler, which (same process,
  // same event loop) always completes before our client's 'open' fires —
  // so count is already bumped by the time we'd observe it post-open.
  const count = b.registry.count;
  const ws = new WebSocket(`ws://127.0.0.1:${b.port}`, ['mcp'], {
    headers: { 'x-claude-code-ide-authorization': lockfile(b).authToken },
  });
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  await waitFor(() => b.registry.count === count + 1);
  ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ide_connected', params: { pid } }));
  return ws;
}

describe('IdeBridge', () => {
  it('start writes a valid lockfile', async () => {
    const b = await startBridge();
    expect(lockfile(b)).toEqual({
      pid: process.pid,
      workspaceFolders: ['/tmp/proj'],
      ideName: 'ctx-push',
      transport: 'ws',
      runningInWindows: process.platform === 'win32',
      authToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('pushRef returns false with no connected session', async () => {
    const b = await startBridge();
    expect(b.pushRef({ fsPath: '/tmp/proj/a.ts' })).toBe(false);
  });

  it('pushRef delivers at_mentioned to the target session', async () => {
    const b = await startBridge();
    const ws = await connectFakeCli(b);
    const messages: string[] = [];
    ws.on('message', d => messages.push(String(d)));
    expect(b.pushRef({ fsPath: '/tmp/proj/a.ts', lineStart: 3, lineEnd: 9 })).toBe(true);
    await waitFor(() => messages.length === 1);
    expect(JSON.parse(messages[0])).toEqual({
      jsonrpc: '2.0', method: 'at_mentioned',
      params: { filePath: '/tmp/proj/a.ts', lineStart: 3, lineEnd: 9 },
    });
  });

  it('pushRefs sends one notification per ref, to the most recent session', async () => {
    const b = await startBridge();
    const first = await connectFakeCli(b, 1);
    const second = await connectFakeCli(b, 2);
    const firstMsgs: string[] = [];
    const secondMsgs: string[] = [];
    first.on('message', d => firstMsgs.push(String(d)));
    second.on('message', d => secondMsgs.push(String(d)));
    expect(b.pushRefs([{ fsPath: '/a.ts' }, { fsPath: '/b.ts' }])).toBe(true);
    await waitFor(() => secondMsgs.length === 2);
    expect(firstMsgs).toEqual([]);
  });

  it('pushRefs with an empty array returns false', async () => {
    const b = await startBridge();
    await connectFakeCli(b);
    expect(b.pushRefs([])).toBe(false);
  });

  it('updateWorkspaceFolders rewrites the lockfile, preserving the token', async () => {
    const b = await startBridge();
    const tokenBefore = lockfile(b).authToken;
    b.updateWorkspaceFolders(['/tmp/other']);
    expect(lockfile(b).workspaceFolders).toEqual(['/tmp/other']);
    expect(lockfile(b).authToken).toBe(tokenBefore);
  });

  it('dispose removes the lockfile and closes the server', async () => {
    const b = await startBridge();
    const port = b.port;
    await b.dispose();
    bridge = undefined;
    expect(fs.existsSync(path.join(dir, `${port}.lock`))).toBe(false);
  });

  it('start cleans up our stale lockfiles from dead windows', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '11111.lock'), JSON.stringify({
      pid: 999999999, ideName: 'ctx-push', workspaceFolders: [], transport: 'ws',
      runningInWindows: false, authToken: 'x',
    }));
    fs.writeFileSync(path.join(dir, '22222.lock'), JSON.stringify({
      pid: 999999999, ideName: 'Cursor', workspaceFolders: [], transport: 'ws',
      runningInWindows: false, authToken: 'x',
    }));
    await startBridge();
    expect(fs.existsSync(path.join(dir, '11111.lock'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '22222.lock'))).toBe(true); // not ours — untouched
  });

  it('start returns undefined instead of throwing when setup fails', async () => {
    // A file where the ide DIRECTORY should be makes mkdir/write fail
    const blocked = path.join(dir, 'blocked');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(blocked, 'not a dir');
    const b = await IdeBridge.start({
      workspaceFolders: [], version: '0.0.0', ideDir: blocked, lockfilePid: process.pid,
    });
    expect(b).toBeUndefined();
  });
});
