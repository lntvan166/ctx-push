import * as vscode from 'vscode';
import { showClipboardSuccess } from '../notify';

const withProgress = vscode.window.withProgress as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('showClipboardSuccess', () => {
  it('shows the plain reference when it is the only ref in the buffer', () => {
    showClipboardSuccess('@src/auth.ts', 0, true);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: @src/auth.ts');
  });

  it('appends the count of other refs already in the buffer', () => {
    showClipboardSuccess('@src/auth.ts', 2, true);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: @src/auth.ts (+2 more)');
  });

  it('does not add a suffix for a multi-file add into an empty buffer', () => {
    showClipboardSuccess('3 files', 0, true);
    expect(withProgress.mock.calls[0][0].title).toBe('Copied: 3 files');
  });

  it('shows nothing when notifications are disabled', () => {
    showClipboardSuccess('@src/auth.ts', 0, false);
    expect(withProgress).not.toHaveBeenCalled();
  });
});
