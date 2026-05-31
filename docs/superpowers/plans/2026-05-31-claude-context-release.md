# Claude Context v1.0.0 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the ctx-push extension to Claude Context, add marketplace metadata, switch to esbuild bundling, add a success notification UX with a toggle setting, and write all release docs.

**Architecture:** All changes are in-place on main — no new modules except `src/notify.ts` (replacing `src/errors.ts`). The rename touches `package.json`, `src/config.ts`, `src/extension.ts`, and all three command files. The success toast is a single `showSuccess()` call after each `sendToTmux`.

**Tech Stack:** TypeScript, VSCode Extension API, esbuild (replaces tsc for bundling), @vscode/vsce (packaging), Jest (unit tests unchanged)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `package.json` | Modify | Full rewrite: rename, metadata, esbuild scripts, new setting, commandPalette exclusion |
| `src/config.ts` | Modify | Rename config prefix; add `showNotifications: boolean` |
| `src/extension.ts` | Modify | Rename command IDs |
| `src/errors.ts` | Delete | Replaced by notify.ts |
| `src/notify.ts` | Create | showTmuxError (moved) + showSuccess (new) |
| `src/commands/addSelection.ts` | Modify | Import notify; call showSuccess |
| `src/commands/addFile.ts` | Modify | Import notify; call showSuccess |
| `src/commands/addFolder.ts` | Modify | Import notify; call showSuccess |
| `media/icon.png` | Create | Copy of /Users/tuvan/Downloads/context.png |
| `LICENSE` | Create | MIT |
| `CHANGELOG.md` | Create | v1.0.0 entry |
| `README.md` | Create | Marketplace landing page |
| `CLAUDE.md` | Create | Developer guide |
| `.vscodeignore` | Modify | Add docs/, .claude/ exclusions |

---

### Task 1: Full package.json rewrite + install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace package.json with the complete release version**

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
  "keywords": ["claude", "claude-code", "anthropic", "ai", "tmux", "context", "cursor"],
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "main": "./out/extension.js",
  "activationEvents": [],
  "contributes": {
    "commands": [
      { "command": "claude-context.addSelection", "title": "Add to Claude Chat (selection)" },
      { "command": "claude-context.addFile", "title": "Add to Claude Chat" },
      { "command": "claude-context.addFolder", "title": "Add to Claude Chat (folder)" }
    ],
    "keybindings": [
      {
        "command": "claude-context.addSelection",
        "key": "ctrl+alt+a",
        "mac": "cmd+alt+a",
        "when": "editorTextFocus"
      },
      {
        "command": "claude-context.addFile",
        "key": "ctrl+alt+f",
        "mac": "cmd+alt+f",
        "when": "editorTextFocus"
      }
    ],
    "menus": {
      "explorer/context": [
        { "command": "claude-context.addFile", "when": "!explorerResourceIsFolder", "group": "navigation" },
        { "command": "claude-context.addFolder", "when": "explorerResourceIsFolder", "group": "navigation" }
      ],
      "commandPalette": [
        { "command": "claude-context.addFolder", "when": "false" }
      ]
    },
    "configuration": {
      "title": "Claude Context",
      "properties": {
        "claude-context.tmuxSession": {
          "type": "string",
          "default": "claude",
          "description": "tmux session name where Claude Code is running"
        },
        "claude-context.pathStyle": {
          "type": "string",
          "enum": ["relative", "absolute"],
          "default": "relative",
          "description": "Whether to use paths relative to workspace root or absolute paths"
        },
        "claude-context.showNotifications": {
          "type": "boolean",
          "default": true,
          "description": "Show a toast notification after successfully injecting a reference into tmux"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run bundle",
    "bundle": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --platform=node --minify",
    "compile": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --platform=node --sourcemap",
    "watch": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --platform=node --sourcemap --watch",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "package": "vsce package --no-dependencies",
    "package:marketplace": "vsce package --no-dependencies --baseContentUrl https://github.com/lntvan166/claude-context/blob/main/ --baseImagesUrl https://github.com/lntvan166/claude-context/raw/main/"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.25.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Install new dependencies**

```bash
npm install
```

Expected: esbuild and @vscode/vsce added to node_modules, no errors.

- [ ] **Step 3: Verify esbuild compile works**

```bash
npm run compile
```

Expected: `out/extension.js` produced, no errors. File size will be larger than before (bundled).

- [ ] **Step 4: Verify tests still pass**

```bash
npm test
```

Expected: 2 suites, 12 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: switch to esbuild, add marketplace metadata, rename to claude-context"
```

---

### Task 2: Rename ctx-push → claude-context in source files

**Files:**
- Modify: `src/config.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Update src/config.ts**

Replace the entire file:

```typescript
import * as vscode from 'vscode';

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

- [ ] **Step 2: Update src/extension.ts**

Replace the entire file:

```typescript
import * as vscode from 'vscode';
import { addSelection } from './commands/addSelection';
import { addFile } from './commands/addFile';
import { addFolder } from './commands/addFolder';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-context.addSelection', addSelection),
    vscode.commands.registerCommand('claude-context.addFile', addFile),
    vscode.commands.registerCommand('claude-context.addFolder', addFolder)
  );
}

export function deactivate(): void {}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/extension.ts
git commit -m "refactor: rename ctx-push → claude-context in source files"
```

---

### Task 3: Create notify.ts, delete errors.ts, update command imports

**Files:**
- Create: `src/notify.ts`
- Delete: `src/errors.ts`
- Modify: `src/commands/addSelection.ts`
- Modify: `src/commands/addFile.ts`
- Modify: `src/commands/addFolder.ts`

- [ ] **Step 1: Create src/notify.ts**

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

- [ ] **Step 2: Delete src/errors.ts**

```bash
git rm src/errors.ts
```

- [ ] **Step 3: Replace src/commands/addSelection.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatSelection, formatPath } from '../pathResolver';
import { sendToTmux } from '../tmux';
import { showTmuxError, showSuccess } from '../notify';

export async function addSelection(): Promise<void> {
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

  try {
    await sendToTmux(config.tmuxSession, reference);
    showSuccess(reference, config.tmuxSession, config.showNotifications);
  } catch (err) {
    showTmuxError(err, config.tmuxSession);
  }
}
```

- [ ] **Step 4: Replace src/commands/addFile.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { sendToTmux } from '../tmux';
import { showTmuxError, showSuccess } from '../notify';

export async function addFile(uri?: vscode.Uri): Promise<void> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }

  const config = getConfig();
  const absolutePath = targetUri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const reference = formatPath(resolvedPath);

  try {
    await sendToTmux(config.tmuxSession, reference);
    showSuccess(reference, config.tmuxSession, config.showNotifications);
  } catch (err) {
    showTmuxError(err, config.tmuxSession);
  }
}
```

- [ ] **Step 5: Replace src/commands/addFolder.ts**

```typescript
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatPath } from '../pathResolver';
import { sendToTmux } from '../tmux';
import { showTmuxError, showSuccess } from '../notify';

