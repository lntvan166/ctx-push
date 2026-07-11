import * as vscode from 'vscode';

export class ContextBuffer {
  private refs: string[] = [];
  private readonly _onChange = new vscode.EventEmitter<number>();
  readonly onChange = this._onChange.event;

  replace(ref: string): void {
    this.refs = [ref];
    this._onChange.fire(this.count);
  }

  append(ref: string): void {
    this.refs.push(ref);
    this._onChange.fire(this.count);
  }

  appendMany(refs: string[]): void {
    this.refs.push(...refs);
    this._onChange.fire(this.count);
  }

  removeAt(index: number): void {
    if (index < 0 || index >= this.refs.length) return;
    this.refs.splice(index, 1);
    this._onChange.fire(this.count);
  }

  getRefs(): readonly string[] {
    return [...this.refs];
  }

  clear(): void {
    this.refs = [];
    this._onChange.fire(0);
  }

  getContents(): string {
    return this.refs.join(' ');
  }

  get count(): number {
    return this.refs.length;
  }

  dispose(): void {
    this._onChange.dispose();
  }
}
