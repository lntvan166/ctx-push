// Automated smoke gate for the direct-push feature (replaces the manual F5 pass
// for the bridge-side checks). Drives the REAL Claude Code CLI against the real
// IdeBridge code:
//   src/ideBridge bundled standalone -> lockfile in ~/.claude/ide ->
//   claude CLI auto-connects via CLAUDE_CODE_SSE_PORT -> at_mentioned pushes ->
//   assert the @refs render in the CLI's prompt (PTY capture).
// No prompt is ever submitted (zero token cost). Cleans up after itself.
//
// Run from the repo root:  npm run smoke
// Requires: `claude` on PATH, python3, and the repo to be a trusted folder.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = process.cwd();
const HERE = dirname(fileURLToPath(import.meta.url));
const IDE_DIR = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'ide');

// Bundle the real bridge code standalone (src/ideBridge is vscode-free by design)
const buildDir = mkdtempSync(join(tmpdir(), 'ctx-push-gate-'));
execFileSync('npx', [
  'esbuild', join(REPO, 'src/ideBridge/index.ts'),
  '--bundle', '--platform=node', '--format=cjs',
  '--external:bufferutil', '--external:utf-8-validate',
  `--outfile=${join(buildDir, 'bridge.cjs')}`,
], { stdio: 'pipe' });
const { IdeBridge } = createRequire(import.meta.url)(join(buildDir, 'bridge.cjs'));

const results = [];
const check = (name, ok, detail = '') =>
  results.push({ name, ok }) && console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const stripAnsi = s => s
  .split(new RegExp(ESC + '\\[[0-9;?]*[a-zA-Z]', 'g')).join('')
  .split(new RegExp(ESC + '\\][^' + BEL + ESC + ']*(?:' + BEL + '|' + ESC + '\\\\)', 'g')).join('')
  .split(new RegExp(ESC + '[()][A-Z0-9]', 'g')).join('')
  .split(new RegExp(ESC + '[<>=]', 'g')).join('')
  .split(ESC).join('')
  .split('\r').join('\n');

const sleep = ms => new Promise(r => setTimeout(r, ms));

let child;
let bridge;
let captured = '';

async function main() {
  bridge = await IdeBridge.start({
    workspaceFolders: [REPO],
    version: 'smoke-gate',
    log: m => console.log(`  [bridge] ${m}`),
  });
  if (!bridge) throw new Error('bridge failed to start');
  check('lockfile written to <config>/ide/<port>.lock', existsSync(join(IDE_DIR, `${bridge.port}.lock`)));

  child = spawn('python3', [join(HERE, 'ptydriver.py'), 'claude'], {
    cwd: REPO,
    env: {
      ...process.env,
      CLAUDE_CODE_SSE_PORT: String(bridge.port),
      TERM_PROGRAM: 'gate-test',
      TERM: 'xterm-256color',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => {
    captured += d.toString();
    if (/trust the files|Yes, proceed/i.test(stripAnsi(d.toString())) && !main.trusted) {
      main.trusted = true;
      child.stdin.write('\r');
    }
  });
  child.stderr.on('data', d => { captured += d.toString(); });

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && bridge.registry.count === 0) await sleep(250);
  const session = bridge.registry.getAll()[0];
  check('claude CLI connected to Claude Context server', bridge.registry.count === 1,
    session ? `session pid=${session.pid ?? 'pending'}` : 'no connection within 45s');
  if (bridge.registry.count === 0) return;
  await sleep(2500);

  // at_mentioned lines are 0-BASED (CLI adds 1 for #L display):
  // display range 10-20 -> protocol 9-19, matching src/commands/addSelection.ts
  bridge.pushRef({ fsPath: join(REPO, 'src/extension.ts'), lineStart: 9, lineEnd: 19 });
  await sleep(1200);
  bridge.pushRef({ fsPath: join(REPO, 'src/clipboard.ts') });
  await sleep(1200);
  bridge.pushRef({ fsPath: join(REPO, 'src') }); // folder
  await sleep(2500);

  const text = stripAnsi(captured);
  check('ranged push renders as @src/extension.ts#L10-20 (display 1-based)', text.includes('@src/extension.ts#L10-20'));
  check('plain file ref renders as @src/clipboard.ts', text.includes('@src/clipboard.ts'));
  const folderText = text.split('@src/extension').join('').split('@src/clipboard').join('');
  check('folder ref renders as @src', /@src(?![\w/.])/.test(folderText));
  check('no off-by-one drift (#L9-19 / #L11-21 absent)', !text.includes('#L9-19') && !text.includes('#L11-21'));
}

async function teardown() {
  try { if (child && !child.killed) { child.stdin.write('\x03'); await sleep(300); child.stdin.write('\x03'); await sleep(500); child.kill('SIGKILL'); } } catch { /* already gone */ }
  const port = bridge?.port;
  try { await bridge?.dispose(); } catch { /* best effort */ }
  if (port) check('lockfile removed on dispose', !existsSync(join(IDE_DIR, `${port}.lock`)));
  rmSync(buildDir, { recursive: true, force: true });
}

main()
  .catch(e => { console.error('GATE ERROR:', e.message); results.push({ name: 'gate ran to completion', ok: false }); })
  .finally(async () => {
    await teardown();
    const failed = results.filter(r => !r.ok);
    console.log(`\n=== GATE ${failed.length === 0 ? 'PASSED' : 'FAILED'} (${results.length - failed.length}/${results.length}) ===`);
    if (failed.length) {
      console.log('\n--- last 2000 chars of CLI output (ANSI-stripped) ---');
      console.log(stripAnsi(captured).slice(-2000));
    }
    process.exit(failed.length === 0 ? 0 : 1);
  });