export async function addFolder(uri?: vscode.Uri): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage('Use the Explorer context menu to add a folder');
    return;
  }

  const config = getConfig();
  const absolutePath = uri.fsPath;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const reference = formatPath(resolvedPath);

  try {
    await sendToTmux(config.tmuxSession, reference);
    showSuccess(reference, config.tmuxSession, config.showNotifications);
  } catch (err) {
    showTmuxError(err, config.tmuxSession);
  }
}
```

- [ ] **Step 6: Verify typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: typecheck: no output. Tests: 2 suites, 12 tests, all pass.

- [ ] **Step 7: Commit**

```bash
git add src/notify.ts src/commands/addSelection.ts src/commands/addFile.ts src/commands/addFolder.ts
git commit -m "feat: add showSuccess notification; rename errors.ts → notify.ts"
```

---

### Task 4: Icon

**Files:**
- Create: `media/icon.png`

- [ ] **Step 1: Create media directory and copy icon**

```bash
mkdir -p media
cp /Users/tuvan/Downloads/context.png media/icon.png
```

- [ ] **Step 2: Verify file exists and is a valid PNG**

```bash
file media/icon.png
```

Expected: `media/icon.png: PNG image data, ...`

- [ ] **Step 3: Commit**

```bash
git add media/icon.png
git commit -m "chore: add extension icon"
```

---

### Task 5: Static release files

**Files:**
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Create: `README.md`
- Create: `CLAUDE.md`
- Modify: `.vscodeignore`

- [ ] **Step 1: Create LICENSE**

```
MIT License

Copyright (c) 2026 lntvan166

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create CHANGELOG.md**

```markdown
# Changelog

## [1.0.0] — 2026-05-31

### Added
- `Add to Claude Chat (selection)` — inject file or code selection as `@path` or `@path:start-end` via `Cmd+Alt+A` / `Ctrl+Alt+A`
- `Add to Claude Chat` — inject whole file via `Cmd+Alt+F` / `Ctrl+Alt+F` or Explorer right-click
- `Add to Claude Chat (folder)` — inject folder path via Explorer right-click
- `claude-context.tmuxSession` setting — tmux session name (default: `claude`)
- `claude-context.pathStyle` setting — `relative` or `absolute` paths (default: `relative`)
- `claude-context.showNotifications` setting — toggle success toast (default: `true`)
```

