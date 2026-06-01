# CLAUDE.md — Claude Context Developer Guide

## What This Project Does

Claude Context is a VS Code/Cursor extension that copies @file-references to the
clipboard for pasting into Claude Code — without stealing focus from the editor.

Three commands:
- `addSelection` (`Cmd+Alt+C`): copies `@path` or `@path:start-end` for current file/selection
- `addFile` (`Cmd+Alt+Shift+C` or Explorer right-click): copies `@path` for whole file
- `addFolder` (Explorer right-click only): copies `@path` for a folder

## Architecture

```
Cursor/VSCode (shortcut or Explorer right-click)
    → command handler (src/commands/*.ts)
    → getConfig()       reads claude-context.* settings
    → resolvePath()     absolute path → relative or absolute per setting
    → formatPath() / formatSelection()   builds @ref string
    → copyReference()   vscode.env.clipboard.writeText(ref + ' ')
    → showClipboardSuccess()  info toast if claude-context.showNotifications = true
```

## File Map

| File | Responsibility |
|---|---|
| `src/extension.ts` | Activation, command registration |
| `src/config.ts` | Read `claude-context.*` workspace settings → `Config` |
| `src/pathResolver.ts` | Pure functions: `resolvePath`, `formatPath`, `formatSelection` |
| `src/clipboard.ts` | `copyReference()` via `vscode.env.clipboard.writeText` |
| `src/pushReference.ts` | Shared push flow: copy + notify |
| `src/notify.ts` | `showClipboardSuccess()`, `showPushError()` — VSCode toast display |
| `src/commands/addSelection.ts` | `claude-context.addSelection` handler |
| `src/commands/addFile.ts` | `claude-context.addFile` handler |
| `src/commands/addFolder.ts` | `claude-context.addFolder` handler |
| `src/test/pathResolver.test.ts` | Jest unit tests for pathResolver (pure functions) |
| `src/test/clipboard.test.ts` | Jest unit tests for clipboard module |

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
- `src/test/clipboard.test.ts` — tests for copyReference (mocked vscode clipboard)

Command handlers are thin orchestrators. Test them manually with F5 + paste into Claude Code.

## Key Design Decisions

- **Clipboard transport**: works with any terminal on Ubuntu/macOS; no tmux dependency
- **Trailing space**: lets the user continue typing in Claude's prompt after the reference
- **Pure functions in pathResolver.ts**: fully unit-testable without VSCode host
- **No tests on command handlers**: thin orchestrators; VSCode API mocking adds complexity without real coverage

## Adding Features

- **New command**: add handler in `src/commands/`, register in `src/extension.ts`, add to `contributes.commands` + `menus` in `package.json`
- **New setting**: add to `contributes.configuration` in `package.json`, add field to `Config` in `src/config.ts`, read in `getConfig()`
- **Change clipboard behavior**: edit `src/clipboard.ts` and update `src/test/clipboard.test.ts`
