/**
 * Story 9-42 — F-018 (AC#7): forgot-password latency equalization.
 *
 * The exists-vs-non-existing-email branches must return on the same latency
 * path. Previously the controller AWAITED `EmailService.sendPasswordResetEmail`
 * only on the exists branch — a timing oracle for account enumeration. The fix
 * dispatches the send via `setImmediate` (off the response path).
 *
 * These tests pin: (1) the exists branch responds 200 WITHOUT synchronously
 * sending the email (the send is deferred to a later tick); (2) the non-exists
 * branch responds 200 and never sends. Both observable responses are identical.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockRequestReset, mockSendEmail, mockGenerateResetUrl } = vi.hoisted(() => ({
  mockRequestReset: vi.fn(),
  mockSendEmail: vi.fn(() => Promise.resolve({ success: true })),
  mockGenerateResetUrl: vi.fn(() => 'https://example.test/reset?token=plaintext'),
}));

vi.mock('../services/password-reset.service.js', () => ({
  PasswordResetService: { requestReset: mockRequestReset },
}));
vi.mock('../services/email.service.js', () => ({
  EmailService: {
    sendPasswordResetEmail: mockSendEmail,
    generateResetUrl: mockGenerateResetUrl,
  },
}));

import { AuthController } from '../controllers/auth.controller.js';

function makeRes() {
  const res = {} as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const flushMicroAndMacro = () => new Promise((resolve) => setImmediate(resolve));

describe('AuthController.forgotPassword — F-018 latency equalization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exists branch: responds 200 WITHOUT a synchronous email send (deferred)', async () => {
    mockRequestReset.mockResolvedValueOnce({ token: 'plaintext', userId: 'u1' });
    const req = { body: { email: 'exists@example.com' } } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await AuthController.forgotPassword(req, res, next);

    // Response is sent immediately…
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
    // …and the email has NOT been sent yet on the response path (it's deferred).
    expect(mockSendEmail).not.toHaveBeenCalled();

    // After a tick, the deferred send fires.
    await flushMicroAndMacro();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'exists@example.com' }),
    );
  });

  it('non-exists branch: responds 200 and never sends an email', async () => {
    mockRequestReset.mockResolvedValueOnce({ token: null, userId: null });
    const req = { body: { email: 'ghost@example.com' } } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await AuthController.forgotPassword(req, res, next);
    await flushMicroAndMacro();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('both branches return the same anti-enumeration message body', async () => {
    mockRequestReset.mockResolvedValueOnce({ token: 'plaintext', userId: 'u1' });
    const resExists = makeRes();
    await AuthController.forgotPassword(
      { body: { email: 'exists@example.com' } } as Request,
      resExists,
      vi.fn() as unknown as NextFunction,
    );

    mockRequestReset.mockResolvedValueOnce({ token: null, userId: null });
    const resGhost = makeRes();
    await AuthController.forgotPassword(
      { body: { email: 'ghost@example.com' } } as Request,
      resGhost,
      vi.fn() as unknown as NextFunction,
    );

    expect(resExists.json.mock.calls[0][0]).toEqual(resGhost.json.mock.calls[0][0]);
  });
});
