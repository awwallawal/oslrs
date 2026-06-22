import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Story 9-63 (Task 7 / AC6) — shared active-super-admin recipient resolver with a
 * reserved/undeliverable-domain filter. Replaces the two identical copies that
 * lived in alert.service.ts + backup.worker.ts. The KEY assertion (per the AC):
 * `example.com` and known test-fixture prefixes are DROPPED before any send.
 */

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => mockDbSelect(),
        }),
      }),
    }),
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  users: { email: 'email', roleId: 'roleId', status: 'status' },
  roles: { id: 'id', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  getActiveSuperAdminEmails,
  isUndeliverableEmail,
} from '../super-admin-recipients.js';

describe('super-admin-recipients (Story 9-63 Task 7 / AC6)', () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  describe('isUndeliverableEmail', () => {
    it('drops reserved/IANA domains', () => {
      expect(isUndeliverableEmail('admin@example.com')).toBe(true);
      expect(isUndeliverableEmail('admin@example.org')).toBe(true);
      expect(isUndeliverableEmail('admin@example.net')).toBe(true);
      expect(isUndeliverableEmail('admin@sub.example.com')).toBe(true);
      expect(isUndeliverableEmail('admin@localhost')).toBe(true);
      expect(isUndeliverableEmail('admin@test')).toBe(true);
      expect(isUndeliverableEmail('admin@foo.invalid')).toBe(true);
    });

    it('drops known test-fixture local-part prefixes', () => {
      expect(isUndeliverableEmail('backoffice-activate-123@oyoskills.com')).toBe(true);
      expect(isUndeliverableEmail('perf-1@oyoskills.com')).toBe(true);
      expect(isUndeliverableEmail('nin-test-9@oyoskills.com')).toBe(true);
    });

    it('drops malformed addresses (no @)', () => {
      expect(isUndeliverableEmail('not-an-email')).toBe(true);
      expect(isUndeliverableEmail('')).toBe(true);
    });

    it('keeps deliverable real addresses', () => {
      expect(isUndeliverableEmail('admin@oyoskills.com')).toBe(false);
      expect(isUndeliverableEmail('awwallawal@gmail.com')).toBe(false);
    });
  });

  describe('getActiveSuperAdminEmails', () => {
    it('filters undeliverable recipients (example.com dropped) before send', async () => {
      mockDbSelect.mockResolvedValue([
        { email: 'admin@oyoskills.com' },
        { email: 'backoffice-activate-1@example.com' }, // both reserved domain + test prefix
        { email: 'real@example.com' }, // reserved domain
        { email: 'awwallawal@gmail.com' },
      ]);

      const emails = await getActiveSuperAdminEmails();
      expect(emails).toEqual(['admin@oyoskills.com', 'awwallawal@gmail.com']);
      expect(emails).not.toContain('real@example.com');
      expect(emails.some((e) => e.endsWith('@example.com'))).toBe(false);
    });

    it('returns [] on a DB error (fail-safe, never throws into a send path)', async () => {
      mockDbSelect.mockRejectedValue(new Error('db down'));
      await expect(getActiveSuperAdminEmails()).resolves.toEqual([]);
    });

    it('returns all addresses when every recipient is deliverable', async () => {
      mockDbSelect.mockResolvedValue([
        { email: 'admin@oyoskills.com' },
        { email: 'awwallawal@gmail.com' },
      ]);
      const emails = await getActiveSuperAdminEmails();
      expect(emails).toHaveLength(2);
    });
  });
});
