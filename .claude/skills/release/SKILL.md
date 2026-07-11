---
name: release
description: Cut and publish a new Claude Context release to the VS Code Marketplace and Open VSX. Use whenever the user asks to "make a release", "publish", "ship", "cut a version", "release vX.Y.Z", "push a new version to the marketplace", or bump the version after landing a change. Handles semver bump, CHANGELOG, tests, bundle, commit, tag, and publishing to both registries (`vsce` + `ovsx`) — pausing for confirmation before the irreversible publish. Trigger even if the user only says "publish this" or "ship it" after finishing a change.
---

# Release Claude Context

Claude Context is a VS Code extension (`publisher: lntvan166`, `name: claude-context`, repo `ctx-push`). A release means: bump the version, record it in the CHANGELOG, verify typecheck + tests + bundle are green, commit + tag it in git, and publish the `.vsix` to **two** registries — the VS Code Marketplace with `vsce`, and [Open VSX](https://open-vsx.org) with `ovsx`. Open VSX is the registry Cursor, VSCodium, and Windsurf pull from, so shipping there is what lets the extension **auto-update** in those editors — the Marketplace alone doesn't reach them. The extension is already live on both registries under the `lntvan166` namespace.

The publish step is **irreversible on both registries** — you cannot unpublish or overwrite a version number on either, and neither lets you re-push a version that's already up. So the flow front-loads every check that can fail (tests, bundle, auth) *before* committing anything, and **pauses for the user's explicit go-ahead** before publishing.

Publish the **same `.vsix` artifact** to both registries — build it once, then hand that one file to `vsce publish` and `ovsx publish`. That guarantees the two registries carry byte-identical builds instead of two independently-bundled ones.

## Before you start

Confirm you're on `main` with a clean-enough tree, and gather the current state so you pick the right version:

```bash
git branch --show-current                        # expect: main
node -p "require('./package.json').version"      # current version
git tag --sort=-v:refname | head -5              # recent tags (v1.2.0, v1.1.0, ...)
git status --short                               # what's uncommitted
```

The uncommitted change being released is usually already in the working tree (like the fix we just made). Note any **untracked** files — they must NOT end up in the release commit (see step 6).

## Tooling — install what's missing

The release needs `vsce` and `ovsx` (both required — one per registry) and optionally `gh` (only if the user wants a GitHub Release too). If a required tool is missing, install it rather than stopping — that's expected, not a blocker. Check first, install only the gap:

```bash
vsce --version   # if "command not found": npm install -g @vscode/vsce
ovsx --version   # if "command not found": npm install -g ovsx
gh --version     # only needed for the optional GitHub Release step below
```

- **vsce** — `npm install -g @vscode/vsce` (also in devDependencies; `npx vsce` works too). Publishes to the VS Code Marketplace.
- **ovsx** — `npm install -g ovsx`. Publishes to Open VSX. Note the package is `ovsx`, *not* `@vscode/ovsx`.
- **gh** — this machine is macOS: `brew install gh`. After install, `gh auth login` is needed once before it can create releases.

Installing a global CLI tool modifies the user's system, so mention what you're about to install before doing it. Never install tools the release doesn't actually need.

## Pick the version bump (semver)

Base the bump on the nature of the change being shipped:

- **patch** (`1.2.0 → 1.2.1`) — bug fix, UX/message tweak, docs, internal-only change. Most releases.
- **minor** (`1.2.1 → 1.3.0`) — new command, setting, or feature, or a backward-compatible behavior change (including keybinding changes).
- **major** (`1.3.0 → 2.0.0`) — a breaking change to how users interact with the extension.

If it's ambiguous, state your reasoning and pick the lower bump — under-bumping is cheaper to correct than a premature major.

## Steps

Do 1–5 first (all reversible). Then **stop and ask before 6 onward.**

### 1. Typecheck + full test suite — green baseline before anything else

```bash
npm run typecheck && npm test
```

`npm test` runs the Jest unit tests (pathResolver, clipboard, contextBuffer, history). If anything fails, stop and fix it — never publish on red. This is why we test before bumping: no point versioning a broken build.

### 2. Bump the version

```bash
npm version <new-version> --no-git-tag-version
```

`--no-git-tag-version` bumps `package.json` (and `package-lock.json`) without letting npm create its own commit/tag — you control those in steps 6–7 so the message and trailer are right. Include `package-lock.json` in the release commit even though it looks unrelated — `npm version` re-syncs it.

### 3. Add the CHANGELOG entry

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/) + semver, with `## [X.Y.Z] — YYYY-MM-DD` headings. Insert a new section above the previous version's, using today's date and the `### Added / ### Changed / ### Fixed` headings that apply. Match the existing voice: each bullet leads with a **bold plain-English summary of the user-visible effect**, then explains the mechanism. Look at the top two existing entries and mirror their density.

### 4. Verify the production bundle builds, then package once

```bash
npm run bundle                    # exactly what vsce runs via vscode:prepublish
npm run package:marketplace      # → claude-context-X.Y.Z.vsix
```

