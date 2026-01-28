import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { generateInvitationToken, encryptToken, decryptToken } from '../crypto.js';

describe('Crypto Utils', () => {
  it('should generate a 32-character hex token', () => {
    const token = generateInvitationToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate unique tokens', () => {
    const token1 = generateInvitationToken();
    const token2 = generateInvitationToken();
    expect(token1).not.toBe(token2);
  });
});

describe('AES-256-GCM Token Encryption', () => {
  // Generate a valid 32-byte key for testing
  const testKey = randomBytes(32);
  const testToken = 'odk-app-user-token-12345678901234567890';

  describe('encryptToken', () => {
    it('should encrypt a token and return ciphertext and IV', () => {
      const result = encryptToken(testToken, testKey);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result.ciphertext).toBeTruthy();
      expect(result.iv).toBeTruthy();
    });

    it('should return hex-encoded ciphertext', () => {
      const result = encryptToken(testToken, testKey);

      // Ciphertext should be valid hex (includes auth tag)
      expect(result.ciphertext).toMatch(/^[0-9a-f]+$/i);
    });

    it('should return hex-encoded 12-byte IV (24 hex characters)', () => {
      const result = encryptToken(testToken, testKey);

      // IV should be 12 bytes = 24 hex characters
      expect(result.iv).toHaveLength(24);
      expect(result.iv).toMatch(/^[0-9a-f]{24}$/i);
    });

    it('should generate unique IV for each encryption (IV uniqueness)', () => {
      const result1 = encryptToken(testToken, testKey);
      const result2 = encryptToken(testToken, testKey);

      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });
  });

  describe('decryptToken', () => {
    it('should decrypt ciphertext back to original plaintext (round-trip)', () => {
      const encrypted = encryptToken(testToken, testKey);
      const decrypted = decryptToken(encrypted.ciphertext, encrypted.iv, testKey);

      expect(decrypted).toBe(testToken);
    });

    it('should handle various token lengths', () => {
      const shortToken = 'abc';
      const longToken = 'a'.repeat(500);

      const shortEncrypted = encryptToken(shortToken, testKey);
      const longEncrypted = encryptToken(longToken, testKey);

      expect(decryptToken(shortEncrypted.ciphertext, shortEncrypted.iv, testKey)).toBe(shortToken);
      expect(decryptToken(longEncrypted.ciphertext, longEncrypted.iv, testKey)).toBe(longToken);
    });

    it('should handle special characters in token', () => {
      const specialToken = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const encrypted = encryptToken(specialToken, testKey);
      const decrypted = decryptToken(encrypted.ciphertext, encrypted.iv, testKey);

      expect(decrypted).toBe(specialToken);
    });

    it('should handle unicode characters in token', () => {
      const unicodeToken = 'Hello 世界 🌍 привет';
      const encrypted = encryptToken(unicodeToken, testKey);
      const decrypted = decryptToken(encrypted.ciphertext, encrypted.iv, testKey);

      expect(decrypted).toBe(unicodeToken);
    });
  });

  describe('Tamper Detection (Authentication Tag Validation)', () => {
    it('should throw error when ciphertext is tampered', () => {
      const encrypted = encryptToken(testToken, testKey);

      // Tamper with ciphertext by XORing the last byte with 0xff (guaranteed change)
      const lastByteIndex = encrypted.ciphertext.length - 2;
      const lastByte = parseInt(encrypted.ciphertext.slice(lastByteIndex), 16);
      const flippedByte = (lastByte ^ 0xff).toString(16).padStart(2, '0');
      const tamperedCiphertext = encrypted.ciphertext.slice(0, lastByteIndex) + flippedByte;

      expect(() => {
        decryptToken(tamperedCiphertext, encrypted.iv, testKey);
      }).toThrow();
    });

    it('should throw error when IV is incorrect', () => {
      const encrypted = encryptToken(testToken, testKey);

      // Use a different IV
      const wrongIv = randomBytes(12).toString('hex');

      expect(() => {
        decryptToken(encrypted.ciphertext, wrongIv, testKey);
      }).toThrow();
    });

    it('should throw error when key is wrong', () => {
      const encrypted = encryptToken(testToken, testKey);
      const wrongKey = randomBytes(32);

      expect(() => {
        decryptToken(encrypted.ciphertext, encrypted.iv, wrongKey);
      }).toThrow();
    });
  });

  describe('Key Validation', () => {
    it('should throw error for invalid key length (too short)', () => {
      const shortKey = randomBytes(16); // 16 bytes instead of 32

      expect(() => {
        encryptToken(testToken, shortKey);
      }).toThrow(/key/i);
    });

    it('should throw error for invalid key length (too long)', () => {
      const longKey = randomBytes(64); // 64 bytes instead of 32

      expect(() => {
        encryptToken(testToken, longKey);
      }).toThrow(/key/i);
    });
  });
});
