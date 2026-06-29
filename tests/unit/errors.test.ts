import {
  AccountNotFoundError,
  ErrorCode,
  InsufficientFundsError,
  NetworkError,
  PaymentSDKError,
  TransactionFailedError,
  ValidationError,
} from '../../src/errors';

describe('PaymentSDKError hierarchy', () => {
  it('sets name, code, message and preserves the original error as cause', () => {
    const original = new Error('boom');
    const err = new PaymentSDKError('wrapped', ErrorCode.UNKNOWN, original);

    expect(err.name).toBe('PaymentSDKError');
    expect(err.message).toBe('wrapped');
    expect(err.code).toBe(ErrorCode.UNKNOWN);
    expect(err.cause).toBe(original);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults to ErrorCode.UNKNOWN when no code is given', () => {
    const err = new PaymentSDKError('oops');
    expect(err.code).toBe(ErrorCode.UNKNOWN);
  });

  it('serializes cleanly via toJSON, including a reduced cause', () => {
    const original = new Error('root cause');
    const err = new PaymentSDKError('wrapped', ErrorCode.NETWORK_ERROR, original);

    const json = err.toJSON();
    expect(json).toMatchObject({
      name: 'PaymentSDKError',
      code: ErrorCode.NETWORK_ERROR,
      message: 'wrapped',
      cause: { name: 'Error', message: 'root cause' },
    });
  });

  it.each([
    [ValidationError, ErrorCode.VALIDATION_ERROR],
    [NetworkError, ErrorCode.NETWORK_ERROR],
    [AccountNotFoundError, ErrorCode.ACCOUNT_NOT_FOUND],
    [TransactionFailedError, ErrorCode.TRANSACTION_FAILED],
    [InsufficientFundsError, ErrorCode.INSUFFICIENT_FUNDS],
  ])('%p sets the expected ErrorCode and extends PaymentSDKError', (ErrorClass, code) => {
    const err = new ErrorClass('message');
    expect(err).toBeInstanceOf(PaymentSDKError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(code);
  });

  it('InsufficientFundsError is also a TransactionFailedError', () => {
    const err = new InsufficientFundsError('underfunded');
    expect(err).toBeInstanceOf(TransactionFailedError);
  });

  it('carries resultCodes on TransactionFailedError when provided', () => {
    const resultCodes = { transaction: 'tx_failed', operations: ['op_underfunded'] };
    const err = new TransactionFailedError('failed', undefined, resultCodes);
    expect(err.resultCodes).toEqual(resultCodes);
  });
});
