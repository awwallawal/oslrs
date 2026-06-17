/**
 * Story 9-38 (AC#10) — integration tests for the authenticated registration
 * read-model `MeService.getRegistrationStatus`. Real-DB; exercises all four
 * states (none / draft / pending_nin / complete) against the actual
 * `respondents.user_id` link + wizard-draft-by-email fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MeService } from '../me.service.js';
import { db } from '../../db/index.js';
import { users, roles, respondents, wizardDrafts } from '../../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';

describe('MeService.getRegistrationStatus (Story 9-38 AC#10)', () => {
  const stamp = Date.now();
  const emails = {
    complete: `me-complete-${stamp}@example.com`,
    pending: `me-pending-${stamp}@example.com`,
    draft: `me-draft-${stamp}@example.com`,
    none: `me-none-${stamp}@example.com`,
  };
  const userIds: Record<keyof typeof emails, string> = {} as never;
  const respondentIds: string[] = [];

  beforeAll(async () => {
    await db.insert(roles).values([{ name: 'public_user', description: 'Public User' }]).onConflictDoNothing();
    const publicRole = await db.query.roles.findFirst({ where: eq(roles.name, 'public_user') });

    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      const [u] = await db
        .insert(users)
        .values({ email: emails[key], fullName: `Me ${key}`, roleId: publicRole!.id, status: 'active' })
        .returning({ id: users.id });
      userIds[key] = u.id;
    }

    // complete → linked respondent, active, NIN provided.
    const [rc] = await db
      .insert(respondents)
      .values({
        nin: '12345678919',
        firstName: 'Comp',
        lastName: 'Lete',
        phoneNumber: '+2348010000001',
        lgaId: 'lga-egbeda',
        source: 'public',
        status: 'active',
        consentMarketplace: true,
        referenceCode: `OSL-2026-CMP${stamp.toString().slice(-3)}`,
        userId: userIds.complete,
      })
      .returning({ id: respondents.id });
    respondentIds.push(rc.id);

    // pending_nin → linked respondent, pending_nin_capture, no NIN.
    const [rp] = await db
      .insert(respondents)
      .values({
        firstName: 'Pend',
        phoneNumber: '+2348010000002',
        lgaId: 'lga-egbeda',
        source: 'public',
        status: 'pending_nin_capture',
        userId: userIds.pending,
      })
      .returning({ id: respondents.id });
    respondentIds.push(rp.id);

    // draft → no respondent; a wizard draft keyed by the user's email.
    await db.insert(wizardDrafts).values({
      email: emails.draft,
      currentStep: 5,
      formData: {},
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });
  }, 30000);

  afterAll(async () => {
    if (respondentIds.length > 0) {
      await db.delete(respondents).where(inArray(respondents.id, respondentIds));
    }
    await db.delete(wizardDrafts).where(eq(wizardDrafts.email, emails.draft));
    await db.delete(users).where(inArray(users.email, Object.values(emails)));
  }, 30000);

  it('returns state=complete with a respondent summary for a linked active respondent', async () => {
    const res = await MeService.getRegistrationStatus({ userId: userIds.complete, email: emails.complete });
    expect(res.state).toBe('complete');
    expect(res.respondent).toMatchObject({
      id: respondentIds[0],
      status: 'active',
      ninStatus: 'provided',
      consentMarketplace: true,
    });
    expect(res.respondent?.referenceCode).toBeTruthy();
  });

  it('returns state=pending_nin with ninStatus=pending for a pending_nin_capture respondent', async () => {
    const res = await MeService.getRegistrationStatus({ userId: userIds.pending, email: emails.pending });
    expect(res.state).toBe('pending_nin');
    expect(res.respondent?.ninStatus).toBe('pending');
    expect(res.respondent?.status).toBe('pending_nin_capture');
  });

  it('returns state=draft with draftStep when only a wizard draft exists (no linked respondent)', async () => {
    const res = await MeService.getRegistrationStatus({ userId: userIds.draft, email: emails.draft });
    expect(res.state).toBe('draft');
    expect(res.draftStep).toBe(5);
    expect(res.respondent).toBeUndefined();
  });

  it('returns state=none when there is neither a linked respondent nor a draft', async () => {
    const res = await MeService.getRegistrationStatus({ userId: userIds.none, email: emails.none });
    expect(res.state).toBe('none');
    expect(res.respondent).toBeUndefined();
  });
});
