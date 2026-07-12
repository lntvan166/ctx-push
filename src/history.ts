import { Ref } from './ref';

export interface HistoryEntry {
  label: string; // the formatted @ref string shown in QuickPicks
  ref?: Ref;     // structured ref for direct push; absent on pre-1.4 entries
}

export class History {
  private readonly MAX = 20;
  private items: HistoryEntry[] = [];
  onDidChange?: (items: HistoryEntry[]) => void;

  constructor(initial?: HistoryEntry[]) {
    if (!initial) return;
    const seen = new Set<string>();
    for (const entry of initial) {
      if (this.items.length >= this.MAX) break;
      if (seen.has(entry.label)) continue;
      seen.add(entry.label);
      this.items.push({ label: entry.label, ref: entry.ref });
    }
  }

  add(label: string, ref?: Ref): void {
    this.items = [{ label, ref }, ...this.items.filter(e => e.label !== label)].slice(0, this.MAX);
    this.onDidChange?.(this.getAll());
  }

  getAll(): HistoryEntry[] {
    return this.items.map(e => ({ ...e }));
  }

  clear(): void {
    this.items = [];
    this.onDidChange?.([]);
  }
}
