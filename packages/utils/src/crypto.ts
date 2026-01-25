import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

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
