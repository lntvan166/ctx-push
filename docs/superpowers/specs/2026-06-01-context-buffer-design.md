# Claude Context — Context Buffer Design Spec

**Date:** 2026-06-01
**Status:** Approved
**Version target:** 1.2.0

## Goal

Add a context buffer that accumulates `@ref` strings across multiple add operations, so the user can build up a multi-file context before pasting once into any AI agent. Paired with a session history quick-pick and a status bar counter.

---

## Features

1. **Append mode** — new `Cmd+Alt+Shift+C` / `Ctrl+Alt+Shift+C` appends to buffer instead of replacing
2. **Multi-file Explorer** — selecting N files and right-clicking adds all N refs to buffer in one shot
3. **Status bar counter** — shows live ref count; hidden when buffer is empty
4. **Session history** — click status bar to pick from refs added this session (last 20, newest first)
5. **New "add whole file" keybinding** — `Cmd+Alt+F` / `Ctrl+Alt+F` replaces the old `Cmd+Alt+Shift+C`
6. **Clear command** — palette command "Clear context buffer" resets the buffer

---

## Keybindings

| Command | mac | linux | Mode |
|---|---|---|---|
| Add selection (or file if no selection) | `Cmd+Alt+C` | `Ctrl+Alt+C` | Replace |
| Add whole file (ignores selection) | `Cmd+Alt+F` | `Ctrl+Alt+F` | Replace |
| **Append** selection (or file if no selection) | `Cmd+Alt+Shift+C` | `Ctrl+Alt+Shift+C` | Append |
| Add folder | Explorer only | Explorer only | Append if multi, Replace if single |
| Clear context buffer | Palette only | Palette only | — |
| Pick from history | Palette / status bar click | Palette / status bar click | Append |

**Replace mode**: clears buffer, sets to new ref, writes to clipboard.
**Append mode**: adds ref(s) to buffer, writes entire buffer to clipboard.

---

## Architecture

```
contextBuffer (state)         history (state)
      │                            │
      ├─ replace(ref)              ├─ add(ref)
      ├─ append(ref)               ├─ getAll()
      ├─ appendMany(refs)          └─ clear()
      ├─ clear()
      ├─ getContents()  ──────────────────────────► clipboard.writeText()
      ├─ count
      └─ onChange event ──────────────────────────► status bar update

Commands:
  addSelection       → buffer.replace  + history.add
  addFile (single)   → buffer.replace  + history.add
  addFile (multi)    → buffer.appendMany + history.add (each)
  addFolder          → buffer.append   + history.add
  addSelectionAppend → buffer.append   + history.add
  clearContext       → buffer.clear
  pickFromHistory    → buffer.append   + history (read-only)
```

---

## Section 1: Keybindings & Commands

### New commands in `package.json`

```json
{ "command": "claude-context.addSelectionAppend", "title": "Append to Claude Context (selection)" }
{ "command": "claude-context.clearContext",        "title": "Clear Claude Context buffer" }
{ "command": "claude-context.pickFromHistory",     "title": "Pick from Claude Context history" }
```

### Updated keybindings

```json
[
  { "command": "claude-context.addSelection",       "key": "ctrl+alt+c",         "mac": "cmd+alt+c",         "when": "editorTextFocus" },
  { "command": "claude-context.addFile",            "key": "ctrl+alt+f",         "mac": "cmd+alt+f",         "when": "editorTextFocus" },
  { "command": "claude-context.addSelectionAppend", "key": "ctrl+alt+shift+c",   "mac": "cmd+alt+shift+c",   "when": "editorTextFocus" }
]
```

### Command palette visibility

```json
"commandPalette": [
  { "command": "claude-context.addFolder",          "when": "false" },
  { "command": "claude-context.addSelectionAppend", "when": "false" }
]
```

`clearContext` and `pickFromHistory` are palette-visible (no `when: false`).

---

## Section 2: Context Buffer (`src/contextBuffer.ts`)

Pure logic module — no VSCode import except EventEmitter. Fully unit-testable.

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

---

## Section 3: History (`src/history.ts`)

Session-only in-memory list. No VSCode dependency.

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

Deduplication: if the same ref is added again it moves to the top rather than duplicating.

---

## Section 4: Status Bar

Created once in `activate()`, added to `context.subscriptions`.

```typescript
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
```

Hidden on startup (buffer starts empty). Shown only when buffer has at least 1 ref.

---

## Section 5: `pushReference.ts` Updates

