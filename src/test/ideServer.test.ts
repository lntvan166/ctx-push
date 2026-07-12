import { WebSocket } from 'ws';
import { startIdeServer, IdeServer } from '../ideBridge/server';
import { SessionRegistry } from '../ideBridge/sessions';

const TOKEN = 'secret-token';

function connect(port: number, token?: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}`, ['mcp'], {
    headers: token ? { 'x-claude-code-ide-authorization': token } : {},
  });
}

function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

function onceOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

let server: IdeServer;
let registry: SessionRegistry;
let sockets: WebSocket[];

beforeEach(async () => {
  registry = new SessionRegistry();
  sockets = [];
  server = await startIdeServer({
    authToken: TOKEN, serverName: 'ctx-push', serverVersion: '0.0.0', registry, port: 0,
  });
});

afterEach(async () => {
  for (const s of sockets) s.terminate();
  await server.close();
});

function client(token?: string): WebSocket {
  const ws = connect(server.port, token);
  sockets.push(ws);
  return ws;
}

describe('startIdeServer', () => {
  it('reports the actually bound port', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('registers an authorized client as a session', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
  });

  it('rejects a client with a bad token with close code 1008', async () => {
    const ws = client('wrong');
    const code = await new Promise<number>(resolve => ws.once('close', c => resolve(c)));
    expect(code).toBe(1008);
    expect(registry.count).toBe(0);
  });

  it('answers the MCP initialize handshake', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    const reply = new Promise<string>(resolve => ws.once('message', d => resolve(String(d))));
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }));
    const parsed = JSON.parse(await reply);
    expect(parsed.result.serverInfo.name).toBe('ctx-push');
  });

  it('attaches the pid from ide_connected to the session', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ide_connected', params: { pid: 4242 } }));
    await waitFor(() => registry.getAll()[0].pid === 4242);
  });

  it('evicts the session when the client disconnects', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
    ws.close();
    await waitFor(() => registry.count === 0);
  });

  it('delivers data sent via the session client handle', async () => {
    const ws = client(TOKEN);
    await onceOpen(ws);
    await waitFor(() => registry.count === 1);
    const received = new Promise<string>(resolve => ws.once('message', d => resolve(String(d))));
    registry.getAll()[0].client.send('{"hello":true}');
    expect(await received).toBe('{"hello":true}');
  });
});
