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
});
