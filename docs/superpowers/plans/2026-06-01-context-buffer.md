# Context Buffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a context buffer that accumulates `@ref` strings across multiple add operations, with append mode, multi-file Explorer support, a status bar counter, and session history quick-pick.

**Architecture:** A new `ContextBuffer` class owns all buffer state and fires `onChange` events to update the status bar. A `History` class tracks per-session refs. All command handlers receive `buffer` and `history` as dependency-injected parameters from `extension.ts`. `pushReference.ts` is the single write path to both buffer and clipboard.

**Tech Stack:** TypeScript, VSCode Extension API (`EventEmitter`, `StatusBarItem`, `setStatusBarMessage`, `showQuickPick`), Jest + ts-jest

---

## File Map

| File | Action |
|---|---|
| `src/contextBuffer.ts` | **New** — buffer state: replace/append/clear/count/onChange |
| `src/history.ts` | **New** — session history: add (dedupe+cap), getAll, clear |
| `src/commands/addSelectionAppend.ts` | **New** — append mode handler for selection/file |
| `src/commands/pickFromHistory.ts` | **New** — quick-pick from history, appends chosen ref |
| `src/test/contextBuffer.test.ts` | **New** — Jest unit tests for ContextBuffer |
| `src/test/history.test.ts` | **New** — Jest unit tests for History |
| `src/test/__mocks__/vscode.ts` | **Modify** — add EventEmitter mock |
| `src/notify.ts` | **Modify** — showClipboardSuccess: setStatusBarMessage + bufferCount param |
| `src/pushReference.ts` | **Modify** — add buffer/history/mode params; add pushManyReferences |
| `src/commands/addSelection.ts` | **Modify** — receive buffer/history; use 'replace' mode |
| `src/commands/addFile.ts` | **Modify** — receive buffer/history; handle allUris for multi-select |
| `src/commands/addFolder.ts` | **Modify** — receive buffer/history; replace single, appendMany multi |
| `src/extension.ts` | **Modify** — instantiate buffer/history/statusBar; register 3 new commands |
| `package.json` | **Modify** — 3 new commands, updated keybindings, version 1.2.0 |

---

### Task 1: ContextBuffer module (TDD)

**Files:**
- Modify: `src/test/__mocks__/vscode.ts`
- Create: `src/test/contextBuffer.test.ts`
- Create: `src/contextBuffer.ts`

- [ ] **Step 1: Add EventEmitter to the VSCode mock**

Replace `src/test/__mocks__/vscode.ts` entirely:

```typescript
class EventEmitter<T> {
  private readonly listeners: Array<(e: T) => void> = [];

  readonly event = (listener: (e: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(listener);
        if (i >= 0) this.listeners.splice(i, 1);
      },
    };
  };

  fire(data: T): void {
    this.listeners.forEach(l => l(data));
  }

  dispose(): void {
    this.listeners.length = 0;
  }
}

const vscode = {
  EventEmitter,
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({ get: jest.fn() }),
    workspaceFolders: undefined as any,
  },
  window: {
    activeTextEditor: undefined as any,
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showQuickPick: jest.fn(),
    setStatusBarMessage: jest.fn(),
    createStatusBarItem: jest.fn().mockReturnValue({
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
      command: '',
    }),
  },
  commands: {
    registerCommand: jest.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
  StatusBarAlignment: { Right: 1, Left: 0 },
};

export = vscode;
```

- [ ] **Step 2: Write the failing tests**

