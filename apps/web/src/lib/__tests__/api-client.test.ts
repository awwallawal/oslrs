import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, getAuthHeaders } from '../api-client';
import { setAccessToken, setBootRefresh, __resetAuthTokenHolder } from '../auth-token-holder';

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
