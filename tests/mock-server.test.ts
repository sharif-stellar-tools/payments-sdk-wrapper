import { MockServer, createMockServer } from '../src/mock/server';
import { MockResponseConfig } from '../src/mock/types';

describe('MockServer', () => {
  let server: MockServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('starts on an ephemeral port', async () => {
    server = new MockServer();
    const port = await server.start();
    expect(port).toBeGreaterThan(0);
    expect(server.url).toContain(`localhost:${port}`);
  });

  it('returns default 200 for known endpoints', async () => {
    server = await createMockServer();
    const res = await fetch(`${server.url}accounts/GABC123`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('balances');
  });

  it('returns 404 for unknown endpoints', async () => {
    server = await createMockServer();
    const res = await fetch(`${server.url}unknown/endpoint`);
    expect(res.status).toBe(404);
  });

  it('injects custom responses', async () => {
    server = await createMockServer();
    const customResponse: MockResponseConfig = {
      status: 500,
      body: { error: 'Internal Server Error' },
    };
    server.setResponse('accounts', customResponse);

    const res = await fetch(`${server.url}accounts/GABC123`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal Server Error');
  });

  it('simulates latency when delay is configured', async () => {
    server = await createMockServer();
    server.setResponse('payments', { status: 200, body: {}, delay: 100 });

    const start = Date.now();
    const res = await fetch(`${server.url}payments`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(90); // allow small timing variance
  });

  it('logs requests for test assertions', async () => {
    server = await createMockServer();
    await fetch(`${server.url}accounts/GABC`);
    await fetch(`${server.url}payments`);

    const log = server.getRequestLog();
    expect(log).toHaveLength(2);
    expect(log[0].url).toContain('accounts');
    expect(log[1].url).toContain('payments');
  });

  it('clears request log', async () => {
    server = await createMockServer();
    await fetch(`${server.url}accounts/GABC`);
    server.clearRequestLog();
    expect(server.getRequestLog()).toHaveLength(0);
  });

  it('clears custom responses back to defaults', async () => {
    server = await createMockServer();
    server.setResponse('accounts', { status: 503, body: {} });
    server.clearResponse('accounts');

    const res = await fetch(`${server.url}accounts/GABC`);
    expect(res.status).toBe(200);
  });

  it('stops cleanly', async () => {
    server = new MockServer();
    await server.start();
    await server.stop();
    expect(server.port).toBe(0);
  });

  it('supports custom prefix', async () => {
    server = await createMockServer({ prefix: '/api/v1/' });
    const res = await fetch(`${server.url}api/v1/accounts/GABC`);
    expect(res.status).toBe(200);
  });
});