- [ ] **Step 3: Create README.md**

```markdown
# Claude Context

**Push file and selection references into Claude Code — one shortcut, no context switching.**

When using Claude Code alongside Cursor, adding code context means copying paths, switching apps, and pasting. Claude Context eliminates that with a single keystroke.

---

## Quick Start

**1. Start Claude Code in a named tmux session**

```bash
tmux new -s claude
# then inside the pane:
claude
```

**2. Install Claude Context**

Install from the VS Code / Cursor Extensions panel (`Ctrl+Shift+X`), search **Claude Context**.

**3. Push references from Cursor**

Select code → `Cmd+Alt+A` (mac) / `Ctrl+Alt+A` (linux) → `@src/auth.ts:11-14` appears in Claude's prompt. Focus stays in Cursor.

---

## Commands & Keybindings

| What it does | Shortcut (mac) | Shortcut (linux) | Also available via |
|---|---|---|---|
| Add current selection (or whole file if no selection) | `Cmd+Alt+A` | `Ctrl+Alt+A` | — |
| Add current file | `Cmd+Alt+F` | `Ctrl+Alt+F` | Explorer right-click |
| Add folder | — | — | Explorer right-click |

When a file is added without a selection, the whole file is referenced as `@path`. With a selection, the reference is `@path:startLine-endLine` (1-based).

---

## Configuration

Open VS Code settings (`Cmd+,`) and search **Claude Context**.

| Setting | Default | Description |
|---|---|---|
| `claude-context.tmuxSession` | `claude` | tmux session name where Claude Code is running. Must match `tmux new -s <name>`. |
| `claude-context.pathStyle` | `relative` | `relative` — paths relative to workspace root. `absolute` — full paths. Use `absolute` if Claude Code runs from a different directory. |
| `claude-context.showNotifications` | `true` | Show a brief toast confirming each injection. Set to `false` to silence. |

---

## Requirements

| Requirement | Notes |
|---|---|
| VS Code 1.85+ or Cursor | |
| [tmux](https://github.com/tmux/tmux) | `brew install tmux` / `apt install tmux` |
| [Claude Code](https://claude.ai/claude-code) | Terminal CLI |

---

## How It Works

```
Cursor (shortcut or right-click)
    → extension resolves @reference string
    → tmux send-keys -l -t <session> "@ref "
    → reference appears in Claude Code prompt
    → focus stays in Cursor
```

No clipboard, no focus steal, no switching windows.

---

## Contributing & Issues

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/lntvan166/claude-context/issues).

---

## License

MIT — see [LICENSE](LICENSE)
```

- [ ] **Step 4: Create CLAUDE.md**

```markdown
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
```

- [ ] **Step 5: Update .vscodeignore**

Replace the entire file:

```
.vscode/**
src/**
node_modules/**
out/test/**
docs/**
.claude/**
.gitignore
jest.config.js
tsconfig.json
**/*.map
**/*.ts
!out/**
```

- [ ] **Step 6: Commit**

```bash
git add LICENSE CHANGELOG.md README.md CLAUDE.md .vscodeignore
git commit -m "docs: add LICENSE, README, CHANGELOG, CLAUDE.md for v1.0.0 release"
```

---

### Task 6: Final verification and package

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected:
```
PASS src/test/tmux.test.ts
PASS src/test/pathResolver.test.ts

Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
```

- [ ] **Step 3: Build minified bundle**

```bash
npm run bundle
```

Expected: `out/extension.js` produced, no errors. Check the file is minified (single line or very few lines).

- [ ] **Step 4: Package the extension**

```bash
npm run package
```

Expected: `claude-context-1.0.0.vsix` produced. Check its size is reasonable (under 1 MB).

- [ ] **Step 5: Verify the .vsix contents**

```bash
unzip -l claude-context-1.0.0.vsix | head -40
```

Expected: should contain `extension/out/extension.js`, `extension/media/icon.png`, `extension/README.md`, `extension/LICENSE`, `extension/CHANGELOG.md`. Should NOT contain `extension/src/`, `extension/node_modules/`, `extension/docs/`.

- [ ] **Step 6: Commit**

```bash
git add claude-context-1.0.0.vsix
git commit -m "chore: build claude-context-1.0.0.vsix"
```
