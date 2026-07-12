import { randomUUID } from 'crypto';
import { Ref } from '../ref';
import { SessionRegistry } from './sessions';
import { startIdeServer, IdeServer } from './server';
import { atMentioned } from './protocol';
import {
  LockfileData, defaultIdeDir, writeLockfile, removeLockfile,
  cleanStaleLockfiles, isPidAlive,
} from './lockfile';

export const IDE_NAME = 'ctx-push';

// Handlers receive a getter, not the instance — the bridge starts async
// after activate() and may be undefined (directPush off / startup failure).
export type BridgeProvider = () => IdeBridge | undefined;

export interface IdeBridgeOptions {
  workspaceFolders: string[];
  version: string;
  ideDir?: string;      // test override; default ~/.claude/ide
  lockfilePid?: number; // test override; default process.ppid (IDE main process)
  log?: (msg: string) => void;
}

export class IdeBridge {
  private constructor(
    readonly registry: SessionRegistry,
    private readonly server: IdeServer,
    private readonly dir: string,
    private readonly baseLockfile: Omit<LockfileData, 'workspaceFolders'>,
    private readonly log?: (msg: string) => void
  ) {}

  // Never throws — a failed bridge means clipboard-only, not a broken extension.
  static async start(opts: IdeBridgeOptions): Promise<IdeBridge | undefined> {
    try {
      const dir = opts.ideDir ?? defaultIdeDir();
      cleanStaleLockfiles(dir, IDE_NAME, isPidAlive);
      const registry = new SessionRegistry();
      const authToken = randomUUID();
      const server = await startIdeServer({
        authToken,
        serverName: IDE_NAME,
        serverVersion: opts.version,
        registry,
        log: opts.log,
      });
      const baseLockfile: Omit<LockfileData, 'workspaceFolders'> = {
        pid: opts.lockfilePid ?? process.ppid,
        ideName: IDE_NAME,
        transport: 'ws',
        runningInWindows: process.platform === 'win32',
        authToken,
      };
      try {
        writeLockfile(dir, server.port, { ...baseLockfile, workspaceFolders: opts.workspaceFolders });
      } catch (err) {
        await server.close();
        throw err;
      }
      opts.log?.(`IDE bridge listening on 127.0.0.1:${server.port} — connect with /ide → ${IDE_NAME}`);
      return new IdeBridge(registry, server, dir, baseLockfile, opts.log);
    } catch (err) {
      opts.log?.(`direct push disabled: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  get port(): number {
    return this.server.port;
  }

  pushRef(ref: Ref): boolean {
    const target = this.registry.target;
    if (!target) return false;
    try {
      target.client.send(atMentioned(ref));
      return true;
    } catch (err) {
      this.log?.(`push failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  pushRefs(refs: Ref[]): boolean {
    if (refs.length === 0) return false;
    return refs.map(r => this.pushRef(r)).every(ok => ok);
  }

  updateWorkspaceFolders(folders: string[]): void {
    try {
      writeLockfile(this.dir, this.server.port, { ...this.baseLockfile, workspaceFolders: folders });
    } catch (err) {
      this.log?.(`lockfile update failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async dispose(): Promise<void> {
    removeLockfile(this.dir, this.server.port);
    await this.server.close();
  }
}
