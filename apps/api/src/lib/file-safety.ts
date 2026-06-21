/**
 * File-safety helpers — Story 9-44 (F-016 / F-017 upload-pipeline hardening).
 *
 * Two concerns, one module:
 *   - F-016: derive download response headers from a SERVER-SIDE allowlist and
 *     a sanitized filename, never by reflecting stored client MIME / raw names.
 *   - F-017: validate uploaded files by MAGIC BYTES (content), not by the
 *     client-supplied `file.mimetype` or the filename extension alone.
 *
 * Selfies are validated by `sharp` (re-encode) and do not use this module.
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';

export type BinaryFileType = 'png' | 'jpeg' | 'pdf' | 'xlsx' | 'xml';

// ── Magic-byte signatures (F-017) ──────────────────────────────────────
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_SIG = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const ZIP_SIG = Buffer.from([0x50, 0x4b]); // PK — xlsx/docx are ZIP containers
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const XML_OPEN = 0x3c; // '<'

interface Signature {
  type: BinaryFileType;
  match: (b: Buffer) => boolean;
}

const SIGNATURES: Signature[] = [
  { type: 'png', match: (b) => b.length >= 8 && b.subarray(0, 8).equals(PNG_SIG) },
  { type: 'jpeg', match: (b) => b.length >= 3 && b.subarray(0, 3).equals(JPEG_SIG) },
  { type: 'pdf', match: (b) => b.length >= 4 && b.subarray(0, 4).equals(PDF_SIG) },
  { type: 'xlsx', match: (b) => b.length >= 2 && b.subarray(0, 2).equals(ZIP_SIG) },
  {
    type: 'xml',
    match: (b) => {
      if (b.length === 0) return false;
      const bom = b.length >= 3 && b.subarray(0, 3).equals(UTF8_BOM);
      const first = bom ? b[3] : b[0];
      return first === XML_OPEN;
    },
  },
];

/**
 * Detect the binary type of a buffer by magic bytes. Returns null when no
 * known signature matches (the safe default — caller rejects).
 *
 * NOTE: xlsx and any other ZIP-based container share the `PK` signature, so a
 * `.docx`/`.zip` would also detect as 'xlsx' here. That is acceptable for the
 * receipt/XLSForm allowlists (the extension+mime gate already narrows the type;
 * this layer's job is to reject NON-container payloads spoofing a container).
 */
export function detectMagicType(buffer: Buffer): BinaryFileType | null {
  for (const sig of SIGNATURES) {
    if (sig.match(buffer)) return sig.type;
  }
  return null;
}

/** True iff the buffer's detected magic type is in the allowed set. */
export function magicBytesAllowed(buffer: Buffer, allowed: BinaryFileType[]): boolean {
  const detected = detectMagicType(buffer);
  return detected !== null && allowed.includes(detected);
}

/**
 * Express middleware factory (F-017): reject `req.file` whose magic bytes are
 * not in `allowed`. No-op when there is no file (uploads are often optional).
 * Place AFTER the multer `.single()` handler in the route chain.
 */
export function requireMagicBytes(allowed: BinaryFileType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return next();
    // Review L1 — fail closed if the buffer is absent (e.g. a future diskStorage
    // route where multer sets `file.path` instead of `file.buffer`): never wave a
    // file through unchecked, and don't throw on `undefined.length`.
    if (!Buffer.isBuffer(file.buffer)) {
      return next(
        new AppError(
          'INVALID_FILE_CONTENT',
          'File content could not be validated (no in-memory buffer available).',
          400,
        ),
      );
    }
    if (!magicBytesAllowed(file.buffer, allowed)) {
      return next(
        new AppError(
          'INVALID_FILE_CONTENT',
          'File content does not match an allowed type (magic-byte check failed).',
          400,
        ),
      );
    }
    next();
  };
}

// ── Download header safety (F-016) ─────────────────────────────────────

/** Lowercased extension incl. the dot (e.g. ".pdf"), or "" when none. */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i).toLowerCase() : '';
}

/** Server-side Content-Type allowlist keyed on extension. Unknown → octet-stream. */
const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
};

/**
 * Resolve a safe Content-Type for a download from the SERVER-SIDE allowlist —
 * never the stored/client MIME. Unknown extensions fall back to the inert
 * `application/octet-stream` (forces download, no content sniffing).
 */
export function contentTypeForFilename(name: string): string {
  return EXTENSION_CONTENT_TYPE[extensionOf(name)] ?? 'application/octet-stream';
}

/**
 * Sanitize a filename for use in a Content-Disposition header: strip any path,
 * allow only `[A-Za-z0-9._-]`, neutralize leading dots, bound the length.
 */
export function sanitizeDownloadFilename(name: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  const bounded = cleaned.slice(0, 200);
  return bounded.length > 0 ? bounded : 'download';
}

/**
 * Build a safe Content-Disposition value with BOTH a sanitized ASCII
 * `filename="..."` (legacy clients) and an RFC 5987 `filename*=UTF-8''<pct>`.
 * The raw client filename is NEVER echoed.
 */
export function buildContentDisposition(
  name: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const safe = sanitizeDownloadFilename(name);
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
