import * as vscode from 'vscode';
import { pushReference, pushManyReferences } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { Config } from '../config';

const writeText = vscode.env.clipboard.writeText as jest.Mock;
const withProgress = vscode.window.withProgress as jest.Mock;

const config: Config = { pathStyle: 'relative', showNotifications: true };

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
    expect(history.getAll()).toEqual(['@a.ts']);
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
});

describe('pushManyReferences', () => {
  it('does not count the added files as "more" in the toast', async () => {
    await pushManyReferences(['@a.ts', '@b.ts', '@c.ts'], config, buffer, history);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: 3 files');
  });

  it('counts pre-existing buffer refs as "more"', async () => {
    await pushReference('@z.ts', config, buffer, history, 'replace');
    await pushManyReferences(['@a.ts', '@b.ts'], config, buffer, history);
    expect(withProgress.mock.calls[1][0].title).toBe('Copied: 2 files (+1 more)');
  });

  it('does not record history when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await pushManyReferences(['@a.ts', '@b.ts'], config, buffer, history);
    expect(history.getAll()).toEqual([]);
  });
});
