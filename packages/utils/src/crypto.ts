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
