import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setReAuthRequestListener,
  requestReAuth,
  resolveReAuth,
  hasPendingReAuth,
  __resetReAuthGate,
} from '../reauth-gate';

describe('reauth-gate — Story 13-17 step-up re-auth coordination', () => {
  beforeEach(() => __resetReAuthGate());

  it('resolves false when no host listener is registered (fail-closed)', async () => {
    await expect(requestReAuth('pin the form')).resolves.toBe(false);
    expect(hasPendingReAuth()).toBe(false);
  });

  it('notifies the listener with the action and resolves true on success', async () => {
    const listener = vi.fn();
    setReAuthRequestListener(listener);

    const pending = requestReAuth('pin the form');
    expect(listener).toHaveBeenCalledWith('pin the form');
    expect(hasPendingReAuth()).toBe(true);

    resolveReAuth(true);
    await expect(pending).resolves.toBe(true);
    expect(hasPendingReAuth()).toBe(false);
  });

  it('resolves false on cancel', async () => {
    setReAuthRequestListener(vi.fn());
    const pending = requestReAuth('change password');
    resolveReAuth(false);
    await expect(pending).resolves.toBe(false);
  });

  it('single-flight: concurrent requests share ONE prompt and settle together', async () => {
    const listener = vi.fn();
    setReAuthRequestListener(listener);

    const a = requestReAuth('action A');
    const b = requestReAuth('action B');
    // Only the FIRST request opens the modal — the second queues on it.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('action A');

    resolveReAuth(true);
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);
  });

  it('resolveReAuth with nothing pending is a safe no-op (close-after-success path)', () => {
    expect(() => resolveReAuth(false)).not.toThrow();
    expect(hasPendingReAuth()).toBe(false);
  });

  it('a settled flight does not gate later requests — a new request opens a new prompt', async () => {
    const listener = vi.fn();
    setReAuthRequestListener(listener);

    const first = requestReAuth('first');
    resolveReAuth(false);
    await expect(first).resolves.toBe(false);

    const second = requestReAuth('second');
    expect(listener).toHaveBeenCalledTimes(2);
    resolveReAuth(true);
    await expect(second).resolves.toBe(true);
  });
});
