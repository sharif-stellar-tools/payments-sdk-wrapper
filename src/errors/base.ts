/**
 * Stable, machine-readable identifiers for each error category.
 * Prefer branching on `instanceof` for type narrowing; use `code` when you
 * need a serializable discriminant (e.g. logging, cross-process responses).
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base class for every error raised by this SDK. Consumers can catch this
 * single type to handle all SDK failures generically, or catch a specific
 * subclass (e.g. `InsufficientFundsError`) to handle one failure mode.
 *
 * The `cause` property always preserves the original error that triggered
 * this one (a raw Stellar SDK error, an Axios error, etc.) so nothing is
 * lost for debugging, even though the consumer-facing type is normalized.
 */
export class PaymentSDKError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: unknown;

  constructor(message: string, code: ErrorCode = ErrorCode.UNKNOWN, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;

    // Drop this constructor frame from the stack so it points at the call
    // site that triggered the error, not at this base class.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /** JSON-safe representation for logging, including the original cause. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message, stack: this.cause.stack }
          : this.cause,
    };
  }
}
