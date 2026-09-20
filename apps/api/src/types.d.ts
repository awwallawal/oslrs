import { JwtPayload } from '@oslsr/types';
import { Request } from 'express';
import type { AnalyticsScope } from './middleware/analytics-scope.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionId?: string;
      viewAs?: {
        targetRole: string;
        targetLgaId: string | null;
        reason: string | null;
        startedAt: string;
        expiresAt: string;
      };
      analyticsScope?: AnalyticsScope;
    }

    /**
     * Story 13-70 FR1 — which rate limiter, if any, refused this request.
     *
     * PRD NFR4.4.d: *a 429 emitted by one limiter MUST NOT be counted by any other limiter on the
     * same route.* The limiters mounted behind `loginIpFloodLimit` set this in their `handler`
     * before responding; the ceiling reads it and hands its own increment back. Typed here once so
     * no site has to cast, and so a limiter added to these routes later opts in EXPLICITLY rather
     * than inheriting behaviour from a status code (adjudication 2026-09-20, Option B).
     */
    interface Locals {
      rateLimitRefusedBy?: string;
    }
  }
}

/**
 * Express Request with guaranteed authenticated user.
 * Use this type in controllers after authenticate middleware has run.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  sessionId?: string;
}
