import { randomBytes } from 'node:crypto';

/**
 * Generates a secure random 32-character hex token (16 bytes).
 * Used for invitation tokens, password reset tokens, etc.
 * @returns {string} 32-character hex string
 */
export const generateInvitationToken = (): string => {
  return randomBytes(16).toString('hex');
};
