import { FeeGuardEngine } from '../src/feeguard';
import { Sep38Client } from '../src/sep38';
import { PaymentClient } from '../src/client';
import { Transaction } from '@stellar/stellar-sdk';
import axios from 'axios';

jest.mock('axios', () => ({
  post: jest.fn(),
  create: jest.fn(() => ({
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  })),
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FeeGuardEngine', () => {
  it('should pass if transaction fee is less than or equal to maxFeeStroops', () => {
    const engine = new FeeGuardEngine(100);
    const mockTx = { fee: '50' } as unknown as Transaction;
    expect(() => engine.checkFee(mockTx)).not.toThrow();
  });

  it('should throw an error if transaction fee exceeds maxFeeStroops', () => {
    const engine = new FeeGuardEngine(100);
    const mockTx = { fee: '150' } as unknown as Transaction;
    expect(() => engine.checkFee(mockTx)).toThrow(
      'Transaction fee of 150 stroops exceeds the configured guardrail limit of 100 stroops.'
    );
  });
});

describe('Sep38Client', () => {
  it('should successfully fetch quote from anchor server', async () => {
    const client = new Sep38Client('https://mock-anchor.com');
    const mockResponse = {
      id: 'quote_123',
      expires_at: '2026-08-12T15:00:00Z',
      price: '1.02',
      sell_amount: '100.00',
      buy_amount: '98.00',
    };
    mockedAxios.post.mockResolvedValue({ data: mockResponse });

    const quote = await client.getQuote({
      sellAsset: 'iso4217:USD',
      buyAsset: 'stellar:USDC:GA5Z',
      sellAmount: '100.00',
      context: 'sep6',
    });

    expect(quote.id).toBe('quote_123');
    expect(quote.price).toBe('1.02');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://mock-anchor.com/quote',
      {
        sell_asset: 'iso4217:USD',
        buy_asset: 'stellar:USDC:GA5Z',
        sell_amount: '100.00',
        context: 'sep6',
      },
      expect.any(Object)
    );
  });

  it('should throw error when HTTP request fails', async () => {
    const client = new Sep38Client('https://mock-anchor.com');
    mockedAxios.post.mockRejectedValue(new Error('Network Error'));

    await expect(
      client.getQuote({
        sellAsset: 'iso4217:USD',
        buyAsset: 'stellar:USDC:GA5Z',
        sellAmount: '100.00',
        context: 'sep6',
      })
    ).rejects.toThrow('SEP-38 Request Failed: Network Error');
  });
});

describe('PaymentClient', () => {
  it('should initialize correctly with options', () => {
    const client = new PaymentClient({
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      maxFeeStroops: 100,
    });

    expect(client.server).toBeDefined();
    expect(client.feeGuard).toBeDefined();
    expect(client.sep38).toBeDefined();
  });
});
