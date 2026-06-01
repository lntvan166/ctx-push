# Changelog

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