```typescript
// src/test/contextBuffer.test.ts
import { ContextBuffer } from '../contextBuffer';

describe('ContextBuffer', () => {
  let buffer: ContextBuffer;

  beforeEach(() => { buffer = new ContextBuffer(); });
  afterEach(() => { buffer.dispose(); });

  describe('replace', () => {
    it('sets buffer to a single ref', () => {
      buffer.replace('@src/auth.ts');
      expect(buffer.count).toBe(1);
      expect(buffer.getContents()).toBe('@src/auth.ts');
    });

    it('clears previous refs when replacing', () => {
      buffer.replace('@src/a.ts');
      buffer.replace('@src/b.ts');
      expect(buffer.count).toBe(1);
      expect(buffer.getContents()).toBe('@src/b.ts');
    });
  });

  describe('append', () => {
    it('adds a ref to the existing buffer', () => {
      buffer.replace('@src/a.ts');
      buffer.append('@src/b.ts');
      expect(buffer.count).toBe(2);
      expect(buffer.getContents()).toBe('@src/a.ts @src/b.ts');
    });
  });

  describe('appendMany', () => {
    it('adds multiple refs at once', () => {
      buffer.appendMany(['@src/a.ts', '@src/b.ts', '@src/c.ts']);
      expect(buffer.count).toBe(3);
      expect(buffer.getContents()).toBe('@src/a.ts @src/b.ts @src/c.ts');
    });
  });

  describe('clear', () => {
    it('empties the buffer', () => {
      buffer.replace('@src/a.ts');
      buffer.clear();
      expect(buffer.count).toBe(0);
      expect(buffer.getContents()).toBe('');
    });
  });

  describe('onChange', () => {
    it('fires with count=1 after replace', () => {
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.replace('@src/a.ts');
      expect(counts).toEqual([1]);
    });

    it('fires incrementally after each append', () => {
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.append('@src/a.ts');
      buffer.append('@src/b.ts');
      expect(counts).toEqual([1, 2]);
    });

    it('fires with 0 after clear', () => {
      const counts: number[] = [];
      buffer.replace('@src/a.ts');
      buffer.onChange(c => counts.push(c));
      buffer.clear();
      expect(counts).toEqual([0]);
    });

    it('fires exactly once after appendMany', () => {
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.appendMany(['@a', '@b', '@c']);
      expect(counts).toEqual([3]);
    });
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npx jest src/test/contextBuffer.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../contextBuffer'`

- [ ] **Step 4: Create src/contextBuffer.ts**

```typescript
import * as vscode from 'vscode';

export class ContextBuffer {
  private refs: string[] = [];
  private readonly _onChange = new vscode.EventEmitter<number>();
  readonly onChange = this._onChange.event;

  replace(ref: string): void {
    this.refs = [ref];
    this._onChange.fire(this.count);
  }

  append(ref: string): void {
    this.refs.push(ref);
    this._onChange.fire(this.count);
  }

  appendMany(refs: string[]): void {
    this.refs.push(...refs);
    this._onChange.fire(this.count);
  }

  clear(): void {
    this.refs = [];
    this._onChange.fire(0);
  }

  getContents(): string {
    return this.refs.join(' ');
  }

  get count(): number {
    return this.refs.length;
  }

  dispose(): void {
    this._onChange.dispose();
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx jest src/test/contextBuffer.test.ts --no-coverage
```

Expected:
```
PASS src/test/contextBuffer.test.ts
  ContextBuffer
    replace ✓ sets buffer to a single ref
            ✓ clears previous refs when replacing
    append  ✓ adds a ref to the existing buffer
    appendMany ✓ adds multiple refs at once
    clear   ✓ empties the buffer
    onChange ✓ fires with count=1 after replace
             ✓ fires incrementally after each append
             ✓ fires with 0 after clear
             ✓ fires exactly once after appendMany

Tests: 9 passed
```

- [ ] **Step 6: Commit**

```bash
git add src/test/__mocks__/vscode.ts src/contextBuffer.ts src/test/contextBuffer.test.ts
git commit -m "feat: add ContextBuffer module with tests"
```

---

### Task 2: History module (TDD)

