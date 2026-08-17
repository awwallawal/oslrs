import { UserRole } from './constants.js';

// Auth provider types (Story 3.0)
export type AuthProvider = 'email' | 'google';

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
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation before schema validation
export interface LoginRequest {
  email: string;
  password: string;
  captchaToken?: string;
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
  authProvider?: AuthProvider;
}

// Token refresh
/**
 * The refresh endpoint takes NO body — the refresh token is read from the
 * httpOnly cookie.
 *
 * ⚠️ `Record<string, never>`, not an empty `interface` (2026-08-16, first lint
 * of `packages/*`). An empty interface declaration accepts any non-nullish
 * value — `0` and `""` included — so the shape that was meant to say "nothing
 * goes here" in fact said "anything at all goes here", which is the opposite.
 * Nothing consumed either of these two marker types, so this is a correction to
 * documentation rather than to behaviour; it is written out because the next
 * empty-body request type will be copied from one of them.
 */
export type RefreshTokenRequest = Record<string, never>;

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}

// Logout
/** No body — the token is read from the Authorization header. See the note on
 *  `RefreshTokenRequest` for why this is a `Record<string, never>`. */
export type LogoutRequest = Record<string, never>;

// Password reset
// Note: captchaToken is optional here because the verifyCaptcha middleware
// handles CAPTCHA validation before schema validation
export interface ForgotPasswordRequest {
  email: string;
  captchaToken?: string;
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

// Google OAuth request type (Story 3.0)
export interface GoogleAuthRequest {
  idToken: string;
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
  | 'AUTH_REQUIRED'
  | 'AUTH_GOOGLE_TOKEN_INVALID'
  | 'AUTH_GOOGLE_ONLY'
  | 'AUTH_EMAIL_ONLY'
  | 'AUTH_PROVIDER_CONFLICT';
