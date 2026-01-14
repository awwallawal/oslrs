import { UserRole } from './constants.js';

// JWT Payload structure
export interface JwtPayload {
  sub: string;        // userId (UUIDv7)
  jti: string;        // Unique token ID for blacklisting
  role: UserRole;
  lgaId?: string;     // For field staff (enumerators, supervisors)
  email: string;
  rememberMe: boolean;
  iat: number;        // Issued at
  exp: number;        // Expiration
}

// Login request types
export interface LoginRequest {
  email: string;
  password: string;
  captchaToken: string;
  rememberMe?: boolean;
}

export interface StaffLoginRequest extends LoginRequest {
  type: 'staff';
}

export interface PublicLoginRequest extends LoginRequest {
  type: 'public';
}

// Login response types
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  expiresIn: number;  // Seconds until access token expires
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  lgaId?: string;
  status: string;
}

// Token refresh
export interface RefreshTokenRequest {
  // Refresh token is read from httpOnly cookie
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}

// Logout
export interface LogoutRequest {
  // Token is read from Authorization header
}

// Password reset
export interface ForgotPasswordRequest {
  email: string;
  captchaToken: string;
}

export interface ForgotPasswordResponse {
  message: string;  // Always same message regardless of email existence
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

// Re-authentication for sensitive actions (Remember Me)
export interface ReAuthRequest {
  password: string;
}

export interface ReAuthResponse {
  verified: boolean;
  expiresIn: number;  // Seconds until re-auth expires
}

// Session info (for frontend)
export interface SessionInfo {
  userId: string;
  sessionId: string;
  lastActivity: string;      // ISO timestamp
  expiresAt: string;         // ISO timestamp
  isRememberMe: boolean;
  absoluteExpiresAt: string; // ISO timestamp (24h or 30d)
}

// Auth error codes
export type AuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_RATE_LIMIT_EXCEEDED'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_TOKEN_REVOKED'
  | 'AUTH_CAPTCHA_FAILED'
  | 'AUTH_RESET_TOKEN_EXPIRED'
  | 'AUTH_RESET_TOKEN_INVALID'
  | 'AUTH_RESET_RATE_LIMITED'
  | 'AUTH_REAUTH_REQUIRED'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_ACCOUNT_SUSPENDED'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_REQUIRED';
