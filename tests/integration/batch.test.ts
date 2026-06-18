// Integration tests for submitBatchedPayments

import { OpenPaymentsClient } from '../../src/client';
import { PaymentRequest } from '../../src/types';

const MOCK_TX_HASH = 'abc123def456mock';
const SENDER_SECRET = 'SMOCKSECRETKEY000000000000000000';

const mockTx = { sign: jest.fn() };
const mockBuild = jest.fn().mockReturnValue(mockTx);
const mockSetTimeout = jest.fn().mockReturnValue({ build: mockBuild });
const mockBuilder = {
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: mockSetTimeout,
};
const mockSubmitTransaction = jest.fn().mockResolvedValue({ hash: MOCK_TX_HASH });
const mockLoadAccount = jest.fn().mockResolvedValue({ id: 'GMOCKACCOUNT', sequence: '1' });

jest.mock('@stellar/stellar-sdk', () => {
  const AssetMock = jest.fn().mockImplementation((code: string, issuer: string) => ({ code, issuer }));
  (AssetMock as any).native = jest.fn().mockReturnValue({ code: 'XLM' });

  return {
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: mockLoadAccount,
        submitTransaction: mockSubmitTransaction,
      })),
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () => 'GMOCKPUBLICKEY',
      }),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    Operation: {
      payment: jest.fn().mockReturnValue({ type: 'payment' }),
    },
    Asset: AssetMock,
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
  };
});

const makeXlmPayments = (count: number): PaymentRequest[] =>
  Array.from({ length: count }, (_, i) => ({
    amount: 10,
    currency: 'XLM',
    destination: `GDEST${i}`,
  }));

describe('submitBatchedPayments', () => {
  let client: OpenPaymentsClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuilder.addOperation.mockReturnThis();
    mockSetTimeout.mockReturnValue({ build: jest.fn().mockReturnValue(mockTx) });
    mockSubmitTransaction.mockResolvedValue({ hash: MOCK_TX_HASH });
    client = new OpenPaymentsClient('dummy-api-key', 'https://horizon-testnet.stellar.org', SENDER_SECRET);
  });

  it('returns a single transaction hash for a valid batch', async () => {
    const result = await client.payments.submitBatchedPayments(makeXlmPayments(3));
    expect(result.transactionHash).toBe(MOCK_TX_HASH);
  });

  it('reports operationCount matching the input array length', async () => {
    const result = await client.payments.submitBatchedPayments(makeXlmPayments(5));
    expect(result.operationCount).toBe(5);
  });

  it('adds exactly one operation per payment to the transaction builder', async () => {
    await client.payments.submitBatchedPayments(makeXlmPayments(4));
    const { Operation } = jest.requireMock('@stellar/stellar-sdk');
    expect(Operation.payment).toHaveBeenCalledTimes(4);
    expect(mockBuilder.addOperation).toHaveBeenCalledTimes(4);
  });

  it('submits to the network exactly once regardless of batch size', async () => {
    await client.payments.submitBatchedPayments(makeXlmPayments(10));
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly 100 operations without throwing', async () => {
    const result = await client.payments.submitBatchedPayments(makeXlmPayments(100));
    expect(result.operationCount).toBe(100);
    expect(result.transactionHash).toBe(MOCK_TX_HASH);
  });

  it('throws a descriptive error when batch exceeds 100 operations', async () => {
    await expect(
      client.payments.submitBatchedPayments(makeXlmPayments(101)),
    ).rejects.toThrow(
      "Batch size of 101 exceeds Stellar's limit of 100 operations per transaction.",
    );
  });

  it('makes no network calls when the 100-operation limit is exceeded', async () => {
    await expect(
      client.payments.submitBatchedPayments(makeXlmPayments(101)),
    ).rejects.toThrow();
    expect(mockLoadAccount).not.toHaveBeenCalled();
    expect(mockSubmitTransaction).not.toHaveBeenCalled();
  });

  it('throws when no sender secret key is configured on the client', async () => {
    const clientWithoutKey = new OpenPaymentsClient('dummy-api-key', 'https://horizon-testnet.stellar.org');
    await expect(
      clientWithoutKey.payments.submitBatchedPayments(makeXlmPayments(2)),
    ).rejects.toThrow('sender secret key must be set on the client');
  });

  it('throws a descriptive error when a non-XLM payment is missing an issuer', async () => {
    const payments: PaymentRequest[] = [
      { amount: 10, currency: 'USDC', destination: 'GDEST0' },
    ];
    await expect(
      client.payments.submitBatchedPayments(payments),
    ).rejects.toThrow('no issuer was provided');
  });

  it('uses the explicit issuer for non-XLM assets, not the source public key', async () => {
    const { Asset } = jest.requireMock('@stellar/stellar-sdk');
    const payments: PaymentRequest[] = [
      { amount: 10, currency: 'USDC', destination: 'GDEST0', issuer: 'GISSUER123' },
    ];
    await client.payments.submitBatchedPayments(payments);

    expect(Asset).toHaveBeenCalledWith('USDC', 'GISSUER123');
    expect(Asset).not.toHaveBeenCalledWith('USDC', 'GMOCKPUBLICKEY');
  });

  it('uses the networkPassphrase configured on the client', async () => {
    const { TransactionBuilder, Networks } = jest.requireMock('@stellar/stellar-sdk');
    const mainnetClient = new OpenPaymentsClient(
      'dummy-api-key',
      'https://horizon.stellar.org',
      SENDER_SECRET,
      Networks.PUBLIC,
    );

    await mainnetClient.payments.submitBatchedPayments(makeXlmPayments(2));

    expect(TransactionBuilder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ networkPassphrase: Networks.PUBLIC }),
    );
  });
});
