import axios, { AxiosRequestConfig } from 'axios';
import * as zlib from 'zlib';
import { Sep38QuoteRequest, Sep38QuoteResponse, Sep38ClientOptions } from './types';

export class Sep38Client {
  private enableGzip: boolean;
  private gzipThresholdBytes: number;
  private customHeaders: Record<string, string>;

  constructor(
    private anchorUrl: string,
    private logger?: any,
    options?: Sep38ClientOptions
  ) {
    this.enableGzip = options?.enableGzip ?? true;
    this.gzipThresholdBytes = options?.gzipThresholdBytes ?? 1024;
    this.customHeaders = options?.headers ?? {};
  }

  /**
   * Request a fiat on-ramp/off-ramp quote from the SEP-38 anchor server.
   */
  public async getQuote(params: Sep38QuoteRequest, authToken?: string): Promise<Sep38QuoteResponse> {
    const url = `${this.anchorUrl}/quote`;
    
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(`SEP-38: Requesting quote for ${params.sellAmount} ${params.sellAsset} -> ${params.buyAsset}`);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.customHeaders,
      };

      if (this.enableGzip) {
        headers['Accept-Encoding'] = 'gzip, deflate, br';
      }
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const bodyData = {
        sell_asset: params.sellAsset,
        buy_asset: params.buyAsset,
        sell_amount: params.sellAmount,
        context: params.context,
      };

      const jsonString = JSON.stringify(bodyData);
      let requestData: string | Buffer = jsonString;

      if (this.enableGzip && Buffer.byteLength(jsonString, 'utf8') >= this.gzipThresholdBytes) {
        requestData = zlib.gzipSync(Buffer.from(jsonString, 'utf8'));
        headers['Content-Encoding'] = 'gzip';
        if (this.logger && typeof this.logger.debug === 'function') {
          this.logger.debug(`SEP-38: Compressed outbound payload with gzip (${Buffer.byteLength(jsonString)} -> ${requestData.length} bytes)`);
        }
      }

      const config: AxiosRequestConfig = {
        headers,
        decompress: true,
      };

      const response = await axios.post<Sep38QuoteResponse>(
        url,
        requestData,
        config
      );

      return response.data;
    } catch (error: any) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error(`SEP-38: Failed to get quote: ${error.message}`);
      }
      throw new Error(`SEP-38 Request Failed: ${error.response?.data?.error || error.message}`);
    }
  }
}
