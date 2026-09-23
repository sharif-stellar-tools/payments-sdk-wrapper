import { MemoValidator } from '../src/memo';
import { PaymentClient } from '../src/client';
import { Memo, Transaction } from '@stellar/stellar-sdk';
import axios from 'axios';

jest.mock('axios', () => {
  const actualAxios = jest.requireActual('axios');
  return {
    __esModule: true,
    ...actualAxios,
    default: {
      ...actualAxios.default,
      post: jest.fn(),
      create: jest.fn(() => ({
        interceptors: {
          request: { use: jest.fn(), eject: jest.fn() },
          response: { use: jest.fn(), eject: jest.fn() },
        },
        defaults: { headers: { common: {} } },
        get: jest.fn(),
        post: jest.fn(),
      })),
    },
    post: jest.fn(),
    create: jest.fn(() => ({
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
      defaults: { headers: { common: {} } },
      get: jest.fn(),
      post: jest.fn(),
    })),
  };
});

describe('MemoValidator', () => {
  describe('Text Memo Validation', () => {
    it('should accept valid text memos of 28 bytes or fewer', () => {
      expect(() => MemoValidator.validateText('')).not.toThrow();
      expect(() => MemoValidator.validateText('payment_ref_12345')).not.toThrow();
      expect(() => MemoValidator.validateText('a'.repeat(28))).not.toThrow();
    });

    it('should account for multi-byte UTF-8 characters', () => {
      // '€' is 3 bytes in UTF-8
      const nineEuros = '€'.repeat(9); // 27 bytes
      expect(() => MemoValidator.validateText(nineEuros)).not.toThrow();

      const tenEuros = '€'.repeat(10); // 30 bytes
      expect(() => MemoValidator.validateText(tenEuros)).toThrow(/exceeds Stellar limit of 28 bytes/);
    });

    it('should throw when text memo exceeds 28 bytes', () => {
      const twentyNineChars = 'a'.repeat(29);
      expect(() => MemoValidator.validateText(twentyNineChars)).toThrow(
        /Memo text exceeds Stellar limit of 28 bytes \(got 29 bytes\)/
      );
    });

    it('should throw if text is not a string', () => {
      expect(() => MemoValidator.validateText(12345 as any)).toThrow(
        /Memo text must be a string/
      );
    });
  });

  describe('ID Memo Validation', () => {
    it('should accept valid 64-bit unsigned integer IDs', () => {
      expect(() => MemoValidator.validateId('0')).not.toThrow();
      expect(() => MemoValidator.validateId(0)).not.toThrow();
      expect(() => MemoValidator.validateId(123456789)).not.toThrow();
      expect(() => MemoValidator.validateId('1234567890123456789')).not.toThrow();
      expect(() => MemoValidator.validateId('18446744073709551615')).not.toThrow(); // 2^64 - 1
      expect(() => MemoValidator.validateId(18446744073709551615n)).not.toThrow();
    });

    it('should throw for negative IDs', () => {
      expect(() => MemoValidator.validateId(-1)).toThrow(/negative/);
      expect(() => MemoValidator.validateId('-500')).toThrow(/unsigned integer digits/);
    });

    it('should throw for float numbers', () => {
      expect(() => MemoValidator.validateId(123.45)).toThrow(/must be an integer/);
    });

    it('should throw for non-numeric strings', () => {
      expect(() => MemoValidator.validateId('invalid_id')).toThrow(
        /must contain only unsigned integer digits/
      );
      expect(() => MemoValidator.validateId('123a45')).toThrow(
        /must contain only unsigned integer digits/
      );
    });

    it('should throw when ID exceeds 64-bit unsigned maximum (18446744073709551615)', () => {
      const overflow = '18446744073709551616';
      expect(() => MemoValidator.validateId(overflow)).toThrow(
        /exceeds maximum 64-bit unsigned integer value/
      );
    });

    it('should throw for null or undefined ID', () => {
      expect(() => MemoValidator.validateId(null as any)).toThrow(
        /cannot be null or undefined/
      );
      expect(() => MemoValidator.validateId(undefined as any)).toThrow(
        /cannot be null or undefined/
      );
    });
  });

  describe('Hash Memo Validation', () => {
    const validHex = 'a'.repeat(64);
    const validBuffer = Buffer.alloc(32, 0xab);

    it('should accept a 64-character hex string (32 bytes)', () => {
      expect(() => MemoValidator.validateHash(validHex)).not.toThrow();
    });

    it('should accept a 32-byte Buffer', () => {
      expect(() => MemoValidator.validateHash(validBuffer)).not.toThrow();
    });

    it('should throw for hex string of incorrect length', () => {
      expect(() => MemoValidator.validateHash('a'.repeat(63))).toThrow(
        /must be a 64-character hexadecimal string/
      );
      expect(() => MemoValidator.validateHash('a'.repeat(65))).toThrow(
        /must be a 64-character hexadecimal string/
      );
    });

    it('should throw for invalid hex characters', () => {
      const invalidHex = 'g'.repeat(64);
      expect(() => MemoValidator.validateHash(invalidHex)).toThrow(
        /must be a 64-character hexadecimal string/
      );
    });

    it('should throw for Buffer with incorrect byte length', () => {
      expect(() => MemoValidator.validateHash(Buffer.alloc(16))).toThrow(
        /must be exactly 32 bytes, got 16 bytes/
      );
      expect(() => MemoValidator.validateHash(Buffer.alloc(33))).toThrow(
        /must be exactly 32 bytes, got 33 bytes/
      );
    });

    it('should throw for empty value', () => {
      expect(() => MemoValidator.validateHash('')).toThrow(/cannot be empty/);
    });
  });

  describe('Return Memo Validation', () => {
    const validHex = 'f'.repeat(64);
    const validBuffer = Buffer.alloc(32, 0xcd);

    it('should accept a 64-character hex string (32 bytes)', () => {
      expect(() => MemoValidator.validateReturn(validHex)).not.toThrow();
    });

    it('should accept a 32-byte Buffer', () => {
      expect(() => MemoValidator.validateReturn(validBuffer)).not.toThrow();
    });

    it('should throw for return string with incorrect length or format', () => {
      expect(() => MemoValidator.validateReturn('12345')).toThrow(
        /must be a 64-character hexadecimal string/
      );
      expect(() => MemoValidator.validateReturn('z'.repeat(64))).toThrow(
        /must be a 64-character hexadecimal string/
      );
    });

    it('should throw for return Buffer with incorrect length', () => {
      expect(() => MemoValidator.validateReturn(Buffer.alloc(31))).toThrow(
        /must be exactly 32 bytes, got 31 bytes/
      );
    });
  });

  describe('Generic validate() and create()', () => {
    it('should validate none memo', () => {
      expect(() => MemoValidator.validate({ type: 'none' })).not.toThrow();
      const noneMemo = MemoValidator.create('none');
      expect(noneMemo.type).toBe('none');
    });

    it('should create valid text memo', () => {
      const memo = MemoValidator.create('text', 'hello stellar');
      expect(memo.type).toBe('text');
      expect(memo.value).toBe('hello stellar');
    });

    it('should create valid id memo', () => {
      const memo = MemoValidator.create('id', '987654321');
      expect(memo.type).toBe('id');
      expect(memo.value).toBe('987654321');
    });

    it('should create valid hash memo', () => {
      const hex = '0'.repeat(64);
      const memo = MemoValidator.create('hash', hex);
      expect(memo.type).toBe('hash');
    });

    it('should create valid return memo', () => {
      const hex = '1'.repeat(64);
      const memo = MemoValidator.create('return', hex);
      expect(memo.type).toBe('return');
    });

    it('should throw when creating with invalid inputs', () => {
      expect(() => MemoValidator.create('text', 'a'.repeat(35))).toThrow();
      expect(() => MemoValidator.create('id', '-999')).toThrow();
      expect(() => MemoValidator.create('hash', 'bad_hash')).toThrow();
      expect(() => MemoValidator.create('unknown' as any, 'val')).toThrow(
        /Unsupported or unknown memo type/
      );
    });
  });

  describe('PaymentClient Integration', () => {
    let client: PaymentClient;

    beforeEach(() => {
      client = new PaymentClient({
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        maxFeeStroops: 1000,
      });
    });

    it('should provide helper to construct valid memo', () => {
      const memo = client.createMemo('text', 'invoice#101');
      expect(memo.type).toBe('text');
      expect(memo.value).toBe('invoice#101');
    });

    it('should reject invalid memo on validateMemo', () => {
      expect(() =>
        client.validateMemo({ type: 'text', value: 'x'.repeat(50) })
      ).toThrow(/limit of 28 bytes/);
    });

    it('should validate memo before transaction submission', async () => {
      const mockTxWithInvalidMemo = {
        fee: '100',
        memo: { type: 'text', value: 'this memo exceeds twenty-eight bytes by far' },
      } as unknown as Transaction;

      await expect(client.submitTransaction(mockTxWithInvalidMemo)).rejects.toThrow(
        /exceeds Stellar limit of 28 bytes/
      );
    });

    it('should allow transaction with valid memo to proceed to server submission', async () => {
      const mockSubmit = jest.fn().mockResolvedValue({ hash: 'tx_success_hash' });
      client.server.submitTransaction = mockSubmit;

      const mockTxWithValidMemo = {
        fee: '100',
        memo: { type: 'text', value: 'valid memo' },
      } as unknown as Transaction;

      const res = await client.submitTransaction(mockTxWithValidMemo);
      expect(res.hash).toBe('tx_success_hash');
      expect(mockSubmit).toHaveBeenCalledWith(mockTxWithValidMemo);
    });
  });
});
