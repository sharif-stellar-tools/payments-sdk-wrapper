import { SdkLogger, createSdkLogger, LoggerInterface, WinstonLoggerLike, PinoLoggerLike } from '../src/logger';
import { FeeGuardEngine } from '../src/feeguard';
import { Sep38Client } from '../src/sep38';
import { PaymentClient } from '../src/client';
import { Transaction } from '@stellar/stellar-sdk';
import axios from 'axios';

jest.mock('axios', () => ({
  post: jest.fn(),
  create: jest.fn(() => ({
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  })),
}));

describe('Universal Logger Delegation (Issue #119)', () => {
  describe('SdkLogger Unit Tests', () => {
    it('should safely no-op when no logger target is configured', () => {
      const logger = createSdkLogger(undefined, 'TestNoop');
      expect(() => {
        logger.trace('trace message');
        logger.debug('debug message');
        logger.info('info message');
        logger.warn('warn message');
        logger.error('error message');
        logger.fatal('fatal message');
      }).not.toThrow();
    });

    it('should delegate to Winston-compatible interface with message-first format', () => {
      const mockWinston: WinstonLoggerLike = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const logger = createSdkLogger(mockWinston, 'WinstonTest');
      logger.info('Transaction initiated', { txId: '0x123' });
      logger.warn('Low liquidity warning', { pool: 'XLM/USDC' });
      logger.error('Network timeout', { code: 504 });

      expect(mockWinston.info).toHaveBeenCalledWith(
        '[WinstonTest] Transaction initiated',
        { txId: '0x123' }
      );
      expect(mockWinston.warn).toHaveBeenCalledWith(
        '[WinstonTest] Low liquidity warning',
        { pool: 'XLM/USDC' }
      );
      expect(mockWinston.error).toHaveBeenCalledWith(
        '[WinstonTest] Network timeout',
        { code: 504 }
      );
    });

    it('should delegate to Pino-compatible interface with object-first format', () => {
      const mockPino: PinoLoggerLike = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      // Mark as Pino-compatible
      (mockPino as any).levels = { values: { info: 30 } };

      const logger = createSdkLogger(mockPino, 'PinoTest');
      logger.info('Payment received', { amount: '50.00' });
      logger.error(new Error('Connection dropped'));

      expect(mockPino.info).toHaveBeenCalledWith(
        { amount: '50.00' },
        '[PinoTest] Payment received'
      );
      expect(mockPino.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        '[PinoTest] Connection dropped'
      );
    });

    it('should support child loggers with structured context propagation', () => {
      const mockLogger = {
        info: jest.fn(),
      };

      const parentLogger = createSdkLogger(mockLogger, 'App');
      const childLogger = parentLogger.child({ correlationId: 'req-abc-999' }, 'SubModule');

      childLogger.info('Processing operation');

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[App:SubModule] Processing operation',
        { correlationId: 'req-abc-999' }
      );
    });

    it('should delegate child creation natively if target logger supports child()', () => {
      const nativeChildMock = { info: jest.fn() };
      const targetWithChild = {
        child: jest.fn().mockReturnValue(nativeChildMock),
        info: jest.fn(),
      };

      const sdkLogger = createSdkLogger(targetWithChild, 'Root');
      const child = sdkLogger.child({ service: 'escrow' });

      expect(targetWithChild.child).toHaveBeenCalledWith({ service: 'escrow' });
      child.info('Executing');
      expect(nativeChildMock.info).toHaveBeenCalledWith('[Root] Executing', { service: 'escrow' });
    });
  });

  describe('Integration with SDK Components', () => {
    it('FeeGuardEngine should log through delegated logger during fee checks', () => {
      const mockLogger = {
        info: jest.fn(),
      };

      const engine = new FeeGuardEngine(200, mockLogger);
      const mockTx = { fee: '150' } as unknown as Transaction;

      engine.checkFee(mockTx);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[FeeGuard] Checking tx fee. Tx fee: 150 stroops. Max fee: 200 stroops.',
        { fee: 150, maxFeeStroops: 200 }
      );
    });

    it('Sep38Client should log quote requests and errors through delegated logger', async () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
      };

      const client = new Sep38Client('https://mock-anchor.com', mockLogger);
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { id: 'q1', expires_at: '2026-09-15', price: '1.0', sell_amount: '10', buy_amount: '10' },
      });

      await client.getQuote({
        sellAsset: 'XLM',
        buyAsset: 'USDC',
        sellAmount: '10',
        context: 'sep6',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SEP-38] Requesting quote for 10 XLM -> USDC',
        expect.objectContaining({ sellAsset: 'XLM', buyAsset: 'USDC' })
      );
    });

    it('PaymentClient should initialize child loggers for internal engines', () => {
      const mockLogger = {
        info: jest.fn(),
      };

      const client = new PaymentClient({
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        maxFeeStroops: 500,
        logger: mockLogger,
      });

      expect(client.logger).toBeDefined();
      expect(client.feeGuard).toBeDefined();
      expect(client.sep38).toBeDefined();
    });
  });
});
