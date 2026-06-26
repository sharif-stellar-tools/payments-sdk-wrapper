export interface PaymentRequest {
  amount: number;
  currency: string;
  destination: string;
  senderSecretKey?: string;
  issuer?: string;
  /** When true, use path payment strict send (exact amount to destination) */
  strictSend?: boolean;
  /** When true, use path payment strict receive (exact source amount) */
  strictReceive?: boolean;
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
