export interface PaymentRequest {
  amount: number;
  currency: string;
  destination: string;
  senderSecretKey?: string;
  issuer?: string;
}

export interface PaymentResponse {
  id: string;
  status: string;
  hash?: string;
}

export interface BatchPaymentResponse {
  transactionHash: string;
  operationCount: number;
}
