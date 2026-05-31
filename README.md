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

Select code → `Cmd+Option+A` (mac) / `Ctrl+Alt+A` (linux) → `@src/auth.ts:11-14` appears in Claude's prompt. Focus stays in Cursor.

---

## Commands & Keybindings

| What it does | Shortcut (mac) | Shortcut (linux) | Also available via |
|---|---|---|---|
| Add current selection (or whole file if no selection) | `Cmd+Option+A` | `Ctrl+Alt+A` | — |
| Add current file | `Cmd+Option+F` | `Ctrl+Alt+F` | Explorer right-click |
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
