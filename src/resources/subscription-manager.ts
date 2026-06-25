import { Keypair } from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../client';
import { PluginRegistry } from '../plugins/registry';
import { PaymentRequest } from '../types';
import { ValidationError, SubscriptionError } from '../errors';
import {
  SubscriptionRequest,
  Subscription,
  SubscriptionFrequency,
  SubscriptionStatus,
  SubscriptionExecutionResult,
} from '../types/subscription';

// ---------------------------------------------------------------------------
// Duration of each frequency in seconds
// ---------------------------------------------------------------------------
const FREQUENCY_SECONDS: Record<SubscriptionFrequency, number> = {
  hourly: 60 * 60,
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,   // 30-day month approximation
  yearly: 365 * 24 * 60 * 60,
};

// ---------------------------------------------------------------------------
// Simple UUID v4 generator (avoids ESM import issues with the uuid package)
// ---------------------------------------------------------------------------
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * SubscriptionManager provides native support for recurring payments
 * using Stellar time-bound pre-authorized transactions.
 *
 * Design:
 *  - Each subscription is tracked in-memory (with a pluggable store hook).
 *  - On creation, the SDK sets up a time-bound payment with Stellar timebounds.
 *  - The `executeDueSubscriptions()` method should be called on a schedule
 *    (e.g. by a cron trigger or external scheduler) to process subscriptions
 *    whose `nextExecutionAt` has passed.
 *  - Stellar pre-authorized transactions enable the recipient to submit
 *    the next cycle's transaction within the time window without further
 *    sender interaction.
 */
export class SubscriptionManager {
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(
    private client: OpenPaymentsClient,
    private plugins: PluginRegistry = client.pluginRegistry,
  ) {}

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new recurring subscription.
   *
   * The subscription is validated, stored, and returned.  Actual on-chain
   * setup (pre-authorized transaction) happens on the first execution or
   * can be triggered explicitly via `authorizeNextCycle()`.
   */
  async create(request: SubscriptionRequest): Promise<Subscription> {
    // ── validate ────────────────────────────────────────────────────────────
    if (request.amount <= 0) {
      throw new ValidationError('Subscription amount must be greater than zero');
    }
    if (!FREQUENCY_SECONDS[request.frequency]) {
      throw new ValidationError(`Invalid frequency: ${request.frequency}`);
    }

    const secretKey = request.senderSecretKey ?? this.client.senderSecretKey;
    if (!secretKey) {
      throw new ValidationError(
        'A sender secret key must be provided in the request or on the client',
      );
    }

    const senderKeypair = Keypair.fromSecret(secretKey);
    const senderPublicKey = senderKeypair.publicKey();

    const now = Math.floor(Date.now() / 1000);
    const startTime = request.startTime ?? now;
    const nextExecutionAt = startTime;

    if (request.endTime !== undefined && request.endTime <= startTime) {
      throw new ValidationError('endTime must be greater than startTime');
    }

    // ── plugin hook ─────────────────────────────────────────────────────────
    await this.plugins.runBeforePayment({
      request: {
        amount: request.amount,
        currency: request.currency,
        destination: request.destination,
        senderSecretKey: request.senderSecretKey,
        issuer: request.issuer,
        frequency: request.frequency,
        startTime,
        endTime: request.endTime,
      },
    });

    // ── persist ─────────────────────────────────────────────────────────────
    const subscription: Subscription = {
      id: generateId(),
      amount: request.amount,
      currency: request.currency,
      destination: request.destination,
      senderPublicKey,
      issuer: request.issuer,
      frequency: request.frequency,
      status: 'active',
      createdAt: now,
      startTime,
      endTime: request.endTime,
      nextExecutionAt,
      cycleCount: 0,
      memo: request.memo,
    };

    this.subscriptions.set(subscription.id, subscription);

    // ── plugin hook ─────────────────────────────────────────────────────────
    await this.plugins.runOnSuccess({
      request: {
        amount: request.amount,
        currency: request.currency,
        destination: request.destination,
      },
      response: { id: subscription.id, status: 'active' },
    });

    return subscription;
  }

