import { History } from '../history';

describe('History', () => {
  let history: History;

  beforeEach(() => { history = new History(); });

  it('starts empty', () => {
    expect(history.getAll()).toEqual([]);
  });

  it('returns items newest first', () => {
    history.add('@src/a.ts');
    history.add('@src/b.ts');
    expect(history.getAll()).toEqual(['@src/b.ts', '@src/a.ts']);
  });

  it('deduplicates by moving existing item to top', () => {
    history.add('@src/a.ts');
    history.add('@src/b.ts');
    history.add('@src/a.ts');
    expect(history.getAll()).toEqual(['@src/a.ts', '@src/b.ts']);
  });

  it('caps at 20 items', () => {
    for (let i = 0; i < 25; i++) {
      history.add(`@src/file${i}.ts`);
    }
    expect(history.getAll().length).toBe(20);
  });

  it('clear empties the history', () => {
    history.add('@src/a.ts');
    history.clear();
    expect(history.getAll()).toEqual([]);
  });

  it('getAll returns a copy, not the internal array', () => {
    history.add('@src/a.ts');
    const result = history.getAll();
    result.push('tampered');
    expect(history.getAll()).toEqual(['@src/a.ts']);
  });

  describe('hydration', () => {
    it('accepts initial items via the constructor', () => {
      const h = new History(['@a.ts', '@b.ts']);
      expect(h.getAll()).toEqual(['@a.ts', '@b.ts']);
    });

    it('dedupes and caps initial items at 20', () => {
      const initial = Array.from({ length: 25 }, (_, i) => `@f${i}.ts`);
      initial[1] = '@f0.ts'; // duplicate
      const h = new History(initial);
      const all = h.getAll();
      expect(all.length).toBe(20);
      expect(all[0]).toBe('@f0.ts');
      expect(new Set(all).size).toBe(20);
    });
  });

  describe('onDidChange', () => {
    it('fires with the current items after add', () => {
      const h = new History();
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items);
      h.add('@a.ts');
      h.add('@b.ts');
      expect(seen).toEqual([['@a.ts'], ['@b.ts', '@a.ts']]);
    });

    it('fires on duplicate add (order changes)', () => {
      const h = new History(['@a.ts', '@b.ts']);
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items);
      h.add('@b.ts');
      expect(seen).toEqual([['@b.ts', '@a.ts']]);
    });

    it('fires with an empty array on clear', () => {
      const h = new History(['@a.ts']);
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items);
      h.clear();
      expect(seen).toEqual([[]]);
    });
  });
});
