# Direct Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adds an IDE-protocol bridge so every ref add lands directly in the prompt input of the connected Claude Code CLI session (any terminal, via `/ide`), with clipboard as the unchanged fallback.

**Architecture:** The extension runs a WebSocket server (JSON-RPC/MCP handshake) advertised via a `~/.claude/ide/<port>.lock` lockfile; connected CLI sessions receive `at_mentioned {filePath, lineStart?, lineEnd?}` notifications which the CLI renders as `@refs` in its prompt. A `SessionRegistry` targets the most-recently-connected session. Structured `Ref` objects flow from command handlers through `pushReference()` (still the single write path) to the bridge, after the clipboard write succeeds.

**Tech Stack:** TypeScript (strict), `ws` (first runtime dep), Jest + ts-jest (unit tests run in plain node — the `vscode` module is mocked via `src/test/__mocks__/vscode.ts`), esbuild bundle.

**Spec:** read `docs/superpowers/specs/2026-07-12-direct-push-design.md` before starting.

## Global Constraints

- `ideName` in the lockfile and MCP `serverInfo.name` is exactly `ctx-push`.
- Never set the `CLAUDE_CODE_SSE_PORT` environment variable (collides with the official Claude Code extension).
- WS server binds `127.0.0.1` only; lockfile written mode `0600`, dir `0700`; auth mismatch → WS close code `1008`.
- All bridge failures degrade silently to clipboard-only behavior — the bridge must never break or delay the existing copy flow.
- Stale-lockfile cleanup only ever deletes lockfiles whose `ideName === 'ctx-push'` — never touch other IDEs' lockfiles.
- New setting `claude-context.directPush`, boolean, default `true`.
- Commands: `npm test` (Jest), `npm run typecheck` (tsc --noEmit; note `src/test` is excluded from tsconfig — Jest type-checks tests via ts-jest).
- Push-on-add sends only the newly added ref(s), never the whole buffer.
- Everything in `src/ideBridge/` must be importable without the `vscode` module so tests run in plain node.

---

### Task 1: Dependencies, `Ref` type, and the protocol module

**Files:**
- Modify: `package.json` (dependencies + esbuild externals)
- Create: `src/ref.ts`
- Create: `src/ideBridge/protocol.ts`
- Test: `src/test/protocol.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `Ref { fsPath: string; lineStart?: number; lineEnd?: number }` (from `src/ref.ts`); `handleInbound(raw: string, serverName: string, serverVersion: string): Inbound` where `Inbound = { kind: 'reply'; json: string } | { kind: 'ide_connected'; pid: number } | { kind: 'ignore' }`; `atMentioned(ref: Ref): string`.

- [ ] **Step 1: Install dependencies**

```bash
npm install ws
npm install --save-dev @types/ws
```

- [ ] **Step 2: Add esbuild externals for ws's optional native deps**

`ws` optionally requires `bufferutil` and `utf-8-validate`; esbuild fails bundling those requires unless marked external. In `package.json`, append ` --external:bufferutil --external:utf-8-validate` to all three esbuild scripts:

```json
    "bundle": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --external:bufferutil --external:utf-8-validate --platform=node --minify",
    "compile": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --external:bufferutil --external:utf-8-validate --platform=node --sourcemap",
    "watch": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --external:bufferutil --external:utf-8-validate --platform=node --sourcemap --watch",
```

Run: `npm run compile` — Expected: exits 0.

- [ ] **Step 3: Create the shared `Ref` type**

Create `src/ref.ts`:

```typescript
// A structured file reference for the IDE bridge. fsPath is ABSOLUTE —
// the Claude CLI relativizes against its own cwd and renders @path#L10-20.
export interface Ref {
  fsPath: string;
  lineStart?: number;
  lineEnd?: number;
}
```

- [ ] **Step 4: Write the failing protocol tests**

Create `src/test/protocol.test.ts`:

```typescript
import { handleInbound, atMentioned } from '../ideBridge/protocol';

describe('handleInbound', () => {
  it('answers initialize with serverInfo and echoes the requested protocolVersion', () => {
    const raw = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.0' } },
    });
    const out = handleInbound(raw, 'ctx-push', '1.3.0');
    expect(out.kind).toBe('reply');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply).toEqual({
      jsonrpc: '2.0', id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'ctx-push', version: '1.3.0' },
      },
    });
  });

  it('defaults protocolVersion when the client omits it', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize' }), 'ctx-push', '1.3.0');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply.result.protocolVersion).toBe('2025-03-26');
  });

  it('answers tools/list with an empty tool set', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }), 'ctx-push', '1.3.0');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply).toEqual({ jsonrpc: '2.0', id: 3, result: { tools: [] } });
  });

  it('answers unknown requests with a method-not-found error (lenient, never throws)', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'resources/list' }), 'ctx-push', '1.3.0');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply.error.code).toBe(-32601);
    expect(reply.id).toBe(4);
  });

  it('extracts the pid from an ide_connected notification', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', method: 'ide_connected', params: { pid: 4242 } }), 'ctx-push', '1.3.0');
    expect(out).toEqual({ kind: 'ide_connected', pid: 4242 });
  });

  it('ignores other notifications', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), 'ctx-push', '1.3.0');
    expect(out).toEqual({ kind: 'ignore' });
  });

  it('ignores malformed JSON', () => {
    expect(handleInbound('{nope', 'ctx-push', '1.3.0')).toEqual({ kind: 'ignore' });
  });

  it('ignores non-object payloads and messages without a method', () => {
    expect(handleInbound('42', 'ctx-push', '1.3.0')).toEqual({ kind: 'ignore' });
    expect(handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 9 }), 'ctx-push', '1.3.0')).toEqual({ kind: 'ignore' });
  });
});

describe('atMentioned', () => {
  it('serializes a file ref without line info', () => {
    expect(JSON.parse(atMentioned({ fsPath: '/abs/src/a.ts' }))).toEqual({
      jsonrpc: '2.0', method: 'at_mentioned', params: { filePath: '/abs/src/a.ts' },
    });
  });

  it('serializes a ref with a line range', () => {
    expect(JSON.parse(atMentioned({ fsPath: '/abs/src/a.ts', lineStart: 10, lineEnd: 20 }))).toEqual({
      jsonrpc: '2.0', method: 'at_mentioned', params: { filePath: '/abs/src/a.ts', lineStart: 10, lineEnd: 20 },
    });
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx jest src/test/protocol.test.ts`
Expected: FAIL — cannot find module `../ideBridge/protocol`.

- [ ] **Step 6: Implement `src/ideBridge/protocol.ts`**

```typescript
import { Ref } from '../ref';

// Pure JSON-RPC/MCP message handling for the IDE bridge. The protocol is
// unofficial (reverse-engineered from the official extension) — be lenient:
// never throw on unknown or malformed input.
export type Inbound =
  | { kind: 'reply'; json: string }
  | { kind: 'ide_connected'; pid: number }
  | { kind: 'ignore' };

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function handleInbound(raw: string, serverName: string, serverVersion: string): Inbound {
  let msg: JsonRpcMessage;
  try {
    msg = JSON.parse(raw) as JsonRpcMessage;
  } catch {
    return { kind: 'ignore' };
  }
  if (typeof msg !== 'object' || msg === null || typeof msg.method !== 'string') {
    return { kind: 'ignore' };
  }
  if (msg.id === undefined || msg.id === null) {
    // Notification — only ide_connected carries information we need
    if (msg.method === 'ide_connected' && typeof msg.params?.pid === 'number') {
      return { kind: 'ide_connected', pid: msg.params.pid };
    }
    return { kind: 'ignore' };
  }
  switch (msg.method) {
    case 'initialize': {
      const requested = typeof msg.params?.protocolVersion === 'string'
        ? msg.params.protocolVersion
        : '2025-03-26';
      return {
        kind: 'reply',
        json: JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: requested,
            capabilities: { tools: {} },
            serverInfo: { name: serverName, version: serverVersion },
          },
        }),
      };
    }
    case 'tools/list':
      return {
        kind: 'reply',
        json: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } }),
      };
    default:
      return {
        kind: 'reply',
        json: JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        }),
      };
  }
}

