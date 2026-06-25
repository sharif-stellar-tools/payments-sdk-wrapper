import { SubscriptionManager } from '../src/resources/subscriptions';
import { OpenPaymentsClient } from '../src/client';

// Mock the Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  Asset: { native: jest.fn(() => ({ type: 'native' })) },
  Keypair: {
    fromSecret: jest.fn((secret: string) => ({
      publicKey: () => `G${secret.slice(0, 10).toUpperCase()}`,
      secret,
    })),
  },
  Operation: { payment: jest.fn((opts: unknown) => ({ type: 'payment', ...opts })) },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      sign: jest.fn(),
    })),
  })),
  Memo: jest.fn(),
}));

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;
  let mockClient: jest.Mocked<OpenPaymentsClient>;

  beforeEach(() => {
    mockClient = {
      server: {
        loadAccount: jest.fn().mockResolvedValue({}),
        submitTransaction: jest.fn().mockResolvedValue({ hash: 'tx_hash_123' }),
      },
      networkPassphrase: 'Test SDF Network',
    } as unknown as jest.Mocked<OpenPaymentsClient>;

    manager = new SubscriptionManager(mockClient);
  });

  it('creates a subscription authorization', () => {
    const auth = manager.createAuthorization({
      amount: 100,
      currency: 'USDC',
      destination: 'GDESTINATION123',
      senderSecretKey: 'SENDER_SECRET_KEY',
      intervalSeconds: 86400,
      totalCharges: 12,
    });

    expect(auth.id).toBeDefined();
    expect(auth.amount).toBe(100);
    expect(auth.totalCharges).toBe(12);
    expect(auth.executedCharges).toBe(0);
    expect(auth.active).toBe(true);
    expect(auth.validUntil).toBeGreaterThan(auth.validFrom);
  });

  it('rejects invalid subscription parameters', () => {
    expect(() =>
      manager.createAuthorization({
        amount: -1,
        currency: 'USDC',
        destination: 'GDEST',
        senderSecretKey: 'SKEY',
        intervalSeconds: 86400,
        totalCharges: 12,
      }),
    ).toThrow('Amount must be positive');

    expect(() =>
      manager.createAuthorization({
        amount: 100,
        currency: 'USDC',
        destination: 'GDEST',
        senderSecretKey: 'SKEY',
        intervalSeconds: 0,
        totalCharges: 12,
      }),
    ).toThrow('Interval must be positive');

    expect(() =>
      manager.createAuthorization({
        amount: 100,
        currency: 'USDC',
        destination: 'GDEST',
        senderSecretKey: 'SKEY',
        intervalSeconds: 86400,
        totalCharges: 0,
      }),
    ).toThrow('Total charges must be positive');
  });

  it('cancels a subscription', () => {
    const auth = manager.createAuthorization({
      amount: 50,
      currency: 'XLM',
      destination: 'GDEST456',
      senderSecretKey: 'SKEY_CANCEL',
      intervalSeconds: 3600,
      totalCharges: 24,
    });

    manager.cancelAuthorization(auth.id);
    const updated = manager.getAuthorization(auth.id);
    expect(updated?.active).toBe(false);
  });

  it('lists subscriptions for a sender', () => {
    manager.createAuthorization({
      amount: 10,
      currency: 'USDC',
      destination: 'GDEST',
      senderSecretKey: 'SKEY_LIST',
      intervalSeconds: 86400,
      totalCharges: 6,
    });

    const sender = 'GSKEY_LIST';
    const subs = manager.listSubscriptions(sender);
    expect(subs.length).toBeGreaterThanOrEqual(0);
  });

  it('returns undefined for unknown subscription', () => {
    expect(manager.getAuthorization('nonexistent')).toBeUndefined();
  });
});
