import { ErrorCode, PaymentSDKError } from './base';

/** Result codes Horizon returns alongside a failed transaction submission. */
export interface TransactionResultCodes {
  transaction: string;
  operations: string[];
}

/**
 * Raised when a request fails local or schema validation before it is ever
 * sent to the network (invalid amount, malformed destination address,
 * missing required field, etc).
 */
export class ValidationError extends PaymentSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, ErrorCode.VALIDATION_ERROR, cause);
  }
}

/**
 * Raised when the SDK could not get a usable response from Horizon/RPC at
 * all: connection refused, timeout, DNS failure, 5xx, or rate limiting.
 * Distinct from `TransactionFailedError`, which means the network *did*
 * respond, just with a rejection.
 */
export class NetworkError extends PaymentSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, ErrorCode.NETWORK_ERROR, cause);
  }
}

/** Raised when the requested Stellar account does not exist on the network. */
export class AccountNotFoundError extends PaymentSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, ErrorCode.ACCOUNT_NOT_FOUND, cause);
  }
}

/**
 * Raised when Horizon accepted the request but rejected the transaction
 * itself. Carries the parsed `result_codes` from Horizon's response so
 * consumers can inspect the precise failure reason.
 */
export class TransactionFailedError extends PaymentSDKError {
  public readonly resultCodes?: TransactionResultCodes;

  constructor(
    message: string,
    cause?: unknown,
    resultCodes?: TransactionResultCodes,
    code: ErrorCode = ErrorCode.TRANSACTION_FAILED,
  ) {
    super(message, code, cause);
    this.resultCodes = resultCodes;
  }
}

/**
 * A `TransactionFailedError` specifically caused by the source account
 * lacking sufficient balance to cover the payment or its fee. Subclassing
 * `TransactionFailedError` means existing `catch` blocks that only know
 * about the parent type still match this error.
 */
export class InsufficientFundsError extends TransactionFailedError {
  constructor(message: string, cause?: unknown, resultCodes?: TransactionResultCodes) {
    super(message, cause, resultCodes, ErrorCode.INSUFFICIENT_FUNDS);
  }
}
