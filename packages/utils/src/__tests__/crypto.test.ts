import { describe, it, expect } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { generateInvitationToken, hashInvitationToken, sha256Hex, encryptToken, decryptToken, requireEncryptionKey, hashPassword, comparePassword } from '../crypto.js';

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

describe('hashPassword / comparePassword (test-runner bcrypt cost downcost)', () => {
  it('produces a valid, verifiable bcrypt hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
    expect(await comparePassword('correct horse battery staple', hash)).toBe(true);
    expect(await comparePassword('wrong password', hash)).toBe(false);
  });

  it('uses the lowered cost factor (4) under the test runner — fixes bcrypt-heavy suite timeouts', async () => {
    // The work factor is encoded as the two-digit cost in the hash prefix.
    // Under NODE_ENV=test / VITEST this MUST be 04 (prod stays 12); a regression
    // that drops the test gating would re-introduce the mfa/full-suite flakiness.
    const hash = await hashPassword('x');
    expect(hash.startsWith('$2b$04$')).toBe(true);
  });
});

describe('hashInvitationToken (OPS-2 / Story 9-42 AC#11)', () => {
  it('should return a 64-character lowercase hex SHA-256 digest', () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should differ from the plaintext token (never store the raw token)', () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).not.toBe(token);
  });

  it('should be deterministic (same input → same hash, enables lookup-by-hash)', () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it('should match a reference SHA-256 hex digest', () => {
    const token = 'a'.repeat(32);
    const expected = createHash('sha256').update(token).digest('hex');
    expect(hashInvitationToken(token)).toBe(expected);
  });

  it('should produce different hashes for different tokens', () => {
    expect(hashInvitationToken(generateInvitationToken())).not.toBe(
      hashInvitationToken(generateInvitationToken()),
    );
  });
});

describe('sha256Hex (shared bearer-secret hashing primitive)', () => {
  it('should return a 64-character lowercase hex SHA-256 digest', () => {
    const hash = sha256Hex('some-token');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should match a reference SHA-256 hex digest', () => {
    const value = 'a'.repeat(32);
    expect(sha256Hex(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });

  it('hashInvitationToken should delegate to sha256Hex (identical output)', () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(sha256Hex(token));
  });
});

describe('AES-256-GCM Token Encryption', () => {
  // Generate a valid 32-byte key for testing
  const testKey = randomBytes(32);
  const testToken = 'test-app-user-token-12345678901234567890';

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
