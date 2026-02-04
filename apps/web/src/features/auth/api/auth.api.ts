import type {
  LoginRequest,
  LoginResponse,
  RefreshTokenResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  ReAuthRequest,
  ReAuthResponse,
} from '@oslsr/types';

// Registration types
export interface PublicRegistrationRequest {
  fullName: string;
  email: string;
  phone: string;
  nin: string;
  password: string;
  confirmPassword: string;
  captchaToken: string;
}

export interface PublicRegistrationResponse {
  message: string;
}

export interface VerifyEmailResponse {
  message: string;
  success: boolean;
}

export interface ResendVerificationRequest {
  email: string;
  captchaToken: string;
}

export interface ResendVerificationResponse {
  message: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

/**
 * Auth API error class with typed error codes
 */
export class AuthApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Make authenticated API request
 * Automatically includes access token and handles credentials
 */
async function authFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const { headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: requestHeaders,
    credentials: 'include', // Required for refresh token cookies
    ...rest,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new AuthApiError(
      data.message || 'Authentication request failed',
      data.code || 'AUTH_ERROR',
      response.status,
      data.details
    );
  }

  return data.data as T;
}

/**
 * Staff login
 */
export async function staffLogin(request: LoginRequest): Promise<LoginResponse> {
  return authFetch<LoginResponse>('/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Public user login
 */
export async function publicLogin(request: LoginRequest): Promise<LoginResponse> {
  return authFetch<LoginResponse>('/auth/public/login', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Logout - invalidates session and blacklists token
 */
export async function logout(accessToken: string): Promise<{ message: string }> {
  return authFetch<{ message: string }>(
    '/auth/logout',
    {
      method: 'POST',
    },
    accessToken
  );
}

/**
 * Refresh access token using httpOnly refresh token cookie
 */
export async function refreshToken(): Promise<RefreshTokenResponse> {
  return authFetch<RefreshTokenResponse>('/auth/refresh', {
    method: 'POST',
  });
}

/**
 * Request password reset email
 */
export async function forgotPassword(request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return authFetch<ForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Validate password reset token
 */
export async function validateResetToken(token: string): Promise<{ valid: boolean }> {
  return authFetch<{ valid: boolean }>(`/auth/reset-password/${token}`, {
    method: 'GET',
  });
}

/**
 * Complete password reset
 */
export async function resetPassword(request: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  return authFetch<ResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Re-authenticate for sensitive actions
 */
export async function reAuthenticate(
  request: ReAuthRequest,
  accessToken: string
): Promise<ReAuthResponse> {
  return authFetch<ReAuthResponse>(
    '/auth/reauth',
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
    accessToken
  );
}

/**
 * Get current user info
 */
export async function getCurrentUser(accessToken: string): Promise<{
  id: string;
  email: string;
  role: string;
  lgaId?: string;
  rememberMe: boolean;
}> {
  return authFetch<{
    id: string;
    email: string;
    role: string;
    lgaId?: string;
    rememberMe: boolean;
  }>(
    '/auth/me',
    {
      method: 'GET',
    },
    accessToken
  );
}

/**
 * Public user registration
 */
export async function publicRegister(request: PublicRegistrationRequest): Promise<PublicRegistrationResponse> {
  return authFetch<PublicRegistrationResponse>('/auth/public/register', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Verify email address using token
 */
export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return authFetch<VerifyEmailResponse>(`/auth/verify-email/${token}`, {
    method: 'GET',
  });
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(request: ResendVerificationRequest): Promise<ResendVerificationResponse> {
  return authFetch<ResendVerificationResponse>('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Activation with selfie request type
 * Matches ActivationWithSelfiePayload from @oslsr/types
 */
export interface ActivationWithSelfieRequest {
  password: string;
  nin: string;
  dateOfBirth: string;
  homeAddress: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  selfieBase64?: string;
}

/**
 * Activation response type
 */
export interface ActivationResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    status: string;
  };
}

/**
 * Token validation response
 */
export interface ValidateTokenResponse {
  valid: boolean;
  email?: string;
  fullName?: string;
  expired?: boolean;
}

/**
 * Validate activation token before showing the wizard
 * Returns user info if token is valid
 */
export async function validateActivationToken(token: string): Promise<ValidateTokenResponse> {
  try {
    return await authFetch<ValidateTokenResponse>(`/auth/activate/${token}/validate`, {
      method: 'GET',
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      if (error.code === 'AUTH_TOKEN_EXPIRED') {
        return { valid: false, expired: true };
      }
      if (error.code === 'AUTH_INVALID_TOKEN' || error.code === 'AUTH_ALREADY_ACTIVATED') {
        return { valid: false, expired: false };
      }
    }
    throw error;
  }
}

/**
 * Activate staff account with profile data and optional selfie
 * Story 2.5-3, Tasks 19-20: Supports selfieBase64 for ID card generation
 */
export async function activateWithSelfie(
  token: string,
  request: ActivationWithSelfieRequest
): Promise<ActivationResponse> {
  return authFetch<ActivationResponse>(`/auth/activate/${token}`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
