<div align="center">
  <h1>payments-sdk-wrapper</h1>
  <p><strong>Seamless cross-border payment protocol integration using Stellar.</strong></p>
</div>

<br />

## 📖 Overview

payments-sdk-wrapper is a critical component of our decentralized ecosystem. This repository contains the source code, tests, and deployment configurations necessary to run the service. Built with modern, enterprise-grade architecture, it ensures high availability, secure execution, and seamless integration with the broader network.

## ✨ Key Features

- **Robust Architecture**: Designed to handle high-throughput and scale horizontally.
- **Secure by Default**: Follows industry-standard security practices and comprehensive auditing guidelines.
- **Extensible Integration**: Exposes clean, well-documented interfaces for third-party extensions.
- **Comprehensive Testing**: Backed by a strict CI/CD pipeline enforcing an 85%+ code coverage requirement.

## 🚀 Getting Started

### Prerequisites
- Make sure you have the latest stable versions of our core toolchains (e.g., Node.js, Rust/Cargo) installed.
- Ensure Docker is installed for running localized integration environments.

### Local Installation

```bash
# Clone the repository
git clone https://github.com/YourOrganization/payments-sdk-wrapper.git
cd payments-sdk-wrapper

# Install dependencies and build
# (Refer to package.json or Cargo.toml for specific build commands)
```

## ⚠️ Error Handling

Every error this SDK throws extends `PaymentSDKError`, so you can catch that single
type to handle all SDK failures generically, or catch a specific subclass to react
to one failure mode. The original error (raw Stellar SDK error, Axios error, etc.)
is always preserved on `error.cause` for debugging/logging.

| Class                    | Thrown when                                                              |
| ------------------------ | ------------------------------------------------------------------------- |
| `ValidationError`        | A request fails local/schema validation before it's sent to the network (bad amount, malformed address, missing key, etc). |
| `NetworkError`           | The SDK couldn't get a usable response from Horizon/RPC at all (timeout, connection refused, 5xx, rate limiting). |
| `AccountNotFoundError`   | The requested Stellar account does not exist on the network.            |
| `TransactionFailedError` | Horizon accepted the request but rejected the transaction. Carries `resultCodes` with Horizon's parsed failure reason. |
| `InsufficientFundsError` | A `TransactionFailedError` specifically caused by an underfunded source account. |

```ts
import {
  AccountNotFoundError,
  InsufficientFundsError,
  NetworkError,
  TransactionFailedError,
  ValidationError,
} from 'payments-sdk-wrapper';

try {
  await client.payments.create(paymentRequest);
} catch (error) {
  if (error instanceof InsufficientFundsError) {
    // error.resultCodes has Horizon's raw failure codes
    console.error('Not enough balance to complete this payment:', error.resultCodes);
  } else if (error instanceof AccountNotFoundError) {
    console.error('The sender or destination account does not exist on this network');
  } else if (error instanceof TransactionFailedError) {
    console.error('Transaction rejected by the network:', error.resultCodes);
  } else if (error instanceof NetworkError) {
    console.error('Could not reach the Stellar network, consider retrying:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Invalid payment request:', error.message);
  } else {
    throw error; // unexpected error, let it propagate
  }

  // The original error is always available for logging/debugging:
  console.debug('Original cause:', error.cause);
}
```

## 🤝 Contributing
We welcome contributions from the community! Please read our [Contributing Guidelines](./CONTRIBUTING.md) to get started. Before submitting a Pull Request, ensure that you have reviewed our [Code of Conduct](./CODE_OF_CONDUCT.md).

## 📄 License
This project is licensed under the MIT License. See the LICENSE file for more details.

## Issue #83 Fix
Documentation updated per issue requirements.
