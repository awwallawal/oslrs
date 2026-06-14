import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';

/**
 * bcrypt work factor. Production-strength is 12. Under the TEST RUNNER ONLY it
 * is lowered to 4 so bcrypt-heavy suites (MFA backup codes hash 8 per enroll,
 * plus login / password-reset / staff-activation) don't blow per-test timeouts
 * on loaded dev machines — historically these flaked locally at cost-12 (~250-
 * 500ms × 8 hashes + DB > 15s). The downcost has ZERO effect on dev/prod: it is
 * gated strictly to the same signal the rate-limiters use (`NODE_ENV==='test'`
 * OR `VITEST`), and the cost is encoded in each hash, so a cost-4 hash created
 * in a test never reaches — and would verify fine against — production anyway.
 * bcrypt's minimum is 4; cost-4 is still a valid, salted bcrypt hash.
 */
const isTestRunner = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const SALT_ROUNDS = isTestRunner ? 4 : 12;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM mode (NIST recommendation)
const AUTH_TAG_LENGTH = 16; // 16 bytes for authentication tag

/**
 * Generates a secure random 32-character hex token (16 bytes).
 * Used for invitation tokens, password reset tokens, etc.
 * @returns {string} 32-character hex string
 */
export const generateInvitationToken = (): string => {
  return randomBytes(16).toString('hex');
};

/**
 * Shared SHA-256 hex primitive for hashing high-entropy bearer secrets at rest
 * (invitation / password-reset / magic-link tokens). Centralized here so every
 * subsystem hashes identically — drift in the algorithm would silently break
 * lookup-by-hash. Prefer the named wrappers (e.g. {@link hashInvitationToken})
 * at call sites for intent.
 *
 * Unsalted is CORRECT for these inputs: they are 16+ bytes of `randomBytes`, so
 * there is no dictionary/rainbow risk a salt would defend against, and a
 * per-token salt would break the lookup-by-hash design. Do NOT use this for
 * passwords — those go through bcrypt ({@link hashPassword}).
 *
 * @param value Plaintext high-entropy secret
 * @returns {string} 64-character lowercase hex SHA-256 digest
 */
export const sha256Hex = (value: string): string => {
  return createHash('sha256').update(value).digest('hex');
};

/**
 * OPS-2 (sec-r2 / Story 9-42 AC#11): SHA-256 hex of a staff invitation token.
 *
 * Invitation tokens must be stored HASHED at rest so a secondary DB leak cannot
 * be turned into account takeover. The plaintext token is emailed exactly once
 * (in the activation URL) and NEVER persisted; only this hash is stored in
 * `users.invitation_token`, and the incoming token is hashed before lookup.
 * Thin wrapper over {@link sha256Hex} for call-site intent.
 *
 * @param token Plaintext token
 * @returns {string} 64-character lowercase hex SHA-256 digest
 */
export const hashInvitationToken = (token: string): string => sha256Hex(token);

/**
 * Hashes a password using bcrypt.
 * @param password Plain text password
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compares a plain text password with a hash.
 * @param password Plain text password
 * @param hash Hashed password
 * @returns {Promise<boolean>} True if match
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Generates a secure random verification token (32 bytes = 64 hex characters).
 * Used for email verification tokens with 24-hour expiry.
 * @returns {string} 64-character hex string
 */
export const generateVerificationToken = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * Generates a cryptographically secure 6-digit OTP code.
 * Used for email verification fallback per ADR-015.
 *
 * Uses crypto.randomBytes to ensure unpredictability.
 * Range: 000000 - 999999 (always 6 digits with leading zeros)
 *
 * @returns {string} 6-digit numeric string (e.g., "047293")
 */
export const generateOtpCode = (): string => {
  // Generate 4 random bytes (32 bits)
  const buffer = randomBytes(4);
  // Convert to unsigned 32-bit integer
  const value = buffer.readUInt32BE(0);
  // Modulo 1,000,000 to get 6-digit range
  const code = value % 1000000;
  // Pad with leading zeros to ensure 6 digits
  return code.toString().padStart(6, '0');
};

/**
 * Encrypts a token using AES-256-GCM.
 * Used for encrypting sensitive tokens at rest (per ADR-006 defense-in-depth).
 *
 * @param plaintext The token to encrypt
 * @param key 32-byte encryption key (256 bits)
 * @returns Object containing hex-encoded ciphertext (with auth tag) and IV
 * @throws Error if key is not exactly 32 bytes
 */
export const encryptToken = (plaintext: string, key: Buffer): { ciphertext: string; iv: string } => {
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length} bytes`);
  }

  // Generate random 12-byte IV (NIST recommendation for GCM)
  const iv = randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Combine ciphertext and auth tag (auth tag appended for storage)
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    ciphertext: combined.toString('hex'),
    iv: iv.toString('hex'),
  };
};

/**
 * Decrypts a token encrypted with AES-256-GCM.
 *
 * @param ciphertext Hex-encoded ciphertext (with auth tag appended)
 * @param iv Hex-encoded initialization vector (12 bytes = 24 hex chars)
 * @param key 32-byte decryption key (must match encryption key)
 * @returns The original plaintext token
 * @throws Error if decryption fails (wrong key, tampered data, invalid IV)
 */
export const decryptToken = (ciphertext: string, iv: string, key: Buffer): string => {
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length} bytes`);
  }

  // Convert hex strings to buffers
  const combined = Buffer.from(ciphertext, 'hex');
  const ivBuffer = Buffer.from(iv, 'hex');

  // Extract ciphertext and auth tag
  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = createDecipheriv(AES_ALGORITHM, key, ivBuffer, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  // Decrypt and return plaintext
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};

/**
 * Validates and returns an encryption key as a Buffer.
 * Used for AES-256-GCM encryption of sensitive tokens.
 *
 * @param encryptionKeyHex Optional 64-character hex string (32 bytes)
 * @returns 32-byte Buffer for use with encryptToken/decryptToken
 * @throws Error if key is not provided or invalid
 */
export const requireEncryptionKey = (encryptionKeyHex: string | undefined): Buffer => {
  if (!encryptionKeyHex) {
    throw new Error('Encryption key is required (64 hex characters / 32 bytes)');
  }
  if (encryptionKeyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex)) {
    throw new Error('Encryption key must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(encryptionKeyHex, 'hex');
};
