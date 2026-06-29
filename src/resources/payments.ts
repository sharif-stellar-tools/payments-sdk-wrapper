import {
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { OpenPaymentsClient } from '../client';
import { mapStellarError, ValidationError } from '../errors';
import { PluginRegistry } from '../plugins/registry';
import { PaymentRequest, PaymentResponse, BatchPaymentResponse } from '../types';
import { validatePaymentRequest } from '../validation';

import { config } from '../config';

export class PaymentsResource {
  constructor(
    private client: OpenPaymentsClient,
    private plugins: PluginRegistry = new PluginRegistry(),
  ) {}

  async create(payload: PaymentRequest): Promise<PaymentResponse> {
    validatePaymentRequest(payload);

    const context = { request: { ...payload } };

    // ── beforePayment ─────────────────────────────────────────────────────────
    // Any plugin can abort the payment by throwing here.
    await this.plugins.runBeforePayment(context);

    const secretKey = payload.senderSecretKey ?? this.client.senderSecretKey;
    if (!secretKey) {
      throw new ValidationError(
        'A sender secret key must be provided in the payload or on the client',
      );
    }

    let senderKeypair;
    let account;
    try {
      senderKeypair = Keypair.fromSecret(secretKey);
      account = await this.client.server.loadAccount(senderKeypair.publicKey());
    } catch (err) {
      throw mapStellarError(err);
    }
    const sourcePublicKey = senderKeypair.publicKey();

    const asset =
      payload.currency === 'XLM'
        ? Asset.native()
        : new Asset(payload.currency, payload.issuer ?? sourcePublicKey);

    let operation: Operation;

    if (payload.strictSend) {
      // PathPaymentStrictSend: specify exact destination amount
      operation = Operation.pathPaymentStrictSend({
        sendAsset: asset,
        sendAmount: payload.amount.toString(),
        destination: payload.destination,
        destAsset: Asset.native(),
        destMin: payload.amount.toString(),
      }) as unknown as Operation;
    } else if (payload.strictReceive) {
      // PathPaymentStrictReceive: specify exact source amount
      operation = Operation.pathPaymentStrictReceive({
        sendAsset: asset,
        sendAmount: payload.amount.toString(),
        destination: payload.destination,
        destAsset: Asset.native(),
        destMin: payload.amount.toString(),
        sendMax: (payload.amount * 1.1).toString(),
      }) as unknown as Operation;
    } else {
      // Standard payment
      operation = Operation.payment({
        destination: payload.destination,
        asset,
        amount: payload.amount.toString(),
      });
    }

    const transaction = new TransactionBuilder(account, {
      fee: config.baseFee,
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(config.txTimeoutSeconds)
      .build();

    transaction.sign(senderKeypair);

    let result: { hash: string };
    try {
      result = await this.client.server.submitTransaction(transaction);
    } catch (err) {
      const error = mapStellarError(err);
      // ── onError ─────────────────────────────────────────────────────────────
      await this.plugins.runOnError({ ...context, error });
      throw error;
    }

    const response: PaymentResponse = {
      id: result.hash,
      status: 'completed',
      hash: result.hash,
    };

    // ── onSuccess ────────────────────────────────────────────────────────────
    await this.plugins.runOnSuccess({ ...context, response });

    return response;
  }

  async submitBatchedPayments(paymentsArray: PaymentRequest[]): Promise<BatchPaymentResponse> {
    if (paymentsArray.length > config.maxOperations) {
      throw new ValidationError(
        `Batch size of ${paymentsArray.length} exceeds Stellar's limit of ${config.maxOperations} operations per transaction.`,
      );
    }

    const secretKey = this.client.senderSecretKey;
    if (!secretKey) {
      throw new ValidationError(
        'A sender secret key must be set on the client to submit batched payments',
      );
    }

    for (const payment of paymentsArray) {
      if (payment.currency !== 'XLM' && !payment.issuer) {
        throw new ValidationError(
          `Payment to "${payment.destination}" uses asset "${payment.currency}" but no issuer was provided. ` +
          `Set payment.issuer to the asset issuer's public key.`,
        );
      }
    }

    // For batch payments we synthesise a single context that covers the whole
    // batch. Individual per-payment plugin hooks are not run here because the
    // batch is submitted as a single atomic Stellar transaction.
    const batchContext = {
      request: {
        amount: 0,
        currency: 'BATCH',
        destination: '',
        batch: paymentsArray,
      },
    };

    // ── beforePayment ─────────────────────────────────────────────────────────
    await this.plugins.runBeforePayment(batchContext);

    let sourceKeypair;
    let sourceAccount;
    try {
      sourceKeypair = Keypair.fromSecret(secretKey);
      sourceAccount = await this.client.server.loadAccount(sourceKeypair.publicKey());
    } catch (err) {
      throw mapStellarError(err);
    }

    let builder = new TransactionBuilder(sourceAccount, {
      fee: config.baseFee,
      networkPassphrase: this.client.networkPassphrase,
    });

    for (const payment of paymentsArray) {
      const asset =
        payment.currency === 'XLM'
          ? Asset.native()
          : new Asset(payment.currency, payment.issuer!);

      builder = builder.addOperation(
        Operation.payment({
          destination: payment.destination,
          asset,
          amount: String(payment.amount),
        }),
      );
    }

    const tx = builder.setTimeout(config.txTimeoutSeconds).build();
    tx.sign(sourceKeypair);

    let result: { hash: string };
    try {
      result = await this.client.server.submitTransaction(tx);
    } catch (err) {
      const error = mapStellarError(err);
      // ── onError ─────────────────────────────────────────────────────────────
      await this.plugins.runOnError({ ...batchContext, error });
      throw error;
    }

    const batchResponse: BatchPaymentResponse = {
      transactionHash: result.hash,
      operationCount: paymentsArray.length,
    };

    // ── onSuccess ────────────────────────────────────────────────────────────
    await this.plugins.runOnSuccess({
      request: batchContext.request,
      response: { id: result.hash, status: 'completed', hash: result.hash },
    });

    return batchResponse;
  }
}
