/**
 * Centralised request-validation middleware factory.
 *
 * Use this for new endpoints that want declarative Zod-driven validation.
 * Existing controllers using the inline `safeParse(req.body)` pattern (see
 * `apps/api/src/controllers/auth.controller.ts:119-122`) are NOT migrated —
 * the migration is deferred to a separate prep task to keep this story's
 * scope bounded. Both patterns coexist; the error response shape is
 * identical between them, so client code is unaffected.
 *
 * Behaviour:
 *   - On success: replaces `req[source]` with the schema's parsed (and
 *     possibly transformed) value, then calls `next()`. Downstream handlers
 *     can rely on canonical, validated data.
 *   - On failure: forwards an `AppError('VALIDATION_ERROR', 'Invalid <source>
 *     data', 400, { errors })` to the global error handler via `next(err)`.
 *     Shape exactly mirrors the inline pattern so clients see one response
 *     contract.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '@oslsr/utils';

export type ValidateSource = 'body' | 'query' | 'params';

export const validate = <T>(
  schema: ZodSchema<T>,
  source: ValidateSource = 'body',
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      // F9 (code-review 2026-05-02): `result.error.errors` exposes the full
      // Zod error array including `path`, `message`, `code`, `expected`. This
      // is intentional — Zod errors are user-facing by design (matches the
      // existing inline pattern at auth.controller.ts:119-122 for shape parity).
      // If a future story needs to omit internals on public-facing endpoints,
      // add a `redact` boolean param here that strips `path` to `[]` etc.
      next(
        new AppError(
          'VALIDATION_ERROR',
          `Invalid ${source} data`,
          400,
          { errors: result.error.errors },
        ),
      );
      return;
    }
    // Attach the parsed (canonical, transformed) value back so downstream
    // handlers consume normalised data without re-parsing.
    // F11 (code-review 2026-05-02): Express 4.x allows mutating req.query and
    // req.params at runtime. Express 5.x typed them as readonly which is why
    // we cast through unknown. If/when the project upgrades to Express 5+,
    // verify this still works and fall back to attaching to req.body[`_${source}`]
    // if the runtime starts rejecting the assignment.
    (req as unknown as Record<ValidateSource, unknown>)[source] = result.data;
    next();
  };
};