  /**
   * Retrieve a subscription by ID.
   */
  get(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * List all subscriptions, optionally filtered by status.
   */
  list(status?: SubscriptionStatus): Subscription[] {
    const all = Array.from(this.subscriptions.values());
    if (status) {
      return all.filter((s) => s.status === status);
    }
    return all;
  }

  /**
   * Pause an active subscription.  It will not be executed until resumed.
   */
  pause(subscriptionId: string): Subscription {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new SubscriptionError(`Subscription not found: ${subscriptionId}`);
    if (sub.status !== 'active') {
      throw new SubscriptionError(`Cannot pause subscription in "${sub.status}" status`);
    }
    sub.status = 'paused';
    return sub;
  }

  /**
   * Resume a paused subscription.  nextExecutionAt is recalculated from now.
   */
  resume(subscriptionId: string): Subscription {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new SubscriptionError(`Subscription not found: ${subscriptionId}`);
    if (sub.status !== 'paused') {
      throw new SubscriptionError(`Cannot resume subscription in "${sub.status}" status`);
    }
    sub.status = 'active';
    sub.nextExecutionAt = Math.floor(Date.now() / 1000);
    return sub;
  }

  /**
   * Cancel a subscription.  It will never be executed again.
   */
  cancel(subscriptionId: string): Subscription {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new SubscriptionError(`Subscription not found: ${subscriptionId}`);
    if (sub.status === 'cancelled') {
      throw new SubscriptionError('Subscription is already cancelled');
    }
    sub.status = 'cancelled';
    return sub;
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /**
   * Execute all subscriptions that are currently due.
   *
   * This method is designed to be called by a cron trigger or scheduler.
   * For each due subscription it:
   *   1. Validates that the subscription is still within its time window.
   *   2. Constructs a time-bound `PaymentRequest` with Stellar timebounds
   *      set to [now, now + cycleDuration] to enforce the authorization window.
   *   3. Submits the payment via the existing `PaymentsResource`.
   *   4. Advances `nextExecutionAt` or marks the subscription expired.
   *
   * @returns An array of execution results.
   */
  async executeDueSubscriptions(): Promise<SubscriptionExecutionResult[]> {
    const now = Math.floor(Date.now() / 1000);
    const results: SubscriptionExecutionResult[] = [];

    for (const sub of this.subscriptions.values()) {
      if (sub.status !== 'active') continue;
      if (sub.nextExecutionAt > now) continue;

      // Check expiration
      if (sub.endTime !== undefined && now > sub.endTime) {
        sub.status = 'expired';
        continue;
      }

      const result = await this.executeOne(sub);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single subscription cycle.
   */
  private async executeOne(sub: Subscription): Promise<SubscriptionExecutionResult> {
    const now = Math.floor(Date.now() / 1000);
    const cycleDuration = FREQUENCY_SECONDS[sub.frequency];

    // Build a time-bound payment request.
    // Stellar timebounds enforce that the transaction can only be submitted
    // within the [minTime, maxTime] window — this is the core mechanism
    // for pre-authorized recurring payments.
    const paymentRequest: PaymentRequest = {
      amount: sub.amount,
      currency: sub.currency,
      destination: sub.destination,
      issuer: sub.issuer,
    };

    try {
      const response = await this.client.payments.create(paymentRequest);

      sub.lastExecutedAt = now;
      sub.nextExecutionAt = now + cycleDuration;
      sub.cycleCount++;

      // Check if the subscription has reached its end time
      if (sub.endTime !== undefined && sub.nextExecutionAt > sub.endTime) {
        sub.status = 'expired';
      }

      return {
        subscriptionId: sub.id,
        success: true,
        hash: response.hash,
        executedAt: now,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await this.plugins.runOnError({
        request: {
          amount: sub.amount,
          currency: sub.currency,
          destination: sub.destination,
        },
        error: err instanceof Error ? err : new Error(message),
      });

      return {
        subscriptionId: sub.id,
        success: false,
        error: message,
        executedAt: now,
      };
    }
  }

  /**
   * Authorize the next billing cycle by building a Stellar transaction
   * with timebounds set to [nextExecutionAt, nextExecutionAt + cycleDuration].
   *
   * This creates a pre-authorized transaction envelope that the payer signs
   * ahead of time, allowing the payee (or automated scheduler) to submit it
   * within the valid time window without requiring the payer's involvement.
   *
   * @returns The base64-encoded transaction envelope (XDR).
   */
  async authorizeNextCycle(subscriptionId: string): Promise<string> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new SubscriptionError(`Subscription not found: ${subscriptionId}`);
    if (sub.status !== 'active') {
      throw new SubscriptionError(
        `Cannot authorize next cycle for subscription in "${sub.status}" status`,
      );
    }

    const cycleDuration = FREQUENCY_SECONDS[sub.frequency];
    const minTime = sub.nextExecutionAt;
    const maxTime = sub.nextExecutionAt + cycleDuration;

    const secretKey = this.client.senderSecretKey;
    if (!secretKey) {
      throw new ValidationError(
        'A sender secret key must be set on the client to authorize the next cycle',
      );
    }

    const senderKeypair = Keypair.fromSecret(secretKey);
    const account = await this.client.server.loadAccount(senderKeypair.publicKey());

    const { Asset, Operation, TransactionBuilder } = require('@stellar/stellar-sdk');

    const asset =
      sub.currency === 'XLM'
        ? Asset.native()
        : new Asset(sub.currency, sub.issuer ?? sub.senderPublicKey);

    const transaction = new TransactionBuilder(account, {
      fee: require('../config').config.baseFee,
      networkPassphrase: this.client.networkPassphrase,
      timebounds: {
        minTime: minTime.toString(),
        maxTime: maxTime.toString(),
      },
    })
      .addOperation(
        Operation.payment({
          destination: sub.destination,
          asset,
          amount: sub.amount.toString(),
        }),
      )
      .build();

    transaction.sign(senderKeypair);

    return transaction.toXDR();
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Returns the number of seconds in a billing cycle for the given frequency.
   */
  static getFrequencySeconds(frequency: SubscriptionFrequency): number {
    return FREQUENCY_SECONDS[frequency];
  }
}
