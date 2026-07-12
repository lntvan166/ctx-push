// Registry of connected Claude CLI clients. Target = manually chosen session
// (until it disconnects or a newer session connects) else most recent.
export interface SessionClient {
  send(data: string): void;
}

export interface Session {
  id: number;
  client: SessionClient;
  pid?: number;
  connectedAt: number; // epoch ms, display only
}

export class SessionRegistry {
  private sessions: Session[] = [];
  private nextId = 1;
  private manualTargetId?: number;
  onDidChange?: (sessions: readonly Session[]) => void;

  add(client: SessionClient, now: number = Date.now()): Session {
    const session: Session = { id: this.nextId++, client, connectedAt: now };
    this.sessions.push(session);
    this.manualTargetId = undefined; // newest connection becomes the target
    this.onDidChange?.(this.getAll());
    return session;
  }

  setPid(id: number, pid: number): void {
    const session = this.sessions.find(s => s.id === id);
    if (!session || session.pid === pid) return;
    session.pid = pid;
    this.onDidChange?.(this.getAll());
  }

  remove(id: number): void {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.manualTargetId === id) this.manualTargetId = undefined;
    if (this.sessions.length !== before) this.onDidChange?.(this.getAll());
  }

  setTarget(id: number): void {
    if (!this.sessions.some(s => s.id === id)) return;
    if (this.manualTargetId === id) return;
    this.manualTargetId = id;
    this.onDidChange?.(this.getAll());
  }

  get target(): Session | undefined {
    if (this.manualTargetId !== undefined) {
      const manual = this.sessions.find(s => s.id === this.manualTargetId);
      if (manual) return manual;
    }
    return this.sessions[this.sessions.length - 1];
  }

  getAll(): readonly Session[] {
    return [...this.sessions];
  }

  get count(): number {
    return this.sessions.length;
  }
}
