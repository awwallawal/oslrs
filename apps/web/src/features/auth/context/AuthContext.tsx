import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type { AuthUser, LoginRequest } from '@oslsr/types';
import * as authApi from '../api/auth.api';
import { AuthApiError } from '../api/auth.api';

// Token storage key
const ACCESS_TOKEN_KEY = 'oslsr_access_token';

// Token refresh buffer (refresh 1 minute before expiry)
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

// Inactivity timeout (8 hours in ms)
const INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000;

// Last activity storage key
const LAST_ACTIVITY_KEY = 'oslsr_last_activity';

// Auth state interface
interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isRememberMe: boolean;
  requiresReAuth: boolean;
  reAuthAction: string | null;
}

// Auth actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: AuthUser; accessToken: string; rememberMe: boolean } }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'TOKEN_REFRESH'; payload: string }
  | { type: 'REQUIRE_REAUTH'; payload: string }
  | { type: 'REAUTH_COMPLETE' }
  | { type: 'CLEAR_ERROR' };

// Initial state
const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true, // Start loading until we check for existing session
  error: null,
  isRememberMe: false,
  requiresReAuth: false,
  reAuthAction: null,
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        isRememberMe: action.payload.rememberMe,
      };
    case 'AUTH_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      return {
        ...initialState,
        isLoading: false,
      };
    case 'TOKEN_REFRESH':
      return {
        ...state,
        accessToken: action.payload,
      };
    case 'REQUIRE_REAUTH':
      return {
        ...state,
        requiresReAuth: true,
        reAuthAction: action.payload,
      };
    case 'REAUTH_COMPLETE':
      return {
        ...state,
        requiresReAuth: false,
        reAuthAction: null,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

// Context interface
interface AuthContextValue extends AuthState {
  loginStaff: (request: LoginRequest) => Promise<void>;
  loginPublic: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  reAuthenticate: (password: string) => Promise<boolean>;
  clearError: () => void;
  updateActivity: () => void;
}

// Create context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save access token to storage
  const saveToken = useCallback((token: string) => {
    try {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
      // Storage might be unavailable
    }
  }, []);

  // Get access token from storage
  const getStoredToken = useCallback(() => {
    try {
      return sessionStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }, []);

  // Clear access token from storage
  const clearToken = useCallback(() => {
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // Storage might be unavailable
    }
  }, []);

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    try {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    } catch {
      // Storage might be unavailable
    }
  }, []);

  // Check if session has timed out due to inactivity
  const checkInactivityTimeout = useCallback(() => {
    try {
      const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity, 10);
        if (elapsed > INACTIVITY_TIMEOUT_MS) {
          return true;
        }
      }
    } catch {
      // Storage might be unavailable
    }
    return false;
  }, []);

  // Schedule token refresh
  const scheduleTokenRefresh = useCallback((expiresIn: number) => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Schedule refresh 1 minute before expiry
    const refreshTime = (expiresIn * 1000) - TOKEN_REFRESH_BUFFER_MS;

    if (refreshTime > 0) {
      refreshTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await authApi.refreshToken();
          dispatch({ type: 'TOKEN_REFRESH', payload: response.accessToken });
          saveToken(response.accessToken);
          scheduleTokenRefresh(response.expiresIn);
        } catch (error) {
          // Token refresh failed, log out
          dispatch({ type: 'AUTH_LOGOUT' });
          clearToken();
        }
      }, refreshTime);
    }
  }, [saveToken, clearToken]);

  // Setup activity tracking
  const setupActivityTracking = useCallback(() => {
    // Clear existing timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    // Set up activity listeners
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const activityHandler = () => {
      updateActivity();
    };

    events.forEach(event => {
      window.addEventListener(event, activityHandler, { passive: true });
    });

    // Initial activity
    updateActivity();

    // Return cleanup function
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, activityHandler);
      });
    };
  }, [updateActivity]);

  // Staff login
  const loginStaff = useCallback(async (request: LoginRequest) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authApi.staffLogin(request);

      saveToken(response.accessToken);
      updateActivity();

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user: response.user,
          accessToken: response.accessToken,
          rememberMe: request.rememberMe || false,
        },
      });

      scheduleTokenRefresh(response.expiresIn);
    } catch (error) {
      const message = error instanceof AuthApiError
        ? error.message
        : 'Login failed. Please try again.';
      dispatch({ type: 'AUTH_ERROR', payload: message });
      throw error;
    }
  }, [saveToken, updateActivity, scheduleTokenRefresh]);

  // Public login
  const loginPublic = useCallback(async (request: LoginRequest) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authApi.publicLogin(request);

      saveToken(response.accessToken);
      updateActivity();

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user: response.user,
          accessToken: response.accessToken,
          rememberMe: request.rememberMe || false,
        },
      });

      scheduleTokenRefresh(response.expiresIn);
    } catch (error) {
      const message = error instanceof AuthApiError
        ? error.message
        : 'Login failed. Please try again.';
      dispatch({ type: 'AUTH_ERROR', payload: message });
      throw error;
    }
  }, [saveToken, updateActivity, scheduleTokenRefresh]);

  // Logout
  const logout = useCallback(async () => {
    try {
      if (state.accessToken) {
        await authApi.logout(state.accessToken);
      }
    } catch {
      // Continue with logout even if API call fails
    }

    // Clear timeouts
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    clearToken();
    dispatch({ type: 'AUTH_LOGOUT' });
  }, [state.accessToken, clearToken]);

  // Re-authenticate for sensitive actions
  const reAuthenticate = useCallback(async (password: string): Promise<boolean> => {
    if (!state.accessToken) {
      return false;
    }

    try {
      const response = await authApi.reAuthenticate({ password }, state.accessToken);
      if (response.verified) {
        dispatch({ type: 'REAUTH_COMPLETE' });
        return true;
      }
      return false;
    } catch (error) {
      const message = error instanceof AuthApiError
        ? error.message
        : 'Re-authentication failed.';
      dispatch({ type: 'AUTH_ERROR', payload: message });
      return false;
    }
  }, [state.accessToken]);

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      // Check for inactivity timeout
      if (checkInactivityTimeout()) {
        clearToken();
        dispatch({ type: 'AUTH_LOGOUT' });
        return;
      }

      // Try to restore session from refresh token
      try {
        const response = await authApi.refreshToken();

        // Get user info
        const userInfo = await authApi.getCurrentUser(response.accessToken);

        saveToken(response.accessToken);
        updateActivity();

        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            user: {
              id: userInfo.id,
              email: userInfo.email,
              fullName: '', // Not returned from /me endpoint
              role: userInfo.role as any,
              status: 'active',
            },
            accessToken: response.accessToken,
            rememberMe: userInfo.rememberMe,
          },
        });

        scheduleTokenRefresh(response.expiresIn);
      } catch {
        // No valid session, clear any stored data
        clearToken();
        dispatch({ type: 'AUTH_LOGOUT' });
      }
    };

    initializeAuth();
  }, [checkInactivityTimeout, clearToken, saveToken, updateActivity, scheduleTokenRefresh]);

  // Setup activity tracking when authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      return setupActivityTracking();
    }
  }, [state.isAuthenticated, setupActivityTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, []);

  const value: AuthContextValue = {
    ...state,
    loginStaff,
    loginPublic,
    logout,
    reAuthenticate,
    clearError,
    updateActivity,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook to check if user has required role
export function useRequireRole(allowedRoles: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

// Export context for testing
export { AuthContext };