```typescript
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

---

## Section 6: `notify.ts` Updates

`showClipboardSuccess` gains a `bufferCount` parameter to reflect buffer state:

```typescript
export function showClipboardSuccess(reference: string, bufferCount: number, enabled: boolean): void {
  if (!enabled) return;
  const suffix = bufferCount > 1 ? ` (+${bufferCount - 1} more in buffer)` : '';
  vscode.window.showInformationMessage(`${reference} copied${suffix} — paste in Claude (${PASTE_HINT})`);
}
```

Examples:
- Single ref: `@src/auth.ts:11-14 copied — paste in Claude (Cmd+V)`
- Buffer has 3: `@src/types.ts copied (+2 more in buffer) — paste in Claude (Cmd+V)`

---

## Section 7: Command Handler Updates

### `addSelection.ts` — replace mode

```typescript
export async function addSelection(
  buffer: ContextBuffer,
  history: History
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showErrorMessage('No active file open'); return; }
  const config = getConfig();
  const resolvedPath = resolvePath(editor.document.uri.fsPath,
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, config.pathStyle);
  const selection = editor.selection;
  const reference = selection.isEmpty
    ? formatPath(resolvedPath)
    : formatSelection(resolvedPath, selection.start.line + 1, selection.end.line + 1);
  await pushReference(reference, config, buffer, history, 'replace');
}
```

### `addSelectionAppend.ts` — new file, append mode

Identical to `addSelection.ts` except the final call uses `'append'`:
```typescript
await pushReference(reference, config, buffer, history, 'append');
```

### `addFile.ts` — replace (single) / appendMany (multi)

```typescript
export async function addFile(
  buffer: ContextBuffer,
  history: History,
  uri?: vscode.Uri,
  allUris?: vscode.Uri[]
): Promise<void> {
  const config = getConfig();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Multi-file selection from Explorer
  if (allUris && allUris.length > 1) {
    const refs = allUris.map(u => formatPath(resolvePath(u.fsPath, workspaceRoot, config.pathStyle)));
    await pushManyReferences(refs, config, buffer, history);
    return;
  }

  // Single file (keyboard shortcut or single Explorer right-click)
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) { vscode.window.showErrorMessage('No active file open'); return; }
  const reference = formatPath(resolvePath(targetUri.fsPath, workspaceRoot, config.pathStyle));
  await pushReference(reference, config, buffer, history, 'replace');
}
```

### `addFolder.ts` — append mode

Same as before but calls `pushReference(..., 'append')`.

---

## Section 8: `extension.ts` Updates

```typescript
export function activate(context: vscode.ExtensionContext): void {
  const buffer = new ContextBuffer();
  const history = new History();

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claude-context.pickFromHistory';
  statusBar.tooltip = 'Click to browse context history';
  buffer.onChange(count => {
    if (count === 0) { statusBar.hide(); return; }
    statusBar.text = `$(clippy) ${count} ${count === 1 ? 'ref' : 'refs'}`;
    statusBar.show();
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
      (uri) => addFolder(buffer, history, uri)),
    vscode.commands.registerCommand('claude-context.clearContext',
      () => { buffer.clear(); history.clear(); }),
    vscode.commands.registerCommand('claude-context.pickFromHistory',
      () => pickFromHistory(buffer, history)),
  );
}
```

---

## Section 9: `pickFromHistory` Command (`src/commands/pickFromHistory.ts`)

```typescript
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

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/contextBuffer.ts` | **New** | Buffer state: replace, append, clear, count, onChange |
| `src/history.ts` | **New** | Session history: add (dedupe), getAll, clear |
| `src/commands/addSelectionAppend.ts` | **New** | Append mode handler for selection |
| `src/commands/pickFromHistory.ts` | **New** | Quick-pick from history, appends chosen ref |
| `src/pushReference.ts` | **Modify** | Add mode param + buffer/history params; add pushManyReferences |
| `src/commands/addSelection.ts` | **Modify** | Pass buffer/history, mode='replace' |
| `src/commands/addFile.ts` | **Modify** | Pass buffer/history; multi-URI handling |
| `src/commands/addFolder.ts` | **Modify** | Pass buffer/history, mode='append' |
| `src/extension.ts` | **Modify** | Instantiate buffer/history/statusBar; register new commands |
| `src/notify.ts` | **Modify** | showClipboardSuccess gains bufferCount param |
| `package.json` | **Modify** | New commands, updated keybindings, commandPalette entries |
| `src/test/contextBuffer.test.ts` | **New** | Unit tests for ContextBuffer |
| `src/test/history.test.ts` | **New** | Unit tests for History |

---

## Error Handling

- `clearContext` when buffer already empty: no-op (no toast, just fires onChange with 0)
- `pickFromHistory` when history empty: info toast "No history yet this session."
- `addFile` with no active editor and no URI: existing "No active file open" error toast
- Clipboard write failure: existing `showPushError` toast

## Testing

Unit tests (Jest, no VSCode host) cover:
- `contextBuffer.test.ts`: replace, append, appendMany, clear, getContents, count, onChange firing
- `history.test.ts`: add (dedup, cap at 20), getAll (newest first), clear

Command handlers are thin orchestrators — tested manually via F5 + Extension Development Host.
