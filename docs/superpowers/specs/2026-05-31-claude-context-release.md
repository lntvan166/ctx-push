# Claude Context — v1.0.0 Release Design Spec

**Date:** 2026-05-31
**Status:** Approved

## Goal

Prepare the ctx-push extension for public release on the VS Code Marketplace as **Claude Context** — with correct metadata, marketplace assets, bundling, a success notification UX, and a CLAUDE.md developer guide.

---

## Rename: ctx-push → claude-context

All internal identifiers change from the `ctx-push` prefix to `claude-context`:

| Before | After |
|---|---|
| `name: "ctx-push"` | `name: "claude-context"` |
| `displayName: "ctx-push"` | `displayName: "Claude Context"` |
| `publisher: "ctx-push"` | `publisher: "lntvan166"` |
| `ctx-push.addSelection` | `claude-context.addSelection` |
| `ctx-push.addFile` | `claude-context.addFile` |
| `ctx-push.addFolder` | `claude-context.addFolder` |
| `ctx-push.tmuxSession` | `claude-context.tmuxSession` |
| `ctx-push.pathStyle` | `claude-context.pathStyle` |
| `ctx-push.showNotifications` | `claude-context.showNotifications` (new) |

Files touched by the rename: `package.json`, `src/config.ts`, `src/commands/addSelection.ts`, `src/commands/addFile.ts`, `src/commands/addFolder.ts`.

---

## Section 1: Metadata & Packaging

### package.json additions

```json
{
  "name": "claude-context",
  "displayName": "Claude Context",
  "description": "Push file and selection references into Claude Code — one shortcut, no context switching.",
  "version": "1.0.0",
  "publisher": "lntvan166",
  "icon": "media/icon.png",
  "galleryBanner": { "color": "#1e1e2e", "theme": "dark" },
  "repository": { "type": "git", "url": "https://github.com/lntvan166/claude-context" },
  "license": "MIT",
  "keywords": ["claude", "claude-code", "anthropic", "ai", "tmux", "context", "cursor"]
}
```

### Command palette exclusion

`addFolder` is only meaningful from Explorer context menu — invoking it from the command palette shows an error. Hide it:

```json
"menus": {
  "commandPalette": [
    { "command": "claude-context.addFolder", "when": "false" }
  ]
}
```

### Bundling: switch tsc → esbuild

Replace the tsc compile step with esbuild for smaller `.vsix` and faster builds, matching the ClaudeGate pattern:

```json
"scripts": {
  "vscode:prepublish": "npm run bundle",
  "bundle": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --platform=node --minify",
  "compile": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --platform=node --sourcemap",
  "watch": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --platform=node --sourcemap --watch",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "package": "vsce package --no-dependencies",
  "package:marketplace": "vsce package --no-dependencies --baseContentUrl https://github.com/lntvan166/claude-context/blob/main/ --baseImagesUrl https://github.com/lntvan166/claude-context/raw/main/"
}
```

New dev dependencies: `esbuild`, `@vscode/vsce`.

### tsconfig.json

Keep `tsconfig.json` for `typecheck` only — esbuild handles emit. No changes needed.

### .vscodeignore update

Add entries to exclude dev-only directories from the packaged `.vsix`:

```
docs/**
.claude/**
src/test/**
jest.config.js
```

### Icon

Copy `context.png` → `media/icon.png`. This is the head-with-document icon provided for the release.

---

## Section 2: New Files

### LICENSE

Standard MIT license, copyright `lntvan166`, year 2026.

### CHANGELOG.md

```markdown
# Changelog

## [1.0.0] — 2026-05-31

### Added
- `Add to Claude Chat` — inject file or code selection as `@path` or `@path:start-end` via `Cmd+Alt+A` / `Ctrl+Alt+A`
- `Add to Claude Chat (file)` — inject whole file via `Cmd+Alt+F` / `Ctrl+Alt+F` or Explorer right-click
- `Add to Claude Chat (folder)` — inject folder path via Explorer right-click
- `claude-context.tmuxSession` setting — tmux session name (default: `claude`)
- `claude-context.pathStyle` setting — `relative` or `absolute` paths
- `claude-context.showNotifications` setting — toggle success toast (default: `true`)
```

