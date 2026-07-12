# CLAUDE.md — Claude Context Developer Guide

## What This Project Does

Claude Context is a VS Code/Cursor extension that copies @file-references to the
clipboard for pasting into Claude Code — without stealing focus from the editor.
References accumulate in a session **context buffer**, so you can build up
`@a.ts @b.ts:10-20 @src/` across multiple adds and paste once.

Seven commands:
- `addSelection` (`Cmd+Alt+C`): **replaces** buffer with `@path` or `@path:start-end` for current file/selection
- `addSelectionAppend` (`Cmd+Alt+Shift+C`): **appends** selection ref to the buffer
- `addFile` (`Cmd+Alt+F` or Explorer right-click): `@path` for whole file — replaces on single file, appends all on multi-select
- `addFolder` (Explorer right-click only): `@path` for a folder — same replace/append-many semantics
- `clearContext` (Command Palette): empties the buffer (history preserved)
- `pickFromHistory` (Command Palette): QuickPick over the last 20 refs; picking appends to the buffer
- `manageBuffer` (status bar click or Command Palette): QuickPick over buffer refs with per-item remove, browse-history and clear-all actions

The clipboard always holds the **whole buffer contents** (refs joined by spaces, plus a trailing space). A status bar item shows the live ref count and opens the buffer manager on click.

With `claude-context.directPush` (default on), the extension also runs an IDE
bridge (`src/ideBridge/`) speaking Claude Code's IDE-integration protocol:
CLI sessions connected via `/ide` → **ctx-push** receive each added ref as an
`at_mentioned` notification, landing it directly in that session's prompt.
Pushes are insert-only and target the most-recently-connected session.

## Architecture

```
Cursor/VSCode (shortcut, Explorer right-click, palette, status bar)
    → command handler (src/commands/*.ts)
    → getConfig()       reads claude-context.* settings
    → resolvePath()     absolute path → relative or absolute per setting
    → formatPath() / formatSelection()   builds @ref string
    → pushReference() / pushManyReferences()   (src/pushReference.ts — the single write path)
        → ContextBuffer.replace/append/appendMany   (fires onChange → status bar update)
        → History.add()                             (dedupe, cap 20)
        → copyReference(buffer.getContents())       vscode.env.clipboard.writeText(refs + ' ')
        → IdeBridge.pushRef/pushRefs                (at_mentioned → connected Claude session, after successful copy)
        → showClipboardSuccess()                    toast if claude-context.showNotifications = true
```

`ContextBuffer` and `History` are constructed once in `activate()` and injected
into every handler. All buffer/clipboard/history/toast writes go through
`src/pushReference.ts` — don't write to the clipboard from anywhere else.

## File Map

| File | Responsibility |
|---|---|
| `src/extension.ts` | Activation, command registration, status bar wiring |
| `src/config.ts` | Read `claude-context.*` workspace settings → `Config` |
| `src/pathResolver.ts` | Pure functions: `resolvePath`, `formatPath`, `formatSelection`, `selectionLineRange` |
| `src/clipboard.ts` | `copyReference()` via `vscode.env.clipboard.writeText` |
| `src/pushReference.ts` | Single write path: buffer → history → clipboard → notify |
| `src/contextBuffer.ts` | `ContextBuffer` — session ref accumulator with `onChange` event |
| `src/history.ts` | History — last-20 refs, deduped, persisted to workspaceState via onDidChange |
| `src/notify.ts` | `showClipboardSuccess()`, `showPushError()` — VSCode toast display |
| `src/commands/addSelection.ts` | `claude-context.addSelection` handler + shared `addSelectionWithMode` |
| `src/commands/addSelectionAppend.ts` | `claude-context.addSelectionAppend` — delegates with mode `append` |
| `src/commands/addFile.ts` | `claude-context.addFile` handler (single + multi-select) |
| `src/commands/addFolder.ts` | `claude-context.addFolder` handler (single + multi-select) |
| `src/commands/pickFromHistory.ts` | `claude-context.pickFromHistory` QuickPick handler |
| `src/commands/manageBuffer.ts` | `claude-context.manageBuffer` QuickPick — view/remove buffer refs |
| `src/test/pathResolver.test.ts` | Jest unit tests for pathResolver (pure functions) |
| `src/test/clipboard.test.ts` | Jest unit tests for clipboard module |
| `src/test/contextBuffer.test.ts` | Jest unit tests for ContextBuffer (incl. onChange contract) |
| `src/test/history.test.ts` | Jest unit tests for History (dedupe, cap, defensive copy) |
| `src/test/__mocks__/vscode.ts` | Jest mock for the `vscode` module |
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

