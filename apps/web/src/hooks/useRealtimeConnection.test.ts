/**
 * Realtime Connection Hook Tests
 * Story prep-6: Tests for Socket.io client connection hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockIsOnline = vi.hoisted(() => ({ value: true }));

vi.mock('./useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: mockIsOnline.value }),
}));

const mockOn = vi.fn();
const mockOff = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockClose = vi.fn();

const mockSocket = {
  on: mockOn,
  off: mockOff,
  connect: mockConnect,
  disconnect: mockDisconnect,
  close: mockClose,
  connected: false,
  id: 'mock-socket-id',
};

const mockIo = vi.fn((..._args: unknown[]) => mockSocket);

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { useRealtimeConnection } from './useRealtimeConnection';
import { setAccessToken, __resetAuthTokenHolder } from '../lib/auth-token-holder';

// ── Helpers ─────────────────────────────────────────────────────────────────

// Story 9-49: the socket reads the token from the in-memory holder, NOT web
// storage. Drive auth state through the holder so the test exercises the real
// production path (the old sessionStorage mock validated a path that no longer
// populates in production).
function setupSessionToken(token = 'test-jwt-token') {
  setAccessToken(token);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useRealtimeConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetAuthTokenHolder(); // Story 9-49: start each test unauthenticated (holder null)
    mockIsOnline.value = true;
    mockSocket.connected = false;
    mockOn.mockImplementation(() => mockSocket);
    mockOff.mockImplementation(() => mockSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return connecting state when token is available', () => {
    setupSessionToken();
    const { result } = renderHook(() => useRealtimeConnection());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isDegraded).toBe(false);
    expect(result.current.connectionState).toBe('connecting');
  });

  it('should return disconnected state when no token exists', () => {
    // holder is null (reset in beforeEach) → unauthenticated
    const { result } = renderHook(() => useRealtimeConnection());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('should connect with function-form auth for token refresh support', () => {
    setupSessionToken('my-jwt-token');
    renderHook(() => useRealtimeConnection());

    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: expect.any(Function),
      }),
    );
  });

  it('Story 9-49: the auth handshake reads the in-memory holder token, not web storage', () => {
    setupSessionToken('holder-jwt');
    renderHook(() => useRealtimeConnection());

    const authFn = (mockIo.mock.calls[0][1] as { auth: (cb: (d: { token: string | null }) => void) => void }).auth;
    const cb = vi.fn();
    authFn(cb);
    expect(cb).toHaveBeenCalledWith({ token: 'holder-jwt' });
  });

  it('should not connect when no token is available', () => {
    // holder is null (reset in beforeEach) → no socket created
    const { result } = renderHook(() => useRealtimeConnection());

    expect(mockIo).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it('should not connect when device is offline', () => {
    mockIsOnline.value = false;
    setupSessionToken('my-jwt-token');
    const { result } = renderHook(() => useRealtimeConnection());

    expect(mockIo).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('should update state to connected on connect event', () => {
    setupSessionToken();
    const connectHandler = vi.fn();

    mockOn.mockImplementation((event: string, handler: () => void) => {
      if (event === 'connect') {
        connectHandler.mockImplementation(handler);
      }
      return mockSocket;
    });

    const { result } = renderHook(() => useRealtimeConnection());

    // Simulate connect event
    act(() => {
      mockSocket.connected = true;
      connectHandler();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.isDegraded).toBe(false);
  });

  it('should update state to disconnected on disconnect event', () => {
    setupSessionToken();
    const handlers: Record<string, (() => void)> = {};

    mockOn.mockImplementation((event: string, handler: () => void) => {
      handlers[event] = handler;
      return mockSocket;
    });

    const { result } = renderHook(() => useRealtimeConnection());

    // Simulate connect then disconnect
    act(() => {
      mockSocket.connected = true;
      handlers['connect']?.();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      mockSocket.connected = false;
      handlers['disconnect']?.();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('should set degraded mode on connect_error event', () => {
    setupSessionToken();
    const handlers: Record<string, (err?: Error) => void> = {};

    mockOn.mockImplementation((event: string, handler: (err?: Error) => void) => {
      handlers[event] = handler;
      return mockSocket;
    });

    const { result } = renderHook(() => useRealtimeConnection());

    // Simulate connection error
    act(() => {
      handlers['connect_error']?.(new Error('Transport error'));
    });

    expect(result.current.isDegraded).toBe(true);
    expect(result.current.connectionState).toBe('degraded');
  });

  it('should clean up socket on unmount', () => {
    setupSessionToken();
    const { unmount } = renderHook(() => useRealtimeConnection());

    unmount();

    expect(mockClose).toHaveBeenCalled();
  });

  it('should expose pollingInterval for TanStack Query fallback', () => {
    setupSessionToken();
    const handlers: Record<string, (err?: Error) => void> = {};

    mockOn.mockImplementation((event: string, handler: (err?: Error) => void) => {
      handlers[event] = handler;
      return mockSocket;
    });

    const { result } = renderHook(() => useRealtimeConnection());

    // When connected, polling is disabled (false)
    act(() => {
      mockSocket.connected = true;
      handlers['connect']?.();
    });
    expect(result.current.pollingInterval).toBe(false);

    // When degraded, polling is active
    act(() => {
      mockSocket.connected = false;
      handlers['connect_error']?.(new Error('fail'));
    });
    expect(result.current.pollingInterval).toBeGreaterThan(0);
  });
});