Running the bundle now surfaces esbuild failures while they're still cheap to fix, not mid-publish. Confirm `out/extension.js` is produced.

Use `npm run package:marketplace` (not plain `package`) for the release artifact — it rewrites relative README image URLs to absolute GitHub URLs so the listing renders correctly on **both** registries. Glance at the file list it prints: `src/`, `docs/`, `.claude/`, `CLAUDE.md`, `*.map`, and stray `.vsix` files are excluded via `.vscodeignore`. If anything unexpected shows up in the listing, fix `.vscodeignore` before publishing.

### 5. Verify publish auth (both registries) — before committing

```bash
vsce verify-pat lntvan166
```

Checking the Marketplace Personal Access Token now means you won't get halfway through (commit + tag pushed) only to discover you can't publish. If it fails, the PAT has expired — the user must refresh it in Azure DevOps (Marketplace → Manage scope) and re-run `vsce login lntvan166`; suggest they do this via `! vsce login lntvan166` so the interactive prompt lands in the session.

**Open VSX auth is different — there's no `verify-pat` equivalent**, so the token is only validated at publish time (step 8). The namespace `lntvan166` already exists and the extension is already published there, so the one-time prerequisites (Publisher Agreement, namespace creation) are done.

The **access token** comes from https://open-vsx.org/user-settings/tokens. Treat it as a secret: pass it as `-p <token>` on the publish command or via the `OVSX_PAT` env var, and **never write it into a committed file or this skill**. If the user hasn't provided one, ask them to run the publish step themselves via `! ovsx publish … -p <token>` so the secret stays in their session rather than being echoed back through you.

### — PAUSE HERE —

Summarize what's about to happen: new version, the CHANGELOG bullets, typecheck/test/bundle/auth all green. Then ask the user to confirm before you commit, tag, and publish. Publishing cannot be undone, so this gate is deliberate.

### 6. Commit — only the release files

Stage the version files, the CHANGELOG, and the actual source change being released. **Never `git add -A`** — the working tree may have unrelated untracked files or build artifacts that must not enter the release commit.

```bash
git add package.json package-lock.json CHANGELOG.md <changed-source-files>
git commit -F - <<'EOF'
release: vX.Y.Z — <one-line summary of the change>

<optional short body explaining the why>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

(Use your standard model co-author trailer if your harness specifies one.)

**Do not commit the `.vsix`.** Old releases committed `.vsix` files to the repo — that practice is retired; the artifact lives on the registries, not in git. Then re-check `git status --short`: only your intended files should be committed.

### 7. Tag the release

```bash
git tag -a vX.Y.Z -m "release: vX.Y.Z — <same summary>"
```

Annotated (`-a`) tags carry a message and author — the project uses these (`v1.0.0`…), not lightweight tags.

### 8. Publish the one artifact to both registries

Publish the `.vsix` you already built in step 4 to each registry:

```bash
vsce publish --packagePath claude-context-X.Y.Z.vsix   # VS Code Marketplace
ovsx publish  claude-context-X.Y.Z.vsix -p <token>     # Open VSX (or set OVSX_PAT and drop -p)
```

Report the version and both listing URLs. The extension appears live within a few minutes on both.

**"Already published" on Open VSX is a success, not a failure.** Neither registry can overwrite an existing version, so a duplicate error means that version is already live — verify and move on:

```bash
curl -s https://open-vsx.org/api/lntvan166/claude-context | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```

### 9. Push commit and tag to GitHub

```bash
git push origin main
git push origin vX.Y.Z
```

### 10. (Optional) GitHub Release

This project's flow is tags-only, so skip this unless the user asks for a GitHub Release. If they do:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<paste the CHANGELOG section>"
```

## After publishing

- Confirm the published version on **both** registries and link them:
  - Marketplace: `https://marketplace.visualstudio.com/items?itemName=lntvan166.claude-context`
  - Open VSX: `https://open-vsx.org/extension/lntvan166/claude-context`
- **Delete the local `.vsix`** once both publishes are done (`rm claude-context-X.Y.Z.vsix`) — it's a build artifact, not something to commit.

## What NOT to do

- Don't publish on failing typecheck, tests, or bundle.
- Don't `git add -A` / `git add .` — you'll sweep in untracked strays or the `.vsix`.
- Don't commit `.vsix` files — the artifact belongs on the registries, not in git.
- Don't hardcode the Open VSX token into this skill, a script, or any committed file — it's a secret; pass it at publish time or via `OVSX_PAT`.
- Don't treat an Open VSX "already published" error as a failure — the version is live; verify via the API and move on.
- Don't let `vsce` and `ovsx` each build their own package — package once (step 4) and publish that one `.vsix` to both, so the registries stay byte-identical.
- Don't use plain `npm run package` for the release artifact — its README image URLs are relative and render broken on the registry listings; use `package:marketplace`.
- Don't create a GitHub Release unless the user asks — this project's flow is tags-only (step 10 covers it if they want one).
- Don't skip the confirmation pause. Neither registry has an undo.