### README.md

Structure (mirrors ClaudeGate style):

```
# Claude Context

**Push file and selection references into Claude Code — one shortcut, no context switching.**

When using Claude Code alongside Cursor, adding code context means copying paths, switching apps, and pasting. Claude Context eliminates that with a single keystroke.

---

## Quick Start

1. Start Claude Code in a named tmux session: `tmux new -s claude`
2. Install Claude Context from the VS Code / Cursor Extensions panel
3. Select code → Cmd+Alt+A (mac) / Ctrl+Alt+A (linux) → @ref appears in Claude's prompt

---

## Commands & Keybindings

| Command | Shortcut (mac) | Shortcut (linux) | Also available |
|---|---|---|---|
| Add selection or file | Cmd+Alt+A | Ctrl+Alt+A | — |
| Add file | Cmd+Alt+F | Ctrl+Alt+F | Explorer right-click |
| Add folder | — | — | Explorer right-click |

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `claude-context.tmuxSession` | `claude` | tmux session name where Claude Code is running |
| `claude-context.pathStyle` | `relative` | `relative` (workspace-relative) or `absolute` |
| `claude-context.showNotifications` | `true` | Show toast after each successful injection |

---

## Requirements

- VS Code 1.85+ or Cursor
- tmux
- Claude Code CLI

---

## License

MIT
```

### CLAUDE.md

Developer guide for agents and contributors — see full content below.

---

## Section 3: Success Notification UX

### New setting

```json
"claude-context.showNotifications": {
  "type": "boolean",
  "default": true,
  "description": "Show a toast notification after successfully injecting a reference into tmux"
}
```

### Config module (`src/config.ts`)

Add `showNotifications: boolean` to the `Config` interface and read it in `getConfig()`:

```typescript
export interface Config {
  tmuxSession: string;
  pathStyle: 'relative' | 'absolute';
  showNotifications: boolean;
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('claude-context');
  return {
    tmuxSession: cfg.get<string>('tmuxSession') ?? 'claude',
    pathStyle: cfg.get<'relative' | 'absolute'>('pathStyle') ?? 'relative',
    showNotifications: cfg.get<boolean>('showNotifications') ?? true,
  };
}
```

### Notification module

Rename `src/errors.ts` → `src/notify.ts`. Add `showSuccess()` alongside the existing `showTmuxError()`:

```typescript
import * as vscode from 'vscode';
import { TmuxNotFoundError, SessionNotFoundError } from './tmux';

export function showSuccess(reference: string, session: string, enabled: boolean): void {
  if (!enabled) return;
  vscode.window.showInformationMessage(`${reference} → tmux:${session}`);
}

export function showTmuxError(err: unknown, session: string): void {
  if (err instanceof TmuxNotFoundError) {
    vscode.window.showErrorMessage(
      'tmux not found. Install tmux and run Claude Code with `tmux new -s claude`'
    );
  } else if (err instanceof SessionNotFoundError) {
    vscode.window.showErrorMessage(
      `tmux session '${session}' not found. Start it with \`tmux new -s ${session}\``
    );
  } else {
    vscode.window.showErrorMessage(
      `claude-context: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
```

### Command handlers

Each command handler calls `showSuccess(reference, config.tmuxSession, config.showNotifications)` after a successful `sendToTmux`. Example for `addSelection.ts`:

```typescript
try {
  await sendToTmux(config.tmuxSession, reference);
  showSuccess(reference, config.tmuxSession, config.showNotifications);
} catch (err) {
  showTmuxError(err, config.tmuxSession);
}
```

Same pattern in `addFile.ts` and `addFolder.ts`.

---

## CLAUDE.md Content

```markdown
# CLAUDE.md — Claude Context Developer Guide

## What This Project Does

Claude Context is a VS Code/Cursor extension that injects @file-references into a
named tmux session running Claude Code — without stealing focus from the editor.

Three commands:
- addSelection (Cmd+Alt+A): sends @path or @path:start-end for the current file/selection
- addFile (Cmd+Alt+F or Explorer right-click): sends @path for a file
- addFolder (Explorer right-click only): sends @path for a folder

## Architecture

Cursor/VSCode (selection / right-click)
    → command handler
    → getConfig() reads claude-context.* settings
    → resolvePath() converts absolute path → relative or absolute per setting
    → formatPath() / formatSelection() builds @ref string
    → sendToTmux() calls execFile('tmux', ['send-keys', '-l', '-t', session, ref + ' '])
    → showSuccess() toasts the result (if claude-context.showNotifications is true)

## File Map

| File | Responsibility |
|---|---|
| src/extension.ts | Activation, command registration |
| src/config.ts | Read claude-context.* workspace settings |
| src/pathResolver.ts | Pure functions: resolvePath, formatPath, formatSelection |
| src/tmux.ts | sendToTmux() via execFile; TmuxNotFoundError, SessionNotFoundError |
| src/notify.ts | showSuccess(), showTmuxError() — VSCode toast display |
| src/commands/addSelection.ts | claude-context.addSelection handler |
| src/commands/addFile.ts | claude-context.addFile handler |
| src/commands/addFolder.ts | claude-context.addFolder handler |
| src/test/pathResolver.test.ts | Jest unit tests for pathResolver (pure functions) |
| src/test/tmux.test.ts | Jest unit tests for tmux module (mocked child_process) |

## Development Setup

npm install
npm run compile        # build with source maps
npm run watch          # watch mode
npm run typecheck      # tsc --noEmit, no emit
npm test               # Jest unit tests

Press F5 in VS Code to launch Extension Development Host.

## Packaging

npm run package                # local .vsix for testing
npm run package:marketplace    # .vsix with correct GitHub URLs for marketplace images

## Publishing

vsce login lntvan166           # requires Azure DevOps PAT (Marketplace → Manage scope)
vsce publish                   # bumps version and publishes

## Testing

Unit tests cover pure logic only (no VSCode host required):
- src/test/pathResolver.test.ts — 8 tests for resolvePath, formatSelection, formatPath
- src/test/tmux.test.ts — 4 tests for sendToTmux (mocked child_process)

Command handlers are thin orchestrators with no testable logic beyond integration.
Test manually using F5 (Extension Development Host) + a live tmux session.

## Key Design Decisions

- execFile (not exec): avoids shell injection — session name and text are argv elements
- send-keys -l flag: forces tmux to treat input as literal text, not key sequences
- Trailing space on injected text: lets the user continue typing immediately
- Typed error classes (TmuxNotFoundError, SessionNotFoundError): clean instanceof dispatch
- Pure functions in pathResolver.ts: fully unit-testable without VSCode host
- No tests on command handlers: they are thin orchestrators; VSCode API mocking adds
  complexity without meaningful coverage

## Adding Features

- New commands: add handler in src/commands/, register in src/extension.ts,
  add to contributes.commands + menus in package.json
- New settings: add to contributes.configuration in package.json, add field to
  Config interface in src/config.ts, read in getConfig()
- Changing tmux invocation: edit src/tmux.ts and update src/test/tmux.test.ts
```

---

## File Change Summary

| File | Action |
|---|---|
| `package.json` | Rename, metadata, bundling scripts, new setting, commandPalette exclusion |
| `src/config.ts` | Add `showNotifications` field; rename config prefix |
| `src/errors.ts` | Rename → `src/notify.ts`; add `showSuccess()` |
| `src/commands/addSelection.ts` | Rename command ID; call `showSuccess()` |
| `src/commands/addFile.ts` | Rename command ID; call `showSuccess()` |
| `src/commands/addFolder.ts` | Rename command ID; call `showSuccess()` |
| `src/extension.ts` | Rename command IDs |
| `media/icon.png` | New — copy of context.png |
| `LICENSE` | New — MIT |
| `CHANGELOG.md` | New |
| `README.md` | New |
| `CLAUDE.md` | New |
| `.vscodeignore` | Add docs/, .claude/, src/test/, jest.config.js |
| `jest.config.js` | No changes needed — `moduleNameMapper` key `vscode` is unchanged |
