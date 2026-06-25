import { Account, Keypair } from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../../src/client';
import { SubscriptionManager } from '../../src/resources/subscription-manager';
import { ValidationError, SubscriptionError } from '../../src/errors';
import {
  Subscription,
  SubscriptionRequest,
  SubscriptionFrequency,
} from '../../src/types/subscription';

// ─── helpers ──────────────────────────────────────────────────────────────────

const senderKeypair = Keypair.random();
const destinationKeypair = Keypair.random();

function createMockClient(
  overrides: Partial<Record<'loadAccount' | 'submitTransaction', jest.Mock>> = {},
) {
  const client = new OpenPaymentsClient(
    'test-api-key',
    'https://horizon-testnet.stellar.org',
    senderKeypair.secret(),
  );
  client.server = {
    loadAccount:
      overrides.loadAccount ??
      jest.fn(async () => new Account(senderKeypair.publicKey(), '1')),
    submitTransaction:
      overrides.submitTransaction ??
      jest.fn(async () => ({ hash: 'test-hash' })),
  } as any;
  // Recreate the subscription manager with the mocked server
  client.subscriptions = new SubscriptionManager(client, client.pluginRegistry);
  return client;
}

function makeSubscriptionRequest(
  overrides: Partial<SubscriptionRequest> = {},
): SubscriptionRequest {
  return {
    amount: 10,
    currency: 'XLM',
    destination: destinationKeypair.publicKey(),
    senderSecretKey: senderKeypair.secret(),
    frequency: 'monthly',
    ...overrides,
  };
}

// ─── SubscriptionManager.create ───────────────────────────────────────────────

