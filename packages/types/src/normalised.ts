/**
 * Shared Zod schemas for normalised input fields.
 *
 * These schemas are the lightweight, validate-and-canonicalise variant intended
 * for declarative request validation (the `validate` middleware factory in
 * `apps/api/src/middleware/validate.ts`) and client-side form validation.
 *
 * The full warning-emitting normalisers live at `apps/api/src/lib/normalise/`
 * and are the source of truth for the input-boundary wiring (submission
 * ingest, staff provisioning, etc.) where `respondents.metadata.normalisation_warnings`
 * needs to be populated for audit. The schemas here mirror the canonical
 * output format of those normalisers but emit no warnings.
 *
 * Why two layers: schema files in `apps/api/src/db/schema/*` and shared types
 * in `packages/types/*` cannot import from `apps/api` (drizzle-kit constraint
 * + layering inversion). So we duplicate the lightweight transforms here.
 * Drift risk between layers is mitigated by `__tests__/normalised.test.ts`
 * asserting that the transform output matches `apps/api/src/lib/normalise`
 * canonical output for representative inputs.
 */

import { z } from 'zod';

const trimAndLowercase = (val: string): string => val.trim().toLowerCase();

/**
 * Email — trimmed + lower-cased, then validated as RFC-compliant.
 */
export const NormalisedEmailSchema = z
  .string()
  .transform(trimAndLowercase)
  .pipe(z.string().email());

const KNOWN_NG_MOBILE_PREFIXES = new Set(['70', '80', '81', '90', '91']);

/**
 * Nigerian phone — strips cosmetic chars, derives 10-digit NSN from the
 * recognised local-trunk / country-code prefix, returns canonical E.164
 * `+234XXXXXXXXXX`. Refines on length AND known mobile prefix so an
 * unparseable or unknown-prefix input is rejected at validation time
 * (server-side endpoints that need this strict guarantee). Boundaries
 * that need to accept-but-warn instead should use `normaliseNigerianPhone`
 * directly from `apps/api/src/lib/normalise/phone.ts`.
 */
export const NigerianPhoneSchema = z
  .string()
  .transform((val) => {
    const stripped = val.trim().replace(/[\s\-().]/g, '');
    if (stripped.startsWith('+234')) return stripped.slice(4);
    if (stripped.startsWith('234')) return stripped.slice(3);
    if (stripped.startsWith('0')) return stripped.slice(1);
    return stripped;
  })
  .refine((nsn) => /^\d{10}$/.test(nsn), {
    message: 'Nigerian phone must canonicalise to a 10-digit NSN',
  })
  .refine((nsn) => KNOWN_NG_MOBILE_PREFIXES.has(nsn.slice(0, 2)), {
    message: 'Unknown Nigerian mobile prefix (expected one of 70, 80, 81, 90, 91)',
  })
  .transform((nsn) => `+234${nsn}`);

/**
 * Full name — trim, collapse internal whitespace, title-case while preserving
 * hyphenated compound surnames.
 */
export const NormalisedNameSchema = z
  .string()
  .min(1, 'Name must not be empty')
  .transform((val) => val.trim().replace(/\s+/g, ' '))
  .refine((val) => val.length > 0, { message: 'Name must not be empty' })
  .transform((val) =>
    val
      .split(' ')
      .map((word) =>
        word
          .split('-')
          .map((part) =>
            part === '' ? '' : part[0].toUpperCase() + part.slice(1).toLowerCase(),
          )
          .join('-'),
      )
      .join(' '),
  );

/**
 * Date — accepts ISO YYYY-MM-DD or DMY (`d/m/yyyy`, `d-m-yyyy`, `d.m.yyyy`)
 * and returns a canonical ISO YYYY-MM-DD string. For boundaries that need
 * format flexibility (auto-detect MDY vs DMY etc.), use `normaliseDate`
 * from `apps/api/src/lib/normalise/date.ts` directly.
 */
export const NormalisedDateSchema = z
  .string()
  .transform((val, ctx) => {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== m - 1 ||
        dt.getUTCDate() !== d
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date components' });
        return z.NEVER;
      }
      return trimmed;
    }
    const parts = trimmed.split(/[/\-.\s]+/).filter(Boolean);
    if (parts.length !== 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date must be ISO or DMY format' });
      return z.NEVER;
    }
    const [d, m, y] = parts.map((p) => Number.parseInt(p, 10));
    if ([d, m, y].some((n) => Number.isNaN(n))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date components must be numeric' });
      return z.NEVER;
    }
    const year = y < 100 ? (y > 50 ? 1900 + y : 2000 + y) : y;
    const dt = new Date(Date.UTC(year, m - 1, d));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date components' });
      return z.NEVER;
    }
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });

/**
 * Trade — trim + collapse whitespace + lowercase. The canonical-vocabulary
 * mapping (`normaliseTrade`) lives in `apps/api/src/lib/normalise/trade.ts`
 * and is server-only because it depends on the trade vocabulary table. This
 * schema is just the input-side cleanup.
 */
export const NormalisedTradeSchema = z
  .string()
  .transform((val) => val.trim().toLowerCase().replace(/\s+/g, ' '))
  .refine((val) => val.length > 0, { message: 'Trade must not be empty' });