**Files:**
- Create: `src/test/history.test.ts`
- Create: `src/history.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/history.test.ts
import { History } from '../history';

describe('History', () => {
  let history: History;

  beforeEach(() => { history = new History(); });

  it('starts empty', () => {
    expect(history.getAll()).toEqual([]);
  });

  it('returns items newest first', () => {
    history.add('@src/a.ts');
    history.add('@src/b.ts');
    expect(history.getAll()).toEqual(['@src/b.ts', '@src/a.ts']);
  });

  it('deduplicates by moving existing item to top', () => {
    history.add('@src/a.ts');
    history.add('@src/b.ts');
    history.add('@src/a.ts');
    expect(history.getAll()).toEqual(['@src/a.ts', '@src/b.ts']);
  });

  it('caps at 20 items', () => {
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

  it('getAll returns a copy, not the internal array', () => {
    history.add('@src/a.ts');
    const result = history.getAll();
    result.push('tampered');
    expect(history.getAll()).toEqual(['@src/a.ts']);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest src/test/history.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../history'`

- [ ] **Step 3: Create src/history.ts**

```typescript
export class History {
  private readonly MAX = 20;
  private items: string[] = [];

  add(ref: string): void {
    this.items = [ref, ...this.items.filter(r => r !== ref)].slice(0, this.MAX);
  }

  getAll(): string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/test/history.test.ts --no-coverage
```

Expected:
```
PASS src/test/history.test.ts
  History
    ✓ starts empty
    ✓ returns items newest first
    ✓ deduplicates by moving existing item to top
    ✓ caps at 20 items
    ✓ clear empties the history
    ✓ getAll returns a copy, not the internal array

Tests: 6 passed
```

- [ ] **Step 5: Run all tests to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: all test suites pass (clipboard + pathResolver + contextBuffer + history).

- [ ] **Step 6: Commit**

```bash
git add src/history.ts src/test/history.test.ts
git commit -m "feat: add History module with tests"
```

---

### Task 3: Update notify.ts

**Files:**
- Modify: `src/notify.ts`

No tests needed — thin VSCode API wrapper with no branching logic worth isolating.

- [ ] **Step 1: Replace src/notify.ts**

```typescript
import * as vscode from 'vscode';

export function showClipboardSuccess(reference: string, bufferCount: number, enabled: boolean): void {
  if (!enabled) return;
  const suffix = bufferCount > 1 ? ` [${bufferCount}]` : '';
  vscode.window.setStatusBarMessage(`$(clippy) ${reference}${suffix}`, 2000);
}

export function showPushError(err: unknown): void {
  vscode.window.showErrorMessage(
    `claude-context: ${err instanceof Error ? err.message : String(err)}`
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no output. (Note: pushReference.ts still calls the old signature — it will error until Task 4. If typecheck fails only on pushReference.ts callers, that is expected and fine.)

- [ ] **Step 3: Commit**

```bash
git add src/notify.ts
git commit -m "refactor: showClipboardSuccess uses setStatusBarMessage with bufferCount"
```

---

### Task 4: Update pushReference.ts

**Files:**
- Modify: `src/pushReference.ts`

- [ ] **Step 1: Replace src/pushReference.ts**

```typescript
import { ContextBuffer } from './contextBuffer';
import { History } from './history';
import { Config } from './config';
import { copyReference } from './clipboard';
import { showClipboardSuccess, showPushError } from './notify';

export async function pushReference(
  reference: string,
  config: Config,
  buffer: ContextBuffer,
  history: History,
  mode: 'replace' | 'append'
): Promise<void> {
  if (mode === 'replace') {
    buffer.replace(reference);
  } else {
    buffer.append(reference);
  }
  history.add(reference);
  try {
    await copyReference(buffer.getContents());
    showClipboardSuccess(reference, buffer.count, config.showNotifications);
  } catch (err) {
    showPushError(err);
  }
}