describe('SubscriptionManager — create', () => {
  it('creates a monthly subscription with correct defaults', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());

    expect(sub.id).toBeDefined();
    expect(sub.amount).toBe(10);
    expect(sub.currency).toBe('XLM');
    expect(sub.destination).toBe(destinationKeypair.publicKey());
    expect(sub.frequency).toBe('monthly');
    expect(sub.status).toBe('active');
    expect(sub.cycleCount).toBe(0);
    expect(sub.senderPublicKey).toBe(senderKeypair.publicKey());
    expect(sub.nextExecutionAt).toBe(sub.startTime);
  });

  it('creates a subscription with a custom start and end time', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);
    const sub = await client.subscriptions.create(
      makeSubscriptionRequest({
        startTime: now + 3600,
        endTime: now + 3600 * 24 * 365,
      }),
    );

    expect(sub.startTime).toBe(now + 3600);
    expect(sub.endTime).toBe(now + 3600 * 24 * 365);
    expect(sub.nextExecutionAt).toBe(now + 3600);
  });

  it('stores and retrieves the subscription via get()', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());

    const retrieved = client.subscriptions.get(sub.id);
    expect(retrieved).toEqual(sub);
  });

  it('throws ValidationError for non-positive amount', async () => {
    const client = createMockClient();
    await expect(
      client.subscriptions.create(makeSubscriptionRequest({ amount: -5 })),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for invalid frequency', async () => {
    const client = createMockClient();
    await expect(
      client.subscriptions.create(
        makeSubscriptionRequest({ frequency: 'biweekly' as SubscriptionFrequency }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when no sender secret key is available', async () => {
    const client = createMockClient();
    // Remove the default secret key
    client.senderSecretKey = undefined;
    await expect(
      client.subscriptions.create({
        amount: 10,
        currency: 'XLM',
        destination: destinationKeypair.publicKey(),
        frequency: 'monthly',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when endTime <= startTime', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);
    await expect(
      client.subscriptions.create(
        makeSubscriptionRequest({
          startTime: now + 1000,
          endTime: now + 500,
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('creates subscriptions with all supported frequencies', async () => {
    const client = createMockClient();
    const frequencies: SubscriptionFrequency[] = [
      'hourly', 'daily', 'weekly', 'monthly', 'yearly',
    ];

    for (const freq of frequencies) {
      const sub = await client.subscriptions.create(
        makeSubscriptionRequest({ frequency: freq }),
      );
      expect(sub.frequency).toBe(freq);
      expect(sub.status).toBe('active');
    }
  });
});

// ─── SubscriptionManager — list / pause / resume / cancel ────────────────────

describe('SubscriptionManager — lifecycle management', () => {
  it('list() returns all subscriptions', async () => {
    const client = createMockClient();
    await client.subscriptions.create(makeSubscriptionRequest({ memo: 'A' }));
    await client.subscriptions.create(makeSubscriptionRequest({ memo: 'B' }));

    const all = client.subscriptions.list();
    expect(all).toHaveLength(2);
  });

  it('list() filters by status', async () => {
    const client = createMockClient();
    const sub1 = await client.subscriptions.create(makeSubscriptionRequest());
    const sub2 = await client.subscriptions.create(makeSubscriptionRequest());

    client.subscriptions.pause(sub1.id);

    const active = client.subscriptions.list('active');
    const paused = client.subscriptions.list('paused');
    expect(active).toHaveLength(1);
    expect(paused).toHaveLength(1);
    expect(active[0].id).toBe(sub2.id);
    expect(paused[0].id).toBe(sub1.id);
  });

  it('pause() transitions active → paused', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());
    const paused = client.subscriptions.pause(sub.id);

    expect(paused.status).toBe('paused');
    expect(client.subscriptions.get(sub.id)?.status).toBe('paused');
  });

  it('pause() throws for non-active subscriptions', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());
    client.subscriptions.cancel(sub.id);

    expect(() => client.subscriptions.pause(sub.id)).toThrow(SubscriptionError);
  });

  it('resume() transitions paused → active and resets nextExecutionAt', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());
    client.subscriptions.pause(sub.id);

    const beforeResume = Math.floor(Date.now() / 1000);
    const resumed = client.subscriptions.resume(sub.id);

    expect(resumed.status).toBe('active');
    expect(resumed.nextExecutionAt).toBeGreaterThanOrEqual(beforeResume);
  });

  it('resume() throws for non-paused subscriptions', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());

    expect(() => client.subscriptions.resume(sub.id)).toThrow(SubscriptionError);
  });

  it('cancel() transitions to cancelled', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());
    const cancelled = client.subscriptions.cancel(sub.id);

    expect(cancelled.status).toBe('cancelled');
  });

  it('cancel() throws when already cancelled', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());
    client.subscriptions.cancel(sub.id);

    expect(() => client.subscriptions.cancel(sub.id)).toThrow(SubscriptionError);
  });

  it('pause/cancel on non-existent subscription throws', () => {
    const client = createMockClient();
    expect(() => client.subscriptions.pause('no-such-id')).toThrow(SubscriptionError);
    expect(() => client.subscriptions.cancel('no-such-id')).toThrow(SubscriptionError);
    expect(() => client.subscriptions.resume('no-such-id')).toThrow(SubscriptionError);
  });
});

// ─── SubscriptionManager — executeDueSubscriptions ──────────────────────────

