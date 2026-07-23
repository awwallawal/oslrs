/**
 * Story 9-38 (AC#10) — integration tests for the authenticated registration
 * read-model `MeService.getRegistrationStatus`. Real-DB; exercises all four
 * states (none / draft / pending_nin / complete) against the actual
 * `respondents.user_id` link + wizard-draft-by-email fallback.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { generateValidNin } from '@oslsr/testing/helpers/nin';
import { uuidv7 } from 'uuidv7';
import { MeService } from '../me.service.js';
import { NativeFormService } from '../native-form.service.js';
import { db } from '../../db/index.js';
import { users, roles, respondents, wizardDrafts, submissions, auditLogs, lgas } from '../../db/schema/index.js';
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
    // Story 9-61 — slug→name source the read-model resolves lgaName from.
    await db.insert(lgas).values({ code: 'egbeda', name: 'Egbeda' }).onConflictDoNothing();

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
        lgaId: 'egbeda',
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
      lgaId: 'egbeda',
      lgaName: 'Egbeda',
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

describe('MeService.updateMarketplaceConsent (Story 9-40 AC#4)', () => {
  const stamp = Date.now();
  const linkedEmail = `me-edit-${stamp}@example.com`;
  const orphanEmail = `me-edit-orphan-${stamp}@example.com`;
  let linkedUserId = '';
  let orphanUserId = '';
  let respondentId = '';

  beforeAll(async () => {
    await db.insert(roles).values([{ name: 'public_user', description: 'Public User' }]).onConflictDoNothing();
    const publicRole = await db.query.roles.findFirst({ where: eq(roles.name, 'public_user') });

    const [linked] = await db
      .insert(users)
      .values({ email: linkedEmail, fullName: 'Me Edit', roleId: publicRole!.id, status: 'active' })
      .returning({ id: users.id });
    linkedUserId = linked.id;

    const [orphan] = await db
      .insert(users)
      .values({ email: orphanEmail, fullName: 'Me Orphan', roleId: publicRole!.id, status: 'active' })
      .returning({ id: users.id });
    orphanUserId = orphan.id;

    const [r] = await db
      .insert(respondents)
      .values({
        nin: '12345678927',
        firstName: 'Edit',
        lastName: 'Me',
        phoneNumber: '+2348010000009',
        lgaId: 'lga-egbeda',
        source: 'public',
        status: 'active',
        consentMarketplace: false,
        referenceCode: `OSL-2026-EDT${stamp.toString().slice(-3)}`,
        userId: linkedUserId,
      })
      .returning({ id: respondents.id });
    respondentId = r.id;
  }, 30000);

  afterAll(async () => {
    const userIds = [linkedUserId, orphanUserId].filter(Boolean);
    if (respondentId) await db.delete(respondents).where(eq(respondents.id, respondentId));
    // updateMarketplaceConsent's audit is FIRE-AND-FORGET, so the audit row can
    // land just after the call returns. Clear audit_logs then delete the users;
    // retry on the FK race in case a late audit write arrives between the two.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (userIds.length) await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
      try {
        if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }, 30000);

  it('flips marketplace consent and returns the refreshed summary', async () => {
    const res = await MeService.updateMarketplaceConsent({
      userId: linkedUserId,
      consentMarketplace: true,
    });
    expect(res.id).toBe(respondentId);
    expect(res.consentMarketplace).toBe(true);

    // Read-model reflects the change.
    const status = await MeService.getRegistrationStatus({ userId: linkedUserId, email: linkedEmail });
    expect(status.respondent?.consentMarketplace).toBe(true);

    // And it toggles back.
    const back = await MeService.updateMarketplaceConsent({
      userId: linkedUserId,
      consentMarketplace: false,
    });
    expect(back.consentMarketplace).toBe(false);
  });

  it('throws NO_REGISTRATION (404) when the caller has no linked respondent', async () => {
    await expect(
      MeService.updateMarketplaceConsent({ userId: orphanUserId, consentMarketplace: true }),
    ).rejects.toMatchObject({ code: 'NO_REGISTRATION', statusCode: 404 });
  });
});

describe('MeService 9-61 — editable read + session edit + complete-nin (real DB)', () => {
  const stamp = Date.now();
  const emailA = `me60-a-${stamp}@example.com`;
  const emailB = `me60-b-${stamp}@example.com`;
  const emailPending = `me60-pending-${stamp}@example.com`;
  let userA = '';
  let userB = '';
  let userPending = '';
  let respA = '';
  let respB = '';
  let respPending = '';
  const ninA = generateValidNin();
  let ninB = generateValidNin();
  while (ninB === ninA) ninB = generateValidNin();

  // Own the completeness gate's fixture. A real published form is pinned in
  // UAT/prod DBs (app_db) but NOT in a clean DB (CI / app_test), so the real
  // getPublicActiveForm would enforce the full Step-4 required-field set here
  // and reject these NIN-dedupe fixtures with INCOMPLETE_SUBMISSION before the
  // logic-under-test runs — passing in CI but failing locally against app_db.
  // Stub it to a trivial (no-required-field) form so the gate passes
  // deterministically regardless of ambient wizard.public_form_id. Mirrors the
  // getPublicActiveForm mock in registration.routes.test.ts.
  // MUST be beforeEach, not beforeAll: vitest.base.ts sets restoreMocks:true,
  // which restores every spy before each test — a beforeAll spy would be wiped
  // before these tests run (the 13-13 mockReset-wiped-spy pitfall).
  beforeEach(() => {
    vi.spyOn(NativeFormService, 'getPublicActiveForm').mockResolvedValue({
      formId: 'me-9-61-test-form',
      title: 'Me 9-61 Test Form',
      version: '1.0.0',
      questions: [],
      choiceLists: {},
      sectionShowWhen: {},
      calculations: [],
    });
  });

  beforeAll(async () => {
    await db.insert(roles).values([{ name: 'public_user', description: 'Public User' }]).onConflictDoNothing();
    const publicRole = await db.query.roles.findFirst({ where: eq(roles.name, 'public_user') });

    const mkUser = async (email: string) => {
      const [u] = await db
        .insert(users)
        .values({ email, fullName: 'Me 60', roleId: publicRole!.id, status: 'active' })
        .returning({ id: users.id });
      return u.id;
    };
    userA = await mkUser(emailA);
    userB = await mkUser(emailB);
    userPending = await mkUser(emailPending);

    const [ra] = await db
      .insert(respondents)
      .values({
        nin: ninA,
        firstName: 'Ada',
        lastName: 'Obi',
        phoneNumber: '+2348010000031',
        lgaId: 'lga-egbeda',
        source: 'public',
        status: 'active',
        consentMarketplace: true,
        referenceCode: `OSL-2026-A60${stamp.toString().slice(-3)}`,
        userId: userA,
      })
      .returning({ id: respondents.id });
    respA = ra.id;

    // A submission carrying identity + a Step-4 answer (for the mapper recovery).
    await db.insert(submissions).values({
      submissionUid: uuidv7(),
      questionnaireFormId: 'test-form',
      respondentId: respA,
      rawData: {
        first_name: 'Ada',
        last_name: 'Obi',
        phone_number: '+2348010000031',
        lga_id: 'lga-egbeda',
        nin: ninA,
        email: emailA,
        gender: 'female',
        q_occupation: 'tailor',
      },
      submittedAt: new Date(),
      source: 'public',
      processed: true,
    });

    const [rb] = await db
      .insert(respondents)
      .values({
        nin: ninB,
        firstName: 'Bayo',
        phoneNumber: '+2348010000032',
        lgaId: 'lga-egbeda',
        source: 'public',
        status: 'active',
        userId: userB,
      })
      .returning({ id: respondents.id });
    respB = rb.id;

    const [rp] = await db
      .insert(respondents)
      .values({
        firstName: 'Pend',
        phoneNumber: '+2348010000033',
        lgaId: 'lga-egbeda',
        source: 'public',
        status: 'pending_nin_capture',
        userId: userPending,
      })
      .returning({ id: respondents.id });
    respPending = rp.id;
  }, 30000);

  afterAll(async () => {
    const userIds = [userA, userB, userPending].filter(Boolean);
    const ids = [respA, respB, respPending].filter(Boolean);
    if (ids.length) {
      await db.delete(submissions).where(inArray(submissions.respondentId, ids));
      await db.delete(respondents).where(inArray(respondents.id, ids));
    }
    // 9-61 edit / complete-nin emit audit_logs (some fire-and-forget). Clear them
    // then delete the users; retry on the FK race if a late audit write lands.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (userIds.length) await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
      try {
        if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }, 30000);

  it('getEditableRegistration maps an active respondent + recovers Step-4 answers (AC#1)', async () => {
    const res = await MeService.getEditableRegistration({ userId: userA, email: emailA });
    expect(res.mode).toBe('edit');
    expect(res.respondentId).toBe(respA);
    expect(res.wizardData?.givenName).toBe('Ada');
    expect(res.wizardData?.nin).toBe(ninA);
    expect(res.wizardData?.gender).toBe('female');
    // Identity keys stripped; only the Step-4 answer remains.
    expect(res.wizardData?.questionnaireResponses).toMatchObject({ q_occupation: 'tailor' });
    expect(res.wizardData?.questionnaireResponses).not.toHaveProperty('first_name');
  });

  it('updateRegistrationFromWizard allows the caller OWN NIN (self-match) + persists edits (AC#2)', async () => {
    const res = await MeService.updateRegistrationFromWizard({
      userId: userA,
      data: {
        givenName: 'Adaeze',
        phone: '+2348010000031',
        email: emailA,
        lgaId: 'lga-egbeda',
        nin: ninA, // own NIN — must NOT trip dedupe
        consentMarketplace: false,
      },
    });
    expect(res.state).toBe('complete');
    const after = await db.query.respondents.findFirst({
      where: eq(respondents.id, respA),
      columns: { firstName: true, consentMarketplace: true },
    });
    expect(after?.firstName).toBe('Adaeze');
    expect(after?.consentMarketplace).toBe(false);
  });

  // Story 13-34 AC2 (code-review H1, second call site) — this authenticated edit
  // path serves the SAME pinned public form through the SAME suppressing
  // renderer as the public wizard, so it must pass `excludeGeopoint` to the
  // completeness gate. Without it a REQUIRED geopoint on the pinned form 422s
  // the edit over a field the respondent can never see. The public-wizard call
  // site is covered by registration.routes.test.ts; this covers the other one —
  // otherwise the flag is deletable here with the whole suite still green
  // ([[pattern-ship-a-fix-that-never-fires]]).
  it('updateRegistrationFromWizard is NOT blocked by an unanswered REQUIRED geopoint on the pinned form (13-34)', async () => {
    vi.spyOn(NativeFormService, 'getPublicActiveForm').mockResolvedValue({
      formId: 'me-13-34-geopoint-form',
      title: 'Me 13-34 Geopoint Form',
      version: '1.0.0',
      questions: [
        {
          id: 'q-gps',
          type: 'geopoint',
          name: 'gps_location',
          label: 'GPS Location',
          required: true,
          sectionId: 's1',
          sectionTitle: 'S1',
        },
      ],
      choiceLists: {},
      sectionShowWhen: {},
      calculations: [],
    });

    const res = await MeService.updateRegistrationFromWizard({
      userId: userA,
      data: {
        givenName: 'Adaeze',
        phone: '+2348010000031',
        email: emailA,
        lgaId: 'lga-egbeda',
        nin: ninA,
        consentMarketplace: false,
      },
    });
    expect(res.state).toBe('complete');
  });

  it('updateRegistrationFromWizard rejects ANOTHER respondent NIN (NIN_DUPLICATE, AC#2)', async () => {
    await expect(
      MeService.updateRegistrationFromWizard({
        userId: userA,
        data: {
          givenName: 'Ada',
          phone: '+2348010000031',
          email: emailA,
          lgaId: 'lga-egbeda',
          nin: ninB, // userB's NIN
          consentMarketplace: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'NIN_DUPLICATE', statusCode: 409 });
  });

  it('completeNinAuthenticated promotes a pending respondent to active (AC#3)', async () => {
    let newNin = generateValidNin();
    while (newNin === ninA || newNin === ninB) newNin = generateValidNin();
    const res = await MeService.completeNinAuthenticated({
      userId: userPending,
      email: emailPending,
      nin: newNin,
    });
    expect(res.state).toBe('complete');
    const after = await db.query.respondents.findFirst({
      where: eq(respondents.id, respPending),
      columns: { status: true, nin: true },
    });
    expect(after?.status).toBe('active');
    expect(after?.nin).toBe(newNin);
  });
});
