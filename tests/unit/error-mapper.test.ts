import {
  AccountRequiresMemoError,
  BadResponseError,
  NetworkError as StellarNetworkError,
  NotFoundError as StellarNotFoundError,
} from '@stellar/stellar-sdk';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  mapStellarError,
  NetworkError,
  PaymentSDKError,
  TransactionFailedError,
  ValidationError,
} from '../../src/errors';

function horizonResponse(resultCodes?: { transaction: string; operations: string[] }) {
  return {
    status: 400,
    data: resultCodes ? { extras: { result_codes: resultCodes } } : undefined,
  };
}

describe('mapStellarError', () => {
  it('returns a PaymentSDKError instance untouched (idempotent)', () => {
    const original = new ValidationError('already typed');
    expect(mapStellarError(original)).toBe(original);
  });

  it('maps StellarSdk NotFoundError to AccountNotFoundError, preserving cause', () => {
    const original = new StellarNotFoundError('Resource Missing', horizonResponse());
    const mapped = mapStellarError(original);

    expect(mapped).toBeInstanceOf(AccountNotFoundError);
    expect(mapped.cause).toBe(original);
  });

  it('maps AccountRequiresMemoError to ValidationError', () => {
    const original = new AccountRequiresMemoError('Memo required', 'GDEST', 0);
    const mapped = mapStellarError(original);

    expect(mapped).toBeInstanceOf(ValidationError);
    expect(mapped.cause).toBe(original);
  });

  it('maps a BadResponseError with op_underfunded to InsufficientFundsError', () => {
    const original = new BadResponseError(
      'Transaction Failed',
      horizonResponse({ transaction: 'tx_failed', operations: ['op_underfunded'] }),
    );
    const mapped = mapStellarError(original);

    expect(mapped).toBeInstanceOf(InsufficientFundsError);
    expect(mapped).toBeInstanceOf(TransactionFailedError);
    expect((mapped as InsufficientFundsError).resultCodes).toEqual({
      transaction: 'tx_failed',
      operations: ['op_underfunded'],
    });
  });

  it('maps a BadResponseError with tx_insufficient_balance to InsufficientFundsError', () => {
    const original = new BadResponseError(
      'Transaction Failed',
      horizonResponse({ transaction: 'tx_insufficient_balance', operations: [] }),
    );
    expect(mapStellarError(original)).toBeInstanceOf(InsufficientFundsError);
  });

  it('maps a BadResponseError with other result codes to TransactionFailedError', () => {
    const original = new BadResponseError(
      'Transaction Failed',
      horizonResponse({ transaction: 'tx_bad_seq', operations: [] }),
    );
    const mapped = mapStellarError(original);

    expect(mapped).toBeInstanceOf(TransactionFailedError);
    expect(mapped).not.toBeInstanceOf(InsufficientFundsError);
  });

  it('maps a StellarSdk NetworkError with no result codes (5xx) to NetworkError', () => {
    const original = new StellarNetworkError('Internal Server Error', {
      status: 500,
      data: undefined,
    });
    expect(mapStellarError(original)).toBeInstanceOf(NetworkError);
  });

  it('maps a raw Axios-shaped error to NetworkError', () => {
    const axiosLikeError = { isAxiosError: true, message: 'connect ECONNREFUSED' };
    const mapped = mapStellarError(axiosLikeError);

    expect(mapped).toBeInstanceOf(NetworkError);
    expect(mapped.message).toBe('connect ECONNREFUSED');
  });

  it('wraps an unrecognized error in PaymentSDKError without losing the original', () => {
    const original = new Error('something unexpected');
    const mapped = mapStellarError(original);

    expect(mapped).toBeInstanceOf(PaymentSDKError);
    expect(mapped.message).toBe('something unexpected');
    expect(mapped.cause).toBe(original);
  });

  it('wraps a non-Error thrown value', () => {
    const mapped = mapStellarError('plain string failure');
    expect(mapped).toBeInstanceOf(PaymentSDKError);
    expect(mapped.message).toBe('plain string failure');
  });
});
