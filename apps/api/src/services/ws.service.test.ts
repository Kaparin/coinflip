import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the logger before importing wsService
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mock
const { wsService } = await import('./ws.service.js');

/** Create a mock WebSocket */
function createMockWs(readyState = 1 /* OPEN */) {
  return {
    send: vi.fn(),
    readyState,
  };
}

describe('WsService', () => {
  beforeEach(() => {
    // Clear all clients between tests by accessing internals
    // We create a fresh set of clients each test via the public API
  });

  it('adds and removes clients', () => {
    const ws1 = createMockWs();
    const id = wsService.addClient(ws1);
    expect(id).toBeTruthy();
    expect(wsService.getClientCount()).toBeGreaterThanOrEqual(1);

    wsService.removeClient(id);
  });

  it('broadcasts to all open clients', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const ws3 = createMockWs(0); // CONNECTING — should not receive

    const id1 = wsService.addClient(ws1);
    const id2 = wsService.addClient(ws2);
    const id3 = wsService.addClient(ws3);

    wsService.broadcast({ type: 'test_event', data: { foo: 'bar' } });

    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
    expect(ws3.send).not.toHaveBeenCalled();

    // Verify message format
    const sent = JSON.parse(ws1.send.mock.calls[0]![0] as string);
    expect(sent.type).toBe('test_event');
    expect(sent.data).toEqual({ foo: 'bar' });
    expect(sent.timestamp).toBeTypeOf('number');

    // Cleanup
    wsService.removeClient(id1);
    wsService.removeClient(id2);
    wsService.removeClient(id3);
  });

  it('sends to specific address only', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    const id1 = wsService.addClient(ws1, 'axm1maker');
    const id2 = wsService.addClient(ws2, 'axm1other');

    wsService.sendToAddress('axm1maker', { type: 'balance', data: { amount: '500' } });

    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).not.toHaveBeenCalled();

    wsService.removeClient(id1);
    wsService.removeClient(id2);
  });

  it('emitBetCreated broadcasts bet_created event', () => {
    const ws = createMockWs();
    const id = wsService.addClient(ws);

    wsService.emitBetCreated({ id: 1, amount: '100' });

    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
    expect(sent.type).toBe('bet_created');
    expect(sent.data.id).toBe(1);

    wsService.removeClient(id);
  });

  it('emitBetAccepted broadcasts bet_accepted event', () => {
    const ws = createMockWs();
    const id = wsService.addClient(ws);

    wsService.emitBetAccepted({ id: 1, acceptor: 'axm1...' });

    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
    expect(sent.type).toBe('bet_accepted');

    wsService.removeClient(id);
  });

  it('handles send errors gracefully', () => {
    const ws = createMockWs();
    ws.send.mockImplementation(() => { throw new Error('connection reset'); });
    const id = wsService.addClient(ws);

    // Should not throw
    expect(() => wsService.broadcast({ type: 'test', data: {} })).not.toThrow();

    // Client should be removed after failed send
    wsService.removeClient(id);
  });

  it('emitBalanceUpdated sends only to target address', () => {
    const wsMaker = createMockWs();
    const wsOther = createMockWs();

    const id1 = wsService.addClient(wsMaker, 'axm1maker');
    const id2 = wsService.addClient(wsOther, 'axm1other');

    wsService.emitBalanceUpdated('axm1maker', { available: '1000', locked: '200' });

    expect(wsMaker.send).toHaveBeenCalledOnce();
    expect(wsOther.send).not.toHaveBeenCalled();

    const sent = JSON.parse(wsMaker.send.mock.calls[0]![0] as string);
    expect(sent.type).toBe('balance_updated');
    expect(sent.data.available).toBe('1000');

    wsService.removeClient(id1);
    wsService.removeClient(id2);
  });
});
