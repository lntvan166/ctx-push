# Changelog

## [1.3.0] — 2026-07-12

### Added
- **Buffer manager** — click the status bar counter to open a QuickPick of everything in the context buffer; remove individual refs with a per-item trash button (the picker stays open as you prune), or use the "Clear all" and "Browse history…" actions at the bottom (Command Palette: `Manage Claude Context buffer`)
- **Persistent history** — the last 20 refs added now survive window reloads, stored per-workspace, so `Pick from Claude Context history` still has your recent refs after a restart

### Changed
- **Status bar click now manages the buffer** instead of opening history — history moved to a "Browse history…" row inside the manager (and is still on the Command Palette)
- **Clearing the buffer now also clears the clipboard** — `Clear Claude Context buffer` and the manager's "Clear all" no longer leave stale refs on the clipboard

## [1.2.1] — 2026-07-11

### Fixed
- **Paths with spaces no longer break** — spaces in refs are now escaped (`@My\ Folder/file.ts`), matching Claude Code's own tab-completion, so refs no longer silently truncate at the first space
- **Full-line selections report the right range** — selecting lines 10–12 with Shift+Down no longer produces `:10-13` (the trailing cursor line at column 0 is excluded)
- **Relative paths work on Windows** — workspace roots with backslashes are recognized and refs are normalized to forward slashes
- **Relative paths work in multi-root workspaces** — each file resolves against its own workspace folder instead of always the first one
- **Accurate toast counts** — adding 3 files to an empty buffer shows "Copied: 3 files" instead of "3 files (+2 more)"; the "(+N more)" suffix now counts only other refs already in the buffer
- **Unsaved buffers are rejected with a clear message** — instead of copying a useless `@Untitled-1` ref
- **History stays truthful** — refs are recorded in history only after the clipboard write succeeds
- **Marketplace listing links fixed** — README images and the issues link now point at the real repo (`ctx-push`, not the nonexistent `claude-context`)

### Changed
- **Shortcuts now work in plain text files** — the `plaintext` keybinding exclusion is gone (`.txt`/`.log` files get the shortcuts back); the `http` exclusion stays to avoid the REST Client conflict

## [1.2.0] — 2026-06-01

### Added
- **Context buffer** — accumulate multiple `@refs` before pasting once (`Cmd+Alt+Shift+C` / `Ctrl+Alt+Shift+C` appends instead of replacing)
- **Multi-file Explorer** — right-click multiple files → all refs copied to buffer in one shot
- **Status bar counter** — shows live ref count (`2 refs`); click to pick from session history
- **Session history** — quick-pick the last 20 refs added this session (Command Palette: `Pick from Claude Context history`)
- **Clear buffer** — Command Palette: `Clear Claude Context buffer` (resets buffer, history preserved)

### Changed
- `Ctrl+Alt+Shift+C` / `Cmd+Alt+Shift+C` is now **append to buffer** (was: add whole file)
- Add whole file moved to `Ctrl+Alt+F` / `Cmd+Alt+F` (new keybinding, no conflict)
- Success notification auto-dismisses after 3 seconds

## [1.1.0] — 2026-06-01

### Changed
- References are copied to the clipboard instead of injected via tmux (selection, file, folder)
- Removed `claude-context.tmuxSession` setting
- Keybindings: `Ctrl+Alt+C` / `Cmd+Alt+C` for selection (copy-like); `Ctrl+Alt+Shift+C` for whole file (replaces `Ctrl+Alt+A` / `Ctrl+Alt+F`)
- Exclude `http` / `plaintext` editors from shortcuts to avoid REST Client conflict

## [1.0.0] — 2026-05-31

### Added
- `Add to Claude Chat (selection)` — copy `@path` or `@path:start-end` via `Cmd+Alt+C` / `Ctrl+Alt+C`
- `Add to Claude Chat` — copy whole file via `Cmd+Alt+Shift+C` / `Ctrl+Alt+Shift+C` or Explorer right-click
- `Add to Claude Chat (folder)` — inject folder path via Explorer right-click
- `claude-context.tmuxSession` setting — tmux session name (default: `claude`)
- `claude-context.pathStyle` setting — `relative` or `absolute` paths (default: `relative`)
- `claude-context.showNotifications` setting — toggle success toast (default: `true`)
