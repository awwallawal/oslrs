import { useEffect, useState, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useOnlineStatus } from './useOnlineStatus';
// Story 9-49 (ADR-022): the access token lives only in the in-memory holder,
// never web storage. Read it here for the socket handshake (the holder is kept
// current by AuthContext on login / silent-refresh, so reconnects pick up
// refreshed JWTs automatically — same property the old sessionStorage read had).
import { getAccessToken } from '../lib/auth-token-holder';

/** Extract origin from API URL, falling back to current page origin (dual-domain) or localhost */
function getSocketUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  // Relative URL (Phase 2 dual-domain: /api/v1) or unset — use current page origin so the
  // socket connects back to whichever host the user is loaded from.
  if (!apiUrl || apiUrl.startsWith('/')) {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  }
  // Absolute URL (e.g. local dev pointing at remote API)
  try {
    return new URL(apiUrl).origin;
  } catch {
    return apiUrl.replace(/\/api\/v\d+\/?$/, '');
  }
}

const SOCKET_URL = getSocketUrl();

/** Polling backoff schedule (ms): 5s → 10s → 30s → 60s max */
const POLLING_INTERVALS = [5_000, 10_000, 30_000, 60_000] as const;

/**
 * Story 9-60: bound socket reconnection. Previously `Infinity`, which let a
 * dead/auth-failing handshake retry forever — orphaned sockets accumulated
 * across HMR re-mounts in dev and pegged the event loop (only a Vite restart
 * cleared it), and in prod a transiently-failing handshake never gave up. Once
 * these attempts are exhausted the Manager emits `reconnect_failed`; we then
 * settle into the existing degraded/polling fallback instead of hammering.
 * 10 gives generous headroom (~4–5 min of bounded backoff, capped at 30s/attempt)
 * before handing to polling; the focus/visibility re-arm recovers sooner when the
 * user returns to the tab.
 */
const MAX_RECONNECTION_ATTEMPTS = 10;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'degraded';

interface RealtimeConnectionReturn {
  /** Whether the socket is actively connected */
  isConnected: boolean;
  /** Whether we're in degraded/polling mode */
  isDegraded: boolean;
  /** Current connection state */
  connectionState: ConnectionState;
  /**
   * Polling interval for TanStack Query refetchInterval.
   * Returns `false` when socket is connected (no polling needed),
   * or a number (ms) when degraded to enable polling fallback.
   */
  pollingInterval: number | false;
  /** The raw socket instance (for event listeners in consuming components) */
  socket: Socket | null;
}

/**
 * Hook for managing Socket.io realtime connection with auth and fallback.
 *
 * Follows existing hook patterns (useOnlineStatus, useToast):
 * - Named export, typed return object
 * - Cleanup on unmount
 * - Composes with useOnlineStatus for offline detection
 */
export function useRealtimeConnection(): RealtimeConnectionReturn {
  const { isOnline } = useOnlineStatus();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [errorCount, setErrorCount] = useState(0);
  // Story 9-60 (H1): bump to re-arm the connection effect with a fresh
  // reconnection budget on a recovery signal, without an unbounded retry loop.
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  // Mirror connectionState in a ref so the mount-once re-arm listeners can read
  // the latest state without being re-attached on every state change.
  const connectionStateRef = useRef<ConnectionState>('disconnected');
  connectionStateRef.current = connectionState;

  const getPollingInterval = useCallback((errors: number): number => {
    const index = Math.min(errors, POLLING_INTERVALS.length - 1);
    return POLLING_INTERVALS[index];
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !isOnline) {
      return;
    }

    const socket = io(SOCKET_URL, {
      // Function form: re-reads the in-memory token on each reconnection attempt,
      // so refreshed JWTs from AuthContext are picked up automatically.
      auth: (cb) => {
        cb({ token: getAccessToken() });
      },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
    });

    socketRef.current = socket;
    setConnectionState('connecting');

    socket.on('connect', () => {
      setConnectionState('connected');
      setErrorCount(0);
    });

    socket.on('disconnect', () => {
      setConnectionState('disconnected');
    });

    socket.on('connect_error', () => {
      setErrorCount((prev) => prev + 1);
      setConnectionState('degraded');
    });

    // Story 9-60: when the bounded reconnection attempts are exhausted, stop
    // retrying and hand off to the polling fallback. `reconnect_failed` is a
    // Manager event, emitted on `socket.io`, not on the socket itself.
    const handleReconnectFailed = () => {
      // Settle into the polling fallback at its slowest cadence — deterministic,
      // regardless of how many connect_error events preceded this. Drop the dead
      // socket so consumers (useMessageRealtime, keyed on [socket]) unbind from
      // it, then stop. Recovery is re-armed by the focus/visibility effect below.
      setErrorCount(POLLING_INTERVALS.length - 1);
      setConnectionState('degraded');
      socket.close();
      socketRef.current = null;
    };
    socket.io.on('reconnect_failed', handleReconnectFailed);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.close();
      socketRef.current = null;
    };
  }, [isOnline, reconnectNonce]);

  // Story 9-60 (H1): bounded reconnection stops the storm, but on its own it
  // would leave the socket permanently in polling mode after a transient outage
  // that never toggled navigator.onLine (e.g. a server restart). Re-arm a fresh
  // connection when the user returns to the tab — the common recovery signal —
  // but ONLY from the settled `degraded` state, so we never interrupt a healthy
  // or in-progress connection and never reintroduce an unbounded loop.
  useEffect(() => {
    const rearm = () => {
      if (connectionStateRef.current !== 'degraded') return;
      setReconnectNonce((n) => n + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') rearm();
    };
    window.addEventListener('focus', rearm);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', rearm);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const isConnected = connectionState === 'connected';
  const isDegraded = connectionState === 'degraded';
  const pollingInterval = isConnected ? false : getPollingInterval(errorCount);

  return {
    isConnected,
    isDegraded,
    connectionState,
    pollingInterval,
    socket: socketRef.current,
  };
}
