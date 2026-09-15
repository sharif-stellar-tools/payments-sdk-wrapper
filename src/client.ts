import { Horizon, Transaction } from '@stellar/stellar-sdk';
import { PaymentClientOptions, PaymentStreamOptions } from './types';
import { FeeGuardEngine } from './feeguard';
import { Sep38Client } from './sep38';
import { PaymentStream } from './stream';
import { createSdkLogger, SdkLogger } from './logger';

export class PaymentClient {
  public server: Horizon.Server;

  public feeGuard: FeeGuardEngine;
  public sep38: Sep38Client;
  private options: PaymentClientOptions;
  public logger: SdkLogger;

  constructor(options: PaymentClientOptions & { anchorUrl?: string }) {
    this.options = options;
    this.logger = createSdkLogger(options.logger, 'PaymentClient');
    this.server = new Horizon.Server(options.horizonUrl);
    this.feeGuard = new FeeGuardEngine(options.maxFeeStroops, this.logger);
    this.sep38 = new Sep38Client(options.anchorUrl || 'https://anchor.stellar.org', this.logger);
  }

  /**
   * Creates a new PaymentStream for real-time SSE payment events.
   */
  public createStream(options: PaymentStreamOptions): PaymentStream {
    return new PaymentStream(this.server, options, this.logger);
  }

  /**
   * Submits a transaction to the Stellar network after checking fee limits.
   */
  public async submitTransaction(transaction: Transaction): Promise<any> {
    // 1. Guard against high fees
    this.feeGuard.checkFee(transaction);

    // 2. Submit transaction
    try {
      const response = await this.server.submitTransaction(transaction);
      this.logger.info(`Transaction submitted successfully. Hash: ${response.hash}`, { hash: response.hash });
      return response;
    } catch (error: any) {
      this.logger.error(`Transaction submission failed: ${error.message}`, { error });
      throw error;
    }
  }
}

export type OpenPaymentsClient = PaymentClient;

