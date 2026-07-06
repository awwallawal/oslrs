import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, getAuthHeaders, ApiError } from '../api-client';
import { setAccessToken, setBootRefresh, __resetAuthTokenHolder } from '../auth-token-holder';
import { setReAuthRequestListener, resolveReAuth, __resetReAuthGate } from '../reauth-gate';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api-client — Story 9-49 in-memory token + boot-refresh queue', () => {
  beforeEach(() => __resetAuthTokenHolder());
  afterEach(() => vi.restoreAllMocks());

  it('getAuthHeaders reads the in-memory token — never web storage (AC#1/AC#5)', () => {
    expect(getAuthHeaders()).toEqual({});
    setAccessToken('mem-tok');
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer mem-tok' });
    // The token is NOT mirrored into web storage:
    expect(sessionStorage.getItem('oslsr_access_token')).toBeNull();
    expect(localStorage.getItem('oslsr_access_token')).toBeNull();
  });

  it('apiClient queues behind the in-flight boot refresh, then sends the re-minted Bearer token (AC#3)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

    // Boot refresh in flight; no token yet.
    let resolveRefresh: () => void = () => {};
    const refresh = new Promise<void>((r) => { resolveRefresh = r; }).then(() => setAccessToken('reminted'));
    setBootRefresh(refresh);

    const call = apiClient('/me'); // fired DURING boot
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled(); // must WAIT for the refresh, not fire a 401

    resolveRefresh();
    await call;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(sentHeaders.Authorization).toBe('Bearer reminted'); // carried the re-minted token (Bearer transport, AC#5)
  });

  it('N concurrent apiClient calls at boot all wait on ONE refresh and all send the token (AC#3 single-flight)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    let resolveRefresh: () => void = () => {};
    const refresh = new Promise<void>((r) => { resolveRefresh = r; }).then(() => setAccessToken('shared-tok'));
    setBootRefresh(refresh);

    const calls = Promise.all([apiClient('/a'), apiClient('/b'), apiClient('/c')]);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();

    resolveRefresh();
    await calls;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const c of fetchMock.mock.calls) {
      const h = (c[1] as RequestInit).headers as Record<string, string>;
      expect(h.Authorization).toBe('Bearer shared-tok');
    }
  });

  it('with no token and no refresh, apiClient sends no Authorization header (clean unauthenticated)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    await apiClient('/public');
    const sentHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(sentHeaders.Authorization).toBeUndefined();
  });
});

// ── Story 13-17: global AUTH_REAUTH_REQUIRED interceptor ────────────────────
describe('api-client — Story 13-17 step-up re-auth interceptor', () => {
  const REAUTH_403 = {
    code: 'AUTH_REAUTH_REQUIRED',
    message: 'Please re-enter your password to continue with this action',
    details: { action: '/api/v1/admin/settings/wizard.public_form_id', reason: 'privileged_action' },
  };

  beforeEach(() => {
    __resetAuthTokenHolder();
    __resetReAuthGate();
    setAccessToken('tok');
  });
  afterEach(() => vi.restoreAllMocks());

  it('403 AUTH_REAUTH_REQUIRED → prompts via the gate, replays the request after re-auth, resolves (AC1+AC2)', async () => {
    const listener = vi.fn(() => {
      // Host side: user re-authenticates successfully.
      queueMicrotask(() => resolveReAuth(true));
    });
    setReAuthRequestListener(listener);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(REAUTH_403, 403))
      .mockResolvedValueOnce(jsonResponse({ data: { pinned: true } }, 200));

    const result = await apiClient('/admin/settings/wizard.public_form_id', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'id-a' }),
    });

    expect(result).toEqual({ data: { pinned: true } });
    // The server's details.action is a raw route path — never user-facing copy.
    // The interceptor passes the modal's generic fallback instead.
    expect(listener).toHaveBeenCalledWith('this action');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The replay is the SAME request (method + body preserved).
    const retry = fetchMock.mock.calls[1][1] as RequestInit;
    expect(retry.method).toBe('PATCH');
    expect(retry.body).toBe(JSON.stringify({ value: 'id-a' }));
  });

  it('modal cancel → rejects with an honest, specific error (no retry) (AC2)', async () => {
    setReAuthRequestListener(() => queueMicrotask(() => resolveReAuth(false)));
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(REAUTH_403, 403));

    const call = apiClient('/admin/settings/x', { method: 'PATCH' });
    await expect(call).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'AUTH_REAUTH_REQUIRED',
      message: 'Re-authentication was not completed, so this action was cancelled.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // never retried
  });

  it('single-shot: retry that STILL returns AUTH_REAUTH_REQUIRED rejects without re-opening the modal (PM guardrail)', async () => {
    const listener = vi.fn(() => queueMicrotask(() => resolveReAuth(true)));
    setReAuthRequestListener(listener);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse(REAUTH_403, 403))); // 403 every time

    await expect(apiClient('/admin/settings/x', { method: 'PATCH' })).rejects.toMatchObject({
      code: 'AUTH_REAUTH_REQUIRED',
    });
    expect(listener).toHaveBeenCalledTimes(1); // ONE prompt per originating request
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + single replay
  });

  it('a plain 403 authz denial does NOT open the re-auth flow (PM guardrail)', async () => {
    const listener = vi.fn();
    setReAuthRequestListener(listener);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, 403),
    );

    await expect(apiClient('/staff')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('with no gate host registered, rejects cleanly instead of retrying blind (fail-closed)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(REAUTH_403, 403));

    await expect(apiClient('/admin/settings/x', { method: 'PATCH' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent guarded requests share ONE prompt and both replay after re-auth', async () => {
    const listener = vi.fn(() => queueMicrotask(() => resolveReAuth(true)));
    setReAuthRequestListener(listener);

    // Both endpoints 403 first, then 200 on replay.
    const seen = new Map<string, number>();
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const key = String(url);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return Promise.resolve(n === 1 ? jsonResponse(REAUTH_403, 403) : jsonResponse({ ok: key }, 200));
    });

    const [a, b] = await Promise.all([apiClient('/guarded/a'), apiClient('/guarded/b')]);
    expect(listener).toHaveBeenCalledTimes(1); // single modal for the burst
    expect(a).toMatchObject({ ok: expect.stringContaining('/guarded/a') });
    expect(b).toMatchObject({ ok: expect.stringContaining('/guarded/b') });
  });
});
