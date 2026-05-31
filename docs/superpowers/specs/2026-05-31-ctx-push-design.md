# ctx-push Design Spec

**Date:** 2026-05-31  
**Status:** Approved

## Problem

When using Claude Code in Warp terminal alongside Cursor/VSCode, adding code context to the chat is friction-heavy: find code in Cursor → copy file path/line reference → switch to Warp → paste into prompt. This tool eliminates the switch-and-paste steps.

## Goal

A Cursor/VSCode extension that injects `@references` (code selections, files, folders) directly into a named tmux session running Claude Code — without stealing focus from Cursor.

## Target Platforms

- Ubuntu Linux (X11 and Wayland)
- macOS

## Architecture

```
Cursor (selection / right-click file / right-click folder)
    → keyboard shortcut or context menu
    → extension formats @reference
    → child_process.exec("tmux send-keys -t <session> '@ref' Enter")
    → reference appears in Warp's Claude Code prompt
    → focus stays in Cursor
```

**Tech stack:**
- TypeScript
- VSCode Extension API
- Node.js `child_process` to shell out to `tmux`

## Commands

### `ctx-push.addSelection`
- **Trigger:** Keyboard shortcut
- **Behavior:** Gets active editor + selection range → formats `@path/to/file:startLine-endLine`
- **Fallback:** No selection → adds whole file as `@path/to/file`

### `ctx-push.addFile`
- **Trigger:** Keyboard shortcut OR right-click file in Explorer
- **Behavior:** Gets file path from active editor or Explorer context → formats `@path/to/file`

### `ctx-push.addFolder`
- **Trigger:** Right-click folder in Explorer only
- **Behavior:** Gets folder path from Explorer context → formats `@path/to/folder`

## Keybindings

| Command | Linux | macOS |
|---|---|---|
| Add selection | `Ctrl+Alt+A` | `Cmd+Alt+A` |
| Add file | `Ctrl+Alt+F` | `Cmd+Alt+F` |
| Add folder | Context menu only | Context menu only |

## Explorer Context Menu

Both files and folders in the Explorer panel show: **"Add to Claude Chat"**

## Configuration

### `ctx-push.tmuxSession` (string, default: `"claude"`)
The tmux session name where Claude Code is running. Must match the session started with `tmux new -s claude`.

### `ctx-push.pathStyle` (enum, default: `"relative"`)
- `relative` — paths relative to workspace root (e.g. `@src/auth.ts:11-14`). Works when Claude Code is started from the same workspace root.
- `absolute` — full paths (e.g. `@/Users/tuvan/project/src/auth.ts:11-14`). Use when Claude Code runs from a different directory.

## Path Resolution

1. Get absolute file path from VSCode API
2. If `pathStyle = relative`: strip workspace root prefix
3. If no workspace root found: fall back to absolute automatically
4. For selections: append `:startLine-endLine` (1-based line numbers)

Each injected reference includes a trailing space so the user can continue typing on that line.

## Error Handling

All errors surface as non-blocking VSCode toast notifications (bottom-right corner). Focus is never stolen.

| Situation | Notification |
|---|---|
| `tmux` not installed | "tmux not found. Install tmux and run Claude Code with `tmux new -s claude`" |
| Session not found | "tmux session 'claude' not found. Start it with `tmux new -s claude`" |
| No active editor | "No active file open" |

## Usage Workflow

1. Start Claude Code in a named tmux session: `tmux new -s claude`
2. Open project in Cursor
3. Select a code block → `Ctrl+Alt+A` → `@src/auth.ts:11-14` appears in Claude prompt
4. Right-click a file in Explorer → "Add to Claude Chat" → `@src/auth.ts` appears
5. Right-click a folder → "Add to Claude Chat" → `@src/` appears
6. When ready, switch to Warp and send the prompt
