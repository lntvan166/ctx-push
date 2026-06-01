export class History {
  private readonly MAX = 20;
  private items: string[] = [];

  add(ref: string): void {
    this.items = [ref, ...this.items.filter(r => r !== ref)].slice(0, this.MAX);
  }

  getAll(): string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