export async function pushManyReferences(
  refs: string[],
  config: Config,
  buffer: ContextBuffer,
  history: History
): Promise<void> {
  buffer.appendMany(refs);
  refs.forEach(r => history.add(r));
  try {
    await copyReference(buffer.getContents());
    showClipboardSuccess(`${refs.length} files`, buffer.count, config.showNotifications);
  } catch (err) {
    showPushError(err);
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: errors only on the three command files that still call the old `pushReference` signature. Those are fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/pushReference.ts
git commit -m "refactor: pushReference accepts buffer/history/mode; add pushManyReferences"
```

---

### Task 5: Update existing command handlers

**Files:**
- Modify: `src/commands/addSelection.ts`
- Modify: `src/commands/addFile.ts`
- Modify: `src/commands/addFolder.ts`

- [ ] **Step 1: Replace src/commands/addSelection.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatSelection, formatPath } from '../pathResolver';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function addSelection(buffer: ContextBuffer, history: History): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  const config = getConfig();
  const absolutePath = editor.document.uri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const selection = editor.selection;
  const reference = selection.isEmpty
    ? formatPath(resolvedPath)
    : formatSelection(resolvedPath, selection.start.line + 1, selection.end.line + 1);
  await pushReference(reference, config, buffer, history, 'replace');
}
```

- [ ] **Step 2: Replace src/commands/addFile.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function addFile(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[]
): Promise<void> {
  const config = getConfig();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (Array.isArray(allUris) && allUris.length > 1) {
    const refs = allUris.map(u => formatPath(resolvePath(u.fsPath, workspaceRoot, config.pathStyle)));
    await pushManyReferences(refs, config, buffer, history);
    return;
  }

  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  const reference = formatPath(resolvePath(targetUri.fsPath, workspaceRoot, config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace');
}
```

- [ ] **Step 3: Replace src/commands/addFolder.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function addFolder(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[]
): Promise<void> {
  const config = getConfig();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (allUris && allUris.length > 1) {
    const refs = allUris.map(u => formatPath(resolvePath(u.fsPath, workspaceRoot, config.pathStyle)));
    await pushManyReferences(refs, config, buffer, history);
    return;
  }

  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }
  const reference = formatPath(resolvePath(uri.fsPath, workspaceRoot, config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace');
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no output (zero errors).

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/addSelection.ts src/commands/addFile.ts src/commands/addFolder.ts
git commit -m "refactor: command handlers accept buffer/history; support multi-URI addFile/addFolder"
```

---

### Task 6: New command files

**Files:**
- Create: `src/commands/addSelectionAppend.ts`
- Create: `src/commands/pickFromHistory.ts`

- [ ] **Step 1: Create src/commands/addSelectionAppend.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatSelection, formatPath } from '../pathResolver';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function addSelectionAppend(buffer: ContextBuffer, history: History): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  const config = getConfig();
  const absolutePath = editor.document.uri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const selection = editor.selection;
  const reference = selection.isEmpty
    ? formatPath(resolvedPath)
    : formatSelection(resolvedPath, selection.start.line + 1, selection.end.line + 1);
  await pushReference(reference, config, buffer, history, 'append');
}
```

- [ ] **Step 2: Create src/commands/pickFromHistory.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function pickFromHistory(buffer: ContextBuffer, history: History): Promise<void> {
  const items = history.getAll();
  if (items.length === 0) {
    vscode.window.showInformationMessage('No history yet this session.');
    return;
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Pick a reference to append to context buffer',
  });
  if (!picked) return;
  const config = getConfig();
  await pushReference(picked, config, buffer, history, 'append');
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/commands/addSelectionAppend.ts src/commands/pickFromHistory.ts
git commit -m "feat: add addSelectionAppend and pickFromHistory commands"
```

---

### Task 7: Update extension.ts and package.json

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] **Step 1: Replace src/extension.ts**

```typescript
import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addSelectionAppend } from './commands/addSelectionAppend';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';
import { pickFromHistory } from './commands/pickFromHistory';
import { ContextBuffer } from './contextBuffer';
import { History } from './history';

export function activate(context: vscode.ExtensionContext): void {
  const buffer = new ContextBuffer();
  const history = new History();

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claude-context.pickFromHistory';
  statusBar.tooltip = 'Click to browse context history';

  buffer.onChange(count => {
    if (count === 0) {
      statusBar.hide();
    } else {
      statusBar.text = `$(clippy) ${count} ${count === 1 ? 'ref' : 'refs'}`;
      statusBar.show();
    }
  });

  context.subscriptions.push(
    buffer,
    statusBar,
    vscode.commands.registerCommand('claude-context.addSelection',
      () => addSelection(buffer, history)),
    vscode.commands.registerCommand('claude-context.addSelectionAppend',
      () => addSelectionAppend(buffer, history)),
    vscode.commands.registerCommand('claude-context.addFile',
      (uri, allUris) => addFile(buffer, history, uri, allUris)),
    vscode.commands.registerCommand('claude-context.addFolder',
      (uri, allUris) => addFolder(buffer, history, uri, allUris)),
    vscode.commands.registerCommand('claude-context.clearContext',
      () => buffer.clear()),
    vscode.commands.registerCommand('claude-context.pickFromHistory',
      () => pickFromHistory(buffer, history)),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 2: Update package.json**

Apply these changes to `package.json`:

**version:** `"1.1.0"` → `"1.2.0"`

**contributes.commands** — add after the existing 3 commands:
```json
{ "command": "claude-context.addSelectionAppend", "title": "Append to Claude Context (selection)" },
{ "command": "claude-context.clearContext",        "title": "Clear Claude Context buffer" },
{ "command": "claude-context.pickFromHistory",     "title": "Pick from Claude Context history" }
```

**contributes.keybindings** — replace the existing array:
```json
[
  {
    "command": "claude-context.addSelection",
    "key": "ctrl+alt+c",
    "mac": "cmd+alt+c",
    "when": "editorTextFocus && editorLangId != 'http' && editorLangId != 'plaintext'"
  },
  {
    "command": "claude-context.addFile",
    "key": "ctrl+alt+f",
    "mac": "cmd+alt+f",
    "when": "editorTextFocus && editorLangId != 'http' && editorLangId != 'plaintext'"
  },
  {
    "command": "claude-context.addSelectionAppend",
    "key": "ctrl+alt+shift+c",
    "mac": "cmd+alt+shift+c",
    "when": "editorTextFocus && editorLangId != 'http' && editorLangId != 'plaintext'"
  }
]
```

**contributes.menus.commandPalette** — replace existing array:
```json
[
  { "command": "claude-context.addFolder",          "when": "false" },
  { "command": "claude-context.addSelectionAppend", "when": "false" }
]
```

- [ ] **Step 3: Verify typecheck and all tests**

```bash
npm run typecheck && npx jest --no-coverage
```

Expected: typecheck — no output. Tests: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: wire buffer/history/statusBar in extension; add 3 new commands; v1.2.0"
```

---

### Task 8: Final verification and package

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage
```

Expected:
```
PASS src/test/clipboard.test.ts
PASS src/test/pathResolver.test.ts
PASS src/test/contextBuffer.test.ts
PASS src/test/history.test.ts

Test Suites: 4 passed, 4 total
Tests:       ~25 passed, ~25 total
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 3: Build bundle**

```bash
npm run bundle
```

Expected: `out/extension.js` produced, no errors.

- [ ] **Step 4: Package**

```bash
rm -f claude-context-*.vsix && npm run package
```

Expected: `claude-context-1.2.0.vsix` produced (under 1 MB).

- [ ] **Step 5: Verify .vsix contents**

```bash
unzip -l claude-context-1.2.0.vsix | grep "extension/out/"
```

Expected: only `extension/out/extension.js` — no stale `.js` or `.map` files.

- [ ] **Step 6: Commit**

```bash
git add claude-context-1.2.0.vsix package-lock.json
git commit -m "chore: build claude-context-1.2.0.vsix"
```
