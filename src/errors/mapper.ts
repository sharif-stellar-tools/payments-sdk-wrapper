import {
  AccountRequiresMemoError,
  NetworkError as StellarNetworkError,
  NotFoundError as StellarNotFoundError,
} from '@stellar/stellar-sdk';
import { PaymentSDKError } from './base';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  NetworkError,
  TransactionFailedError,
  TransactionResultCodes,
  ValidationError,
} from './types';

/** Operation-level Horizon result codes that indicate a balance shortfall. */
const INSUFFICIENT_FUNDS_OP_CODES = new Set(['op_underfunded', 'op_line_full']);
const INSUFFICIENT_FUNDS_TX_CODE = 'tx_insufficient_balance';

interface HorizonErrorResponse {
  status?: number;
  data?: {
    extras?: {
      result_codes?: TransactionResultCodes;
    };
  };
}

function extractResultCodes(error: StellarNetworkError): TransactionResultCodes | undefined {
  const response = error.response as HorizonErrorResponse | undefined;
  return response?.data?.extras?.result_codes;
}

function indicatesInsufficientFunds(resultCodes: TransactionResultCodes): boolean {
  return (
    resultCodes.transaction === INSUFFICIENT_FUNDS_TX_CODE ||
    resultCodes.operations.some((code) => INSUFFICIENT_FUNDS_OP_CODES.has(code))
  );
}

function isAxiosError(error: unknown): error is { isAxiosError: true; message: string } {
  return typeof error === 'object' && error !== null && (error as { isAxiosError?: boolean }).isAxiosError === true;
}

/**
 * Translates a raw error thrown by the Stellar SDK (or Axios, for the
 * webhook delivery path) into one of this SDK's typed `PaymentSDKError`
 * subclasses, preserving the original error as `cause`.
 *
 * Runs in O(1) time and space: every branch inspects a fixed, small set of
 * fields (Horizon's `result_codes.operations` is bounded by Stellar's
 * 100-operations-per-transaction limit).
 */
export function mapStellarError(error: unknown): PaymentSDKError {
  if (error instanceof PaymentSDKError) {
    return error;
  }

  if (error instanceof StellarNotFoundError) {
    return new AccountNotFoundError('The requested Stellar account was not found', error);
  }

  if (error instanceof AccountRequiresMemoError) {
    return new ValidationError(
      `Destination account ${error.accountId} requires a memo on the transaction`,
      error,
    );
  }

  if (error instanceof StellarNetworkError) {
    const resultCodes = extractResultCodes(error);

    if (resultCodes && indicatesInsufficientFunds(resultCodes)) {
      return new InsufficientFundsError(
        'The source account has insufficient balance to complete this transaction',
        error,
        resultCodes,
      );
    }

    if (resultCodes) {
      return new TransactionFailedError(
        `Transaction submission was rejected: ${resultCodes.transaction}`,
        error,
        resultCodes,
      );
    }

    return new NetworkError(
      error.message || 'A network error occurred while communicating with the Stellar network',
      error,
    );
  }

  if (isAxiosError(error)) {
    return new NetworkError(error.message || 'A network error occurred', error);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new PaymentSDKError(message, undefined, error);
}
