# Buffer Manager & Persistent History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a status-bar-launched QuickPick to view/remove refs in the context buffer, and persist session history across window reloads.

**Architecture:** `ContextBuffer` gains `removeAt`/`getRefs`; `History` gains constructor hydration and an `onDidChange` callback (stays vscode-free); a new `manageBuffer` command renders a live QuickPick with per-item trash buttons; `extension.ts` wires `workspaceState` persistence and repoints the status bar. A shared `syncClipboard` helper keeps the clipboard mirroring the buffer after every mutation.

**Tech Stack:** TypeScript, VS Code extension API (`createQuickPick`, `workspaceState`), Jest + ts-jest with the mock at `src/test/__mocks__/vscode.ts`.

**Spec:** `docs/superpowers/specs/2026-07-12-buffer-manager-design.md`

## Global Constraints

- Pure logic (`contextBuffer.ts`, `history.ts`, `pushReference.ts`) is unit-tested; command handlers are thin orchestrators tested manually via F5 (project convention in CLAUDE.md).
- `History` must not import `vscode`.
- Clipboard invariant: non-empty buffer → contents + one trailing space; empty buffer → write `''` exactly.
- History cap is 20, key is `claude-context.history`, stored in `workspaceState` (not `globalState`).
- Run `npm run typecheck && npm test` before every commit; both must be clean.
- All commits end with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: ContextBuffer.removeAt and getRefs

**Files:**
- Modify: `src/contextBuffer.ts`
- Test: `src/test/contextBuffer.test.ts`

**Interfaces:**
- Consumes: existing `ContextBuffer` (`refs: string[]`, `_onChange: EventEmitter<number>`, `count`, `getContents()`).
- Produces: `removeAt(index: number): void` (out-of-range = silent no-op, no event) and `getRefs(): readonly string[]` (defensive copy). Task 4 renders `getRefs()` and calls `removeAt` from trash buttons.

- [ ] **Step 1: Write the failing tests** — append inside the existing top-level `describe('ContextBuffer', ...)` block in `src/test/contextBuffer.test.ts`:

```typescript
  describe('removeAt', () => {
    it('removes the ref at the given index and fires onChange with the new count', () => {
      const buffer = new ContextBuffer();
      buffer.appendMany(['@a.ts', '@b.ts', '@c.ts']);
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.removeAt(1);
      expect(buffer.getContents()).toBe('@a.ts @c.ts');
      expect(counts).toEqual([2]);
    });

    it('removes the first and last refs correctly', () => {
      const buffer = new ContextBuffer();
      buffer.appendMany(['@a.ts', '@b.ts', '@c.ts']);
      buffer.removeAt(0);
      buffer.removeAt(1);
      expect(buffer.getContents()).toBe('@b.ts');
    });

    it('ignores an out-of-range index and fires no event', () => {
      const buffer = new ContextBuffer();
      buffer.append('@a.ts');
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.removeAt(5);
      buffer.removeAt(-1);
      expect(buffer.getContents()).toBe('@a.ts');
      expect(counts).toEqual([]);
    });
  });

  describe('getRefs', () => {
    it('returns the refs in order', () => {
      const buffer = new ContextBuffer();
      buffer.appendMany(['@a.ts', '@b.ts']);
      expect(buffer.getRefs()).toEqual(['@a.ts', '@b.ts']);
    });

    it('returns a defensive copy', () => {
      const buffer = new ContextBuffer();
      buffer.append('@a.ts');
      const refs = buffer.getRefs() as string[];
      refs.push('@evil.ts');
      expect(buffer.getRefs()).toEqual(['@a.ts']);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest contextBuffer -t "removeAt"` then `npx jest contextBuffer -t "getRefs"`
Expected: FAIL — `buffer.removeAt is not a function` / `buffer.getRefs is not a function` (TS compile error TS2339 is the equivalent failure under ts-jest).

- [ ] **Step 3: Implement** — add to the `ContextBuffer` class in `src/contextBuffer.ts`, after `appendMany`:

```typescript
  removeAt(index: number): void {
    if (index < 0 || index >= this.refs.length) return;
    this.refs.splice(index, 1);
    this._onChange.fire(this.count);
  }

  getRefs(): readonly string[] {
    return [...this.refs];
  }
```

