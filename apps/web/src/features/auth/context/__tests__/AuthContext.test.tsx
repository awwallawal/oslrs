// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { AuthProvider, useAuth, useRequireRole } from '../AuthContext';
import * as authApi from '../../api/auth.api';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

// Mock the auth API module
vi.mock('../../api/auth.api', () => ({
  staffLogin: vi.fn(),
  publicLogin: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  getCurrentUser: vi.fn(),
  reAuthenticate: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    code: string;
    details?: Record<string, unknown>;
    constructor(message: string, code: string, details?: Record<string, unknown>) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

const mockAuthApi = authApi as unknown as {
  staffLogin: ReturnType<typeof vi.fn>;
  publicLogin: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  refreshToken: ReturnType<typeof vi.fn>;
  getCurrentUser: ReturnType<typeof vi.fn>;
  reAuthenticate: ReturnType<typeof vi.fn>;
  AuthApiError: new (message: string, code: string, details?: Record<string, unknown>) => Error & { code: string; details?: Record<string, unknown> };
};

// Test wrapper component
function TestComponent({ testId = 'test' }: { testId?: string }) {
  const { isAuthenticated, user, isLoading } = useAuth();
  return (
    <div data-testid={testId}>
      <span data-testid="loading">{isLoading ? 'loading' : 'loaded'}</span>
      <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing session
    mockAuthApi.refreshToken.mockRejectedValue(new Error('No session'));
    // Clear session storage
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial State', () => {
    it('starts in loading state and checks for existing session', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Initially loading
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');

      // After session check completes
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      });
    });

    it('is not authenticated when no session exists', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
      expect(screen.getByTestId('user')).toHaveTextContent('none');
    });
  });

  describe('Session Restoration', () => {
    it('restores session from refresh token on mount', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'enumerator',
        rememberMe: false,
      };

      mockAuthApi.refreshToken.mockResolvedValueOnce({
        accessToken: 'new-access-token',
        expiresIn: 900,
      });

      mockAuthApi.getCurrentUser.mockResolvedValueOnce(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });
  });

  describe('useAuth Hook', () => {
    it('throws error when used outside AuthProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });

    it('provides login functions', async () => {
      mockAuthApi.refreshToken.mockRejectedValueOnce(new Error('No session'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.loginStaff).toBe('function');
      expect(typeof result.current.loginPublic).toBe('function');
      expect(typeof result.current.logout).toBe('function');
      expect(typeof result.current.reAuthenticate).toBe('function');
    });
  });

  describe('Staff Login', () => {
    it('updates state on successful staff login', async () => {
      const mockLoginResponse = {
        accessToken: 'access-token-123',
        user: {
          id: 'user-123',
          email: 'staff@example.com',
          fullName: 'Staff User',
          role: 'enumerator',
          status: 'active',
        },
        expiresIn: 900,
      };

      mockAuthApi.staffLogin.mockResolvedValueOnce(mockLoginResponse);
      mockAuthApi.refreshToken.mockRejectedValueOnce(new Error('No session'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.loginStaff({
          email: 'staff@example.com',
          password: 'password123',
          captchaToken: 'captcha-token',
          rememberMe: false,
        });
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe('staff@example.com');
    });

    it('sets error on failed staff login', async () => {
      const { AuthApiError } = mockAuthApi;
      mockAuthApi.staffLogin.mockRejectedValueOnce(
        new AuthApiError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS')
      );
      mockAuthApi.refreshToken.mockRejectedValueOnce(new Error('No session'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.loginStaff({
            email: 'staff@example.com',
            password: 'wrongpassword',
            captchaToken: 'captcha-token',
            rememberMe: false,
          });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBe('Invalid credentials');
    });
  });

  describe('Logout', () => {
    it('clears auth state on logout', async () => {
      const mockLoginResponse = {
        accessToken: 'access-token-123',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'enumerator',
          status: 'active',
        },
        expiresIn: 900,
      };

      mockAuthApi.staffLogin.mockResolvedValueOnce(mockLoginResponse);
      mockAuthApi.logout.mockResolvedValueOnce({});
      mockAuthApi.refreshToken.mockRejectedValueOnce(new Error('No session'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Login first
      await act(async () => {
        await result.current.loginStaff({
          email: 'test@example.com',
          password: 'password123',
          captchaToken: 'captcha-token',
          rememberMe: false,
        });
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Then logout
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('Re-Authentication', () => {
    it('calls reAuthenticate API and returns success', async () => {
      const mockLoginResponse = {
        accessToken: 'access-token-123',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'enumerator',
          status: 'active',
        },
        expiresIn: 900,
      };

      mockAuthApi.staffLogin.mockResolvedValueOnce(mockLoginResponse);
      mockAuthApi.reAuthenticate.mockResolvedValueOnce({ verified: true });
      mockAuthApi.refreshToken.mockRejectedValueOnce(new Error('No session'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Login first
      await act(async () => {
        await result.current.loginStaff({
          email: 'test@example.com',
          password: 'password123',
          captchaToken: 'captcha-token',
          rememberMe: true,
        });
      });

      // Re-authenticate
      let reAuthResult: boolean = false;
      await act(async () => {
        reAuthResult = await result.current.reAuthenticate('password123');
      });

      expect(reAuthResult).toBe(true);
    });
  });

  describe('Remember Me State', () => {
    it('tracks Remember Me state from login', async () => {
      const mockLoginResponse = {
        accessToken: 'access-token-123',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'enumerator',
          status: 'active',
        },
        expiresIn: 900,
      };

      mockAuthApi.staffLogin.mockResolvedValueOnce(mockLoginResponse);
      mockAuthApi.refreshToken.mockRejectedValueOnce(new Error('No session'));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Login with Remember Me
      await act(async () => {
        await result.current.loginStaff({
          email: 'test@example.com',
          password: 'password123',
          captchaToken: 'captcha-token',
          rememberMe: true,
        });
      });

      expect(result.current.isRememberMe).toBe(true);
    });
  });
});

describe('useRequireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthApi.refreshToken.mockRejectedValue(new Error('No session'));
    sessionStorage.clear();
  });

  it('returns false when user is not authenticated', async () => {
    const { result } = renderHook(() => useRequireRole(['admin']), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('returns true when user has required role', async () => {
    const mockLoginResponse = {
      accessToken: 'access-token-123',
      user: {
        id: 'user-123',
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'super_admin',
        status: 'active',
      },
      expiresIn: 900,
    };

    mockAuthApi.staffLogin.mockResolvedValueOnce(mockLoginResponse);

    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const hasRole = useRequireRole(['super_admin', 'admin']);
        return { auth, hasRole };
      },
      {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      }
    );

    await waitFor(() => {
      expect(result.current.auth.isLoading).toBe(false);
    });

    // Login
    await act(async () => {
      await result.current.auth.loginStaff({
        email: 'admin@example.com',
        password: 'password123',
        captchaToken: 'captcha-token',
        rememberMe: false,
      });
    });

    expect(result.current.hasRole).toBe(true);
  });

  it('returns false when user does not have required role', async () => {
    const mockLoginResponse = {
      accessToken: 'access-token-123',
      user: {
        id: 'user-123',
        email: 'user@example.com',
        fullName: 'Regular User',
        role: 'enumerator',
        status: 'active',
      },
      expiresIn: 900,
    };

    mockAuthApi.staffLogin.mockResolvedValueOnce(mockLoginResponse);

    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const hasRole = useRequireRole(['super_admin', 'admin']);
        return { auth, hasRole };
      },
      {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      }
    );

    await waitFor(() => {
      expect(result.current.auth.isLoading).toBe(false);
    });

    // Login
    await act(async () => {
      await result.current.auth.loginStaff({
        email: 'user@example.com',
        password: 'password123',
        captchaToken: 'captcha-token',
        rememberMe: false,
      });
    });

    expect(result.current.hasRole).toBe(false);
  });
});
