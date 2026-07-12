import { handleInbound, atMentioned } from '../ideBridge/protocol';

describe('handleInbound', () => {
  it('answers initialize with serverInfo and echoes the requested protocolVersion', () => {
    const raw = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.0' } },
    });
    const out = handleInbound(raw, 'ctx-push', '1.3.0');
    expect(out.kind).toBe('reply');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply).toEqual({
      jsonrpc: '2.0', id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'ctx-push', version: '1.3.0' },
      },
    });
  });

  it('defaults protocolVersion when the client omits it', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize' }), 'ctx-push', '1.3.0');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply.result.protocolVersion).toBe('2025-03-26');
  });

  it('answers tools/list with an empty tool set', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }), 'ctx-push', '1.3.0');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply).toEqual({ jsonrpc: '2.0', id: 3, result: { tools: [] } });
  });

  it('answers unknown requests with a method-not-found error (lenient, never throws)', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'resources/list' }), 'ctx-push', '1.3.0');
    const reply = JSON.parse((out as { kind: 'reply'; json: string }).json);
    expect(reply.error.code).toBe(-32601);
    expect(reply.id).toBe(4);
  });

  it('extracts the pid from an ide_connected notification', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', method: 'ide_connected', params: { pid: 4242 } }), 'ctx-push', '1.3.0');
    expect(out).toEqual({ kind: 'ide_connected', pid: 4242 });
  });

  it('ignores other notifications', () => {
    const out = handleInbound(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), 'ctx-push', '1.3.0');
    expect(out).toEqual({ kind: 'ignore' });
  });

  it('ignores malformed JSON', () => {
    expect(handleInbound('{nope', 'ctx-push', '1.3.0')).toEqual({ kind: 'ignore' });
  });

  it('ignores non-object payloads and messages without a method', () => {
    expect(handleInbound('42', 'ctx-push', '1.3.0')).toEqual({ kind: 'ignore' });
    expect(handleInbound(JSON.stringify({ jsonrpc: '2.0', id: 9 }), 'ctx-push', '1.3.0')).toEqual({ kind: 'ignore' });
  });
});

describe('atMentioned', () => {
  it('serializes a file ref without line info', () => {
    expect(JSON.parse(atMentioned({ fsPath: '/abs/src/a.ts' }))).toEqual({
      jsonrpc: '2.0', method: 'at_mentioned', params: { filePath: '/abs/src/a.ts' },
    });
  });

  it('serializes a ref with a line range', () => {
    expect(JSON.parse(atMentioned({ fsPath: '/abs/src/a.ts', lineStart: 10, lineEnd: 20 }))).toEqual({
      jsonrpc: '2.0', method: 'at_mentioned', params: { filePath: '/abs/src/a.ts', lineStart: 10, lineEnd: 20 },
    });
  });
});
