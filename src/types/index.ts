export interface PaymentClientOptions {
  network: 'mainnet' | 'testnet';
  horizonUrl: string;
  maxFeeStroops: number;
  logger?: any;
}

export interface PaymentStreamOptions {
  account: string;
  cursor?: string;
}

export interface Sep38QuoteRequest {
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  context: string;
}

export interface Sep38QuoteResponse {
  id: string;
  expires_at: string;
  price: string;
  sell_amount: string;
  buy_amount: string;
}

export interface Sep38ClientOptions {
  enableGzip?: boolean;
  gzipThresholdBytes?: number;
  headers?: Record<string, string>;
}

export interface PaymentEvent {
  id: string;
  from: string;
  to: string;
  amount: string;
  asset_code: string;
  asset_issuer?: string;
  asset_type: string;
  created_at: string;
}
