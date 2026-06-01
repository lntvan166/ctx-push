# Claude Context

**Push file and selection references into Claude Code — one shortcut, no context switching.**

When using Claude Code alongside Cursor, adding code context means copying paths, switching apps, and pasting. Claude Context eliminates that with a single keystroke.

---

## Quick Start

**1. Install Claude Context**

Install from the VS Code / Cursor Extensions panel (`Ctrl+Shift+X`), search **Claude Context**.

**2. Run Claude Code**

Start Claude Code in any terminal (Cursor integrated terminal, Warp, etc.).

**3. Push references from Cursor**

Select code → `Cmd+Alt+C` (mac) / `Ctrl+Alt+C` (linux) → reference is copied (like copy, plus Alt). Paste in Claude with `Ctrl+Shift+V` (linux) / `Cmd+V` (mac). Use `Ctrl+Alt+Shift+C` to copy the whole file even when text is selected.

---

## Commands & Keybindings

| What it does | Shortcut (mac) | Shortcut (linux) | Also available via |
|---|---|---|---|
| Add selection (or whole file if nothing selected) | `Cmd+Alt+C` | `Ctrl+Alt+C` | — |
| Add whole file (ignores selection) | `Cmd+Alt+Shift+C` | `Ctrl+Alt+Shift+C` | Explorer right-click |
| Add folder | — | — | Explorer right-click |

When a file is added without a selection, the whole file is referenced as `@path`. With a selection, the reference is `@path:startLine-endLine` (1-based).

---

## Configuration

Open VS Code settings (`Cmd+,`) and search **Claude Context**.

| Setting | Default | Description |
|---|---|---|
| `claude-context.pathStyle` | `relative` | `relative` — paths relative to workspace root. `absolute` — full paths. Use `absolute` if Claude Code runs from a different directory. |
| `claude-context.showNotifications` | `true` | Show a brief toast confirming each copy. Set to `false` to silence. |

---

## Requirements

| Requirement | Notes |
|---|---|
| VS Code 1.85+ or Cursor | |
| [Claude Code](https://claude.ai/claude-code) | Terminal CLI |

---

## How It Works

```
Cursor (shortcut or right-click)
    → extension resolves @reference string
    → clipboard: "@ref " (with trailing space)
    → paste in Claude Code prompt (Ctrl+Shift+V)
    → focus stays in Cursor
```

No tmux required. Works on Ubuntu, macOS, and any terminal.

### Keybinding conflicts

| Binding | VS Code / Cursor default | Your installed extensions |
|---|---|---|
| `Ctrl+Alt+C` | **None** | **REST Client** uses the same key in `.http` / `plaintext` editors (generate code snippet). This extension skips those languages automatically. |
| `Ctrl+Alt+Shift+C` | **None** | **None found** |
| Related | `Ctrl+C` = copy | Official **Claude Code** extension uses `Ctrl+Alt+K` for @-mention in the panel (different key, same idea). |

To see live conflicts: `Ctrl+K Ctrl+S` → search `ctrl+alt+c` → right-click → **Show Same Keybindings**.

---

## Contributing & Issues

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/lntvan166/claude-context/issues).

---

## License

MIT — see [LICENSE](LICENSE)
