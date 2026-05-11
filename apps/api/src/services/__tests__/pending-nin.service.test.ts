import { describe, it, expect } from 'vitest';
import { resolveReminderDestination, type ReminderInput } from '../pending-nin.service.js';

/**
 * Story 9-12 Task 3.6 + 3.9 — pure-function tests for the reminder destination
 * resolver. Exercises every cell of the precedence table in Dev Notes
 * "Universal pending-NIN — Option 1 design, D2".
 */
describe('resolveReminderDestination', () => {
  function input(overrides: Partial<ReminderInput>): ReminderInput {
    return {
      source: 'public',
      email: null,
      phoneNumber: null,
      lgaId: null,
      smsEnabled: false,
      ...overrides,
    };
  }

  describe('source: public', () => {
    it('returns email when present', () => {
      const out = resolveReminderDestination(
        input({ source: 'public', email: 'a@example.com' }),
      );
      expect(out).toEqual({ type: 'email', target: 'a@example.com', reason: 'primary_email' });
    });

    it('returns skip when no email is somehow present (defensive)', () => {
      const out = resolveReminderDestination(input({ source: 'public', email: null }));
      expect(out.type).toBe('skip');
    });
  });

  describe('source: enumerator', () => {
    it('prefers email when present', () => {
      const out = resolveReminderDestination(
        input({ source: 'enumerator', email: 'r@example.com', phoneNumber: '+2348012345678', lgaId: 'lga-1' }),
      );
      expect(out.type).toBe('email');
      expect(out.target).toBe('r@example.com');
    });

    it('falls back to SMS when email missing AND smsEnabled AND phone present', () => {
      const out = resolveReminderDestination(
        input({ source: 'enumerator', email: null, phoneNumber: '+2348012345678', smsEnabled: true, lgaId: 'lga-1' }),
      );
      expect(out.type).toBe('sms');
      expect(out.target).toBe('+2348012345678');
      expect(out.reason).toBe('enumerator_sms_fallback');
    });

    it('falls back to supervisor task when email missing AND smsEnabled but phone missing', () => {
      const out = resolveReminderDestination(
        input({ source: 'enumerator', email: null, phoneNumber: null, smsEnabled: true, lgaId: 'lga-1' }),
      );
      expect(out.type).toBe('supervisor_task');
      expect(out.target).toBe('lga-1');
      expect(out.reason).toBe('enumerator_supervisor_fallback');
    });

    it('falls back to supervisor task when email missing AND smsEnabled is false (does NOT use phone)', () => {
      const out = resolveReminderDestination(
        input({ source: 'enumerator', email: null, phoneNumber: '+2348012345678', smsEnabled: false, lgaId: 'lga-1' }),
      );
      expect(out.type).toBe('supervisor_task');
      expect(out.target).toBe('lga-1');
    });

    it('returns skip when no email AND no lga', () => {
      const out = resolveReminderDestination(
        input({ source: 'enumerator', email: null, phoneNumber: null, smsEnabled: false, lgaId: null }),
      );
      expect(out.type).toBe('skip');
      expect(out.reason).toBe('no_channel_available');
    });
  });

  describe('source: clerk', () => {
    it('prefers email when present', () => {
      const out = resolveReminderDestination(
        input({ source: 'clerk', email: 'c@example.com', lgaId: 'lga-1' }),
      );
      expect(out.type).toBe('email');
    });

    it('falls back directly to supervisor (NEVER SMS — clerks defer regardless of flag)', () => {
      const out = resolveReminderDestination(
        input({ source: 'clerk', email: null, phoneNumber: '+2348012345678', smsEnabled: true, lgaId: 'lga-1' }),
      );
      expect(out.type).toBe('supervisor_task');
      expect(out.target).toBe('lga-1');
      expect(out.reason).toBe('clerk_supervisor_fallback');
    });
  });

  describe('source: imported_*', () => {
    it('returns skip for imported_itf_supa', () => {
      const out = resolveReminderDestination(
        input({ source: 'imported_itf_supa', email: 'a@b.com' }),
      );
      expect(out.type).toBe('skip');
      expect(out.reason).toBe('imported_source_no_reminders');
    });

    it('returns skip for imported_other regardless of contact fields', () => {
      const out = resolveReminderDestination(
        input({ source: 'imported_other', email: 'a@b.com', phoneNumber: '+2348012345678', smsEnabled: true }),
      );
      expect(out.type).toBe('skip');
    });
  });
});
