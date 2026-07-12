import { History, HistoryEntry } from '../history';

describe('History', () => {
  let history: History;

  beforeEach(() => { history = new History(); });

  it('starts empty', () => {
    expect(history.getAll()).toEqual([]);
  });

  it('returns entries newest first, keeping the structured ref', () => {
    history.add('@src/a.ts', { fsPath: '/abs/src/a.ts' });
    history.add('@src/b.ts:1-5', { fsPath: '/abs/src/b.ts', lineStart: 1, lineEnd: 5 });
    expect(history.getAll()).toEqual([
      { label: '@src/b.ts:1-5', ref: { fsPath: '/abs/src/b.ts', lineStart: 1, lineEnd: 5 } },
      { label: '@src/a.ts', ref: { fsPath: '/abs/src/a.ts' } },
    ]);
  });

  it('supports entries without a ref (hydrated from the old string format)', () => {
    history.add('@src/a.ts');
    expect(history.getAll()).toEqual([{ label: '@src/a.ts', ref: undefined }]);
  });

  it('deduplicates by label, moving the entry to the top with the newest ref', () => {
    history.add('@src/a.ts');
    history.add('@src/b.ts');
    history.add('@src/a.ts', { fsPath: '/abs/src/a.ts' });
    expect(history.getAll().map(e => e.label)).toEqual(['@src/a.ts', '@src/b.ts']);
    expect(history.getAll()[0].ref).toEqual({ fsPath: '/abs/src/a.ts' });
  });

  it('caps at 20 entries', () => {
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

  it('getAll returns copies, not internal objects', () => {
    history.add('@src/a.ts', { fsPath: '/abs/a.ts' });
    const result = history.getAll();
    result.push({ label: 'tampered' });
    result[0].label = 'mutated';
    expect(history.getAll()).toEqual([{ label: '@src/a.ts', ref: { fsPath: '/abs/a.ts' } }]);
  });

  describe('hydration', () => {
    it('accepts initial entries via the constructor', () => {
      const h = new History([{ label: '@a.ts' }, { label: '@b.ts', ref: { fsPath: '/b.ts' } }]);
      expect(h.getAll().map(e => e.label)).toEqual(['@a.ts', '@b.ts']);
      expect(h.getAll()[1].ref).toEqual({ fsPath: '/b.ts' });
    });

    it('dedupes by label and caps initial entries at 20', () => {
      const initial: HistoryEntry[] = Array.from({ length: 25 }, (_, i) => ({ label: `@f${i}.ts` }));
      initial[1] = { label: '@f0.ts' }; // duplicate
      const h = new History(initial);
      const all = h.getAll();
      expect(all.length).toBe(20);
      expect(all[0].label).toBe('@f0.ts');
      expect(new Set(all.map(e => e.label)).size).toBe(20);
    });
  });

  describe('onDidChange', () => {
    it('fires with the current entries after add', () => {
      const h = new History();
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items.map(e => e.label));
      h.add('@a.ts');
      h.add('@b.ts');
      expect(seen).toEqual([['@a.ts'], ['@b.ts', '@a.ts']]);
    });

    it('fires on duplicate add (order changes)', () => {
      const h = new History([{ label: '@a.ts' }, { label: '@b.ts' }]);
      const seen: string[][] = [];
      h.onDidChange = items => seen.push(items.map(e => e.label));
      h.add('@b.ts');
      expect(seen).toEqual([['@b.ts', '@a.ts']]);
    });

    it('fires with an empty array on clear', () => {
      const h = new History([{ label: '@a.ts' }]);
      const seen: HistoryEntry[][] = [];
      h.onDidChange = items => seen.push(items);
      h.clear();
      expect(seen).toEqual([[]]);
    });
  });
});