describe('SubscriptionManager — executeDueSubscriptions', () => {
  it('executes a due subscription and advances nextExecutionAt', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);

    // Create a subscription that is due now (startTime in the past)
    const sub = await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now - 1 }),
    );
    expect(sub.nextExecutionAt).toBe(now - 1);

    const results = await client.subscriptions.executeDueSubscriptions();

    expect(results).toHaveLength(1);
    expect(results[0].subscriptionId).toBe(sub.id);
    expect(results[0].success).toBe(true);
    expect(results[0].hash).toBe('test-hash');

    const updated = client.subscriptions.get(sub.id)!;
    expect(updated.cycleCount).toBe(1);
    expect(updated.lastExecutedAt).toBeGreaterThanOrEqual(now - 1);
    expect(updated.nextExecutionAt).toBeGreaterThan(now - 1);
  });

  it('skips paused and cancelled subscriptions', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);

    const sub1 = await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now - 1, memo: 'A' }),
    );
    const sub2 = await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now - 1, memo: 'B' }),
    );

    client.subscriptions.pause(sub1.id);
    client.subscriptions.cancel(sub2.id);

    const results = await client.subscriptions.executeDueSubscriptions();
    expect(results).toHaveLength(0);
  });

  it('skips subscriptions whose nextExecutionAt is in the future', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);

    await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now + 3600 }),
    );

    const results = await client.subscriptions.executeDueSubscriptions();
    expect(results).toHaveLength(0);
  });

  it('marks subscription as expired when now > endTime', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);

    const sub = await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now - 100, endTime: now - 1 }),
    );

    const results = await client.subscriptions.executeDueSubscriptions();
    expect(results).toHaveLength(0);

    const expired = client.subscriptions.get(sub.id)!;
    expect(expired.status).toBe('expired');
  });

  it('marks subscription expired after execution passes endTime', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);
    // Set end time far enough in the future for the first cycle to succeed
    // but after one cycle the nextExecutionAt will exceed endTime
    const cycleSeconds = SubscriptionManager.getFrequencySeconds('monthly');

    const sub = await client.subscriptions.create(
      makeSubscriptionRequest({
        startTime: now - 1,
        endTime: now + Math.floor(cycleSeconds / 2), // halfway through next cycle
      }),
    );

    const results = await client.subscriptions.executeDueSubscriptions();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // After execution, next cycle should be past endTime => expired
    const updated = client.subscriptions.get(sub.id)!;
    expect(updated.status).toBe('expired');
  });

  it('returns error result when payment submission fails', async () => {
    const submitTransaction = jest.fn().mockRejectedValue(new Error('network failure'));
    const client = createMockClient({ submitTransaction });
    const now = Math.floor(Date.now() / 1000);

    await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now - 1 }),
    );

    const results = await client.subscriptions.executeDueSubscriptions();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('network failure');
  });
});

// ─── SubscriptionManager — authorizeNextCycle ───────────────────────────────

describe('SubscriptionManager — authorizeNextCycle', () => {
  it('throws for a non-existent subscription', async () => {
    const client = createMockClient();
    await expect(
      client.subscriptions.authorizeNextCycle('no-such-id'),
    ).rejects.toThrow(SubscriptionError);
  });

  it('throws for a non-active subscription', async () => {
    const client = createMockClient();
    const sub = await client.subscriptions.create(makeSubscriptionRequest());
    client.subscriptions.cancel(sub.id);

    await expect(
      client.subscriptions.authorizeNextCycle(sub.id),
    ).rejects.toThrow(SubscriptionError);
  });

  it('returns an XDR envelope for an active subscription', async () => {
    const client = createMockClient();
    const now = Math.floor(Date.now() / 1000);
    const sub = await client.subscriptions.create(
      makeSubscriptionRequest({ startTime: now + 3600 }),
    );

    const xdr = await client.subscriptions.authorizeNextCycle(sub.id);
    expect(typeof xdr).toBe('string');
    expect(xdr.length).toBeGreaterThan(0);
  });
});

// ─── SubscriptionManager — static helpers ───────────────────────────────────

describe('SubscriptionManager — static helpers', () => {
  it('getFrequencySeconds returns correct durations', () => {
    expect(SubscriptionManager.getFrequencySeconds('hourly')).toBe(3600);
    expect(SubscriptionManager.getFrequencySeconds('daily')).toBe(86400);
    expect(SubscriptionManager.getFrequencySeconds('weekly')).toBe(604800);
    expect(SubscriptionManager.getFrequencySeconds('monthly')).toBe(2592000);
    expect(SubscriptionManager.getFrequencySeconds('yearly')).toBe(31536000);
  });
});