- [ ] **Step 4: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all suites PASS (43 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/contextBuffer.ts src/test/contextBuffer.test.ts
git commit -m "feat: ContextBuffer.removeAt and getRefs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: History hydration and onDidChange

**Files:**
- Modify: `src/history.ts`
- Test: `src/test/history.test.ts`

**Interfaces:**
- Consumes: existing `History` (`MAX = 20`, `items: string[]`, `add`, `getAll`, `clear`).
- Produces: `constructor(initial?: string[])` (dedupes, caps at 20) and a public mutable field `onDidChange?: (items: string[]) => void` invoked after every `add` and `clear` with a fresh copy of the items. Task 5 hydrates from `workspaceState` and saves in this callback. `History` must not import `vscode`.

- [ ] **Step 1: Write the failing tests** — append inside the existing top-level `describe('History', ...)` block in `src/test/history.test.ts`:

```typescript
  describe('hydration', () => {
    it('accepts initial items via the constructor', () => {
      const h = new History(['@a.ts', '@b.ts']);
      expect(h.getAll()).toEqual(['@a.ts', '@b.ts']);
    });

    it('dedupes and caps initial items at 20', () => {
      const initial = Array.from({ length: 25 }, (_, i) => `@f${i}.ts`);
      initial[1] = '@f0.ts'; // duplicate
      const h = new History(initial);
      const all = h.getAll();
      expect(all.length).toBe(20);
      expect(all[0]).toBe('@f0.ts');
      expect(new Set(all).size).toBe(20);
    });
  });

  describe('onDidChange', () => {
    it('fires with the current items after add', () => {
      const h = new History();
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items);
      h.add('@a.ts');
      h.add('@b.ts');
      expect(seen).toEqual([['@a.ts'], ['@b.ts', '@a.ts']]);
    });

    it('fires on duplicate add (order changes)', () => {
      const h = new History(['@a.ts', '@b.ts']);
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items);
      h.add('@b.ts');
      expect(seen).toEqual([['@b.ts', '@a.ts']]);
    });

    it('fires with an empty array on clear', () => {
      const h = new History(['@a.ts']);
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items);
      h.clear();
      expect(seen).toEqual([[]]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest history`
Expected: FAIL — constructor ignores arguments (`getAll()` returns `[]`) and `onDidChange` never fires (TS2554/TS2339 compile errors are the equivalent failure).

- [ ] **Step 3: Implement** — replace the class body in `src/history.ts` with:

```typescript
export class History {
  private readonly MAX = 20;
  private items: string[] = [];
  onDidChange?: (items: string[]) => void;

  constructor(initial?: string[]) {
    if (initial) {
      this.items = [...new Set(initial)].slice(0, this.MAX);
    }
  }

  add(ref: string): void {
    this.items = [ref, ...this.items.filter(r => r !== ref)].slice(0, this.MAX);
    this.onDidChange?.(this.getAll());
  }

  getAll(): string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
    this.onDidChange?.([]);
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/history.ts src/test/history.test.ts
git commit -m "feat: History hydration and onDidChange callback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: syncClipboard helper

**Files:**
- Modify: `src/pushReference.ts`
- Test: `src/test/pushReference.test.ts`

**Interfaces:**
- Consumes: `ContextBuffer.getContents()` (existing), `copyReference(ref)` from `src/clipboard.ts` (appends one trailing space), `showPushError(err)` from `src/notify.ts`.
- Produces: `export async function syncClipboard(buffer: ContextBuffer): Promise<void>` — non-empty buffer writes `contents + ' '`, empty buffer writes `''`, failures go to `showPushError` and never throw. Tasks 4 and 5 call it after `removeAt`/`clear`.

- [ ] **Step 1: Write the failing tests** — append to `src/test/pushReference.test.ts` (the file already imports `vscode`, `ContextBuffer`, `History`, `Config` and defines `writeText`; add `syncClipboard` to the existing import from `'../pushReference'`):

```typescript
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest pushReference`
Expected: FAIL — `'../pushReference'` has no exported member `syncClipboard` (TS2305).

- [ ] **Step 3: Implement** — in `src/pushReference.ts`, add `import * as vscode from 'vscode';` at the top and this function at the bottom:

```typescript
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

- [ ] **Step 4: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pushReference.ts src/test/pushReference.test.ts
git commit -m "feat: syncClipboard keeps clipboard mirroring the buffer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: manageBuffer command (QuickPick UI)

**Files:**
- Create: `src/commands/manageBuffer.ts`
- Modify: `src/extension.ts`
- Modify: `package.json` (contributes.commands)
- Modify: `CLAUDE.md` (file map + command list)

**Interfaces:**
- Consumes: `buffer.getRefs()`, `buffer.removeAt(i)`, `buffer.clear()`, `buffer.count` (Task 1); `syncClipboard(buffer)` (Task 3); `pickFromHistory(buffer, history): Promise<void>` from `src/commands/pickFromHistory.ts` (existing).
- Produces: `export function manageBuffer(buffer: ContextBuffer, history: History): void`, registered as command `claude-context.manageBuffer`; the status bar's `command` now points at it.

No unit tests — thin orchestrator over the QuickPick API (project convention). Verified manually in Step 3.

- [ ] **Step 1: Create `src/commands/manageBuffer.ts`**

```typescript
import * as vscode from 'vscode';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { syncClipboard } from '../pushReference';
import { pickFromHistory } from './pickFromHistory';

const BROWSE_HISTORY = '$(history) Browse history…';
const CLEAR_ALL = '$(clear-all) Clear all';

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

function buildItems(buffer: ContextBuffer): RefItem[] {
  const refs = buffer.getRefs();
  const items: RefItem[] = refs.length
    ? refs.map((ref, refIndex) => ({ label: ref, refIndex, buttons: [trashButton] }))
    : [{ label: 'Buffer is empty', description: 'Add refs with the add-selection or add-file commands' }];
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: BROWSE_HISTORY });
  if (refs.length) {
    items.push({ label: CLEAR_ALL });
  }
  return items;
}

export function manageBuffer(buffer: ContextBuffer, history: History): void {
  const qp = vscode.window.createQuickPick<RefItem>();
  qp.title = title(buffer);
  qp.placeholder = 'Remove refs with the trash button';
  qp.items = buildItems(buffer);

  qp.onDidTriggerItemButton(async e => {
    if (e.item.refIndex === undefined) return;
    buffer.removeAt(e.item.refIndex);
    await syncClipboard(buffer);
    qp.title = title(buffer);
    qp.items = buildItems(buffer);
  });

  qp.onDidAccept(async () => {
    const selected = qp.selectedItems[0];
    if (!selected) return;
    if (selected.label === BROWSE_HISTORY) {
      qp.hide();
      await pickFromHistory(buffer, history);
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

- [ ] **Step 2: Wire it up**

In `src/extension.ts`:
1. Add two imports: `import { manageBuffer } from './commands/manageBuffer';` and `import { syncClipboard } from './pushReference';` (extension.ts does not currently import from pushReference)
2. Change the status bar wiring (currently `statusBar.command = 'claude-context.pickFromHistory'; statusBar.tooltip = 'Click to browse context history';`) to:

```typescript
  statusBar.command = 'claude-context.manageBuffer';
  statusBar.tooltip = 'Click to manage the context buffer';
```

3. Change the `clearContext` registration (currently `() => buffer.clear()`) and add the new command inside the same `context.subscriptions.push(...)` call:

```typescript
    vscode.commands.registerCommand('claude-context.clearContext',
      async () => { buffer.clear(); await syncClipboard(buffer); }),
    vscode.commands.registerCommand('claude-context.manageBuffer',
      () => manageBuffer(buffer, history)),
```

In `package.json`, add to `contributes.commands` after the `pickFromHistory` entry:

```json
      { "command": "claude-context.manageBuffer", "title": "Manage Claude Context buffer" }
```

In `CLAUDE.md`: add `| src/commands/manageBuffer.ts | claude-context.manageBuffer QuickPick — view/remove buffer refs |` to the file map; change the `pickFromHistory` bullet in "What This Project Does" to note the status bar now opens the manager, and add a `manageBuffer` bullet: `- manageBuffer (status bar click or Command Palette): QuickPick over buffer refs with per-item remove, browse-history and clear-all actions`.

- [ ] **Step 3: Typecheck, test, and verify manually**

Run: `npm run typecheck && npm test` — expected clean/PASS.
Then F5 (Extension Development Host) and verify:
1. Add 3 refs (`Cmd+Alt+C`, then `Cmd+Alt+Shift+C` twice on other files) → status bar shows "3 refs".
2. Click the status bar → QuickPick titled "Claude Context — 3 refs" with trash buttons.
3. Trash the middle ref → picker stays open, shows 2 refs, title updates; paste in a terminal → only the 2 remaining refs (trailing space present).
4. Trash the remaining two refs → in-place switch to "Buffer is empty" placeholder + Browse history only; paste → empty clipboard.
5. `Browse history…` → history picker opens; picking an item appends and updates the status bar.
6. `Clear all` (after re-adding refs) → buffer empties, status bar hides, clipboard empty.
7. Palette → "Clear Claude Context buffer" → clipboard is emptied too.

- [ ] **Step 4: Commit**

```bash
git add src/commands/manageBuffer.ts src/extension.ts package.json CLAUDE.md
git commit -m "feat: buffer manager QuickPick on status bar click

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Persist history via workspaceState

**Files:**
- Modify: `src/extension.ts`
- Modify: `CLAUDE.md` (History file-map row)

**Interfaces:**
- Consumes: `new History(initial?: string[])` and `history.onDidChange` (Task 2); `vscode.ExtensionContext.workspaceState` (`Memento.get` / `Memento.update`).
- Produces: history persisted under key `claude-context.history`, hydrated at activation. No new exports.

No unit tests — `Memento` wiring is host-dependent (project convention). Verified manually in Step 2.

- [ ] **Step 1: Wire persistence in `src/extension.ts`** — replace `const history = new History();` with:

```typescript
  const persisted = context.workspaceState
    .get<unknown[]>('claude-context.history', [])
    .filter((x): x is string => typeof x === 'string');
  const history = new History(persisted);
  history.onDidChange = items => {
    void context.workspaceState.update('claude-context.history', items);
  };
```

Update the `src/history.ts` row in CLAUDE.md's file map to: `| src/history.ts | History — last-20 refs, deduped, persisted to workspaceState via onDidChange |`.

- [ ] **Step 2: Typecheck, test, and verify manually**

Run: `npm run typecheck && npm test` — expected clean/PASS.
Then F5 and verify:
1. Add 2 refs, open the manager's `Browse history…` → both listed.
2. **Reload the window** (`Developer: Reload Window`) → status bar is hidden (buffer not persisted — by design), but `Pick from Claude Context history` still lists both refs.
3. In a *different* workspace folder, history starts empty (workspaceState is per-workspace).

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts CLAUDE.md
git commit -m "feat: persist ref history across window reloads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
