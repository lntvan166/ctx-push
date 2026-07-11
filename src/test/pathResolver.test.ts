import { resolvePath, formatSelection, formatPath, selectionLineRange } from '../pathResolver';

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

  it('does not treat a sibling folder sharing the root prefix as inside the workspace', () => {
    const result = resolvePath('/home/user/project-api/src/auth.ts', '/home/user/project', 'relative');
    expect(result).toBe('/home/user/project-api/src/auth.ts');
  });

  it('strips a Windows workspace root and normalizes separators to forward slashes', () => {
    const result = resolvePath('C:\\Users\\me\\project\\src\\auth.ts', 'C:\\Users\\me\\project', 'relative');
    expect(result).toBe('src/auth.ts');
  });

  it('returns a Windows path unchanged when outside the workspace', () => {
    const result = resolvePath('D:\\other\\auth.ts', 'C:\\Users\\me\\project', 'relative');
    expect(result).toBe('D:\\other\\auth.ts');
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

  it('escapes spaces so the ref survives whitespace tokenization', () => {
    expect(formatPath('My Folder/some file.ts')).toBe('@My\\ Folder/some\\ file.ts');
  });
});

describe('formatSelection with spaces', () => {
  it('escapes spaces in selection refs', () => {
    expect(formatSelection('My Folder/file.ts', 3, 7)).toBe('@My\\ Folder/file.ts:3-7');
  });
});

describe('selectionLineRange', () => {
  it('converts 0-based selection lines to a 1-based inclusive range', () => {
    expect(selectionLineRange(10, 12, 5)).toEqual({ start: 11, end: 13 });
  });

  it('excludes the trailing line when a full-line selection ends at column 0', () => {
    // Shift+Down over lines 10-12 leaves the cursor at line 12 (0-based), column 0
    expect(selectionLineRange(9, 12, 0)).toEqual({ start: 10, end: 12 });
  });

  it('keeps a single-line selection at column 0 as one line', () => {
    expect(selectionLineRange(4, 4, 0)).toEqual({ start: 5, end: 5 });
  });
});
