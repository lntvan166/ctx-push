import * as childProcess from 'child_process';
import { sendToTmux, TmuxNotFoundError, SessionNotFoundError } from '../tmux';

jest.mock('child_process');

const mockExecFile = childProcess.execFile as jest.MockedFunction<typeof childProcess.execFile>;

function mockSuccess(): void {
  mockExecFile.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1];
    cb(null, '', '');
    return {} as any;
  });
}

function mockError(err: Partial<NodeJS.ErrnoException>): void {
  mockExecFile.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1];
    cb(Object.assign(new Error(err.message ?? ''), err), '', err.message ?? '');
    return {} as any;
  });
}

beforeEach(() => jest.clearAllMocks());

describe('sendToTmux', () => {
  it('calls tmux send-keys with session name and text plus trailing space', async () => {
    mockSuccess();
    await sendToTmux('claude', '@src/auth.ts:11-14');
    expect(mockExecFile).toHaveBeenCalledWith(
      'tmux',
      ['send-keys', '-t', 'claude', '@src/auth.ts:11-14 '],
      expect.any(Function)
    );
  });

  it('throws TmuxNotFoundError when tmux binary is missing', async () => {
    mockError({ code: 'ENOENT', message: 'tmux not found' });
    await expect(sendToTmux('claude', '@src/auth.ts')).rejects.toBeInstanceOf(TmuxNotFoundError);
  });

  it("throws SessionNotFoundError when session doesn't exist", async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      const err = Object.assign(new Error("can't find session: claude"), { stderr: "can't find session: claude" });
      cb(err, '', "can't find session: claude");
      return {} as any;
    });
    const error = await sendToTmux('claude', '@src/auth.ts').catch((e) => e);
    expect(error).toBeInstanceOf(SessionNotFoundError);
    expect((error as SessionNotFoundError).session).toBe('claude');
  });

  it('re-throws unknown errors', async () => {
    mockError({ message: 'some unexpected error' });
    await expect(sendToTmux('claude', '@src/auth.ts')).rejects.toThrow('some unexpected error');
  });
});
