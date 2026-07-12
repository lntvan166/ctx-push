import { SessionRegistry, SessionClient } from '../ideBridge/sessions';

const client = (): SessionClient => ({ send: jest.fn() });

describe('SessionRegistry', () => {
  let reg: SessionRegistry;

  beforeEach(() => { reg = new SessionRegistry(); });

  it('starts empty with no target', () => {
    expect(reg.count).toBe(0);
    expect(reg.target).toBeUndefined();
    expect(reg.everConnected).toBe(false);
  });

  it('everConnected latches true on first connect and survives disconnect', () => {
    const a = reg.add(client());
    expect(reg.everConnected).toBe(true);
    reg.remove(a.id);
    expect(reg.count).toBe(0);
    expect(reg.everConnected).toBe(true);
  });

  it('targets the most recently connected session', () => {
    reg.add(client());
    const b = reg.add(client());
    expect(reg.target?.id).toBe(b.id);
  });

  it('assigns unique incrementing ids and stores connectedAt', () => {
    const a = reg.add(client(), 1000);
    const b = reg.add(client(), 2000);
    expect(a.id).not.toBe(b.id);
    expect(a.connectedAt).toBe(1000);
    expect(b.connectedAt).toBe(2000);
  });

  it('setPid attaches the pid from ide_connected', () => {
    const a = reg.add(client());
    reg.setPid(a.id, 4242);
    expect(reg.getAll()[0].pid).toBe(4242);
  });

  it('remove evicts a session and target falls back to next-most-recent', () => {
    const a = reg.add(client());
    const b = reg.add(client());
    reg.remove(b.id);
    expect(reg.count).toBe(1);
    expect(reg.target?.id).toBe(a.id);
  });

  it('manual setTarget overrides most-recent', () => {
    const a = reg.add(client());
    reg.add(client());
    reg.setTarget(a.id);
    expect(reg.target?.id).toBe(a.id);
  });

  it('manual target is cleared when that session disconnects', () => {
    const a = reg.add(client());
    const b = reg.add(client());
    reg.setTarget(a.id);
    reg.remove(a.id);
    expect(reg.target?.id).toBe(b.id);
  });

  it('a newer session connecting resets a manual target to most-recent', () => {
    const a = reg.add(client());
    reg.add(client());
    reg.setTarget(a.id);
    const c = reg.add(client());
    expect(reg.target?.id).toBe(c.id);
  });

  it('setTarget on an unknown id is a no-op', () => {
    const a = reg.add(client());
    reg.setTarget(999);
    expect(reg.target?.id).toBe(a.id);
  });

  it('fires onDidChange on add, setPid, and remove', () => {
    const counts: number[] = [];
    reg.onDidChange = sessions => counts.push(sessions.length);
    const a = reg.add(client());
    reg.setPid(a.id, 1);
    reg.remove(a.id);
    expect(counts).toEqual([1, 1, 0]);
  });

  it('getAll returns a copy', () => {
    reg.add(client());
    const all = reg.getAll() as unknown[];
    all.pop();
    expect(reg.count).toBe(1);
  });

  it('setTarget fires onDidChange when the target changes', () => {
    const a = reg.add(client());
    reg.add(client());
    let fireCount = 0;
    reg.onDidChange = () => { fireCount++; };

    reg.setTarget(a.id);
    expect(fireCount).toBe(1);

    reg.setTarget(a.id); // repeat call with same id: no-op
    expect(fireCount).toBe(1);

    reg.setTarget(999); // unknown id: no-op
    expect(fireCount).toBe(1);
  });
});
