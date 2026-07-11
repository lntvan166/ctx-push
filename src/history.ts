export class History {
  private readonly MAX = 20;
  private items: string[] = [];
  onDidChange?: (items: string[]) => void;

  constructor(initial?: string[]) {
    if (initial) {
      this.items = [...new Set(initial)].slice(0, this.MAX);
    }
  }

  add(ref: string): void {
    this.items = [ref, ...this.items.filter(r => r !== ref)].slice(0, this.MAX);
    this.onDidChange?.(this.getAll());
  }

  getAll(): string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
    this.onDidChange?.([]);
  }
}
