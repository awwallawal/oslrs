import { describe, it, expect } from 'vitest';
import { buildPasswordResetCompletionKey } from '../password-reset-rate-limit.js';

/**
 * 2026-09-16. The reset-completion limiter was 5 attempts / 15 min / IP, mounted on BOTH
 * `GET /reset-password/:token` and `POST /reset-password` — so opening the page spent a
 * slot and a refresh spent another. Behind an Opera Mini or CGNAT address those five were
 * shared between strangers, which is the FOURTH time this project has charged one person
 * for another's traffic.
 *
 * The key is now the reset token. These cases pin that; the IP fallback stays for a
 * request that carries no token at all.
 */
describe('buildPasswordResetCompletionKey', () => {
  it('keys on the token from the URL (GET /reset-password/:token)', () => {
    expect(buildPasswordResetCompletionKey('tok-abc', undefined, '1.2.3.4')).toBe('t:tok-abc');
  });

  it('keys on the token from the body (POST /reset-password)', () => {
    expect(buildPasswordResetCompletionKey(undefined, 'tok-xyz', '1.2.3.4')).toBe('t:tok-xyz');
  });

  it('prefers the URL token when both are present', () => {
    expect(buildPasswordResetCompletionKey('from-url', 'from-body', '1.2.3.4')).toBe('t:from-url');
  });

  it('trims surrounding whitespace so " tok " and "tok" are ONE bucket', () => {
    expect(buildPasswordResetCompletionKey('  tok-abc  ', undefined, '1.2.3.4')).toBe('t:tok-abc');
  });

  // THE REGRESSION. Two people behind one proxy, each with their own reset link, must not
  // share a budget. If this ever returns the same key for both, the defect is back.
  it('gives two different tokens different keys FROM THE SAME IP', () => {
    const a = buildPasswordResetCompletionKey('tok-a', undefined, '41.58.1.1');
    const b = buildPasswordResetCompletionKey('tok-b', undefined, '41.58.1.1');
    expect(a).not.toBe(b);
  });

  it('gives one token ONE key from two different IPs (a phone changing network)', () => {
    const a = buildPasswordResetCompletionKey('tok-a', undefined, '41.58.1.1');
    const b = buildPasswordResetCompletionKey('tok-a', undefined, '105.119.15.131');
    expect(a).toBe(b);
  });

  it('falls back to the IP when no token is present anywhere', () => {
    expect(buildPasswordResetCompletionKey(undefined, undefined, '1.2.3.4')).toMatch(/^ip:/);
  });

  it('falls back to the IP for a blank or non-string token', () => {
    expect(buildPasswordResetCompletionKey('   ', '', '1.2.3.4')).toMatch(/^ip:/);
    expect(buildPasswordResetCompletionKey(42, null, '1.2.3.4')).toMatch(/^ip:/);
  });

  it('does not throw when the IP is missing', () => {
    expect(() => buildPasswordResetCompletionKey(undefined, undefined, undefined)).not.toThrow();
  });
});
