import * as vscode from 'vscode';
import { copyReference } from '../clipboard';

const mockWriteText = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  (vscode.env as any).clipboard = { writeText: mockWriteText };
});

describe('copyReference', () => {
  it('writes reference plus trailing space to the clipboard', async () => {
    await copyReference('@src/auth.ts:11-14');
    expect(mockWriteText).toHaveBeenCalledWith('@src/auth.ts:11-14 ');
  });

  it('propagates clipboard write failures', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('clipboard denied'));
    await expect(copyReference('@src/auth.ts')).rejects.toThrow('clipboard denied');
  });
});
