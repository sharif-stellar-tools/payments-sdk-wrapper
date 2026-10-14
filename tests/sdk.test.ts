import { FeeGuardEngine } from '../src/feeguard';
import { Sep38Client } from '../src/sep38';
import { PaymentClient } from '../src/client';
import { Transaction } from '@stellar/stellar-sdk';
import axios from 'axios';

jest.mock('axios');
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

  it('should build a multi-asset payment transaction with multiple operations', async () => {
    const { Account, Asset, Memo } = require('@stellar/stellar-sdk');
    const client = new PaymentClient({
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      maxFeeStroops: 1000,
    });

    const mockAccount = new Account('GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H', '1000');
    jest.spyOn(client.server, 'loadAccount').mockResolvedValue(mockAccount as any);

    const tx = await client.buildMultiAssetPaymentTransaction({
      sourceAccount: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      payments: [
        {
          destination: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          asset: Asset.native(),
          amount: '10.5',
        },
        {
          destination: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          asset: new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
          amount: '25.0',
        },
      ],
      baseFee: 200,
      memo: Memo.text('MultiAsset'),
    });

    expect(tx).toBeDefined();
    expect(tx.operations.length).toBe(2);
    expect(tx.fee).toBe('200');
  });
});
