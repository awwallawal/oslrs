import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { generateInvitationToken, encryptToken, decryptToken, requireEncryptionKey } from '../crypto.js';

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

      // GCM ciphertext structure: [encrypted_data][16-byte auth tag]
      // Tamper with byte 0 (actual ciphertext), not the auth tag at the end
      const ciphertextBuffer = Buffer.from(encrypted.ciphertext, 'hex');
      ciphertextBuffer[0] ^= 0xff; // Flip bits in actual ciphertext
      const tamperedCiphertext = ciphertextBuffer.toString('hex');

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

  describe('requireEncryptionKey Edge Cases', () => {
    it('should throw error for empty string', () => {
      expect(() => {
        requireEncryptionKey('');
      }).toThrow(/required/i);
    });

    it('should throw error for undefined', () => {
      expect(() => {
        requireEncryptionKey(undefined);
      }).toThrow(/required/i);
    });

    it('should throw error for wrong length (too short)', () => {
      expect(() => {
        requireEncryptionKey('abc123'); // 6 chars, needs 64
      }).toThrow(/64 hex characters/i);
    });

    it('should throw error for wrong length (too long)', () => {
      expect(() => {
        requireEncryptionKey('a'.repeat(128)); // 128 chars, needs 64
      }).toThrow(/64 hex characters/i);
    });

    it('should throw error for invalid hex chars', () => {
      expect(() => {
        // 64 chars but contains invalid hex chars (xyz)
        requireEncryptionKey('xyz'.repeat(21) + 'ab');
      }).toThrow(/64 hex characters/i);
    });

    it('should return Buffer for valid 64-char hex key', () => {
      const validKey = randomBytes(32).toString('hex'); // 64 hex chars
      const result = requireEncryptionKey(validKey);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    it('should decrypt token encrypted with different valid key (wrong key failure)', () => {
      const key1 = randomBytes(32);
      const key2 = randomBytes(32); // Different key

      const encrypted = encryptToken(testToken, key1);

      // Decryption with wrong key should fail
      expect(() => {
        decryptToken(encrypted.ciphertext, encrypted.iv, key2);
      }).toThrow();
    });
  });
});
