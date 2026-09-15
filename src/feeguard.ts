import { Transaction } from '@stellar/stellar-sdk';
import { createSdkLogger, SdkLogger, SupportedLogger } from './logger';

export class FeeGuardEngine {
  public logger: SdkLogger;

  constructor(private maxFeeStroops: number, logger?: SupportedLogger) {
    this.logger = createSdkLogger(logger, 'FeeGuard');
  }

  /**
   * Validates if the transaction fee is within the allowed limits.
   * Throws an error if it exceeds the maximum fee.
   */
  public checkFee(tx: Transaction): void {
    const fee = parseInt(tx.fee, 10);
    if (isNaN(fee)) {
      throw new Error('Invalid transaction fee');
    }

    this.logger.info(`Checking tx fee. Tx fee: ${fee} stroops. Max fee: ${this.maxFeeStroops} stroops.`, {
      fee,
      maxFeeStroops: this.maxFeeStroops,
    });

    if (fee > this.maxFeeStroops) {
      throw new Error(
        `Transaction fee of ${fee} stroops exceeds the configured guardrail limit of ${this.maxFeeStroops} stroops.`
      );
    }
  }
}
