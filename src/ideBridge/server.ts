import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { handleInbound } from './protocol';
import { SessionRegistry } from './sessions';

export interface IdeServer {
  port: number;
  close(): Promise<void>;
}

export interface IdeServerOptions {
  authToken: string;
  serverName: string;
  serverVersion: string;
  registry: SessionRegistry;
  log?: (msg: string) => void;
  port?: number; // tests pass 0 (OS-assigned); production omits for random
}

// Same range the official extension uses
function randomPort(): number {
  return Math.floor(Math.random() * 55536) + 10000;
}

function listen(port: number): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port,
      // The CLI connects with subprotocol "mcp"
      handleProtocols: protocols => (protocols.has('mcp') ? 'mcp' : false),
    });
    wss.once('listening', () => resolve(wss));
    wss.once('error', reject);
  });
}

export async function startIdeServer(opts: IdeServerOptions): Promise<IdeServer> {
  let wss: WebSocketServer | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3 && !wss; attempt++) {
    const candidate = opts.port ?? randomPort();
    try {
      wss = await listen(candidate);
    } catch (err) {
      lastError = err;
      opts.log?.(`port ${candidate} unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!wss) {
    throw new Error(`could not bind a port after 3 attempts: ${String(lastError)}`);
  }
  const address = wss.address();
  const port = typeof address === 'object' && address !== null ? address.port : (opts.port ?? 0);

  wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
    if (req.headers['x-claude-code-ide-authorization'] !== opts.authToken) {
      opts.log?.('rejected client: bad auth token');
      socket.close(1008, 'Unauthorized');
      return;
    }
    const session = opts.registry.add({ send: data => socket.send(data) });
    opts.log?.(`Claude session ${session.id} connected`);
    socket.on('message', raw => {
      const inbound = handleInbound(String(raw), opts.serverName, opts.serverVersion);
      if (inbound.kind === 'reply') {
        socket.send(inbound.json);
      } else if (inbound.kind === 'ide_connected') {
        opts.registry.setPid(session.id, inbound.pid);
      }
    });
    socket.on('close', () => {
      opts.registry.remove(session.id);
      opts.log?.(`Claude session ${session.id} disconnected`);
    });
    socket.on('error', err => {
      opts.log?.(`session ${session.id} socket error: ${err.message}`);
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>(resolve => {
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => resolve());
      }),
  };
}
