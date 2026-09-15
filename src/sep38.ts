import axios from 'axios';
import { Sep38QuoteRequest, Sep38QuoteResponse } from './types';
import { createSdkLogger, SdkLogger, SupportedLogger } from './logger';

export class Sep38Client {
  public logger: SdkLogger;

  constructor(private anchorUrl: string, logger?: SupportedLogger) {
    this.logger = createSdkLogger(logger, 'SEP-38');
  }

  /**
   * Request a fiat on-ramp/off-ramp quote from the SEP-38 anchor server.
   */
  public async getQuote(params: Sep38QuoteRequest, authToken?: string): Promise<Sep38QuoteResponse> {
    const url = `${this.anchorUrl}/quote`;
    
    this.logger.info(`Requesting quote for ${params.sellAmount} ${params.sellAsset} -> ${params.buyAsset}`, {
      sellAsset: params.sellAsset,
      buyAsset: params.buyAsset,
      sellAmount: params.sellAmount,
      context: params.context,
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await axios.post<Sep38QuoteResponse>(
        url,
        {
          sell_asset: params.sellAsset,
          buy_asset: params.buyAsset,
          sell_amount: params.sellAmount,
          context: params.context,
        },
        { headers }
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get quote: ${error.message}`, { error });
      throw new Error(`SEP-38 Request Failed: ${error.response?.data?.error || error.message}`);
    }
  }
}
