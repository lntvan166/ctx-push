// src/test/contextBuffer.test.ts
import { ContextBuffer } from '../contextBuffer';

describe('ContextBuffer', () => {
  let buffer: ContextBuffer;

  beforeEach(() => { buffer = new ContextBuffer(); });
  afterEach(() => { buffer.dispose(); });

  describe('replace', () => {
    it('sets buffer to a single ref', () => {
      buffer.replace('@src/auth.ts');
      expect(buffer.count).toBe(1);
      expect(buffer.getContents()).toBe('@src/auth.ts');
    });

    it('clears previous refs when replacing', () => {
      buffer.replace('@src/a.ts');
      buffer.replace('@src/b.ts');
      expect(buffer.count).toBe(1);
      expect(buffer.getContents()).toBe('@src/b.ts');
    });
  });

  describe('append', () => {
    it('adds a ref to the existing buffer', () => {
      buffer.replace('@src/a.ts');
      buffer.append('@src/b.ts');
      expect(buffer.count).toBe(2);
      expect(buffer.getContents()).toBe('@src/a.ts @src/b.ts');
    });
  });

  describe('appendMany', () => {
    it('adds multiple refs at once', () => {
      buffer.appendMany(['@src/a.ts', '@src/b.ts', '@src/c.ts']);
      expect(buffer.count).toBe(3);
      expect(buffer.getContents()).toBe('@src/a.ts @src/b.ts @src/c.ts');
    });
  });

  describe('clear', () => {
    it('empties the buffer', () => {
      buffer.replace('@src/a.ts');
      buffer.clear();
      expect(buffer.count).toBe(0);
      expect(buffer.getContents()).toBe('');
    });
  });

  describe('onChange', () => {
    it('fires with count=1 after replace', () => {
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.replace('@src/a.ts');
      expect(counts).toEqual([1]);
    });

    it('fires incrementally after each append', () => {
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.append('@src/a.ts');
      buffer.append('@src/b.ts');
      expect(counts).toEqual([1, 2]);
    });

    it('fires with 0 after clear', () => {
      const counts: number[] = [];
      buffer.replace('@src/a.ts');
      buffer.onChange(c => counts.push(c));
      buffer.clear();
      expect(counts).toEqual([0]);
    });

    it('fires exactly once after appendMany', () => {
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.appendMany(['@a', '@b', '@c']);
      expect(counts).toEqual([3]);
    });
  });

  describe('removeAt', () => {
    it('removes the ref at the given index and fires onChange with the new count', () => {
      const buffer = new ContextBuffer();
      buffer.appendMany(['@a.ts', '@b.ts', '@c.ts']);
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.removeAt(1);
      expect(buffer.getContents()).toBe('@a.ts @c.ts');
      expect(counts).toEqual([2]);
    });

    it('removes the first and last refs correctly', () => {
      const buffer = new ContextBuffer();
      buffer.appendMany(['@a.ts', '@b.ts', '@c.ts']);
      buffer.removeAt(0);
      buffer.removeAt(1);
      expect(buffer.getContents()).toBe('@b.ts');
    });

    it('ignores an out-of-range index and fires no event', () => {
      const buffer = new ContextBuffer();
      buffer.append('@a.ts');
      const counts: number[] = [];
      buffer.onChange(c => counts.push(c));
      buffer.removeAt(5);
      buffer.removeAt(-1);
      expect(buffer.getContents()).toBe('@a.ts');
      expect(counts).toEqual([]);
    });
  });

  describe('getRefs', () => {
    it('returns the refs in order', () => {
      const buffer = new ContextBuffer();
      buffer.appendMany(['@a.ts', '@b.ts']);
      expect(buffer.getRefs()).toEqual(['@a.ts', '@b.ts']);
    });

    it('returns a defensive copy', () => {
      const buffer = new ContextBuffer();
      buffer.append('@a.ts');
      const refs = buffer.getRefs() as string[];
      refs.push('@evil.ts');
      expect(buffer.getRefs()).toEqual(['@a.ts']);
    });
  });
});
