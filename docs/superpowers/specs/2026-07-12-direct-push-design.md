# Direct Push — Design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem

Claude Context stops at the clipboard: the user builds a ref buffer, then must
manually paste into the Claude Code CLI. The goal is one keystroke/click that
lands the ref directly in the prompt input of **exactly the Claude Code session
the user is prompting** — regardless of terminal app (Warp, iTerm, VS Code/Cursor
integrated terminal) and with multiple concurrent sessions.

## Mechanism (research summary)

Claude Code's CLI speaks an IDE-integration protocol with editor extensions:

- The **extension is a WebSocket server** (JSON-RPC 2.0, MCP-flavored, subprotocol
  `"mcp"`) bound to `127.0.0.1` on a random port in 10000–65535.
- It advertises itself via a lockfile `~/.claude/ide/<port>.lock` (0600, dir 0700)
  containing `{pid, workspaceFolders, ideName, transport: "ws", runningInWindows,
  authToken}`. `pid` must be `process.ppid` (IDE main process) so the CLI's
  ancestor check passes for integrated terminals. `authToken` is a random UUID
  per server start; the CLI echoes it in the `X-Claude-Code-Ide-Authorization`
  header (mismatch → WS close 1008).
- The CLI discovers lockfiles and connects when `cwd` is within a lockfile's
  `workspaceFolders` (external terminals) or via `/ide` picker; `ideName` is the
  label shown. `CLAUDE_CODE_SSE_PORT` drives official-extension auto-connect —
  **we never set it** (would collide with the official extension's env collection).
- After the MCP `initialize` / `tools/list` handshake, the server may send the
  notification **`at_mentioned` `{filePath, lineStart?, lineEnd?}`** — the CLI
  inserts a real `@ref` into its prompt input (relativized against the CLI's cwd,
  rendered `@path` / `@path#L10` / `@path#L10-20`, trailing space). The CLI sends
  `ide_connected {pid}` on connect.
- Multiple lockfiles coexist by design; `/ide` lists all valid ones. Protocol is
  unofficial (reverse-engineered; production implementations: claudecode.nvim,
  claude-code-ide.el) — stable since mid-2025 but must be treated as driftable.

Rejected alternatives: `Terminal.sendText` (integrated terminal only — useless in
Warp), `UserPromptSubmit` hook (injected text is invisible plain text, no @-file
expansion), Warp scripting (no API exists), tmux `send-keys` (tmux users only),
MCP servers and CLI IPC (pull-based / nothing shipped).

## Decisions

- **Approach:** implement the IDE protocol server in the extension ("ctx-push"
  appears in `/ide`). Clipboard flow is untouched and remains the universal
  fallback.
- **Push model:** push on every add. `Cmd+Alt+C` / `Cmd+Alt+F` / right-click /
  history-pick immediately send the newly added ref(s) to the connected session.
  No new keybinding.
- **Multi-session:** target = most-recently-connected live client. Unlike the
  official extension, we do not kick previous clients; all stay connected, only
  the target receives pushes. Manual target switch via buffer-manager QuickPick.
- **Setting:** `claude-context.directPush` (boolean, default `true`) — disables
  the whole bridge.

## Architecture

```
command handler (existing)
    → pushReference()/pushManyReferences()   buffer → history → clipboard (unchanged)
    → IdeBridge.pushRef(ref) / pushRefs(refs)   NEW — after successful copy
            │ at_mentioned notification over WS
            ▼
    Claude Code CLI session (any terminal, connected via /ide or workspace match)
```

New module `src/ideBridge/`:

| File | Responsibility |
|---|---|
| `server.ts` | WS server lifecycle: bind 127.0.0.1:random, auth check, start/stop |
| `lockfile.ts` | Write/refresh/remove `~/.claude/ide/<port>.lock`; startup cleanup of stale lockfiles from crashed windows |
| `protocol.ts` | MCP handshake responses (`initialize`, `tools/list` → empty tools), `at_mentioned` serialization, lenient handling of unknown messages |
| `sessions.ts` | Client registry: `ide_connected` pids, connect order, live/dead state, current target |
| `index.ts` | `IdeBridge` facade: `start()`, `dispose()`, `pushRef()`, `pushRefs()`, `onSessionsChanged` event, `target` accessor |

`IdeBridge` is constructed in `activate()` and injected like `ContextBuffer`/
`History`. All pushes flow through `pushReference.ts` — it stays the single write
path.

### Structured refs

`at_mentioned` needs `{filePath (absolute), lineStart?, lineEnd?}`, not the
formatted string. Handlers already hold the URI + selection; they pass a `Ref`
object (`{fsPath, lineStart?, lineEnd?}`) alongside the formatted string into
`pushReference()`. The CLI does its own relativization and `#L` formatting; our
`:10-20` clipboard format is unaffected. Folder adds send the folder's absolute
path the same way.

`History` entries carry the structured `Ref` alongside the display string
(persisted to workspaceState; entries hydrated from an older version lack a
`Ref` and simply don't push — clipboard behavior still applies). This keeps
`pickFromHistory` consistent with push-on-add.

### Data flow per add (session connected)

1. Handler builds formatted string (as today) + structured `Ref`.
2. `pushReference()` runs buffer → history → clipboard exactly as now.
3. On successful copy, calls `IdeBridge.pushRef(ref)` → `at_mentioned` → ref
   appears in the target session's prompt.
4. Toast/status bar say "pushed to session" vs. "copied to clipboard".

No connected session → steps 1–2 only (today's behavior, toast unchanged).

Push-on-add sends **only the newly added ref(s)** — never the whole buffer (the
protocol is insert-only; re-sending would duplicate text in the prompt).
Multi-select `addFile` sends one `at_mentioned` per file. Replace-mode adds still
push; retraction is impossible, so buffer remove/clear does not touch the prompt.
The clipboard remains the source of truth for "paste the whole buffer".

## UX

- **Status bar:** `$(plug) N refs` when ≥1 session connected, `N refs` otherwise.
  Tooltip names the target (pid + connect time).
- **Buffer manager QuickPick:** when 2+ sessions are connected, an extra row
  "Switch target session" lists clients (pid, connect time); picking one makes it
  the target until it disconnects or a newer session connects.
- **Connection UX (documented in README):** from any terminal, run `/ide` once per
  session and pick **ctx-push**. Integrated-terminal sessions may auto-connect to
  the *official* extension first; `/ide` switches. One command per session.

## Error handling

All failures degrade to the existing clipboard behavior — the bridge must never
break the core feature.

- **Port bind failure:** retry with a new random port (3 attempts), then disable
  the bridge for the window and log to the output channel.
- **Stale lockfiles:** on activate, remove lockfiles whose pid is dead or port
  unresponsive; always remove own lockfile in `deactivate()`.
- **Dead clients:** WS close/error evicts from registry; target falls back to
  next-most-recent. `pushRef` with no live target is a no-op (clipboard already
  succeeded; toast reads "copied — no session connected" only when directPush is
  on and refs were expected to push).
- **Auth mismatch:** close 1008, log; no user-facing error.
- **Protocol drift:** unknown methods/fields ignored; malformed JSON logged and
  dropped; handshake changes at worst mean "never connects" = clipboard fallback.
- **Workspace folder changes:** rewrite lockfile on `onDidChangeWorkspaceFolders`.

## Testing

- **Jest (no VSCode host):** `protocol.ts` handshake and `at_mentioned` framing;
  `lockfile.ts` JSON shape + stale-cleanup logic (fs mocked/temp dir);
  `sessions.ts` most-recent targeting, manual-switch, eviction; `Ref` →
  `at_mentioned` params mapping; server auth/connect flow tested in-process with
  a real `ws` client faking the CLI (auth header, subprotocol, `initialize`,
  `ide_connected`).
- **Manual (F5):** integrated terminal `/ide` → add → ref in prompt; Warp `/ide` →
  same; two sessions → most-recent wins + manual switch; kill CLI → eviction +
  clipboard fallback; `directPush: false` → no lockfile written.
- **Dependency:** `ws` becomes the first runtime dependency (bundled by esbuild).

## Out of scope (v1)

- `selection_changed` live-selection chips
- IDE tools (`openDiff`, diagnostics, `openFile`, …) beyond the empty `tools/list`
- Auto-submit (sending Enter)
- Retracting refs from the prompt
- Setting `CLAUDE_CODE_SSE_PORT` / auto-connect env injection

## Risks

- **Unofficial protocol** may drift with CLI releases. Mitigations: lenient
  parsing, soft failure to clipboard, core (`at_mentioned`, lockfile, auth) stable
  since mid-2025 with two third-party ecosystems depending on it.
- **User confusion** when a session silently isn't connected. Mitigations: status
  bar plug indicator, distinct toast wording, README section.
