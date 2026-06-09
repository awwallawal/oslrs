import { describe, it, expect, beforeEach } from 'vitest';
import {
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  setBootRefresh,
  awaitAccessToken,
  __resetAuthTokenHolder,
} from '../auth-token-holder';

describe('auth-token-holder (Story 9-49)', () => {
  beforeEach(() => __resetAuthTokenHolder());

  it('holds the token in memory (set/get/clear) — never touches web storage', () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken('tok-1');
    expect(getAccessToken()).toBe('tok-1');
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
    // It must not persist anywhere JS-readable at rest:
    expect(sessionStorage.getItem('oslsr_access_token')).toBeNull();
    expect(localStorage.getItem('oslsr_access_token')).toBeNull();
  });

  it('awaitAccessToken returns the current token immediately when set', async () => {
    setAccessToken('tok-2');
    await expect(awaitAccessToken()).resolves.toBe('tok-2');
  });

  it('awaitAccessToken queues behind an in-flight boot refresh, then returns the re-minted token (AC#3)', async () => {
    let resolveRefresh: () => void = () => {};
    const refresh = new Promise<void>((r) => { resolveRefresh = r; }).then(() => {
      setAccessToken('reminted'); // refresh completes by setting the token
    });
    setBootRefresh(refresh);

    // No token yet — the call must AWAIT the refresh, not return null early.
    const pending = awaitAccessToken();
    expect(getAccessToken()).toBeNull();
    resolveRefresh();
    await expect(pending).resolves.toBe('reminted');
  });

  it('N concurrent awaits all resolve from ONE in-flight refresh (single-flight)', async () => {
    let count = 0;
    let resolveRefresh: () => void = () => {};
    const refresh = new Promise<void>((r) => { resolveRefresh = r; }).then(() => {
      count += 1; // would-be /refresh side effect — must happen once
      setAccessToken('shared');
    });
    setBootRefresh(refresh);

    const all = Promise.all([awaitAccessToken(), awaitAccessToken(), awaitAccessToken()]);
    resolveRefresh();
    await expect(all).resolves.toEqual(['shared', 'shared', 'shared']);
    expect(count).toBe(1);
  });

  it('a failed boot refresh leaves the holder unauthenticated (null), not throwing', async () => {
    const refresh = Promise.reject(new Error('no cookie')).catch(() => { throw new Error('no cookie'); });
    setBootRefresh(refresh);
    await expect(awaitAccessToken()).resolves.toBeNull();
  });

  it('the boot-refresh promise auto-clears on settle so later reads do not block', async () => {
    setAccessToken('after');
    const refresh = Promise.resolve();
    setBootRefresh(refresh);
    await refresh; // let it settle + auto-clear
    // microtask for the auto-clear .then to run
    await Promise.resolve();
    await expect(awaitAccessToken()).resolves.toBe('after');
  });
});