## Development Setup

```bash
npm install
npm run compile        # build with source maps (esbuild)
npm run watch          # watch mode
npm run typecheck      # tsc --noEmit
npm test               # Jest unit tests
```

Press **F5** in VS Code to launch the Extension Development Host with the extension loaded.

## Packaging & Publishing

Use the `release` skill (`.claude/skills/release/SKILL.md`) — it covers the full flow:
semver bump, CHANGELOG, tests, bundle, commit + tag, and publishing the same `.vsix`
to both the VS Code Marketplace (`vsce`) and Open VSX (`ovsx`, what Cursor pulls from).

```bash
# Build local .vsix for testing
npm run package

# Build .vsix with correct GitHub image URLs for registry listings (use for releases)
npm run package:marketplace
```

The `.vscodeignore` controls what goes into the `.vsix`. Keep dev-only dirs listed there.
Never commit `.vsix` files — they're build artifacts (gitignored).

## Testing

Unit tests cover pure logic (no VSCode host required):
- `src/test/pathResolver.test.ts` — resolvePath (incl. Windows paths), formatSelection, formatPath (incl. space escaping), selectionLineRange
- `src/test/clipboard.test.ts` — copyReference contract incl. trailing space
- `src/test/contextBuffer.test.ts` — replace/append/appendMany/clear + onChange event counts
- `src/test/history.test.ts` — dedupe, 20-item cap, defensive copies
- `src/test/pushReference.test.ts` — history only on successful copy, toast ref counts
- `src/test/notify.test.ts` — toast title format and enable/disable
- `src/test/protocol.test.ts` — Jest unit tests for protocol handling
- `src/test/sessions.test.ts` — Jest unit tests for SessionRegistry
- `src/test/lockfile.test.ts` — Jest unit tests for lockfile management (temp dirs)
- `src/test/ideServer.test.ts` — Jest integration tests for the WS server (real ws client)
- `src/test/ideBridge.test.ts` — Jest integration tests for the IdeBridge facade

Command handlers are thin orchestrators. Test them manually with F5 + paste into Claude Code.

## Key Design Decisions

- **Clipboard transport**: works with any terminal on Ubuntu/macOS; no tmux dependency
- **Buffer, not per-ref clipboard**: the clipboard always mirrors the full buffer so append workflows paste everything at once
- **Trailing space**: lets the user continue typing in Claude's prompt after the reference
- **Replace vs append**: plain shortcut replaces (common one-shot case); Shift variant and multi-select append
- **Pure functions in pathResolver.ts**: fully unit-testable without VSCode host
- **No tests on command handlers**: thin orchestrators; VSCode API mocking adds complexity without real coverage
- **`http` excluded from keybinding `when` clauses**: avoids REST Client conflict; plain text files keep the shortcuts
- **IDE bridge, not terminal automation**: direct push speaks Claude Code's (unofficial) IDE protocol — works in any terminal via `/ide`, inserts visible `@refs`; all bridge failures degrade silently to the clipboard flow
- **Never set `CLAUDE_CODE_SSE_PORT`**: it belongs to the official extension's auto-connect; colliding breaks both
- **Push-on-add, newly added refs only**: the protocol is insert-only — re-pushing the buffer would duplicate prompt text

## Adding Features

- **New command**: add handler in `src/commands/`, register in `src/extension.ts`, add to `contributes.commands` + `menus`/`keybindings` in `package.json`
- **New setting**: add to `contributes.configuration` in `package.json`, add field to `Config` in `src/config.ts`, read in `getConfig()`
- **Change clipboard behavior**: edit `src/clipboard.ts` and update `src/test/clipboard.test.ts`
- **Change buffer/history semantics**: edit `src/contextBuffer.ts` / `src/history.ts` and their test files
