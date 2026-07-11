# Buffer Manager & Persistent History — Design

**Date:** 2026-07-12
**Target version:** 1.3.0
**Status:** Approved

## Goal

Deepen the buffer workflow: let users see and edit what's in the context buffer
(remove individual refs, clear all) from the status bar, and make session
history survive window reloads.

## 1. Commands & entry points

- New command `claude-context.manageBuffer` — title **"Manage Claude Context buffer"**, palette-visible.
- The QuickPick shows one row per buffered ref with a trash item-button, then two footer rows:
  - `$(history) Browse history…` — closes the manager and opens the existing history picker (`pickFromHistory`)
  - `$(clear-all) Clear all` — empties the buffer
- **Status bar click changes from `pickFromHistory` to `manageBuffer`.** The counter shows buffer state, so clicking it should manage the buffer. History stays reachable via the footer row and the palette.
- Empty buffer (reachable via palette only — the status bar hides at count 0): show a disabled "Buffer is empty" placeholder plus the `Browse history…` footer row (no `Clear all`).

```
┌──────────────────────────────────────┐
│ Claude Context — 3 refs              │
├──────────────────────────────────────┤
│ @src/auth.ts                    🗑   │
│ @src/api.ts:10-42               🗑   │
│ @docs/                          🗑   │
├──────────────────────────────────────┤
│ $(history) Browse history…           │
│ $(clear-all) Clear all               │
└──────────────────────────────────────┘
```

## 2. Manager behavior

- Built on `vscode.window.createQuickPick()` (not one-shot `showQuickPick`) — item buttons and in-place re-render require the live API.
- Trash click removes that ref; the picker **stays open** and re-renders the remaining items. Removing the last ref switches to the empty-buffer state in place.
- Enter/accept on a ref row does nothing (no destructive default action).
- **Clipboard invariant:** after every mutation (single remove, clear-all), the clipboard is rewritten with the new buffer contents — including the empty string when the buffer empties. The clipboard always mirrors the buffer.
- The existing `clearContext` command gets the same treatment (it currently leaves a stale clipboard).
- Mutations do NOT touch history — history records what was added, not what remains.

## 3. Architecture

### ContextBuffer additions (`src/contextBuffer.ts`)

- `removeAt(index: number): void` — removes one ref, fires `onChange`; out-of-range index is a no-op (no event).
- `getRefs(): readonly string[]` — defensive copy for rendering.

### New handler (`src/commands/manageBuffer.ts`)

Thin orchestrator: renders buffer state into QuickPick items, wires the trash
button to `buffer.removeAt` + clipboard rewrite, footer rows to
`pickFromHistory` / `buffer.clear()` + clipboard rewrite. Registered in
`extension.ts`; `statusBar.command` updated to `claude-context.manageBuffer`.

Clipboard rewrite on mutation goes through `copyReference`-style raw write of
`buffer.getContents()` — a small shared helper `syncClipboard(buffer)` in
`src/pushReference.ts` used by manageBuffer and clearContext. Non-empty buffer:
write contents plus the usual trailing space (same as `copyReference`). Empty
buffer: write `''` exactly — no trailing space.

### History persistence

- `History` stays vscode-free and unit-testable:
  - constructor accepts optional initial items: `new History(initial?: string[])`
  - gains an optional change callback: `onDidChange?: (items: string[]) => void`, invoked after every `add`/`clear`
- `extension.ts` wires persistence:
  - hydrate: `context.workspaceState.get<string[]>('claude-context.history', [])`, filtered by `typeof x === 'string'` (corrupt-state guard)
  - save: `onDidChange` → `void context.workspaceState.update('claude-context.history', items)`
- `workspaceState`, not `globalState` — refs are workspace-relative paths, meaningless across projects.
- Cap stays 20; hydration applies the same cap/dedupe by construction (initial items pass through the normal `add` path or are sliced on load).

Alternatives considered: passing the `Memento` into `History` (couples the pure
class to vscode; harder to test) and a dedicated storage module (overkill for a
single key). The chosen wiring matches how `ContextBuffer` is composed today.

## 4. Error handling

- Clipboard write failures during manager mutations surface via the existing `showPushError`; buffer state still updates (consistent with `pushReference` today).
- Missing/corrupt persisted history hydrates to `[]` via the filter guard — never throws during activation.

## 5. Testing

Per project convention (pure logic unit-tested; thin handlers manual F5):

- `src/test/contextBuffer.test.ts` — `removeAt` middle/first/last, out-of-range no-op (no `onChange` fire), `getRefs` defensive copy, `onChange` count after removal.
- `src/test/history.test.ts` — constructor hydration (cap + dedupe applied), `onDidChange` invoked with current items on `add` and `clear` (including duplicate adds, which reorder and therefore fire), malformed initial input handled by caller-side filter (History assumes clean strings).
- `manageBuffer` handler and `workspaceState` wiring — manual Extension Development Host test.

## 6. Out of scope

- Persisting the buffer itself across reloads (considered, deferred)
- Clear-buffer keybinding (deferred)
- Reordering refs in the manager
- Any change to ref formatting or push flow
