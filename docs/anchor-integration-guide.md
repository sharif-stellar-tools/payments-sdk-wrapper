# Anchor Integration End-to-End Developer Guide

This guide details how to integrate and interact with Stellar Anchor services (on-ramps, off-ramps, and cross-border corridors) using the `payments-sdk-wrapper`. It covers the full lifecycle of anchor interaction on Stellar Testnet, including rate quotation (SEP-38), transaction authorization, fee protection via `FeeGuard`, and transaction submission.

---

## 1. Overview & Architecture

Stellar Anchors serve as financial bridges between on-chain assets (e.g. `USDC`, `EURC`) and off-chain traditional banking rails (SEPA, ACH, Pix). The integration leverages standard Stellar Ecosystem Proposals (SEPs):

```
+--------------------------+          +---------------------------+          +-------------------------+
|   Client Application     |  ----->  |    PaymentClient (SDK)    |  ----->  | Stellar Horizon / Soroban|
| (payments-sdk-wrapper)   |          |  (FeeGuard + Sep38Client) |          |         Testnet         |
+--------------------------+          +---------------------------+          +-------------------------+
             |                                      |
             |                                      v
             +----------------------------> +---------------------------+
                                            |   Anchor Server (SEP-38)  |
                                            | (Quotes & Fiat Settlement)|
                                            +---------------------------+
```

- **SEP-38 (Anchor RFQ API)**: Provides firm quotes and pricing for exchanging off-chain fiat or on-chain assets before initiating a transfer.
- **FeeGuard Engine**: Ensures transactions do not exceed safety fee thresholds before submission to Horizon.
- **PaymentStream**: Server-Sent Events (SSE) stream for monitoring real-time payments and settlement events.

---

## 2. Prerequisites & Client Initialization

To connect to a live testnet anchor, instantiate `PaymentClient` with the target Horizon RPC endpoint and the anchor base URL:

```typescript
import { PaymentClient } from 'payments-sdk-wrapper';

// Initialize the client for Stellar Testnet
const client = new PaymentClient({
  horizonUrl: 'https://horizon-testnet.stellar.org',
  maxFeeStroops: 10_000, // 0.001 XLM max fee safeguard
  anchorUrl: 'https://testanchor.stellar.org', // Testnet anchor endpoint
  logger: console,
});
```

---

## 3. End-to-End On-Ramp (Deposit) Flow

An on-ramp flow allows a user to deposit fiat currency and receive tokenized assets (e.g., USDC) on Stellar.

### Step 1: Request an Exchange Quote (SEP-38)
Before depositing funds, query the anchor's SEP-38 endpoint to obtain a guaranteed exchange rate:

```typescript
async function getDepositQuote(client: PaymentClient, userAuthToken?: string) {
  const quote = await client.sep38.getQuote(
    {
      sellAsset: 'iso4217:USD',
      buyAsset: 'stellar:USDC:GBBDU6VU2FS277747H5RTV7WGHQ22W6V6OQC2M5VOHJ7G2U43G3XN3Z6',
      sellAmount: '100.00',
      context: 'sep24',
    },
    userAuthToken
  );

  console.log('Quote Received:');
  console.log(`- Quote ID: ${quote.id}`);
  console.log(`- You receive: ${quote.buy_amount} USDC`);
  console.log(`- Exchange rate: ${quote.price}`);
  console.log(`- Expires at: ${quote.expires_at}`);

  return quote;
}
```

### Step 2: Listen for Inbound Payment via PaymentStream
Once the user deposits fiat through the anchor's payment rails, monitor the user's Stellar account for the arrival of the minted tokens:

```typescript
function watchForDeposit(client: PaymentClient, accountId: string) {
  const stream = client.createStream({
    accountId,
    cursor: 'now',
    onPayment: (payment) => {
      console.log(`[Payment Received] Amount: ${payment.amount} ${payment.asset_code}`);
      console.log(`Transaction Hash: ${payment.transaction_hash}`);
    },
    onError: (err) => {
      console.error('PaymentStream connection error:', err);
    },
  });

  // To close listener when done:
  // stream.close();
}
```

---

## 4. End-to-End Off-Ramp (Withdrawal) Flow

An off-ramp allows users to burn or send on-chain tokens in exchange for local fiat delivered to their bank account.

### Step 1: Request a Withdrawal Quote (SEP-38)
```typescript
async function getWithdrawalQuote(client: PaymentClient, userAuthToken?: string) {
  return await client.sep38.getQuote(
    {
      sellAsset: 'stellar:USDC:GBBDU6VU2FS277747H5RTV7WGHQ22W6V6OQC2M5VOHJ7G2U43G3XN3Z6',
      buyAsset: 'iso4217:EUR',
      sellAmount: '50.00',
      context: 'sep24',
    },
    userAuthToken
  );
}
```

### Step 2: Construct, Guard, and Submit Transfer
Construct the payment transaction directing the tokens to the anchor's receiving address with the memo specified by the anchor:

```typescript
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
} from '@stellar/stellar-sdk';

async function submitWithdrawal(
  client: PaymentClient,
  senderKeypair: Keypair,
  anchorReceivingAddress: string,
  quoteId: string,
  amount: string
) {
  // Fetch sender account sequence
  const senderAccount = await client.server.loadAccount(senderKeypair.publicKey());

  const asset = new Asset(
    'USDC',
    'GBBDU6VU2FS277747H5RTV7WGHQ22W6V6OQC2M5VOHJ7G2U43G3XN3Z6'
  );

  // Build transaction with appropriate fee and memo
  const transaction = new TransactionBuilder(senderAccount, {
    fee: '1000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: anchorReceivingAddress,
        asset,
        amount,
      })
    )
    .setTimeout(180)
    .build();

  // Sign transaction with sender's keypair
  transaction.sign(senderKeypair);

  // FeeGuard checks transaction fee against client options before submitting
  const result = await client.submitTransaction(transaction);
  console.log(`Withdrawal submitted successfully: ${result.hash}`);
  return result;
}
```

---

## 5. Error Handling & Edge Cases

When integrating with anchors in production or testnet environments:

1. **Quote Expiration**: Always inspect `quote.expires_at`. Do not submit payments against expired quote IDs; anchors may reject or re-rate transactions.
2. **Fee Spikes (`FeeGuardEngine`)**: If network surge pricing causes transaction fees to exceed `maxFeeStroops`, `submitTransaction` throws `Error("Transaction fee exceeds maximum limit")` to prevent unexpected expense.
3. **Horizon Rate Limits (HTTP 429)**: Horizon testnet rate limits requests to 3600 requests per hour per IP. Catch 429 exceptions and backoff before retrying.
4. **Network Verification**: Ensure `Networks.TESTNET` or `Networks.PUBLIC` aligns strictly with your configured Horizon RPC endpoint.
