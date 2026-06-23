import * as dotenv from 'dotenv';
import { Networks } from '@stellar/stellar-sdk';

// Load environment variables from .env file
dotenv.config();

export const config = {
  get horizonUrl() {
    return process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
  },
  get networkPassphrase() {
    return process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
  },
  get senderSecretKey() {
    return process.env.SENDER_SECRET_KEY;
  },
  get baseFee() {
    return process.env.BASE_FEE || '100';
  },
  get txTimeoutSeconds() {
    return parseInt(process.env.TX_TIMEOUT_SECONDS || '30', 10);
  },
  get maxOperations() {
    return parseInt(process.env.MAX_OPERATIONS || '100', 10);
  },
};
