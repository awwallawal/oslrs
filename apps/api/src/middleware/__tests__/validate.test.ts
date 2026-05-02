import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { validate } from '../validate.js';

const buildReq = (overrides: Partial<Request>): Request =>
  ({ body: {}, query: {}, params: {}, ...overrides }) as unknown as Request;

const NOOP_RES = {} as Response;

describe('validate middleware factory', () => {
  it('attaches parsed body and calls next() with no args on success', () => {
    const schema = z.object({ email: z.string().email() });
    const req = buildReq({ body: { email: 'foo@bar.com' } });
    const next = vi.fn();

    validate(schema, 'body')(req, NOOP_RES, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: 'foo@bar.com' });
  });

  it('replaces source with the transformed value after parse', () => {
    const schema = z.object({
      email: z.string().transform((v) => v.trim().toLowerCase()),
    });
    const req = buildReq({ body: { email: '  Foo@Bar.COM  ' } });
    const next = vi.fn();

    validate(schema, 'body')(req, NOOP_RES, next as unknown as NextFunction);

    expect(req.body).toEqual({ email: 'foo@bar.com' });
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards AppError("VALIDATION_ERROR", ..., 400) on schema failure', () => {
    const schema = z.object({ email: z.string().email() });
    const req = buildReq({ body: { email: 'not-an-email' } });
    const next = vi.fn();

    validate(schema, 'body')(req, NOOP_RES, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid body data');
    expect(err.details).toHaveProperty('errors');
    expect(Array.isArray(err.details.errors)).toBe(true);
  });

  it('uses the source name in the error message', () => {
    const schema = z.object({ id: z.string().uuid() });
    const req = buildReq({ params: { id: 'not-a-uuid' } });
    const next = vi.fn();

    validate(schema, 'params')(req, NOOP_RES, next as unknown as NextFunction);

    const err = next.mock.calls[0][0];
    expect(err.message).toBe('Invalid params data');
  });

  it('defaults source to body when not specified', () => {
    const schema = z.object({ flag: z.boolean() });
    const req = buildReq({ body: { flag: 'not-a-bool' } });
    const next = vi.fn();

    validate(schema)(req, NOOP_RES, next as unknown as NextFunction);

    const err = next.mock.calls[0][0];
    expect(err.message).toBe('Invalid body data');
  });

  it('matches the AppError shape produced by the existing inline pattern', () => {
    // Asserts shape parity with auth.controller.ts:119-122:
    //   throw new AppError('VALIDATION_ERROR', 'Invalid login data', 400, { errors: validation.error.errors });
    // The middleware must produce the same code / status / details key so
    // existing client error handling is unaffected (Risk #6 mitigation).
    const schema = z.object({ email: z.string().email() });
    const req = buildReq({ body: { email: 'bad' } });
    const next = vi.fn();

    validate(schema, 'body')(req, NOOP_RES, next as unknown as NextFunction);

    const err = next.mock.calls[0][0];
    const inline = new AppError(
      'VALIDATION_ERROR',
      'Invalid body data',
      400,
      { errors: [{ code: 'invalid_string' }] },
    );
    expect(err.code).toBe(inline.code);
    expect(err.statusCode).toBe(inline.statusCode);
    expect(err.message).toBe(inline.message);
    expect(typeof err.details).toBe(typeof inline.details);
    expect(Object.keys(err.details)).toEqual(Object.keys(inline.details!));
  });
});
