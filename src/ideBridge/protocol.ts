import { Ref } from '../ref';

// Pure JSON-RPC/MCP message handling for the IDE bridge. The protocol is
// unofficial (reverse-engineered from the official extension) — be lenient:
// never throw on unknown or malformed input.
export type Inbound =
  | { kind: 'reply'; json: string }
  | { kind: 'ide_connected'; pid: number }
  | { kind: 'ignore' };

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function handleInbound(raw: string, serverName: string, serverVersion: string): Inbound {
  let msg: JsonRpcMessage;
  try {
    msg = JSON.parse(raw) as JsonRpcMessage;
  } catch {
    return { kind: 'ignore' };
  }
  if (typeof msg !== 'object' || msg === null || typeof msg.method !== 'string') {
    return { kind: 'ignore' };
  }
  if (msg.id === undefined || msg.id === null) {
    // Notification — only ide_connected carries information we need
    if (msg.method === 'ide_connected' && typeof msg.params?.pid === 'number') {
      return { kind: 'ide_connected', pid: msg.params.pid };
    }
    return { kind: 'ignore' };
  }
  switch (msg.method) {
    case 'initialize': {
      const requested = typeof msg.params?.protocolVersion === 'string'
        ? msg.params.protocolVersion
        : '2025-03-26';
      return {
        kind: 'reply',
        json: JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: requested,
            capabilities: { tools: {} },
            serverInfo: { name: serverName, version: serverVersion },
          },
        }),
      };
    }
    case 'tools/list':
      return {
        kind: 'reply',
        json: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } }),
      };
    default:
      return {
        kind: 'reply',
        json: JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        }),
      };
  }
}

export function atMentioned(ref: Ref): string {
  const params: { filePath: string; lineStart?: number; lineEnd?: number } = { filePath: ref.fsPath };
  if (ref.lineStart !== undefined) params.lineStart = ref.lineStart;
  if (ref.lineEnd !== undefined) params.lineEnd = ref.lineEnd;
  return JSON.stringify({ jsonrpc: '2.0', method: 'at_mentioned', params });
}
