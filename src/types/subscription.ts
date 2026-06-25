/**
 * Types for recurring subscriptions via time-bound authorizations.
 *
 * Leverages Stellar's pre-authorized transactions and timebounds
 * to implement subscription billing cycles.
 */

/** Frequency of a subscription's billing cycle. */
export type SubscriptionFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Status of a subscription. */
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired';

/** Request object to create a new subscription. */
export interface SubscriptionRequest {
  /** Amount to charge per billing cycle (in units of the asset). */
  amount: number;
  /** Asset code to use for each payment (e.g. 'XLM', 'USDC'). */
  currency: string;
  /** Destination public key that receives the recurring payment. */
  destination: string;
  /** Sender's Stellar secret key (can fall back to client default). */
  senderSecretKey?: string;
  /** Issuer public key for non-native assets. */
  issuer?: string;
  /** Billing frequency. */
  frequency: SubscriptionFrequency;
  /** Optional: start time as a UNIX timestamp (seconds). Defaults to now. */
  startTime?: number;
  /** Optional: end time as a UNIX timestamp (seconds). If omitted the subscription runs indefinitely until cancelled. */
  endTime?: number;
  /** Optional: human-readable label for this subscription. */
  memo?: string;
}

/** Represents a persisted subscription. */
export interface Subscription {
  /** Unique subscription identifier (UUID). */
  id: string;
  /** Amount charged per cycle. */
  amount: number;
  /** Currency code. */
  currency: string;
  /** Destination public key. */
  destination: string;
  /** Sender public key (derived from the secret at creation time). */
  senderPublicKey: string;
  /** Issuer for custom assets. */
  issuer?: string;
  /** Billing frequency. */
  frequency: SubscriptionFrequency;
  /** Current status. */
  status: SubscriptionStatus;
  /** UNIX timestamp (seconds) when the subscription was created. */
  createdAt: number;
  /** UNIX timestamp (seconds) when the first billing cycle starts. */
  startTime: number;
  /** UNIX timestamp (seconds) when the subscription expires, if set. */
  endTime?: number;
  /** UNIX timestamp (seconds) of the most recent successful payment. */
  lastExecutedAt?: number;
  /** UNIX timestamp (seconds) of the next scheduled payment. */
  nextExecutionAt: number;
  /** Total number of successful billing cycles executed. */
  cycleCount: number;
  /** Human-readable memo. */
  memo?: string;
}

/** Result of a subscription execution attempt. */
export interface SubscriptionExecutionResult {
  /** The subscription ID. */
  subscriptionId: string;
  /** Whether the execution was successful. */
  success: boolean;
  /** The payment response hash if successful. */
  hash?: string;
  /** Error message if the execution failed. */
  error?: string;
  /** Timestamp of execution. */
  executedAt: number;
}
