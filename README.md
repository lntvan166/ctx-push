# Context Push

**Push `@file` context to Claude Code and any terminal AI agent — one shortcut, no focus steal.**

Select code in VS Code or Cursor, press a shortcut — the ref lands directly in your connected Claude Code session's prompt (any terminal, via `/ide`), and the clipboard always holds the full buffer for every other agent.

---

## Quick Start

**1. Install Context Push**

Install from the VS Code / Cursor Extensions panel (`Ctrl+Shift+X`), search **Context Push**.

**2. Run Claude Code**

Start Claude Code in any terminal (Cursor integrated terminal, Warp, etc.).

**3. Push references from Cursor**

Select code → `Cmd+Alt+C` (mac) / `Ctrl+Alt+C` (linux) → reference is copied to clipboard. Paste in Claude with `Cmd+V` (mac) / `Ctrl+Shift+V` (linux).

Build up multiple references before pasting: use `Cmd+Alt+Shift+C` to **append** instead of replace.

---

## Commands & Keybindings

| What it does | Shortcut (mac) | Shortcut (linux) | Also available via |
|---|---|---|---|
| Add selection (or whole file if nothing selected) — **replaces** clipboard | `Cmd+Alt+C` | `Ctrl+Alt+C` | — |
| Add whole file (ignores selection) — **replaces** clipboard | `Cmd+Alt+F` | `Ctrl+Alt+F` | Explorer right-click |
| **Append** selection to buffer — adds without replacing | `Cmd+Alt+Shift+C` | `Ctrl+Alt+Shift+C` | — |
| Add / append folder | — | — | Explorer right-click |
| Clear context buffer | — | — | Command Palette |
| Pick from history | — | — | Command Palette / status bar |

When a file is added without a selection, the whole file is referenced as `@path`. With a selection, the reference is `@path:startLine-endLine` (1-based).

---

## Context Buffer

Instead of replacing the clipboard on every add, you can accumulate refs:

1. `Cmd+Alt+C` → copies `@src/auth.ts:11-14` (replaces)
2. `Cmd+Alt+Shift+C` → copies `@src/auth.ts:11-14 @src/types.ts` (appended)
3. `Cmd+V` in Claude → pastes both refs at once

**Status bar:** When the buffer has refs, a counter appears in the bottom-right (`2 refs`). Click it to pick from session history.

**Multi-file:** Select multiple files in Explorer → right-click → "Add to Claude Chat" → all refs appended in one shot.

**Clear:** Command Palette → `Clear context buffer` resets the buffer. History is preserved so you can re-add via the status bar picker.

---

## Direct push into Claude Code sessions

With `claude-context.directPush` enabled (default), the extension runs the same
IDE bridge the official Claude Code extension uses. Connect any Claude Code CLI
session to it — Warp, iTerm, or the integrated terminal — and every ref you add
lands directly in that session's prompt input. No pasting.

**Connect (once per session):** in the Claude Code CLI, run `/ide` and pick
**Context Push**. Sessions started in the integrated terminal may auto-connect
to the official Claude Code extension first — run `/ide` and switch.

- The status bar shows `$(plug)` while a session is connected; adds toast
  `Pushed:` instead of `Copied:`.
- With multiple sessions connected, refs go to the most recently connected one;
  click the status bar → "Switch target session…" to retarget.
- The clipboard still always holds the full buffer — pasting keeps working
  everywhere, and is the automatic fallback when no session is connected.
- Notes: pushes are insert-only (removing a ref from the buffer can't remove it
  from the prompt), and the CLI renders line ranges as `@path#L10-20`. The IDE
  protocol is unofficial; if a Claude Code update breaks it, the extension
  silently falls back to clipboard-only.

Set `claude-context.directPush` to `false` for clipboard-only behavior.

---

## Configuration

Open VS Code settings (`Cmd+,`) and search **Context Push**.

| Setting | Default | Description |
|---|---|---|
| `claude-context.pathStyle` | `relative` | `relative` — paths relative to workspace root. `absolute` — full paths. Use `absolute` if Claude Code runs from a different directory. |
| `claude-context.showNotifications` | `true` | Show a toast confirming each copy. Set to `false` to silence. |

---

## Requirements

| Requirement | Notes |
|---|---|
| VS Code 1.85+ or Cursor | |
| [Claude Code](https://claude.ai/claude-code) | Terminal CLI or any AI agent that accepts `@`-references |

---

## How It Works

```
Cursor (shortcut or right-click)
    → extension resolves @reference string
    → added to context buffer (replace or append)
    → clipboard: full buffer contents with trailing space
    → paste in Claude Code prompt (Cmd+V)
    → focus stays in Cursor
```

No tmux required. Works on Ubuntu, macOS, and any terminal.

### Keybinding conflicts

| Binding | VS Code / Cursor default | Notes |
|---|---|---|
| `Ctrl+Alt+C` | **None** | **REST Client** uses this in `.http`/`plaintext` editors — skipped automatically |
| `Ctrl+Alt+F` | **None** | Safe on both platforms |
| `Ctrl+Alt+Shift+C` | **None** | Safe on both platforms |

To see live conflicts: `Ctrl+K Ctrl+S` → search the binding → right-click → **Show Same Keybindings**.

---

## Contributing & Issues

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/lntvan166/ctx-push/issues).

---

## License

MIT — see [LICENSE](LICENSE)
