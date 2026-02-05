import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;
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
