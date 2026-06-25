/**
 * Mock Horizon/RPC server for local development without testnet dependency.
 *
 * Provides a fully functional in-process HTTP server that emulates Stellar
 * Horizon and Soroban RPC endpoints, enabling:
 * - Offline development and CI testing
 * - Deterministic test scenarios (success, failure, latency)
 * - No testnet rate limits or funding requirements
 *
 * @module mock/server
 */

import http from 'http';
import { URL } from 'url';
import { MockServerConfig, MockResponseOverrides, MockResponseConfig } from './types';

/** Default mock responses for each endpoint. */
const DEFAULT_RESPONSES: Record<string, MockResponseConfig> = {
  accounts: { status: 200, body: { _links: {}, id: '', account_id: '', sequence: '0', subentry_count: 0, balances: [] } },
  transactions: { status: 200, body: { _links: {}, records: [] } },
  payments: { status: 200, body: { _links: {}, records: [] } },
  operations: { status: 200, body: { _links: {}, records: [] } },
  ledgers: { status: 200, body: { _links: {}, records: [] } },
  effects: { status: 200, body: { _links: {}, records: [] } },
  offers: { status: 200, body: { _links: {}, records: [] } },
  assets: { status: 200, body: { _links: {}, records: [] } },
  claimableBalances: { status: 200, body: { _links: {}, records: [] } },
  feeStats: { status: 200, body: { last_ledger: '0', last_ledger_base_fee: '100', ledger_capacity_usage: '0' } },
};

export class MockServer {
  private server: http.Server | null = null;
  private responses: Map<string, MockResponseConfig> = new Map();
  private requestLog: Array<{ method: string; url: string; timestamp: number }> = [];
  private _port: number = 0;

  constructor(private config: MockServerConfig = {}) {
    // Initialize with defaults, then apply overrides
    for (const [key, value] of Object.entries(DEFAULT_RESPONSES)) {
      this.responses.set(key, value);
    }
    if (config.responses) {
      for (const [key, value] of Object.entries(config.responses)) {
        this.responses.set(key, value);
      }
    }
  }

  /** Start the mock server. Returns the actual port number. */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      const port = this.config.port ?? 0;
      this.server.listen(port, () => {
        const addr = this.server?.address();
        if (addr && typeof addr !== 'string') {
          this._port = addr.port;
          resolve(this._port);
        } else {
          reject(new Error('Failed to start mock server'));
        }
      });

      this.server.on('error', reject);
    });
  }

  /** Stop the mock server. */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else {
          this.server = null;
          this._port = 0;
          resolve();
        }
      });
    });
  }

  /** Get the server URL. */
  get url(): string {
    return `http://localhost:${this._port}${this.config.prefix ?? '/'}`;
  }

  get port(): number {
    return this._port;
  }

  /** Inject a custom response for a specific endpoint. */
  setResponse(endpoint: string, config: MockResponseConfig): void {
    this.responses.set(endpoint, config);
  }

  /** Remove a custom response (revert to default). */
  clearResponse(endpoint: string): void {
    const def = DEFAULT_RESPONSES[endpoint];
    if (def) {
      this.responses.set(endpoint, def);
    } else {
      this.responses.delete(endpoint);
    }
  }

  /** Get the request log for test assertions. */
  getRequestLog(): ReadonlyArray<{ method: string; url: string; timestamp: number }> {
    return this.requestLog;
  }

  /** Clear the request log. */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const timestamp = Date.now();
    this.requestLog.push({ method: req.method ?? 'GET', url: req.url ?? '/', timestamp });

    const parsedUrl = new URL(req.url ?? '/', `http://localhost`);
    const prefix = this.config.prefix ?? '/';
    let path = parsedUrl.pathname;

    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length);
    }

    // Extract endpoint from path (e.g., "/accounts/GABC..." → "accounts")
    const segments = path.split('/').filter(Boolean);
    const endpoint = segments[0] ?? '';

    const mockConfig = this.responses.get(endpoint);

    if (this.config.verbose) {
      console.log(`[MockServer] ${req.method} ${req.url} → ${mockConfig ? mockConfig.status : 404}`);
    }

    if (!mockConfig) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }));
      return;
    }

    // Simulate latency if configured
    const delay = mockConfig.delay ?? 0;
    const respond = () => {
      res.writeHead(mockConfig.status, {
        'Content-Type': 'application/json',
        'X-Mock-Server': 'payments-sdk-wrapper',
      });
      res.end(JSON.stringify(mockConfig.body));
    };

    if (delay > 0) {
      setTimeout(respond, delay);
    } else {
      respond();
    }
  }
}

/** Convenience: create, start, and return a mock server instance. */
export async function createMockServer(config?: MockServerConfig): Promise<MockServer> {
  const server = new MockServer(config);
  await server.start();
  return server;
}
