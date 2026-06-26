import { Keypair } from '@stellar/stellar-sdk';
import { validatePaymentRequest } from '../../src/validation';

describe('PaymentRequest validation — path payment strict send/receive', () => {
  const validRequest = {
    amount: 100,
    currency: 'XLM',
    destination: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
  };

  it('validates a standard payment request', () => {
    expect(() => validatePaymentRequest(validRequest)).not.toThrow();
  });

  it('validates a strictSend payment request', () => {
    const req = { ...validRequest, strictSend: true };
    expect(() => validatePaymentRequest(req)).not.toThrow();
  });

  it('validates a strictReceive payment request', () => {
    const req = { ...validRequest, strictReceive: true };
    expect(() => validatePaymentRequest(req)).not.toThrow();
  });

  it('rejects when both strictSend and strictReceive are true', () => {
    const req = { ...validRequest, strictSend: true, strictReceive: true };
    expect(() => validatePaymentRequest(req)).toThrow();
  });

  it('validates custom currency with issuer', () => {
    const issuer = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
    const req = { ...validRequest, currency: 'USDC', issuer };
    expect(() => validatePaymentRequest(req)).not.toThrow();
  });

  it('rejects invalid destination key', () => {
    const req = { ...validRequest, destination: 'INVALID' };
    expect(() => validatePaymentRequest(req)).toThrow();
  });

  it('rejects negative amount', () => {
    const req = { ...validRequest, amount: -10 };
    expect(() => validatePaymentRequest(req)).toThrow();
  });
});
