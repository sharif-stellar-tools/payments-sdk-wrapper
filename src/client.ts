import { Horizon, Networks } from '@stellar/stellar-sdk';
import { PaymentsResource } from './resources/payments';

export class OpenPaymentsClient {
  public payments: PaymentsResource;
  public server: Horizon.Server;

  constructor(
    _apiKey: string,
    public baseUrl: string,
    public senderSecretKey?: string,
    public networkPassphrase: string = Networks.TESTNET,
  ) {
    this.server = new Horizon.Server(baseUrl);
    this.payments = new PaymentsResource(this);
  }
}
