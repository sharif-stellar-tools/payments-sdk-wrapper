import { EventEmitter } from 'events';
import { Horizon } from '@stellar/stellar-sdk';
import { PaymentStreamOptions, PaymentEvent } from './types';
import { createSdkLogger, SdkLogger, SupportedLogger } from './logger';

export class PaymentStream extends EventEmitter {
  private closeFn?: () => void;
  public logger: SdkLogger;

  constructor(
    private server: Horizon.Server,
    private options: PaymentStreamOptions,
    logger?: SupportedLogger
  ) {
    super();
    this.logger = createSdkLogger(logger, 'PaymentStream');
  }

  /**
   * Establishes a connection to Stellar's SSE stream for the given account's payments.
   */
  public connect(): void {
    if (this.closeFn) {
      this.logger.warn('PaymentStream is already connected.');
      return;
    }

    this.logger.info(`Connecting to payments stream for account: ${this.options.account}`, {
      account: this.options.account,
      cursor: this.options.cursor || 'now',
    });

    try {
      this.closeFn = this.server.payments()
        .forAccount(this.options.account)
        .cursor(this.options.cursor || 'now')
        .stream({
          onmessage: (operation: any) => {
            if (operation.type === 'payment' || operation.type === 'path_payment_strict_receive' || operation.type === 'path_payment_strict_send') {
              const event: PaymentEvent = {
                id: operation.id,
                from: operation.from || operation.source_account,
                to: operation.to || operation.destination,
                amount: operation.amount,
                asset_code: operation.asset_code || 'XLM',
                asset_issuer: operation.asset_issuer,
                asset_type: operation.type,
                created_at: operation.created_at,
              };

              this.emit('payment.completed', event);
            }
          },
          onerror: (error: any) => {
            this.logger.error(`PaymentStream Error: ${error.message || JSON.stringify(error)}`, { error });
            this.emit('payment.failed', error);
          }
        });
    } catch (err: any) {
      this.emit('payment.failed', err);
    }
  }

  /**
   * Disconnects the SSE stream.
   */
  public disconnect(): void {
    if (this.closeFn) {
      this.closeFn();
      this.closeFn = undefined;
      this.logger.info('PaymentStream: Disconnected');
    }
  }
}
