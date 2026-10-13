import { Sep38Client } from '../src/sep38';
import axios from 'axios';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Sep38Client Gzip Compression', () => {
  it('should include Accept-Encoding header and decompress: true when enableGzip is true', async () => {
    const client = new Sep38Client('https://mock-anchor.com', undefined, { enableGzip: true });
    mockedAxios.post.mockResolvedValue({ data: { id: 'quote_gzip_test' } });

    const quote = await client.getQuote({
      sellAsset: 'iso4217:USD',
      buyAsset: 'stellar:USDC:GA5Z',
      sellAmount: '100.00',
      context: 'sep6',
    });

    expect(quote.id).toBe('quote_gzip_test');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://mock-anchor.com/quote',
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept-Encoding': 'gzip, deflate, br',
        }),
        decompress: true,
      })
    );
  });

  it('should compress body and set Content-Encoding header when payload exceeds gzipThresholdBytes', async () => {
    const client = new Sep38Client('https://mock-anchor.com', undefined, {
      enableGzip: true,
      gzipThresholdBytes: 20,
    });
    mockedAxios.post.mockResolvedValue({ data: { id: 'quote_large_payload' } });

    await client.getQuote({
      sellAsset: 'iso4217:USD',
      buyAsset: 'stellar:USDC:GA5Z',
      sellAmount: '5000000.00',
      context: 'sep6',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://mock-anchor.com/quote',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Encoding': 'gzip',
          'Accept-Encoding': 'gzip, deflate, br',
        }),
        decompress: true,
      })
    );
  });

  it('should not compress or add Accept-Encoding when enableGzip is false', async () => {
    const client = new Sep38Client('https://mock-anchor.com', undefined, {
      enableGzip: false,
    });
    mockedAxios.post.mockResolvedValue({ data: { id: 'quote_no_gzip' } });

    await client.getQuote({
      sellAsset: 'iso4217:USD',
      buyAsset: 'stellar:USDC:GA5Z',
      sellAmount: '100.00',
      context: 'sep6',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://mock-anchor.com/quote',
      expect.any(String),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'Content-Encoding': 'gzip',
          'Accept-Encoding': expect.anything(),
        }),
      })
    );
  });
});