export function atMentioned(ref: Ref): string {
  const params: { filePath: string; lineStart?: number; lineEnd?: number } = { filePath: ref.fsPath };
  if (ref.lineStart !== undefined) params.lineStart = ref.lineStart;
  if (ref.lineEnd !== undefined) params.lineEnd = ref.lineEnd;
  return JSON.stringify({ jsonrpc: '2.0', method: 'at_mentioned', params });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest src/test/protocol.test.ts`
Expected: PASS (10 tests). Also run `npm run typecheck` — exits 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/ref.ts src/ideBridge/protocol.ts src/test/protocol.test.ts
git commit -m "feat: add IDE bridge protocol module and ws dependency"
```

---

### Task 2: Session registry

**Files:**
- Create: `src/ideBridge/sessions.ts`
- Test: `src/test/sessions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SessionClient { send(data: string): void }`; `Session { id: number; client: SessionClient; pid?: number; connectedAt: number }`; `class SessionRegistry` with `add(client, now?): Session`, `setPid(id, pid): void`, `remove(id): void`, `setTarget(id): void`, `get target(): Session | undefined`, `getAll(): readonly Session[]`, `get count(): number`, `onDidChange?: (sessions: readonly Session[]) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/sessions.test.ts`:

```typescript
import { SessionRegistry, SessionClient } from '../ideBridge/sessions';

const client = (): SessionClient => ({ send: jest.fn() });

describe('SessionRegistry', () => {
  let reg: SessionRegistry;

  beforeEach(() => { reg = new SessionRegistry(); });

  it('starts empty with no target', () => {
    expect(reg.count).toBe(0);
    expect(reg.target).toBeUndefined();
  });

  it('targets the most recently connected session', () => {
    reg.add(client());
    const b = reg.add(client());
    expect(reg.target?.id).toBe(b.id);
  });

  it('assigns unique incrementing ids and stores connectedAt', () => {
    const a = reg.add(client(), 1000);
    const b = reg.add(client(), 2000);
    expect(a.id).not.toBe(b.id);
    expect(a.connectedAt).toBe(1000);
    expect(b.connectedAt).toBe(2000);
  });

  it('setPid attaches the pid from ide_connected', () => {
    const a = reg.add(client());
    reg.setPid(a.id, 4242);
    expect(reg.getAll()[0].pid).toBe(4242);
  });

  it('remove evicts a session and target falls back to next-most-recent', () => {
    const a = reg.add(client());
    const b = reg.add(client());
    reg.remove(b.id);
    expect(reg.count).toBe(1);
    expect(reg.target?.id).toBe(a.id);
  });

  it('manual setTarget overrides most-recent', () => {
    const a = reg.add(client());
    reg.add(client());
    reg.setTarget(a.id);
    expect(reg.target?.id).toBe(a.id);
  });

  it('manual target is cleared when that session disconnects', () => {
    const a = reg.add(client());
    const b = reg.add(client());
    reg.setTarget(a.id);
    reg.remove(a.id);
    expect(reg.target?.id).toBe(b.id);
  });

  it('a newer session connecting resets a manual target to most-recent', () => {
    const a = reg.add(client());
    reg.add(client());
    reg.setTarget(a.id);
    const c = reg.add(client());
    expect(reg.target?.id).toBe(c.id);
  });

  it('setTarget on an unknown id is a no-op', () => {
    const a = reg.add(client());
    reg.setTarget(999);
    expect(reg.target?.id).toBe(a.id);
  });

  it('fires onDidChange on add, setPid, and remove', () => {
    const counts: number[] = [];
    reg.onDidChange = sessions => counts.push(sessions.length);
    const a = reg.add(client());
    reg.setPid(a.id, 1);
    reg.remove(a.id);
    expect(counts).toEqual([1, 1, 0]);
  });

  it('getAll returns a copy', () => {
    reg.add(client());
    const all = reg.getAll() as unknown[];
    all.pop();
    expect(reg.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/test/sessions.test.ts`
Expected: FAIL — cannot find module `../ideBridge/sessions`.

- [ ] **Step 3: Implement `src/ideBridge/sessions.ts`**

```typescript
// Registry of connected Claude CLI clients. Target = manually chosen session
// (until it disconnects or a newer session connects) else most recent.
export interface SessionClient {
  send(data: string): void;
}

export interface Session {
  id: number;
  client: SessionClient;
  pid?: number;
  connectedAt: number; // epoch ms, display only
}

export class SessionRegistry {
  private sessions: Session[] = [];
  private nextId = 1;
  private manualTargetId?: number;
  onDidChange?: (sessions: readonly Session[]) => void;

  add(client: SessionClient, now: number = Date.now()): Session {
    const session: Session = { id: this.nextId++, client, connectedAt: now };
    this.sessions.push(session);
    this.manualTargetId = undefined; // newest connection becomes the target
    this.onDidChange?.(this.getAll());
    return session;
  }

  setPid(id: number, pid: number): void {
    const session = this.sessions.find(s => s.id === id);
    if (!session || session.pid === pid) return;
    session.pid = pid;
    this.onDidChange?.(this.getAll());
  }

  remove(id: number): void {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.manualTargetId === id) this.manualTargetId = undefined;
    if (this.sessions.length !== before) this.onDidChange?.(this.getAll());
  }

  setTarget(id: number): void {
    if (this.sessions.some(s => s.id === id)) this.manualTargetId = id;
  }

  get target(): Session | undefined {
    if (this.manualTargetId !== undefined) {
      const manual = this.sessions.find(s => s.id === this.manualTargetId);
      if (manual) return manual;
    }
    return this.sessions[this.sessions.length - 1];
  }

  getAll(): readonly Session[] {
    return [...this.sessions];
  }

  get count(): number {
    return this.sessions.length;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/test/sessions.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ideBridge/sessions.ts src/test/sessions.test.ts
git commit -m "feat: add session registry with most-recent targeting"
```

---

### Task 3: Lockfile management

**Files:**
- Create: `src/ideBridge/lockfile.ts`
- Test: `src/test/lockfile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LockfileData { pid: number; workspaceFolders: string[]; ideName: string; transport: 'ws'; runningInWindows: boolean; authToken: string }`; `defaultIdeDir(): string`; `lockfilePath(dir: string, port: number): string`; `writeLockfile(dir: string, port: number, data: LockfileData): void`; `removeLockfile(dir: string, port: number): void`; `cleanStaleLockfiles(dir: string, ideName: string, isPidAlive: (pid: number) => boolean): void`; `isPidAlive(pid: number): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/lockfile.test.ts` (uses a real temp dir — no fs mocking):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/test/lockfile.test.ts`
Expected: FAIL — cannot find module `../ideBridge/lockfile`.

- [ ] **Step 3: Implement `src/ideBridge/lockfile.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/test/lockfile.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ideBridge/lockfile.ts src/test/lockfile.test.ts
git commit -m "feat: add IDE lockfile write/remove/stale-cleanup"
```

---

### Task 4: WebSocket server

**Files:**
- Create: `src/ideBridge/server.ts`
- Test: `src/test/ideServer.test.ts`

**Interfaces:**
- Consumes: `handleInbound` from `./protocol`; `SessionRegistry` from `./sessions`.
- Produces: `IdeServer { port: number; close(): Promise<void> }`; `startIdeServer(opts: IdeServerOptions): Promise<IdeServer>` where `IdeServerOptions = { authToken: string; serverName: string; serverVersion: string; registry: SessionRegistry; log?: (msg: string) => void; port?: number }` (pass `port: 0` in tests for an OS-assigned port; production omits it for a random 10000–65535 port with 3 bind attempts).

- [ ] **Step 1: Write the failing tests**

Create `src/test/ideServer.test.ts`:

```typescript
import { WebSocket } from 'ws';
import { startIdeServer, IdeServer } from '../ideBridge/server';
import { SessionRegistry } from '../ideBridge/sessions';

const TOKEN = 'secret-token';

function connect(port: number, token?: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}`, ['mcp'], {
    headers: token ? { 'x-claude-code-ide-authorization': token } : {},
  });
}

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

function onceOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

let server: IdeServer;
let registry: SessionRegistry;
let sockets: WebSocket[];

beforeEach(async () => {
  registry = new SessionRegistry();
  sockets = [];
  server = await startIdeServer({
    authToken: TOKEN, serverName: 'ctx-push', serverVersion: '0.0.0', registry, port: 0,
  });
});

afterEach(async () => {
  for (const s of sockets) s.terminate();
  await server.close();
});

function client(token?: string): WebSocket {
  const ws = connect(server.port, token);
  sockets.push(ws);
  return ws;
}

describe('startIdeServer', () => {
  it('reports the actually bound port', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('registers an authorized client as a session', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
  });

  it('rejects a client with a bad token with close code 1008', async () => {
    const ws = client('wrong');
    const code = await new Promise<number>(resolve => ws.once('close', c => resolve(c)));
    expect(code).toBe(1008);
    expect(registry.count).toBe(0);
  });

  it('answers the MCP initialize handshake', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    const reply = new Promise<string>(resolve => ws.once('message', d => resolve(String(d))));
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }));
    const parsed = JSON.parse(await reply);
    expect(parsed.result.serverInfo.name).toBe('ctx-push');
  });

  it('attaches the pid from ide_connected to the session', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ide_connected', params: { pid: 4242 } }));
    await waitFor(() => registry.getAll()[0].pid === 4242);
  });

  it('evicts the session when the client disconnects', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
    ws.close();
    await waitFor(() => registry.count === 0);
  });

  it('delivers data sent via the session client handle', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
    const received = new Promise<string>(resolve => ws.once('message', d => resolve(String(d))));
    registry.getAll()[0].client.send('{"hello":true}');
    expect(await received).toBe('{"hello":true}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/test/ideServer.test.ts`
Expected: FAIL — cannot find module `../ideBridge/server`.

- [ ] **Step 3: Implement `src/ideBridge/server.ts`**

```typescript
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { handleInbound } from './protocol';
import { SessionRegistry } from './sessions';

export interface IdeServer {
  port: number;
  close(): Promise<void>;
}

export interface IdeServerOptions {
  authToken: string;
  serverName: string;
  serverVersion: string;
  registry: SessionRegistry;
  log?: (msg: string) => void;
  port?: number; // tests pass 0 (OS-assigned); production omits for random
}

// Same range the official extension uses
function randomPort(): number {
  return Math.floor(Math.random() * 55536) + 10000;
}

function listen(port: number): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port,
      // The CLI connects with subprotocol "mcp"
      handleProtocols: protocols => (protocols.has('mcp') ? 'mcp' : false),
    });
    wss.once('listening', () => resolve(wss));
    wss.once('error', reject);
  });
}

export async function startIdeServer(opts: IdeServerOptions): Promise<IdeServer> {
  let wss: WebSocketServer | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3 && !wss; attempt++) {
    const candidate = opts.port ?? randomPort();
    try {
      wss = await listen(candidate);
    } catch (err) {
      lastError = err;
      opts.log?.(`port ${candidate} unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!wss) {
    throw new Error(`could not bind a port after 3 attempts: ${String(lastError)}`);
  }
  const address = wss.address();
  const port = typeof address === 'object' && address !== null ? address.port : (opts.port ?? 0);

  wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
    if (req.headers['x-claude-code-ide-authorization'] !== opts.authToken) {
      opts.log?.('rejected client: bad auth token');
      socket.close(1008, 'Unauthorized');
      return;
    }
    const session = opts.registry.add({ send: data => socket.send(data) });
    opts.log?.(`Claude session ${session.id} connected`);
    socket.on('message', raw => {
      const inbound = handleInbound(String(raw), opts.serverName, opts.serverVersion);
      if (inbound.kind === 'reply') {
        socket.send(inbound.json);
      } else if (inbound.kind === 'ide_connected') {
        opts.registry.setPid(session.id, inbound.pid);
      }
    });
    socket.on('close', () => {
      opts.registry.remove(session.id);
      opts.log?.(`Claude session ${session.id} disconnected`);
    });
    socket.on('error', err => {
      opts.log?.(`session ${session.id} socket error: ${err.message}`);
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>(resolve => {
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => resolve());
      }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/test/ideServer.test.ts`
Expected: PASS (7 tests), no open-handle warnings. Also run `npm run typecheck` — exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/ideBridge/server.ts src/test/ideServer.test.ts
git commit -m "feat: add IDE bridge WebSocket server with auth and session wiring"
```

---

### Task 5: IdeBridge facade

**Files:**
- Create: `src/ideBridge/index.ts`
- Test: `src/test/ideBridge.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4; `randomUUID` from node `crypto`.
- Produces: `IDE_NAME = 'ctx-push'`; `class IdeBridge` with `static start(opts: IdeBridgeOptions): Promise<IdeBridge | undefined>` (`IdeBridgeOptions = { workspaceFolders: string[]; version: string; ideDir?: string; lockfilePid?: number; log?: (msg: string) => void }`), `readonly registry: SessionRegistry`, `get port(): number`, `pushRef(ref: Ref): boolean`, `pushRefs(refs: Ref[]): boolean`, `updateWorkspaceFolders(folders: string[]): void`, `dispose(): Promise<void>`. Later tasks also use the type alias `BridgeProvider = () => IdeBridge | undefined` (exported here).

- [ ] **Step 1: Write the failing tests**

Create `src/test/ideBridge.test.ts`:

```typescript
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
  const ws = new WebSocket(`ws://127.0.0.1:${b.port}`, ['mcp'], {
    headers: { 'x-claude-code-ide-authorization': lockfile(b).authToken },
  });
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const count = b.registry.count;
  ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ide_connected', params: { pid } }));
  await waitFor(() => b.registry.count === count + 1);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/test/ideBridge.test.ts`
Expected: FAIL — cannot find module `../ideBridge`.

- [ ] **Step 3: Implement `src/ideBridge/index.ts`**

```typescript
import { randomUUID } from 'crypto';
import { Ref } from '../ref';
import { SessionRegistry } from './sessions';
import { startIdeServer, IdeServer } from './server';
import { atMentioned } from './protocol';
import {
  LockfileData, defaultIdeDir, writeLockfile, removeLockfile,
  cleanStaleLockfiles, isPidAlive,
} from './lockfile';

export const IDE_NAME = 'ctx-push';

// Handlers receive a getter, not the instance — the bridge starts async
// after activate() and may be undefined (directPush off / startup failure).
export type BridgeProvider = () => IdeBridge | undefined;

export interface IdeBridgeOptions {
  workspaceFolders: string[];
  version: string;
  ideDir?: string;      // test override; default ~/.claude/ide
  lockfilePid?: number; // test override; default process.ppid (IDE main process)
  log?: (msg: string) => void;
}

export class IdeBridge {
  private constructor(
    readonly registry: SessionRegistry,
    private readonly server: IdeServer,
    private readonly dir: string,
    private readonly baseLockfile: Omit<LockfileData, 'workspaceFolders'>,
    private readonly log?: (msg: string) => void
  ) {}

  // Never throws — a failed bridge means clipboard-only, not a broken extension.
  static async start(opts: IdeBridgeOptions): Promise<IdeBridge | undefined> {
    try {
      const dir = opts.ideDir ?? defaultIdeDir();
      cleanStaleLockfiles(dir, IDE_NAME, isPidAlive);
      const registry = new SessionRegistry();
      const authToken = randomUUID();
      const server = await startIdeServer({
        authToken,
        serverName: IDE_NAME,
        serverVersion: opts.version,
        registry,
        log: opts.log,
      });
      const baseLockfile: Omit<LockfileData, 'workspaceFolders'> = {
        pid: opts.lockfilePid ?? process.ppid,
        ideName: IDE_NAME,
        transport: 'ws',
        runningInWindows: process.platform === 'win32',
        authToken,
      };
      try {
        writeLockfile(dir, server.port, { ...baseLockfile, workspaceFolders: opts.workspaceFolders });
      } catch (err) {
        await server.close();
        throw err;
      }
      opts.log?.(`IDE bridge listening on 127.0.0.1:${server.port} — connect with /ide → ${IDE_NAME}`);
      return new IdeBridge(registry, server, dir, baseLockfile, opts.log);
    } catch (err) {
      opts.log?.(`direct push disabled: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  get port(): number {
    return this.server.port;
  }

  pushRef(ref: Ref): boolean {
    const target = this.registry.target;
    if (!target) return false;
    try {
      target.client.send(atMentioned(ref));
      return true;
    } catch (err) {
      this.log?.(`push failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  pushRefs(refs: Ref[]): boolean {
    if (refs.length === 0) return false;
    return refs.map(r => this.pushRef(r)).every(ok => ok);
  }

  updateWorkspaceFolders(folders: string[]): void {
    try {
      writeLockfile(this.dir, this.server.port, { ...this.baseLockfile, workspaceFolders: folders });
    } catch (err) {
      this.log?.(`lockfile update failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async dispose(): Promise<void> {
    removeLockfile(this.dir, this.server.port);
    await this.server.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/test/ideBridge.test.ts`
Expected: PASS (9 tests). Also run `npm run typecheck` and the full `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/ideBridge/index.ts src/test/ideBridge.test.ts
git commit -m "feat: add IdeBridge facade — lockfile lifecycle + at_mentioned push"
```

---

### Task 6: Structured history entries

**Files:**
- Modify: `src/history.ts` (full rewrite below)
- Modify: `src/extension.ts:14-17` (hydration)
- Modify: `src/commands/pickFromHistory.ts` (entries → labels)
- Test: `src/test/history.test.ts` (rewrite)

**Interfaces:**
- Consumes: `Ref` from `src/ref.ts`.
- Produces: `HistoryEntry { label: string; ref?: Ref }`; `History` API becomes `constructor(initial?: HistoryEntry[])`, `add(label: string, ref?: Ref): void`, `getAll(): HistoryEntry[]`, `clear(): void`, `onDidChange?: (items: HistoryEntry[]) => void`. Dedupe/cap stay keyed on `label`. `extension.ts` exports nothing new but persists `HistoryEntry[]` to workspaceState under the existing `'claude-context.history'` key; old persisted `string[]` values hydrate as `{ label }` entries (no `ref` → those picks stay clipboard-only).

- [ ] **Step 1: Rewrite the history tests**

Replace the entire contents of `src/test/history.test.ts`:

```typescript
import { History, HistoryEntry } from '../history';

describe('History', () => {
  let history: History;

  beforeEach(() => { history = new History(); });

  it('starts empty', () => {
    expect(history.getAll()).toEqual([]);
  });

  it('returns entries newest first, keeping the structured ref', () => {
    history.add('@src/a.ts', { fsPath: '/abs/src/a.ts' });
    history.add('@src/b.ts:1-5', { fsPath: '/abs/src/b.ts', lineStart: 1, lineEnd: 5 });
    expect(history.getAll()).toEqual([
      { label: '@src/b.ts:1-5', ref: { fsPath: '/abs/src/b.ts', lineStart: 1, lineEnd: 5 } },
      { label: '@src/a.ts', ref: { fsPath: '/abs/src/a.ts' } },
    ]);
  });

  it('supports entries without a ref (hydrated from the old string format)', () => {
    history.add('@src/a.ts');
    expect(history.getAll()).toEqual([{ label: '@src/a.ts', ref: undefined }]);
  });

  it('deduplicates by label, moving the entry to the top with the newest ref', () => {
    history.add('@src/a.ts');
    history.add('@src/b.ts');
    history.add('@src/a.ts', { fsPath: '/abs/src/a.ts' });
    expect(history.getAll().map(e => e.label)).toEqual(['@src/a.ts', '@src/b.ts']);
    expect(history.getAll()[0].ref).toEqual({ fsPath: '/abs/src/a.ts' });
  });

  it('caps at 20 entries', () => {
    for (let i = 0; i < 25; i++) {
      history.add(`@src/file${i}.ts`);
    }
    expect(history.getAll().length).toBe(20);
  });

  it('clear empties the history', () => {
    history.add('@src/a.ts');
    history.clear();
    expect(history.getAll()).toEqual([]);
  });

  it('getAll returns copies, not internal objects', () => {
    history.add('@src/a.ts', { fsPath: '/abs/a.ts' });
    const result = history.getAll();
    result.push({ label: 'tampered' });
    result[0].label = 'mutated';
    expect(history.getAll()).toEqual([{ label: '@src/a.ts', ref: { fsPath: '/abs/a.ts' } }]);
  });

  describe('hydration', () => {
    it('accepts initial entries via the constructor', () => {
      const h = new History([{ label: '@a.ts' }, { label: '@b.ts', ref: { fsPath: '/b.ts' } }]);
      expect(h.getAll().map(e => e.label)).toEqual(['@a.ts', '@b.ts']);
      expect(h.getAll()[1].ref).toEqual({ fsPath: '/b.ts' });
    });

    it('dedupes by label and caps initial entries at 20', () => {
      const initial: HistoryEntry[] = Array.from({ length: 25 }, (_, i) => ({ label: `@f${i}.ts` }));
      initial[1] = { label: '@f0.ts' }; // duplicate
      const h = new History(initial);
      const all = h.getAll();
      expect(all.length).toBe(20);
      expect(all[0].label).toBe('@f0.ts');
      expect(new Set(all.map(e => e.label)).size).toBe(20);
    });
  });

  describe('onDidChange', () => {
    it('fires with the current entries after add', () => {
      const h = new History();
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items.map(e => e.label));
      h.add('@a.ts');
      h.add('@b.ts');
      expect(seen).toEqual([['@a.ts'], ['@b.ts', '@a.ts']]);
    });

    it('fires on duplicate add (order changes)', () => {
      const h = new History([{ label: '@a.ts' }, { label: '@b.ts' }]);
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items.map(e => e.label));
      h.add('@b.ts');
      expect(seen).toEqual([['@b.ts', '@a.ts']]);
    });

    it('fires with an empty array on clear', () => {
      const h = new History([{ label: '@a.ts' }]);
      const seen: HistoryEntry[][] = [];
      h.onDidChange = items => seen.push(items);
      h.clear();
      expect(seen).toEqual([[]]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/test/history.test.ts`
Expected: FAIL — `HistoryEntry` not exported / signature mismatches.

- [ ] **Step 3: Rewrite `src/history.ts`**

```typescript
import { Ref } from './ref';

export interface HistoryEntry {
  label: string; // the formatted @ref string shown in QuickPicks
  ref?: Ref;     // structured ref for direct push; absent on pre-1.4 entries
}

export class History {
  private readonly MAX = 20;
  private items: HistoryEntry[] = [];
  onDidChange?: (items: HistoryEntry[]) => void;

  constructor(initial?: HistoryEntry[]) {
    if (!initial) return;
    const seen = new Set<string>();
    for (const entry of initial) {
      if (this.items.length >= this.MAX) break;
      if (seen.has(entry.label)) continue;
      seen.add(entry.label);
      this.items.push({ label: entry.label, ref: entry.ref });
    }
  }

  add(label: string, ref?: Ref): void {
    this.items = [{ label, ref }, ...this.items.filter(e => e.label !== label)].slice(0, this.MAX);
    this.onDidChange?.(this.getAll());
  }

  getAll(): HistoryEntry[] {
    return this.items.map(e => ({ ...e }));
  }

  clear(): void {
    this.items = [];
    this.onDidChange?.([]);
  }
}
```

- [ ] **Step 4: Update hydration in `src/extension.ts`**

Replace lines 14–17 (`const rawHistory` … `new History(persisted)`) with:

```typescript
  const rawHistory = context.workspaceState.get<unknown>('claude-context.history');
  const history = new History(hydrateHistory(rawHistory));
```

and add this function (plus the import changes) at the bottom of the file, after `deactivate`:

```typescript
// Accepts both the pre-1.4 string[] format and the current HistoryEntry[]
// format; anything unrecognized is dropped.
function hydrateHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      entries.push({ label: item });
    } else if (item !== null && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
      const candidate = item as { label: string; ref?: { fsPath?: unknown; lineStart?: unknown; lineEnd?: unknown } };
      const ref = candidate.ref;
      entries.push({
        label: candidate.label,
        ref: ref && typeof ref.fsPath === 'string'
          ? {
              fsPath: ref.fsPath,
              lineStart: typeof ref.lineStart === 'number' ? ref.lineStart : undefined,
              lineEnd: typeof ref.lineEnd === 'number' ? ref.lineEnd : undefined,
            }
          : undefined,
      });
    }
  }
  return entries;
}
```

Update the import at the top: `import { History, HistoryEntry } from './history';`

- [ ] **Step 5: Update `src/commands/pickFromHistory.ts` to work with entries**

Replace the file contents:

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function pickFromHistory(buffer: ContextBuffer, history: History): Promise<void> {
  const entries = history.getAll();
  if (entries.length === 0) {
    vscode.window.showInformationMessage('No history yet this session.');
    return;
  }
  const picked = await vscode.window.showQuickPick(entries.map(e => e.label), {
    placeHolder: 'Pick a reference to append to context buffer',
  });
  if (!picked) return;
  const config = getConfig();
  await pushReference(picked, config, buffer, history, 'append');
}
```

(The structured ref is threaded through to the push in Task 7 — this step only keeps the build green.)

- [ ] **Step 6: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all suites PASS, tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/history.ts src/extension.ts src/commands/pickFromHistory.ts src/test/history.test.ts
git commit -m "feat: history entries carry structured refs (backward-compatible hydration)"
```

---

### Task 7: Thread refs and the bridge through the push path and handlers

**Files:**
- Modify: `src/notify.ts`
- Modify: `src/pushReference.ts`
- Modify: `src/commands/addSelection.ts`
- Modify: `src/commands/addSelectionAppend.ts`
- Modify: `src/commands/addFile.ts`
- Modify: `src/commands/addFolder.ts`
- Modify: `src/commands/pickFromHistory.ts`
- Test: `src/test/notify.test.ts`, `src/test/pushReference.test.ts`

**Interfaces:**
- Consumes: `IdeBridge`, `BridgeProvider` from `src/ideBridge`; `Ref` from `src/ref.ts`; `History.add(label, ref?)` from Task 6.
- Produces: `Delivery = 'pushed' | 'copied' | 'copied-no-session'` and `showClipboardSuccess(reference: string, extraCount: number, enabled: boolean, delivery?: Delivery)` in `notify.ts`; `pushReference(reference, config, buffer, history, mode, targets?: { ref?: Ref; bridge?: IdeBridge })` and `pushManyReferences(items: Array<{ label: string; ref?: Ref }>, config, buffer, history, bridge?: IdeBridge)` in `pushReference.ts`; every command handler gains a trailing optional `getBridge?: BridgeProvider` parameter (so `extension.ts` compiles unchanged until Task 8).

- [ ] **Step 1: Extend the notify tests**

Append inside the `describe('showClipboardSuccess', …)` block of `src/test/notify.test.ts` (the existing `import { showClipboardSuccess } from '../notify';` stays as is — the string literals below don't need the `Delivery` type):

```typescript
  it('titles the toast Pushed when the ref was delivered to a session', () => {
    showClipboardSuccess('@src/auth.ts', 0, true, 'pushed');
    expect(withProgress.mock.calls[0][0].title).toBe('Pushed: @src/auth.ts');
  });

  it('flags a missing session when direct push is on but nothing is connected', () => {
    showClipboardSuccess('@src/auth.ts', 1, true, 'copied-no-session');
    expect(withProgress.mock.calls[0][0].title).toBe('Copied (no session): @src/auth.ts (+1 more)');
  });

  it('defaults to the plain Copied title', () => {
    showClipboardSuccess('@src/auth.ts', 0, true, 'copied');
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: @src/auth.ts');
  });
```

- [ ] **Step 2: Run notify tests to verify the new ones fail**

Run: `npx jest src/test/notify.test.ts`
Expected: 3 new tests FAIL (extra argument not accepted / wrong titles), 4 old ones PASS.

- [ ] **Step 3: Update `src/notify.ts`**

```typescript
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
```

Run: `npx jest src/test/notify.test.ts` — Expected: PASS (7 tests).

- [ ] **Step 4: Extend the pushReference tests**

In `src/test/pushReference.test.ts`, the existing `pushManyReferences` calls change shape (`['@a.ts']` → `[{ label: '@a.ts' }]`). Replace the file contents:

```typescript
import * as vscode from 'vscode';
import { pushReference, pushManyReferences, syncClipboard } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { Config } from '../config';
import { IdeBridge } from '../ideBridge';
import { Ref } from '../ref';

const writeText = vscode.env.clipboard.writeText as jest.Mock;
const withProgress = vscode.window.withProgress as jest.Mock;

const config: Config = { pathStyle: 'relative', showNotifications: true };

// A fake bridge: only the members pushReference touches (pushRef/pushRefs/registry.count)
function fakeBridge(sessionCount: number): { bridge: IdeBridge; pushed: Ref[] } {
  const pushed: Ref[] = [];
  const bridge = {
    registry: { count: sessionCount },
    pushRef: (ref: Ref) => { if (sessionCount === 0) return false; pushed.push(ref); return true; },
    pushRefs: (refs: Ref[]) => {
      if (sessionCount === 0 || refs.length === 0) return false;
      pushed.push(...refs);
      return true;
    },
  } as unknown as IdeBridge;
  return { bridge, pushed };
}

let buffer: ContextBuffer;
let history: History;

beforeEach(() => {
  jest.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  buffer = new ContextBuffer();
  history = new History();
});

describe('pushReference', () => {
  it('records history only after a successful clipboard write', async () => {
    await pushReference('@a.ts', config, buffer, history, 'replace');
    expect(history.getAll().map(e => e.label)).toEqual(['@a.ts']);
  });

  it('does not record history when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await pushReference('@a.ts', config, buffer, history, 'replace');
    expect(history.getAll()).toEqual([]);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('reports the number of other refs in the buffer in the toast', async () => {
    await pushReference('@a.ts', config, buffer, history, 'replace');
    await pushReference('@b.ts', config, buffer, history, 'append');
    expect(withProgress.mock.calls[1][0].title).toBe('Copied: @b.ts (+1 more)');
  });

  it('stores the structured ref in history', async () => {
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' } });
    expect(history.getAll()[0].ref).toEqual({ fsPath: '/abs/a.ts' });
  });

  it('pushes the ref to the bridge and titles the toast Pushed', async () => {
    const { bridge, pushed } = fakeBridge(1);
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' }, bridge });
    expect(pushed).toEqual([{ fsPath: '/abs/a.ts' }]);
    expect(withProgress.mock.calls[0][0].title).toBe('Pushed: @a.ts');
  });

  it('reports no-session when the bridge is up but nothing is connected', async () => {
    const { bridge, pushed } = fakeBridge(0);
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' }, bridge });
    expect(pushed).toEqual([]);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied (no session): @a.ts');
  });

  it('does not attempt a push without a structured ref (history entries from pre-1.4)', async () => {
    const { bridge, pushed } = fakeBridge(1);
    await pushReference('@a.ts', config, buffer, history, 'replace', { bridge });
    expect(pushed).toEqual([]);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: @a.ts');
  });
});

describe('pushManyReferences', () => {
  it('does not count the added files as "more" in the toast', async () => {
    await pushManyReferences([{ label: '@a.ts' }, { label: '@b.ts' }, { label: '@c.ts' }], config, buffer, history);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: 3 files');
  });

  it('counts pre-existing buffer refs as "more"', async () => {
    await pushReference('@z.ts', config, buffer, history, 'replace');
    await pushManyReferences([{ label: '@a.ts' }, { label: '@b.ts' }], config, buffer, history);
    expect(withProgress.mock.calls[1][0].title).toBe('Copied: 2 files (+1 more)');
  });

  it('does not record history when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await pushManyReferences([{ label: '@a.ts' }, { label: '@b.ts' }], config, buffer, history);
    expect(history.getAll()).toEqual([]);
  });

  it('pushes all structured refs and titles the toast Pushed', async () => {
    const { bridge, pushed } = fakeBridge(1);
    await pushManyReferences(
      [{ label: '@a.ts', ref: { fsPath: '/a.ts' } }, { label: '@b.ts', ref: { fsPath: '/b.ts' } }],
      config, buffer, history, bridge
    );
    expect(pushed).toEqual([{ fsPath: '/a.ts' }, { fsPath: '/b.ts' }]);
    expect(withProgress.mock.calls[0][0].title).toBe('Pushed: 2 files');
  });
});

describe('syncClipboard', () => {
  it('writes the buffer contents with a trailing space', async () => {
    buffer.appendMany(['@a.ts', '@b.ts']);
    writeText.mockClear();
    await syncClipboard(buffer);
    expect(writeText).toHaveBeenCalledWith('@a.ts @b.ts ');
  });

  it('writes an empty string exactly when the buffer is empty', async () => {
    await syncClipboard(buffer);
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('reports failures via the error toast and does not throw', async () => {
    buffer.append('@a.ts');
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await expect(syncClipboard(buffer)).resolves.toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run pushReference tests to verify the new ones fail**

Run: `npx jest src/test/pushReference.test.ts`
Expected: FAIL — new signatures don't exist yet.

- [ ] **Step 6: Update `src/pushReference.ts`**

```typescript
import * as vscode from 'vscode';
import { ContextBuffer } from './contextBuffer';
import { History } from './history';
import { Config } from './config';
import { Ref } from './ref';
import { IdeBridge } from './ideBridge';
import { copyReference } from './clipboard';
import { showClipboardSuccess, showPushError, Delivery } from './notify';

export interface PushTargets {
  ref?: Ref;
  bridge?: IdeBridge;
}

function deliveryOf(pushed: boolean, bridge?: IdeBridge): Delivery {
  if (pushed) return 'pushed';
  if (bridge && bridge.registry.count === 0) return 'copied-no-session';
  return 'copied';
}

export async function pushReference(
  reference: string,
  config: Config,
  buffer: ContextBuffer,
  history: History,
  mode: 'replace' | 'append',
  targets: PushTargets = {}
): Promise<void> {
  if (mode === 'replace') {
    buffer.replace(reference);
  } else {
    buffer.append(reference);
  }
  try {
    await copyReference(buffer.getContents());
    history.add(reference, targets.ref);
    const pushed = targets.bridge && targets.ref ? targets.bridge.pushRef(targets.ref) : false;
    showClipboardSuccess(reference, buffer.count - 1, config.showNotifications, deliveryOf(pushed, targets.bridge));
  } catch (err) {
    showPushError(err);
  }
}

export async function pushManyReferences(
  items: Array<{ label: string; ref?: Ref }>,
  config: Config,
  buffer: ContextBuffer,
  history: History,
  bridge?: IdeBridge
): Promise<void> {
  buffer.appendMany(items.map(i => i.label));
  try {
    await copyReference(buffer.getContents());
    items.forEach(i => history.add(i.label, i.ref));
    const refs = items.map(i => i.ref).filter((r): r is Ref => r !== undefined);
    const pushed = bridge && refs.length > 0 ? bridge.pushRefs(refs) : false;
    showClipboardSuccess(
      `${items.length} files`,
      buffer.count - items.length,
      config.showNotifications,
      deliveryOf(pushed, bridge)
    );
  } catch (err) {
    showPushError(err);
  }
}

export async function syncClipboard(buffer: ContextBuffer): Promise<void> {
  try {
    const contents = buffer.getContents();
    if (contents) {
      await copyReference(contents);
    } else {
      await vscode.env.clipboard.writeText('');
    }
  } catch (err) {
    showPushError(err);
  }
}
```

- [ ] **Step 7: Update the command handlers to build structured refs**

`src/commands/addSelection.ts` — replace the file contents:

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatSelection, formatPath, selectionLineRange } from '../pathResolver';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';
import { Ref } from '../ref';

export async function addSelectionWithMode(
  buffer: ContextBuffer,
  history: History,
  mode: 'replace' | 'append',
  getBridge?: BridgeProvider
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  if (editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
    vscode.window.showErrorMessage('Save the file first — unsaved buffers have no path to reference');
    return;
  }
  const config = getConfig();
  const absolutePath = editor.document.uri.fsPath;
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const selection = editor.selection;
  const { start, end } = selectionLineRange(
    selection.start.line,
    selection.end.line,
    selection.end.character
  );
  const reference = selection.isEmpty
    ? formatPath(resolvedPath)
    : formatSelection(resolvedPath, start, end);
  const ref: Ref = selection.isEmpty
    ? { fsPath: absolutePath }
    : { fsPath: absolutePath, lineStart: start, lineEnd: end };
  await pushReference(reference, config, buffer, history, mode, { ref, bridge: getBridge?.() });
}

export async function addSelection(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): Promise<void> {
  await addSelectionWithMode(buffer, history, 'replace', getBridge);
}
```

`src/commands/addSelectionAppend.ts` — replace the file contents (mirror the current delegation shape, adding the parameter):

```typescript
import { addSelectionWithMode } from './addSelection';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

export async function addSelectionAppend(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): Promise<void> {
  await addSelectionWithMode(buffer, history, 'append', getBridge);
}
```

`src/commands/addFile.ts` — replace the file contents:

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

function rootFor(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

export async function addFile(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[],
  getBridge?: BridgeProvider
): Promise<void> {
  const config = getConfig();

  if (Array.isArray(allUris) && allUris.length > 1) {
    const items = allUris.map(u => ({
      label: formatPath(resolvePath(u.fsPath, rootFor(u), config.pathStyle)),
      ref: { fsPath: u.fsPath },
    }));
    await pushManyReferences(items, config, buffer, history, getBridge?.());
    return;
  }

  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  if (targetUri.scheme !== 'file') {
    vscode.window.showErrorMessage('Save the file first — unsaved buffers have no path to reference');
    return;
  }
  const reference = formatPath(resolvePath(targetUri.fsPath, rootFor(targetUri), config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace', {
    ref: { fsPath: targetUri.fsPath },
    bridge: getBridge?.(),
  });
}
```

`src/commands/addFolder.ts` — replace the file contents (same pattern; folder paths push as plain `fsPath` refs):

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

function rootFor(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

export async function addFolder(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[],
  getBridge?: BridgeProvider
): Promise<void> {
  const config = getConfig();

  if (Array.isArray(allUris) && allUris.length > 1) {
    const items = allUris.map(u => ({
      label: formatPath(resolvePath(u.fsPath, rootFor(u), config.pathStyle)),
      ref: { fsPath: u.fsPath },
    }));
    await pushManyReferences(items, config, buffer, history, getBridge?.());
    return;
  }

  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }
  const reference = formatPath(resolvePath(uri.fsPath, rootFor(uri), config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace', {
    ref: { fsPath: uri.fsPath },
    bridge: getBridge?.(),
  });
}
```

`src/commands/pickFromHistory.ts` — replace the file contents (now threads the stored ref):

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

export async function pickFromHistory(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): Promise<void> {
  const entries = history.getAll();
  if (entries.length === 0) {
    vscode.window.showInformationMessage('No history yet this session.');
    return;
  }
  const picked = await vscode.window.showQuickPick(entries.map(e => e.label), {
    placeHolder: 'Pick a reference to append to context buffer',
  });
  if (!picked) return;
  const entry = entries.find(e => e.label === picked);
  const config = getConfig();
  await pushReference(picked, config, buffer, history, 'append', {
    ref: entry?.ref,
    bridge: getBridge?.(),
  });
}
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all suites PASS, tsc exits 0. (`extension.ts` still compiles because every new handler parameter is optional.)

- [ ] **Step 9: Commit**

```bash
git add src/notify.ts src/pushReference.ts src/commands/ src/test/notify.test.ts src/test/pushReference.test.ts
git commit -m "feat: thread structured refs and the IDE bridge through the push path"
```

---

### Task 8: Setting, activation wiring, and status bar indicator

**Files:**
- Modify: `package.json` (`contributes.configuration`)
- Modify: `src/config.ts`
- Modify: `src/extension.ts` (full rewrite below)
- Test: manual (F5) — activation wiring is a thin orchestrator, per this codebase's convention

**Interfaces:**
- Consumes: `IdeBridge`, `BridgeProvider` from `src/ideBridge`; all handlers' `getBridge` parameters from Task 7.
- Produces: `Config.directPush: boolean`; module-level bridge lifecycle (`activate` starts it fire-and-forget, `deactivate` disposes it); status bar shows `$(plug) N refs` when ≥1 session is connected, `$(clippy) N refs` otherwise.

- [ ] **Step 1: Add the setting to `package.json`**

In `contributes.configuration.properties`, after `claude-context.showNotifications`, add:

```json
        "claude-context.directPush": {
          "type": "boolean",
          "default": true,
          "description": "Run the IDE bridge so Claude Code sessions connected via /ide → ctx-push receive added refs directly in their prompt"
        }
```

- [ ] **Step 2: Add `directPush` to `src/config.ts`**

```typescript
import * as vscode from 'vscode';

export interface Config {
  pathStyle: 'relative' | 'absolute';
  showNotifications: boolean;
  directPush: boolean;
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('claude-context');
  return {
    pathStyle: cfg.get<'relative' | 'absolute'>('pathStyle') ?? 'relative',
    showNotifications: cfg.get<boolean>('showNotifications') ?? true,
    directPush: cfg.get<boolean>('directPush') ?? true,
  };
}
```

Note: `src/test/pushReference.test.ts` builds a `Config` object literal — add `directPush: true` to it:

```typescript
const config: Config = { pathStyle: 'relative', showNotifications: true, directPush: true };
```

- [ ] **Step 3: Rewrite `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addSelectionAppend } from './commands/addSelectionAppend';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';
import { pickFromHistory } from './commands/pickFromHistory';
import { manageBuffer } from './commands/manageBuffer';
import { ContextBuffer } from './contextBuffer';
import { History, HistoryEntry } from './history';
import { syncClipboard } from './pushReference';
import { getConfig } from './config';
import { IdeBridge } from './ideBridge';

let bridge: IdeBridge | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const buffer = new ContextBuffer();
  const rawHistory = context.workspaceState.get<unknown>('claude-context.history');
  const history = new History(hydrateHistory(rawHistory));
  history.onDidChange = items => {
    void context.workspaceState.update('claude-context.history', items);
  };

  const output = vscode.window.createOutputChannel('Claude Context');
  const getBridge = (): IdeBridge | undefined => bridge;

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claude-context.manageBuffer';

  const updateStatusBar = (): void => {
    const count = buffer.count;
    if (count === 0) {
      statusBar.hide();
      return;
    }
    const sessions = bridge?.registry.count ?? 0;
    const icon = sessions > 0 ? '$(plug)' : '$(clippy)';
    statusBar.text = `${icon} ${count} ${count === 1 ? 'ref' : 'refs'}`;
    const targetPid = bridge?.registry.target?.pid;
    statusBar.tooltip = sessions > 0
      ? `Pushing refs to Claude session${targetPid ? ` (pid ${targetPid})` : ''} — click to manage`
      : 'Click to manage the context buffer';
    statusBar.show();
  };
  updateStatusBar();

  const onChangeDisposable = buffer.onChange(() => updateStatusBar());

  if (getConfig().directPush) {
    const folders = (): string[] =>
      (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
    void IdeBridge.start({
      workspaceFolders: folders(),
      version: (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
      log: msg => output.appendLine(msg),
    }).then(started => {
      bridge = started;
      if (!bridge) return;
      bridge.registry.onDidChange = () => updateStatusBar();
      updateStatusBar();
      context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => bridge?.updateWorkspaceFolders(folders()))
      );
    });
  }

  context.subscriptions.push(
    statusBar,
    onChangeDisposable,
    buffer,
    output,
    { dispose: () => { void bridge?.dispose(); bridge = undefined; } },
    vscode.commands.registerCommand('claude-context.addSelection',
      () => addSelection(buffer, history, getBridge)),
    vscode.commands.registerCommand('claude-context.addSelectionAppend',
      () => addSelectionAppend(buffer, history, getBridge)),
    vscode.commands.registerCommand('claude-context.addFile',
      (uri, allUris) => addFile(buffer, history, uri, allUris, getBridge)),
    vscode.commands.registerCommand('claude-context.addFolder',
      (uri, allUris) => addFolder(buffer, history, uri, allUris, getBridge)),
    vscode.commands.registerCommand('claude-context.clearContext',
      async () => { buffer.clear(); await syncClipboard(buffer); }),
    vscode.commands.registerCommand('claude-context.pickFromHistory',
      () => pickFromHistory(buffer, history, getBridge)),
    vscode.commands.registerCommand('claude-context.manageBuffer',
      () => manageBuffer(buffer, history)),
  );
}

export function deactivate(): Promise<void> | undefined {
  const pending = bridge?.dispose();
  bridge = undefined;
  return pending;
}

// Accepts both the pre-1.4 string[] format and the current HistoryEntry[]
// format; anything unrecognized is dropped.
function hydrateHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      entries.push({ label: item });
    } else if (item !== null && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
      const candidate = item as { label: string; ref?: { fsPath?: unknown; lineStart?: unknown; lineEnd?: unknown } };
      const ref = candidate.ref;
      entries.push({
        label: candidate.label,
        ref: ref && typeof ref.fsPath === 'string'
          ? {
              fsPath: ref.fsPath,
              lineStart: typeof ref.lineStart === 'number' ? ref.lineStart : undefined,
              lineEnd: typeof ref.lineEnd === 'number' ? ref.lineEnd : undefined,
            }
          : undefined,
      });
    }
  }
  return entries;
}
```

(Note: `hydrateHistory` already exists from Task 6 — this rewrite keeps it; the diff versus Task 6's `extension.ts` is the output channel, bridge start, `getBridge` threading, and the status bar plug/tooltip logic.)

- [ ] **Step 4: Verify build, tests, typecheck**

Run: `npm test && npm run typecheck && npm run compile`
Expected: all PASS / exit 0.

- [ ] **Step 5: Manual smoke test (F5)**

1. Press F5 → Extension Development Host opens on a workspace.
2. Open the integrated terminal, run `claude`, then `/ide` → the picker must list **ctx-push** (alongside the official extension if installed). Pick ctx-push.
3. `Cmd+Alt+C` on a selection → the ref appears in Claude's prompt input as `@path#L<start>-<end>` with a trailing space; toast says `Pushed: …`; status bar shows `$(plug)`.
4. Quit the CLI → status bar reverts to `$(clippy)`; adds toast `Copied (no session): …`.
5. Set `claude-context.directPush` to `false`, reload the window → `ls ~/.claude/ide/` contains no lockfile from ctx-push; adds behave exactly like v1.3.0.

Expected: all five checks pass. If step 2's picker doesn't list ctx-push, check the "Claude Context" output channel for the bridge log line and inspect `~/.claude/ide/*.lock` contents.

- [ ] **Step 6: Commit**

```bash
git add package.json src/config.ts src/extension.ts src/test/pushReference.test.ts
git commit -m "feat: wire IdeBridge into activation with directPush setting and status bar indicator"
```

---

### Task 9: Switch-target row in the buffer manager

**Files:**
- Modify: `src/commands/manageBuffer.ts`
- Modify: `src/extension.ts:` (the `manageBuffer` registration — pass `getBridge`)
- Test: manual (F5) — QuickPick handlers are thin orchestrators, per this codebase's convention

**Interfaces:**
- Consumes: `BridgeProvider`, `IdeBridge` from `src/ideBridge`; `SessionRegistry.getAll/setTarget/target` from Task 2.
- Produces: `manageBuffer(buffer, history, getBridge?)` — new optional third parameter.

- [ ] **Step 1: Update `src/commands/manageBuffer.ts`**

Replace the file contents:

```typescript
import * as vscode from 'vscode';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { syncClipboard } from '../pushReference';
import { pickFromHistory } from './pickFromHistory';
import { BridgeProvider, IdeBridge } from '../ideBridge';

const BROWSE_HISTORY = '$(history) Browse history…';
const CLEAR_ALL = '$(clear-all) Clear all';
const SWITCH_TARGET = '$(plug) Switch target session…';

interface RefItem extends vscode.QuickPickItem {
  refIndex?: number;
}

const trashButton: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('trash'),
  tooltip: 'Remove from buffer',
};

function title(buffer: ContextBuffer): string {
  return `Claude Context — ${buffer.count} ${buffer.count === 1 ? 'ref' : 'refs'}`;
}

function buildItems(buffer: ContextBuffer, bridge?: IdeBridge): RefItem[] {
  const refs = buffer.getRefs();
  const items: RefItem[] = refs.length
    ? refs.map((ref, refIndex) => ({ label: ref, refIndex, buttons: [trashButton] }))
    : [{ label: 'Buffer is empty', description: 'Add refs with the add-selection or add-file commands' }];
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: BROWSE_HISTORY });
  if ((bridge?.registry.count ?? 0) >= 2) {
    items.push({ label: SWITCH_TARGET });
  }
  if (refs.length) {
    items.push({ label: CLEAR_ALL });
  }
  return items;
}

async function switchTarget(bridge: IdeBridge): Promise<void> {
  const sessions = bridge.registry.getAll();
  const targetId = bridge.registry.target?.id;
  interface SessionItem extends vscode.QuickPickItem { id: number }
  const picked = await vscode.window.showQuickPick<SessionItem>(
    sessions.map(s => ({
      id: s.id,
      label: `$(terminal) Claude session${s.pid !== undefined ? ` (pid ${s.pid})` : ''}`,
      description:
        `connected ${new Date(s.connectedAt).toLocaleTimeString()}` +
        (s.id === targetId ? ' — current target' : ''),
    })),
    { placeHolder: 'Pick the session that receives pushed refs' }
  );
  if (picked) bridge.registry.setTarget(picked.id);
}

export function manageBuffer(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): void {
  const bridge = getBridge?.();
  const qp = vscode.window.createQuickPick<RefItem>();
  qp.title = title(buffer);
  qp.placeholder = 'Remove refs with the trash button';
  qp.items = buildItems(buffer, bridge);

  qp.onDidTriggerItemButton(async e => {
    if (e.item.refIndex === undefined) return;
    buffer.removeAt(e.item.refIndex);
    qp.title = title(buffer);
    qp.items = buildItems(buffer, bridge);
    await syncClipboard(buffer);
  });

  qp.onDidAccept(async () => {
    const selected = qp.selectedItems[0];
    if (!selected) return;
    if (selected.label === BROWSE_HISTORY) {
      qp.hide();
      await pickFromHistory(buffer, history, getBridge);
    } else if (selected.label === SWITCH_TARGET) {
      qp.hide();
      if (bridge) await switchTarget(bridge);
    } else if (selected.label === CLEAR_ALL) {
      buffer.clear();
      await syncClipboard(buffer);
      qp.hide();
    }
    // Enter on a ref row (or the empty placeholder): intentionally no action
  });

  qp.onDidHide(() => qp.dispose());
  qp.show();
}
```

- [ ] **Step 2: Pass `getBridge` in `src/extension.ts`**

Change the `manageBuffer` registration to:

```typescript
    vscode.commands.registerCommand('claude-context.manageBuffer',
      () => manageBuffer(buffer, history, getBridge)),
```

- [ ] **Step 3: Verify build, tests, typecheck**

Run: `npm test && npm run typecheck && npm run compile`
Expected: all PASS / exit 0.

- [ ] **Step 4: Manual smoke test (F5)**

1. Connect two Claude sessions (e.g. one integrated terminal + one external, both `/ide` → ctx-push).
2. Add a ref so the status bar shows; click it → the QuickPick shows "Switch target session…".
3. Pick the older session → add a ref → it lands in that session's prompt, not the newer one.
4. With 0 or 1 sessions connected the row must be absent.

Expected: all four checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/manageBuffer.ts src/extension.ts
git commit -m "feat: switch-target-session row in the buffer manager"
```

---

### Task 10: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a README section**

Insert after the existing feature/usage section of `README.md` (adapt heading level to the file's structure):

```markdown
## Direct push into Claude Code sessions

With `claude-context.directPush` enabled (default), the extension runs the same
IDE bridge the official Claude Code extension uses. Connect any Claude Code CLI
session to it — Warp, iTerm, or the integrated terminal — and every ref you add
lands directly in that session's prompt input. No pasting.

**Connect (once per session):** in the Claude Code CLI, run `/ide` and pick
**ctx-push**. Sessions started in the integrated terminal may auto-connect to
the official Claude Code extension first — run `/ide` and switch.

- The status bar shows `$(plug)` while a session is connected; adds toast
  `Pushed:` instead of `Copied:`.
- With multiple sessions connected, refs go to the most recently connected one;
  click the status bar → "Switch target session…" to retarget.
- The clipboard still always holds the full buffer — pasting keeps working
  everywhere, and is the automatic fallback when no session is connected.
- Notes: pushes are insert-only (removing a ref from the buffer can't remove it
  from the prompt), and the CLI renders line ranges as `@path#L10-20`. The IDE
  protocol is unofficial; if a Claude Code update breaks it, the extension
  silently falls back to clipboard-only.

Set `claude-context.directPush` to `false` for clipboard-only behavior.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Make these edits:

1. In the intro paragraph, after the sentence about the clipboard holding the whole buffer, add:

```markdown
With `claude-context.directPush` (default on), the extension also runs an IDE
bridge (`src/ideBridge/`) speaking Claude Code's IDE-integration protocol:
CLI sessions connected via `/ide` → **ctx-push** receive each added ref as an
`at_mentioned` notification, landing it directly in that session's prompt.
Pushes are insert-only and target the most-recently-connected session.
```

2. In the Architecture diagram, after the `copyReference(...)` line, add:

```
        → IdeBridge.pushRef/pushRefs                (at_mentioned → connected Claude session, after successful copy)
```

3. Add rows to the File Map table:

```markdown
| `src/ref.ts` | `Ref` — structured file reference (absolute path + optional line range) |
| `src/ideBridge/index.ts` | `IdeBridge` facade — start/dispose, lockfile lifecycle, pushRef(s) |
| `src/ideBridge/server.ts` | WebSocket server: bind 127.0.0.1, auth check (close 1008), session wiring |
| `src/ideBridge/protocol.ts` | Pure JSON-RPC/MCP handling: initialize, tools/list, ide_connected, at_mentioned |
| `src/ideBridge/sessions.ts` | `SessionRegistry` — connected CLI clients, most-recent targeting |
| `src/ideBridge/lockfile.ts` | `~/.claude/ide/<port>.lock` write/remove/stale-cleanup |
| `src/test/protocol.test.ts` | Jest unit tests for protocol handling |
| `src/test/sessions.test.ts` | Jest unit tests for SessionRegistry |
| `src/test/lockfile.test.ts` | Jest unit tests for lockfile management (temp dirs) |
| `src/test/ideServer.test.ts` | Jest integration tests for the WS server (real ws client) |
| `src/test/ideBridge.test.ts` | Jest integration tests for the IdeBridge facade |
```

4. In Key Design Decisions, add:

```markdown
- **IDE bridge, not terminal automation**: direct push speaks Claude Code's (unofficial) IDE protocol — works in any terminal via `/ide`, inserts visible `@refs`; all bridge failures degrade silently to the clipboard flow
- **Never set `CLAUDE_CODE_SSE_PORT`**: it belongs to the official extension's auto-connect; colliding breaks both
- **Push-on-add, newly added refs only**: the protocol is insert-only — re-pushing the buffer would duplicate prompt text
```

5. In the Testing section list, add the five new test files with one-line descriptions (same wording as the File Map rows above).

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document direct push (IDE bridge) feature"
```

---

## Final Verification

- [ ] Run `npm test` — all suites pass.
- [ ] Run `npm run typecheck` — exits 0.
- [ ] Run `npm run compile` — bundle builds without ws-related errors.
- [ ] Full manual pass (F5): integrated terminal flow, external terminal (Warp) flow, two-session targeting + switch, CLI kill → fallback, `directPush: false` → no lockfile. (Detailed steps in Tasks 8–9.)
- [ ] Do NOT bump the version or publish — releasing is handled separately by the `release` skill.
