import { describe, it, expect, vi } from 'vitest';
import {
  detectMagicType,
  magicBytesAllowed,
  requireMagicBytes,
  extensionOf,
  contentTypeForFilename,
  sanitizeDownloadFilename,
  buildContentDisposition,
} from '../file-safety.js';

// Real magic-byte fixtures
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // xlsx container
const XML = Buffer.from('<?xml version="1.0"?>', 'utf-8');
const XML_BOM = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<root/>', 'utf-8')]);

describe('file-safety — magic bytes (F-017)', () => {
  it('detects each known signature', () => {
    expect(detectMagicType(PNG)).toBe('png');
    expect(detectMagicType(JPEG)).toBe('jpeg');
    expect(detectMagicType(PDF)).toBe('pdf');
    expect(detectMagicType(ZIP)).toBe('xlsx');
    expect(detectMagicType(XML)).toBe('xml');
    expect(detectMagicType(XML_BOM)).toBe('xml');
  });

  it('returns null for an unrecognized / empty buffer', () => {
    expect(detectMagicType(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(detectMagicType(Buffer.alloc(0))).toBeNull();
  });

  it('magicBytesAllowed gates on the allowlist', () => {
    expect(magicBytesAllowed(PNG, ['png', 'jpeg', 'pdf'])).toBe(true);
    expect(magicBytesAllowed(PDF, ['png', 'jpeg', 'pdf'])).toBe(true);
    // A disallowed-but-real type is rejected.
    expect(magicBytesAllowed(ZIP, ['png', 'jpeg', 'pdf'])).toBe(false);
  });

  it('rejects a payload whose extension/mime claims an allowed type but whose bytes disagree', () => {
    // e.g. a script renamed "receipt.png" with a spoofed image/png mime.
    const fakePng = Buffer.from('#!/bin/sh\nrm -rf /', 'utf-8');
    expect(magicBytesAllowed(fakePng, ['png', 'jpeg', 'pdf'])).toBe(false);
  });
});

describe('requireMagicBytes middleware (F-017)', () => {
  function run(file: { buffer: Buffer } | undefined, allowed: Parameters<typeof requireMagicBytes>[0]) {
    const next = vi.fn();
    requireMagicBytes(allowed)({ file } as never, {} as never, next);
    return next;
  }

  it('passes a valid file', () => {
    const next = run({ buffer: PNG }, ['png', 'jpeg', 'pdf']);
    expect(next).toHaveBeenCalledWith();
  });

  it('no-ops when there is no file (optional upload)', () => {
    const next = run(undefined, ['png', 'jpeg', 'pdf']);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a content/type mismatch with INVALID_FILE_CONTENT', () => {
    const fake = Buffer.from('not an image', 'utf-8');
    const next = run({ buffer: fake }, ['png', 'jpeg', 'pdf']);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILE_CONTENT', statusCode: 400 }),
    );
  });

  // Review L1 — fail closed (not throw) when a file has no in-memory buffer
  // (e.g. a future diskStorage route sets file.path, not file.buffer).
  it('fails closed (no throw) when file.buffer is missing', () => {
    const next = vi.fn();
    expect(() =>
      requireMagicBytes(['png', 'jpeg', 'pdf'])({ file: { path: '/tmp/x' } } as never, {} as never, next),
    ).not.toThrow();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILE_CONTENT', statusCode: 400 }),
    );
  });
});

describe('file-safety — download headers (F-016)', () => {
  it('derives Content-Type from the server-side extension allowlist', () => {
    expect(contentTypeForFilename('receipt.pdf')).toBe('application/pdf');
    expect(contentTypeForFilename('photo.JPG')).toBe('image/jpeg');
    expect(contentTypeForFilename('form.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // Unknown / extensionless → inert octet-stream (never the client MIME).
    expect(contentTypeForFilename('mystery.exe')).toBe('application/octet-stream');
    expect(contentTypeForFilename('noext')).toBe('application/octet-stream');
  });

  it('extensionOf is path- and case-safe', () => {
    expect(extensionOf('a/b/c.PDF')).toBe('.pdf');
    expect(extensionOf('plain')).toBe('');
    expect(extensionOf('.hidden')).toBe('');
  });

  it('sanitizes filenames to [A-Za-z0-9._-], strips path + leading dots', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeDownloadFilename('in"voice ;.pdf')).toBe('in_voice__.pdf');
    expect(sanitizeDownloadFilename('...secret')).toBe('_secret');
    expect(sanitizeDownloadFilename('')).toBe('download');
  });

  it('builds a safe Content-Disposition with no raw quotes/CRLF from the client name', () => {
    const cd = buildContentDisposition('evil"\r\nSet-Cookie: x.pdf');
    // No raw double-quote injection, no CRLF.
    expect(cd).not.toMatch(/[\r\n]/);
    expect(cd).toContain("filename*=UTF-8''");
    // Sanitized ASCII filename present.
    expect(cd).toMatch(/^attachment; filename="[A-Za-z0-9._-]+"/);
  });
});
