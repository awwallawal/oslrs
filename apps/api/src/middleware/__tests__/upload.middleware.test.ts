import { describe, it, expect, vi } from 'vitest';
import { xlsformFileFilter, validateFileContent } from '../upload.middleware.js';
import type { Request, Response } from 'express';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function runFilter(originalname: string, mimetype: string) {
  const cb = vi.fn();
  xlsformFileFilter(
    {} as Request,
    { originalname, mimetype } as Express.Multer.File,
    cb,
  );
  return cb;
}

describe('xlsformFileFilter — extension AND mime (F-017)', () => {
  it('accepts when BOTH extension and mime are valid', () => {
    const cb = runFilter('form.xlsx', XLSX_MIME);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('REJECTS a valid extension with a spoofed/invalid mime (would have passed under the old OR)', () => {
    const cb = runFilter('form.xlsx', 'text/html');
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
    expect(cb.mock.calls[0][1]).not.toBe(true);
  });

  it('REJECTS a valid mime with a disallowed extension', () => {
    const cb = runFilter('payload.exe', XLSX_MIME);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  // Review M1 — the client MIME is untrusted; a legit .xlsx/.xml whose client MIME
  // is a generic/empty value (Windows: x-zip-compressed / octet-stream for .xlsx,
  // text/plain for .xml) must NOT be false-rejected. Magic bytes are authoritative.
  it.each([
    ['form.xlsx', 'application/octet-stream'],
    ['form.xlsx', 'application/x-zip-compressed'],
    ['form.xlsx', 'application/zip'],
    ['form.xlsx', ''],
    ['data.xml', 'text/plain'],
  ])('accepts a valid extension with a generic/empty client mime: %s (%s)', (name, mime) => {
    const cb = runFilter(name, mime);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
});

describe('validateFileContent — XLSForm magic bytes', () => {
  function run(file: { buffer: Buffer; originalname: string } | undefined) {
    const next = vi.fn();
    validateFileContent({ file } as never, {} as Response, next);
    return next;
  }

  it('rejects a .xlsx whose bytes are not a ZIP container', () => {
    const next = run({ buffer: Buffer.from('not a zip'), originalname: 'form.xlsx' });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILE_CONTENT' }),
    );
  });

  it('passes a .xlsx with a valid PK magic prefix', () => {
    const next = run({ buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]), originalname: 'form.xlsx' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a .xml that does not start with < (or BOM+<)', () => {
    const next = run({ buffer: Buffer.from('garbage'), originalname: 'form.xml' });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILE_CONTENT' }),
    );
  });

  it('no-ops when there is no file', () => {
    const next = run(undefined);
    expect(next).toHaveBeenCalledWith();
  });
});
