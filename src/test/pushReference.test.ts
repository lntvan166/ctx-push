import * as vscode from 'vscode';
import { pushReference, pushManyReferences, syncClipboard } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { Config } from '../config';
import { IdeBridge } from '../ideBridge';
import { Ref } from '../ref';

const writeText = vscode.env.clipboard.writeText as jest.Mock;
const withProgress = vscode.window.withProgress as jest.Mock;

const config: Config = { pathStyle: 'relative', showNotifications: true, directPush: true };

// A fake bridge: only the members pushReference touches (pushRef/pushRefs/registry)
function fakeBridge(sessionCount: number, everConnected = sessionCount > 0): { bridge: IdeBridge; pushed: Ref[] } {
  const pushed: Ref[] = [];
  const bridge = {
    registry: { count: sessionCount, everConnected },
    pushRef: (ref: Ref) => { if (sessionCount === 0) return false; pushed.push(ref); return true; },
    pushRefs: (refs: Ref[]) => {
      if (sessionCount === 0 || refs.length === 0) return false;
      pushed.push(...refs);
      return true;
    },
  } as unknown as IdeBridge;
  return { bridge, pushed };
}

let buffer: ContextBuffer;
let history: History;

beforeEach(() => {
  jest.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  buffer = new ContextBuffer();
  history = new History();
});

describe('pushReference', () => {
  it('records history only after a successful clipboard write', async () => {
    await pushReference('@a.ts', config, buffer, history, 'replace');
    expect(history.getAll().map(e => e.label)).toEqual(['@a.ts']);
  });

  it('does not record history when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await pushReference('@a.ts', config, buffer, history, 'replace');
    expect(history.getAll()).toEqual([]);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('reports the number of other refs in the buffer in the toast', async () => {
    await pushReference('@a.ts', config, buffer, history, 'replace');
    await pushReference('@b.ts', config, buffer, history, 'append');
    expect(withProgress.mock.calls[1][0].title).toBe('Copied: @b.ts (+1 more)');
  });

  it('stores the structured ref in history', async () => {
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' } });
    expect(history.getAll()[0].ref).toEqual({ fsPath: '/abs/a.ts' });
  });

  it('pushes the ref to the bridge and titles the toast Pushed', async () => {
    const { bridge, pushed } = fakeBridge(1);
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' }, bridge });
    expect(pushed).toEqual([{ fsPath: '/abs/a.ts' }]);
    expect(withProgress.mock.calls[0][0].title).toBe('Pushed: @a.ts');
  });

  it('reports no-session when a previously connected session has gone away', async () => {
    const { bridge, pushed } = fakeBridge(0, true);
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' }, bridge });
    expect(pushed).toEqual([]);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied (no session): @a.ts');
  });

  it('does not nag clipboard-only users: plain Copied when no session has ever connected', async () => {
    const { bridge, pushed } = fakeBridge(0, false);
    await pushReference('@a.ts', config, buffer, history, 'replace', { ref: { fsPath: '/abs/a.ts' }, bridge });
    expect(pushed).toEqual([]);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: @a.ts');
  });

  it('does not attempt a push without a structured ref (history entries from pre-1.4)', async () => {
    const { bridge, pushed } = fakeBridge(1);
    await pushReference('@a.ts', config, buffer, history, 'replace', { bridge });
    expect(pushed).toEqual([]);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: @a.ts');
  });
});

describe('pushManyReferences', () => {
  it('does not count the added files as "more" in the toast', async () => {
    await pushManyReferences([{ label: '@a.ts' }, { label: '@b.ts' }, { label: '@c.ts' }], config, buffer, history);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: 3 files');
  });

  it('counts pre-existing buffer refs as "more"', async () => {
    await pushReference('@z.ts', config, buffer, history, 'replace');
    await pushManyReferences([{ label: '@a.ts' }, { label: '@b.ts' }], config, buffer, history);
    expect(withProgress.mock.calls[1][0].title).toBe('Copied: 2 files (+1 more)');
  });

  it('does not record history when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await pushManyReferences([{ label: '@a.ts' }, { label: '@b.ts' }], config, buffer, history);
    expect(history.getAll()).toEqual([]);
  });

  it('pushes all structured refs and titles the toast Pushed', async () => {
    const { bridge, pushed } = fakeBridge(1);
    await pushManyReferences(
      [{ label: '@a.ts', ref: { fsPath: '/a.ts' } }, { label: '@b.ts', ref: { fsPath: '/b.ts' } }],
      config, buffer, history, bridge
    );
    expect(pushed).toEqual([{ fsPath: '/a.ts' }, { fsPath: '/b.ts' }]);
    expect(withProgress.mock.calls[0][0].title).toBe('Pushed: 2 files');
  });
});

describe('syncClipboard', () => {
  it('writes the buffer contents with a trailing space', async () => {
    buffer.appendMany(['@a.ts', '@b.ts']);
    writeText.mockClear();
    await syncClipboard(buffer);
    expect(writeText).toHaveBeenCalledWith('@a.ts @b.ts ');
  });

  it('writes an empty string exactly when the buffer is empty', async () => {
    await syncClipboard(buffer);
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('reports failures via the error toast and does not throw', async () => {
    buffer.append('@a.ts');
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await expect(syncClipboard(buffer)).resolves.toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });
});
