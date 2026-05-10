import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import {
  ENCRYPTION_ALGORITHM,
  IV_LENGTH_BYTES,
  KEY_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
  getEncryptionKey,
  isEncryptionEnabled,
  createEncryptCipher,
  createDecryptDecipher,
  buildEncryptionMeta,
} from '../backup-crypto.js';

const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes of 0xAA

async function streamToBuffer(input: Buffer, transform?: NodeJS.ReadWriteStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  if (transform) {
    await pipeline(Readable.from(input), transform, sink);
  } else {
    await pipeline(Readable.from(input), sink);
  }
  return Buffer.concat(chunks);
}

describe('backup-crypto (Story 9-9 AC#5)', () => {
  describe('getEncryptionKey', () => {
    it('throws with actionable message when env var unset', () => {
      expect(() => getEncryptionKey({})).toThrow(/BACKUP_ENCRYPTION_KEY env var not set/);
      expect(() => getEncryptionKey({})).toThrow(/openssl rand -hex 32/);
    });

    it('throws when key is too short', () => {
      expect(() => getEncryptionKey({ BACKUP_ENCRYPTION_KEY: 'aa' })).toThrow(/64 hex chars/);
    });

    it('throws when key is non-hex', () => {
      const badKey = 'z'.repeat(64);
      expect(() => getEncryptionKey({ BACKUP_ENCRYPTION_KEY: badKey })).toThrow(/64 hex chars/);
    });

    it('returns 32-byte buffer for valid key', () => {
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      expect(key.length).toBe(KEY_LENGTH_BYTES);
      expect(key.every((b) => b === 0xaa)).toBe(true);
    });
  });

  describe('isEncryptionEnabled', () => {
    it('returns false when env var unset', () => {
      expect(isEncryptionEnabled({})).toBe(false);
    });

    it('returns false when env var is invalid', () => {
      expect(isEncryptionEnabled({ BACKUP_ENCRYPTION_KEY: 'short' })).toBe(false);
    });

    it('returns true for valid key', () => {
      expect(isEncryptionEnabled({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX })).toBe(true);
    });
  });

  describe('createEncryptCipher', () => {
    it('rejects keys of wrong length', () => {
      expect(() => createEncryptCipher(Buffer.alloc(16))).toThrow(/32 bytes/);
    });

    it('produces 12-byte IV', () => {
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      const { iv } = createEncryptCipher(key);
      expect(iv.length).toBe(IV_LENGTH_BYTES);
    });

    it('produces fresh IV on each call', () => {
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      const ivs = Array.from({ length: 10 }, () => createEncryptCipher(key).iv.toString('hex'));
      expect(new Set(ivs).size).toBe(10);
    });
  });

  describe('round-trip', () => {
    it('encrypts and decrypts arbitrary payload', async () => {
      const plaintext = Buffer.from('the quick brown fox jumps over the lazy dog');
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });

      const { cipher, iv } = createEncryptCipher(key);
      const ciphertext = await streamToBuffer(plaintext, cipher);
      const meta = buildEncryptionMeta(iv, cipher);

      expect(meta.algorithm).toBe(ENCRYPTION_ALGORITHM);
      expect(meta.ivHex.length).toBe(IV_LENGTH_BYTES * 2);
      expect(meta.authTagHex.length).toBe(AUTH_TAG_LENGTH_BYTES * 2);
      expect(ciphertext.equals(plaintext)).toBe(false);

      const decipher = createDecryptDecipher(key, meta);
      const recovered = await streamToBuffer(ciphertext, decipher);
      expect(recovered.equals(plaintext)).toBe(true);
    });

    it('round-trips large random payloads (1 MB)', async () => {
      const plaintext = randomBytes(1024 * 1024);
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });

      const { cipher, iv } = createEncryptCipher(key);
      const ciphertext = await streamToBuffer(plaintext, cipher);
      const meta = buildEncryptionMeta(iv, cipher);

      const decipher = createDecryptDecipher(key, meta);
      const recovered = await streamToBuffer(ciphertext, decipher);
      expect(recovered.equals(plaintext)).toBe(true);
    });
  });

  describe('decryption integrity', () => {
    it('fails when wrong key is used', async () => {
      const plaintext = Buffer.from('secret payroll data');
      const correctKey = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      const wrongKey = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: 'b'.repeat(64) });

      const { cipher, iv } = createEncryptCipher(correctKey);
      const ciphertext = await streamToBuffer(plaintext, cipher);
      const meta = buildEncryptionMeta(iv, cipher);

      const decipher = createDecryptDecipher(wrongKey, meta);
      await expect(streamToBuffer(ciphertext, decipher)).rejects.toThrow();
    });

    it('fails when ciphertext is tampered', async () => {
      const plaintext = Buffer.from('secret payroll data');
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });

      const { cipher, iv } = createEncryptCipher(key);
      const ciphertext = await streamToBuffer(plaintext, cipher);
      const meta = buildEncryptionMeta(iv, cipher);

      const tampered = Buffer.from(ciphertext);
      tampered[0] ^= 0xff;

      const decipher = createDecryptDecipher(key, meta);
      await expect(streamToBuffer(tampered, decipher)).rejects.toThrow();
    });

    it('fails when auth tag is tampered', async () => {
      const plaintext = Buffer.from('secret payroll data');
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });

      const { cipher, iv } = createEncryptCipher(key);
      const ciphertext = await streamToBuffer(plaintext, cipher);
      const meta = buildEncryptionMeta(iv, cipher);
      const tamperedMeta = { ...meta, authTagHex: '0'.repeat(meta.authTagHex.length) };

      const decipher = createDecryptDecipher(key, tamperedMeta);
      await expect(streamToBuffer(ciphertext, decipher)).rejects.toThrow();
    });
  });

  describe('createDecryptDecipher validation', () => {
    it('rejects wrong-length key (R1-M1)', () => {
      // Symmetric protection with createEncryptCipher; production restore failures
      // surface clearer than letting createDecipheriv throw a less-specific error.
      const shortKey = Buffer.alloc(16);
      expect(() =>
        createDecryptDecipher(shortKey, {
          algorithm: ENCRYPTION_ALGORITHM,
          ivHex: '0'.repeat(IV_LENGTH_BYTES * 2),
          authTagHex: '0'.repeat(AUTH_TAG_LENGTH_BYTES * 2),
        }),
      ).toThrow(/Decryption key must be 32 bytes/);
    });

    it('rejects unknown algorithm', () => {
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      expect(() =>
        createDecryptDecipher(key, {
          algorithm: 'aes-128-cbc' as unknown as typeof ENCRYPTION_ALGORITHM,
          ivHex: '0'.repeat(IV_LENGTH_BYTES * 2),
          authTagHex: '0'.repeat(AUTH_TAG_LENGTH_BYTES * 2),
        }),
      ).toThrow(/Unsupported algorithm/);
    });

    it('rejects wrong-length IV', () => {
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      expect(() =>
        createDecryptDecipher(key, {
          algorithm: ENCRYPTION_ALGORITHM,
          ivHex: 'aa',
          authTagHex: '0'.repeat(AUTH_TAG_LENGTH_BYTES * 2),
        }),
      ).toThrow(/IV must be 12 bytes/);
    });

    it('rejects wrong-length auth tag', () => {
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });
      expect(() =>
        createDecryptDecipher(key, {
          algorithm: ENCRYPTION_ALGORITHM,
          ivHex: '0'.repeat(IV_LENGTH_BYTES * 2),
          authTagHex: 'aa',
        }),
      ).toThrow(/Auth tag must be 16 bytes/);
    });
  });

  describe('manifest serialization (R1-M2)', () => {
    it('round-trips EncryptionMeta through JSON.stringify + JSON.parse', async () => {
      // Production code path: manifest written as JSON to S3, read back as JSON during
      // restore. In-memory pass-through (covered above) does not exercise this serialization;
      // a serializer bug would silently fail at restore time.
      const plaintext = Buffer.from('payload for json-roundtrip test');
      const key = getEncryptionKey({ BACKUP_ENCRYPTION_KEY: VALID_KEY_HEX });

      const { cipher, iv } = createEncryptCipher(key);
      const ciphertext = await streamToBuffer(plaintext, cipher);
      const meta = buildEncryptionMeta(iv, cipher);

      const serialized = JSON.stringify(meta);
      const parsed = JSON.parse(serialized);

      expect(parsed.algorithm).toBe(ENCRYPTION_ALGORITHM);
      expect(parsed.ivHex).toBe(meta.ivHex);
      expect(parsed.authTagHex).toBe(meta.authTagHex);

      // Decrypt using the parsed (post-JSON) metadata, proving the field shape survives.
      const decipher = createDecryptDecipher(key, parsed);
      const recovered = await streamToBuffer(ciphertext, decipher);
      expect(recovered.equals(plaintext)).toBe(true);
    });
  });
});
