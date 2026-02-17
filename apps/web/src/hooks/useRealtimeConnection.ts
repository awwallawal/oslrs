import { useEffect, useState, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useOnlineStatus } from './useOnlineStatus';

const ACCESS_TOKEN_KEY = 'oslsr_access_token';

/** Extract origin from API URL, falling back to localhost */
function getSocketUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      return apiUrl.replace(/\/api\/v\d+\/?$/, '');
    }
  }
  return 'http://localhost:3000';
}

const SOCKET_URL = getSocketUrl();

/** Polling backoff schedule (ms): 5s → 10s → 30s → 60s max */
const POLLING_INTERVALS = [5_000, 10_000, 30_000, 60_000] as const;

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
  const socketRef = useRef<Socket | null>(null);

  const getPollingInterval = useCallback((errors: number): number => {
    const index = Math.min(errors, POLLING_INTERVALS.length - 1);
    return POLLING_INTERVALS[index];
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token || !isOnline) {
      return;
    }

    const socket = io(SOCKET_URL, {
      // Function form: re-reads token on each reconnection attempt,
      // so refreshed JWTs from AuthContext are picked up automatically.
      auth: (cb) => {
        cb({ token: sessionStorage.getItem(ACCESS_TOKEN_KEY) });
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
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

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.close();
      socketRef.current = null;
    };
  }, [isOnline]);

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
