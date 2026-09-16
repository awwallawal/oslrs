import { describe, it, expect } from 'vitest';
import type {
  LoginRequest,
  StaffLoginRequest,
  PublicLoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ReAuthRequest,
  GoogleAuthRequest,
} from '../auth.js';
import {
  loginRequestSchema,
  staffLoginRequestSchema,
  publicLoginRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  resetPasswordFormSchema,
  reAuthRequestSchema,
  googleAuthRequestSchema,
} from '../validation/auth.js';

/**
 * WIRE-CONTRACT GUARD (2026-09-15)
 *
 * The server parses each request body with the zod schema; every client builds that
 * body from the TypeScript interface. Nothing connected the two, so they could drift
 * apart silently -- and they did, on the day the feature was written:
 *
 *   `resetPasswordRequestSchema` REQUIRED `confirmPassword`.
 *   `ResetPasswordRequest` does not HAVE `confirmPassword`.
 *
 * Result: from 3d84842 (2026-01-14) to 2026-09-15, every real password reset was
 * rejected with 400 "Invalid request data". The API suite was green throughout,
 * because its payloads were written from the schema rather than from the caller.
 *
 * Each case below sends the MINIMUM a client can legally construct -- the interface's
 * required fields and nothing else. The payloads are typed, so an excess property is a
 * compile error: the only way to make a case pass is to fix the schema, not the test.
 */
describe('auth wire contract: every schema accepts its own interface', () => {
  it('loginRequestSchema accepts a minimal LoginRequest', () => {
    const payload: LoginRequest = { email: 'a@example.com', password: 'x' };
    expect(loginRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('staffLoginRequestSchema accepts a minimal StaffLoginRequest', () => {
    const payload: StaffLoginRequest = { email: 'a@example.com', password: 'x', type: 'staff' };
    expect(staffLoginRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('publicLoginRequestSchema accepts a minimal PublicLoginRequest', () => {
    const payload: PublicLoginRequest = { email: 'a@example.com', password: 'x', type: 'public' };
    expect(publicLoginRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('forgotPasswordRequestSchema accepts a minimal ForgotPasswordRequest', () => {
    const payload: ForgotPasswordRequest = { email: 'a@example.com' };
    expect(forgotPasswordRequestSchema.safeParse(payload).success).toBe(true);
  });

  // ⛔ THE REGRESSION. Do not add a field to this payload to make it pass.
  it('resetPasswordRequestSchema accepts a minimal ResetPasswordRequest', () => {
    const payload: ResetPasswordRequest = {
      token: 'a'.repeat(43),
      newPassword: 'Str0ngPass!x',
    };
    const result = resetPasswordRequestSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('reAuthRequestSchema accepts a minimal ReAuthRequest', () => {
    const payload: ReAuthRequest = { password: 'x' };
    expect(reAuthRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('googleAuthRequestSchema accepts a minimal GoogleAuthRequest', () => {
    const payload: GoogleAuthRequest = { idToken: 'x' };
    expect(googleAuthRequestSchema.safeParse(payload).success).toBe(true);
  });
});

describe('resetPasswordFormSchema is the UI-only superset', () => {
  it('still enforces the confirmation box for the web form', () => {
    const mismatch = resetPasswordFormSchema.safeParse({
      token: 'a'.repeat(43),
      newPassword: 'Str0ngPass!x',
      confirmPassword: 'Str0ngPass!y',
    });
    expect(mismatch.success).toBe(false);
    expect(mismatch.success === false && mismatch.error.errors[0]?.path).toEqual(['confirmPassword']);
  });

  it('accepts a matching confirmation', () => {
    expect(resetPasswordFormSchema.safeParse({
      token: 'a'.repeat(43),
      newPassword: 'Str0ngPass!x',
      confirmPassword: 'Str0ngPass!x',
    }).success).toBe(true);
  });

  // The form schema must never be the one the SERVER parses with: it would reintroduce
  // the exact defect. This asserts the two schemas really are different objects with
  // different requirements, so a careless `resetPasswordFormSchema` in the controller
  // cannot pass unnoticed.
  it('rejects what the request schema accepts -- they are NOT interchangeable', () => {
    const wirePayload = { token: 'a'.repeat(43), newPassword: 'Str0ngPass!x' };
    expect(resetPasswordRequestSchema.safeParse(wirePayload).success).toBe(true);
    expect(resetPasswordFormSchema.safeParse(wirePayload).success).toBe(false);
  });
});
