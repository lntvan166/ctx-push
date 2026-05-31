import { resolvePath, formatSelection, formatPath } from '../pathResolver';

describe('resolvePath', () => {
  it('strips workspace root for relative style', () => {
    const result = resolvePath('/home/user/project/src/auth.ts', '/home/user/project', 'relative');
    expect(result).toBe('src/auth.ts');
  });

  it('returns absolute path when pathStyle is absolute', () => {
    const result = resolvePath('/home/user/project/src/auth.ts', '/home/user/project', 'absolute');
    expect(result).toBe('/home/user/project/src/auth.ts');
  });

  it('falls back to absolute when workspaceRoot is undefined', () => {
    const result = resolvePath('/home/user/project/src/auth.ts', undefined, 'relative');
    expect(result).toBe('/home/user/project/src/auth.ts');
  });

  it('falls back to absolute when path does not start with workspace root', () => {
    const result = resolvePath('/other/src/auth.ts', '/home/user/project', 'relative');
    expect(result).toBe('/other/src/auth.ts');
  });
});

describe('formatSelection', () => {
  it('formats a selection reference with 1-based line numbers', () => {
    expect(formatSelection('src/auth.ts', 11, 14)).toBe('@src/auth.ts:11-14');
  });

  it('formats a single-line selection', () => {
    expect(formatSelection('src/auth.ts', 5, 5)).toBe('@src/auth.ts:5-5');
  });
});

describe('formatPath', () => {
  it('adds @ prefix to a relative path', () => {
    expect(formatPath('src/auth.ts')).toBe('@src/auth.ts');
  });

  it('adds @ prefix to an absolute path', () => {
    expect(formatPath('/home/user/project/src/auth.ts')).toBe('@/home/user/project/src/auth.ts');
  });
});
