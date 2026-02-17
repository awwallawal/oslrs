import { AppError } from '@oslsr/utils';
import { TokenService } from '../services/token.service.js';
import type { JwtPayload } from '@oslsr/types';

/**
 * Verifies a token for Socket.io handshake authentication.
 * Replicates REST auth steps 1-4 (JWT verify, blacklist, revocation).
 * Session activity (step 5) is handled separately on connect/disconnect.
 */
export async function verifySocketToken(token: string): Promise<JwtPayload> {
  if (!token) {
    throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
  }

  // Step 1: Verify JWT signature and decode
  const decoded = TokenService.verifyAccessToken(token);

  // Step 2: Check if token is blacklisted
  const isBlacklisted = await TokenService.isBlacklisted(decoded.jti);
  if (isBlacklisted) {
    throw new AppError('AUTH_TOKEN_REVOKED', 'Token has been revoked', 401);
  }

  // Step 3: Check if token was revoked by timestamp (e.g., after password change)
  const isRevoked = await TokenService.isTokenRevokedByTimestamp(decoded.sub, decoded.iat);
  if (isRevoked) {
    throw new AppError('AUTH_TOKEN_REVOKED', 'Please log in again', 401);
  }

  return decoded;
}
