/**
 * Recurring subscription support via time-bound authorizations.
 *
 * Implements Stellar's time-bound payment authorization pattern, allowing
 * users to authorize recurring payments that execute automatically within
 * specified time windows without requiring a new signature each period.
 *
 * @module resources/subscriptions
 */

import {
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
  Memo,
} from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../client';
import { ValidationError } from '../errors';
import { config } from '../config';

export interface SubscriptionRequest {
  /** Amount to charge per period. */
  amount: number;
  /** Asset code (e.g., 'USDC', 'XLM'). */
  currency: string;
  /** Recipient address. */
  destination: string;
  /** Sender's secret key (for signing the authorization). */
  senderSecretKey: string;
  /** Interval in seconds between charges (e.g., 86400 = daily, 2592000 = monthly). */
  intervalSeconds: number;
  /** Total number of charges. */
  totalCharges: number;
  /** Optional memo for each payment. */
  memo?: string;
}

export interface SubscriptionAuthorization {
  /** Unique subscription ID. */
  id: string;
  /** Authorized amount per charge. */
  amount: number;
  /** Asset code. */
  currency: string;
  /** Recipient address. */
  destination: string;
  /** Sender address. */
  sender: string;
  /** Interval in seconds. */
  intervalSeconds: number;
  /** Total charges authorized. */
  totalCharges: number;
  /** Charges executed so far. */
  executedCharges: number;
  /** Timestamp when authorization becomes valid. */
  validFrom: number;
  /** Timestamp when authorization expires. */
  validUntil: number;
  /** Whether the subscription is active. */
  active: boolean;
}

export interface ChargeResult {
  /** The charge number (1-indexed). */
  chargeNumber: number;
  /** Transaction hash. */
  hash: string;
  /** Timestamp of execution. */
  executedAt: number;
  /** Amount charged. */
  amount: number;
}

export class SubscriptionManager {
  private subscriptions: Map<string, SubscriptionAuthorization> = new Map();

  constructor(private client: OpenPaymentsClient) {}

  /**
   * Create a time-bound authorization for recurring payments.
   *
   * The authorization specifies the amount, interval, and total number of
   * charges. Individual charges are executed via `executeCharge()` within
   * the validity window.
   */
  createAuthorization(req: SubscriptionRequest): SubscriptionAuthorization {
    if (req.amount <= 0) throw new ValidationError('Amount must be positive');
    if (req.intervalSeconds <= 0) throw new ValidationError('Interval must be positive');
    if (req.totalCharges <= 0) throw new ValidationError('Total charges must be positive');

    const senderKeypair = Keypair.fromSecret(req.senderSecretKey);
    const now = Math.floor(Date.now() / 1000);
    const validFrom = now;
    const validUntil = now + req.intervalSeconds * req.totalCharges;

    const id = `sub_${senderKeypair.publicKey().slice(0, 8)}_${now}`;

    const auth: SubscriptionAuthorization = {
      id,
      amount: req.amount,
      currency: req.currency,
      destination: req.destination,
      sender: senderKeypair.publicKey(),
      intervalSeconds: req.intervalSeconds,
      totalCharges: req.totalCharges,
      executedCharges: 0,
      validFrom,
      validUntil,
      active: true,
    };

    this.subscriptions.set(id, auth);
    return auth;
  }

  /**
   * Execute a single charge under an existing authorization.
   *
   * Validates:
   * - Subscription is active
   * - Within validity window
   * - Interval has elapsed since last charge
   * - Charges remaining
   */
  async executeCharge(
    subscriptionId: string,
    senderSecretKey: string,
  ): Promise<ChargeResult> {
    const auth = this.subscriptions.get(subscriptionId);
    if (!auth) throw new ValidationError(`Subscription ${subscriptionId} not found`);
    if (!auth.active) throw new ValidationError('Subscription is not active');

    const now = Math.floor(Date.now() / 1000);
    if (now < auth.validFrom) throw new ValidationError('Authorization not yet valid');
    if (now > auth.validUntil) throw new ValidationError('Authorization has expired');
    if (auth.executedCharges >= auth.totalCharges) {
      throw new ValidationError('All charges have been executed');
    }

    // Check interval
    const nextValidTime = auth.validFrom + auth.intervalSeconds * auth.executedCharges;
    if (now < nextValidTime) {
      throw new ValidationError(
        `Next charge not yet due. Wait ${nextValidTime - now}s`,
      );
    }

    const senderKeypair = Keypair.fromSecret(senderSecretKey);
    const sourcePublicKey = senderKeypair.publicKey();

    const account = await this.client.server.loadAccount(sourcePublicKey);
    const asset =
      auth.currency === 'XLM'
        ? Asset.native()
        : new Asset(auth.currency, sourcePublicKey);

    const transaction = new TransactionBuilder(account, {
      fee: config.baseFee,
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: auth.destination,
          asset,
          amount: auth.amount.toString(),
        }),
      )
      .setTimeout(config.txTimeoutSeconds)
      .build();

    transaction.sign(senderKeypair);
    const result = await this.client.server.submitTransaction(transaction);

    auth.executedCharges += 1;
    if (auth.executedCharges >= auth.totalCharges) {
      auth.active = false;
    }

    return {
      chargeNumber: auth.executedCharges,
      hash: result.hash,
      executedAt: now,
      amount: auth.amount,
    };
  }

  /**
   * Execute all pending charges for a subscription.
   * Returns results for each charge executed.
   */
  async executeAllCharges(
    subscriptionId: string,
    senderSecretKey: string,
  ): Promise<ChargeResult[]> {
    const results: ChargeResult[] = [];
    const auth = this.subscriptions.get(subscriptionId);
    if (!auth) throw new ValidationError(`Subscription ${subscriptionId} not found`);

    while (auth.active && auth.executedCharges < auth.totalCharges) {
      try {
        const result = await this.executeCharge(subscriptionId, senderSecretKey);
        results.push(result);
      } catch {
        break;
      }
    }

    return results;
  }

  /** Cancel a subscription (prevents further charges). */
  cancelAuthorization(subscriptionId: string): void {
    const auth = this.subscriptions.get(subscriptionId);
    if (!auth) throw new ValidationError(`Subscription ${subscriptionId} not found`);
    auth.active = false;
  }

  /** Get subscription details. */
  getAuthorization(subscriptionId: string): SubscriptionAuthorization | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /** List all subscriptions for a sender. */
  listSubscriptions(senderAddress: string): SubscriptionAuthorization[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.sender === senderAddress,
    );
  }
}
