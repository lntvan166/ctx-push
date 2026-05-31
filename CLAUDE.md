# CLAUDE.md — Claude Context Developer Guide

## What This Project Does

Claude Context is a VS Code/Cursor extension that injects @file-references into a
named tmux session running Claude Code — without stealing focus from the editor.

Three commands:
- `addSelection` (`Cmd+Alt+A`): sends `@path` or `@path:start-end` for current file/selection
- `addFile` (`Cmd+Alt+F` or Explorer right-click): sends `@path` for a file
- `addFolder` (Explorer right-click only): sends `@path` for a folder

## Architecture

```
Cursor/VSCode (shortcut or Explorer right-click)
    → command handler (src/commands/*.ts)
    → getConfig()       reads claude-context.* settings
    → resolvePath()     absolute path → relative or absolute per setting
    → formatPath() / formatSelection()   builds @ref string
    → sendToTmux()      execFile('tmux', ['send-keys', '-l', '-t', session, ref + ' '])
    → showSuccess()     info toast if claude-context.showNotifications = true
```

## File Map

| File | Responsibility |
|---|---|
| `src/extension.ts` | Activation, command registration |
| `src/config.ts` | Read `claude-context.*` workspace settings → `Config` |
| `src/pathResolver.ts` | Pure functions: `resolvePath`, `formatPath`, `formatSelection` |
| `src/tmux.ts` | `sendToTmux()` via `execFile`; `TmuxNotFoundError`, `SessionNotFoundError` |
| `src/notify.ts` | `showSuccess()`, `showTmuxError()` — VSCode toast display |
| `src/commands/addSelection.ts` | `claude-context.addSelection` handler |
| `src/commands/addFile.ts` | `claude-context.addFile` handler |
| `src/commands/addFolder.ts` | `claude-context.addFolder` handler |
| `src/test/pathResolver.test.ts` | Jest unit tests for pathResolver (pure functions) |
| `src/test/tmux.test.ts` | Jest unit tests for tmux module (mocked child_process) |

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

```bash
# Build local .vsix for testing
npm run package

# Build .vsix with correct GitHub image URLs for Marketplace
npm run package:marketplace

# Publish (requires vsce login first)
npm install -g @vscode/vsce   # one-time
vsce login lntvan166           # requires Azure DevOps PAT: Marketplace → Manage scope
vsce publish                   # bumps version and publishes
```

The `.vscodeignore` controls what goes into the `.vsix`. Keep dev-only dirs listed there.

## Testing

Unit tests cover pure logic (no VSCode host required):
- `src/test/pathResolver.test.ts` — 8 tests: resolvePath, formatSelection, formatPath
- `src/test/tmux.test.ts` — 4 tests: sendToTmux (mocked child_process)

Command handlers are thin orchestrators. Test them manually with F5 + a live tmux session.

## Key Design Decisions

- **`execFile` not `exec`**: avoids shell injection — session name and text are discrete argv elements
- **`send-keys -l` flag**: forces tmux to treat input as literal text, not named key sequences
- **Trailing space**: lets the user continue typing in Claude's prompt after the reference
- **Typed error classes**: `TmuxNotFoundError` / `SessionNotFoundError` for clean `instanceof` dispatch
- **Pure functions in pathResolver.ts**: fully unit-testable without VSCode host
- **No tests on command handlers**: thin orchestrators; VSCode API mocking adds complexity without real coverage

## Adding Features

- **New command**: add handler in `src/commands/`, register in `src/extension.ts`, add to `contributes.commands` + `menus` in `package.json`
- **New setting**: add to `contributes.configuration` in `package.json`, add field to `Config` in `src/config.ts`, read in `getConfig()`
- **Change tmux invocation**: edit `src/tmux.ts` and update `src/test/tmux.test.ts` assertion
