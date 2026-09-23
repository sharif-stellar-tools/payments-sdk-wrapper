import { Memo } from '@stellar/stellar-sdk';

export type StellarMemoType = 'text' | 'id' | 'hash' | 'return' | 'none';

export interface MemoInput {
  type: StellarMemoType;
  value?: string | number | bigint | Buffer;
}

const MAX_TEXT_BYTES = 28;
const MAX_UINT64 = 18446744073709551615n; // 2^64 - 1
const HASH_BYTES = 32;
const HEX_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Validates Stellar transaction memos according to network specifications.
 * Ensures text memos do not exceed 28 bytes, ID memos fit in a 64-bit unsigned integer,
 * and hash/return memos are exact 32-byte payloads.
 */
export class MemoValidator {
  constructor(private logger?: any) {}

  /**
   * Validates that a text memo does not exceed 28 bytes in UTF-8 encoding.
   */
  public static validateText(text: string): void {
    if (typeof text !== 'string') {
      throw new Error(`Memo text must be a string, got ${typeof text}`);
    }
    const byteLength = Buffer.byteLength(text, 'utf8');
    if (byteLength > MAX_TEXT_BYTES) {
      throw new Error(
        `Memo text exceeds Stellar limit of ${MAX_TEXT_BYTES} bytes (got ${byteLength} bytes): "${text}"`
      );
    }
  }

  /**
   * Validates that an ID memo represents a valid 64-bit unsigned integer (0 to 18446744073709551615).
   */
  public static validateId(id: string | number | bigint): void {
    if (id === undefined || id === null) {
      throw new Error('Memo ID value cannot be null or undefined');
    }

    if (typeof id === 'number') {
      if (!Number.isInteger(id)) {
        throw new Error(`Memo ID must be an integer, got float: ${id}`);
      }
      if (id < 0) {
        throw new Error(`Memo ID must be a positive 64-bit unsigned integer, got negative: ${id}`);
      }
      if (!Number.isSafeInteger(id)) {
        // Numbers above Number.MAX_SAFE_INTEGER can lose precision, recommend string/bigint
        // but still validate range
      }
    }

    const strVal = id.toString().trim();
    if (!/^\d+$/.test(strVal)) {
      throw new Error(`Memo ID must contain only unsigned integer digits, got: "${id}"`);
    }

    try {
      const bigVal = BigInt(strVal);
      if (bigVal < 0n) {
        throw new Error(`Memo ID cannot be negative: ${id}`);
      }
      if (bigVal > MAX_UINT64) {
        throw new Error(
          `Memo ID exceeds maximum 64-bit unsigned integer value (${MAX_UINT64}): ${id}`
        );
      }
    } catch (err: any) {
      if (err.message.includes('Memo ID')) {
        throw err;
      }
      throw new Error(`Invalid Memo ID value: ${id}`);
    }
  }

  /**
   * Validates that a hash memo is exactly 32 bytes (Buffer or 64-character hex string).
   */
  public static validateHash(hash: string | Buffer): void {
    if (!hash) {
      throw new Error('Memo hash value cannot be empty');
    }

    if (Buffer.isBuffer(hash)) {
      if (hash.length !== HASH_BYTES) {
        throw new Error(
          `Memo hash Buffer must be exactly ${HASH_BYTES} bytes, got ${hash.length} bytes`
        );
      }
      return;
    }

    if (typeof hash === 'string') {
      if (!HEX_REGEX.test(hash)) {
        throw new Error(
          `Memo hash string must be a 64-character hexadecimal string (${HASH_BYTES} bytes), got: "${hash}"`
        );
      }
      return;
    }

    throw new Error(`Memo hash must be a Buffer or hex string, got ${typeof hash}`);
  }

  /**
   * Validates that a return memo is exactly 32 bytes (Buffer or 64-character hex string).
   */
  public static validateReturn(returnHash: string | Buffer): void {
    if (!returnHash) {
      throw new Error('Memo return value cannot be empty');
    }

    if (Buffer.isBuffer(returnHash)) {
      if (returnHash.length !== HASH_BYTES) {
        throw new Error(
          `Memo return Buffer must be exactly ${HASH_BYTES} bytes, got ${returnHash.length} bytes`
        );
      }
      return;
    }

    if (typeof returnHash === 'string') {
      if (!HEX_REGEX.test(returnHash)) {
        throw new Error(
          `Memo return string must be a 64-character hexadecimal string (${HASH_BYTES} bytes), got: "${returnHash}"`
        );
      }
      return;
    }

    throw new Error(`Memo return must be a Buffer or hex string, got ${typeof returnHash}`);
  }

  /**
   * Validates any Stellar Memo instance or MemoInput configuration.
   */
  public static validate(memo: Memo | MemoInput): void {
    if (!memo) return;

    const type = (memo.type || (memo as any)._type) as StellarMemoType;
    const value = memo.value !== undefined ? memo.value : (memo as any)._value;

    switch (type) {
      case 'none':
        break;
      case 'text':
        MemoValidator.validateText(value as string);
        break;
      case 'id':
        MemoValidator.validateId(value as string | number | bigint);
        break;
      case 'hash':
        MemoValidator.validateHash(value as string | Buffer);
        break;
      case 'return':
        MemoValidator.validateReturn(value as string | Buffer);
        break;
      default:
        throw new Error(`Unsupported or unknown memo type: "${type}"`);
    }
  }

  /**
   * Safely constructs and validates a Stellar Memo instance.
   */
  public static create(type: StellarMemoType, value?: any): Memo {
    MemoValidator.validate({ type, value });

    switch (type) {
      case 'none':
        return Memo.none();
      case 'text':
        return Memo.text(value as string);
      case 'id':
        return Memo.id(value.toString());
      case 'hash':
        return Memo.hash(value);
      case 'return':
        return Memo.return(value);
      default:
        throw new Error(`Unsupported or unknown memo type: "${type}"`);
    }
  }

  // Instance methods with optional logging
  public validateText(text: string): void {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug(`MemoValidator: Validating text memo of length ${Buffer.byteLength(text || '', 'utf8')} bytes`);
    }
    MemoValidator.validateText(text);
  }

  public validateId(id: string | number | bigint): void {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug(`MemoValidator: Validating ID memo: ${id}`);
    }
    MemoValidator.validateId(id);
  }

  public validateHash(hash: string | Buffer): void {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug('MemoValidator: Validating hash memo');
    }
    MemoValidator.validateHash(hash);
  }

  public validateReturn(returnHash: string | Buffer): void {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug('MemoValidator: Validating return memo');
    }
    MemoValidator.validateReturn(returnHash);
  }

  public validate(memo: Memo | MemoInput): void {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug(`MemoValidator: Validating memo of type ${memo?.type || (memo as any)?._type}`);
    }
    MemoValidator.validate(memo);
  }

  public create(type: StellarMemoType, value?: any): Memo {
    return MemoValidator.create(type, value);
  }
}
