import { Horizon, Transaction, Memo } from '@stellar/stellar-sdk';
import { PaymentClientOptions, PaymentStreamOptions } from './types';
import { FeeGuardEngine } from './feeguard';
import { Sep38Client } from './sep38';
import { PaymentStream } from './stream';
import { MemoValidator, StellarMemoType, MemoInput } from './memo';

export class PaymentClient {
  public server: Horizon.Server;
  public feeGuard: FeeGuardEngine;
  public sep38: Sep38Client;
  public memoValidator: MemoValidator;
  private options: PaymentClientOptions;

  constructor(options: PaymentClientOptions & { anchorUrl?: string }) {
    this.options = options;
    this.server = new Horizon.Server(options.horizonUrl);
    this.feeGuard = new FeeGuardEngine(options.maxFeeStroops, options.logger);
    this.sep38 = new Sep38Client(options.anchorUrl || 'https://anchor.stellar.org', options.logger);
    this.memoValidator = new MemoValidator(options.logger);
  }

  /**
   * Safely constructs and validates a Stellar Memo.
   */
  public createMemo(type: StellarMemoType, value?: any): Memo {
    return this.memoValidator.create(type, value);
  }

  /**
   * Validates an existing memo or memo configuration.
   */
  public validateMemo(memo: Memo | MemoInput): void {
    this.memoValidator.validate(memo);
  }

  /**
   * Creates a new PaymentStream for real-time SSE payment events.
   */
  public createStream(options: PaymentStreamOptions): PaymentStream {
    return new PaymentStream(this.server, options, this.options.logger);
  }

  /**
   * Submits a transaction to the Stellar network after checking fee limits.
   */
  public async submitTransaction(transaction: Transaction): Promise<any> {
    // 1. Guard against high fees
    this.feeGuard.checkFee(transaction);

    // 2. Validate transaction memo field
    if (transaction.memo) {
      this.memoValidator.validate(transaction.memo);
    }

    // 3. Submit transaction
    try {
      const response = await this.server.submitTransaction(transaction);
      if (this.options.logger && typeof this.options.logger.info === 'function') {
        this.options.logger.info(`PaymentClient: Transaction submitted successfully. Hash: ${response.hash}`);
      }
      return response;
    } catch (error: any) {
      if (this.options.logger && typeof this.options.logger.error === 'function') {
        this.options.logger.error(`PaymentClient: Transaction submission failed: ${error.message}`);
      }
      throw error;
    }
  }
}

export { PaymentClient as OpenPaymentsClient };

