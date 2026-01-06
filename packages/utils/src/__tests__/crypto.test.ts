import { describe, it, expect } from 'vitest';
import { generateInvitationToken } from '../crypto.js';

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
