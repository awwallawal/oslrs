/**
 * Form Controller Tests
 * Story 3.1: Tests for form rendering endpoints
 * Story 3.3: Tests for submission endpoint
 * Story 3.7: Tests for NIN check and submission status endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { FormController } from '../form.controller.js';
import { NativeFormService } from '../../services/native-form.service.js';
import { queueSubmissionForIngestion } from '../../queues/webhook-ingestion.queue.js';
// Story 13-71 R7 — read the fence rather than re-typing its value; see the
// boundary test below for why a copied literal stops testing what it names.
import { GEOPOINT_REQUIREMENT_EFFECTIVE_FROM } from '../../services/form-submission-validation.service.js';
import { AppError } from '@oslsr/utils';

const mockFindFirstRespondent = vi.fn();
const mockFindFirstUser = vi.fn();
const mockFindManySubmissions = vi.fn();

vi.mock('../../services/native-form.service.js');
vi.mock('../../queues/webhook-ingestion.queue.js');
vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      respondents: { findFirst: (...args: unknown[]) => mockFindFirstRespondent(...args) },
      users: { findFirst: (...args: unknown[]) => mockFindFirstUser(...args) },
      submissions: { findMany: (...args: unknown[]) => mockFindManySubmissions(...args) },
    },
  },
}));
// Story 9-58 (review M2) — submitForm is SERVER-AUTHORITATIVE: it ALWAYS mints
// server-side via generateUnique (uniqueness SELECT via db.execute, not stubbed
// here) and overwrites any client-supplied code. Mock generateUnique to a fixed
// code. Plain function (NOT vi.fn) so `vi.resetAllMocks()` in beforeEach can't
// wipe the return value back to undefined.
vi.mock('../../services/reference-code.service.js', () => ({
  ReferenceCodeService: {
    generateUnique: () => Promise.resolve('OSL-2026-TEST00'),
  },
}));
// Story 13-15: no validation-module mock — checkNin is FORMAT-ONLY (^\d{11}$
// via zod); the Mod-11 checksum gate is retired (real NINs have no check digit).

describe('FormController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };

    mockNext = vi.fn();

    mockReq = {
      query: {},
      params: {},
      body: {},
      user: { sub: 'user-123', role: 'enumerator' },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPublishedForms', () => {
    it('returns published forms list', async () => {
      const mockForms = [
        {
          id: 'form-uuid-1',
          formId: 'survey-v1',
          title: 'Labour Survey',
          version: '1.0.0',
          status: 'published',
          publishedAt: '2026-02-10T00:00:00.000Z',
        },
        {
          id: 'form-uuid-2',
          formId: 'skills-v1',
          title: 'Skills Assessment',
          version: '2.0.0',
          status: 'published',
          publishedAt: '2026-02-11T00:00:00.000Z',
        },
      ];

      vi.mocked(NativeFormService.listPublished).mockResolvedValue(mockForms);

      await FormController.listPublishedForms(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(NativeFormService.listPublished).toHaveBeenCalledOnce();
      expect(jsonMock).toHaveBeenCalledWith({ data: mockForms });
    });

    it('returns empty array when no published forms', async () => {
      vi.mocked(NativeFormService.listPublished).mockResolvedValue([]);

      await FormController.listPublishedForms(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });

    it('calls next on error', async () => {
      const error = new Error('Database error');
      vi.mocked(NativeFormService.listPublished).mockRejectedValue(error);

      await FormController.listPublishedForms(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getFormForRender', () => {
    const mockSchema = {
      id: 'form-uuid-1',
      title: 'Labour Survey',
      version: '1.0.0',
      status: 'published' as const,
      sections: [],
      choiceLists: {},
      createdAt: '2026-02-10T00:00:00.000Z',
    };

    const mockFlattened = {
      formId: 'form-uuid-1',
      title: 'Labour Survey',
      version: '1.0.0',
      questions: [],
      choiceLists: {},
    };

    it('returns flattened form for rendering', async () => {
      mockReq.params = { id: 'form-uuid-1' };

      vi.mocked(NativeFormService.getPublishedFormSchema).mockResolvedValue(mockSchema);
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(mockFlattened);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(NativeFormService.getPublishedFormSchema).toHaveBeenCalledWith('form-uuid-1');
      // Story 9-33 Bug #1: the row PK (`:id` param) must be forwarded to flattenForRender.
      expect(NativeFormService.flattenForRender).toHaveBeenCalledWith(mockSchema, 'form-uuid-1');
      expect(jsonMock).toHaveBeenCalledWith({ data: mockFlattened });
    });

    it('returns 404 when form not found', async () => {
      mockReq.params = { id: 'nonexistent-id' };

      const notFoundError = new AppError('FORM_NOT_FOUND', 'Form not found', 404);
      vi.mocked(NativeFormService.getPublishedFormSchema).mockRejectedValue(notFoundError);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(notFoundError);
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(404);
      expect(passedError.code).toBe('FORM_NOT_FOUND');
    });

    it('returns 403 when form is not published', async () => {
      mockReq.params = { id: 'form-uuid-1' };

      const notPublishedError = new AppError('FORM_NOT_PUBLISHED', 'Form is not available for data collection', 403);
      vi.mocked(NativeFormService.getPublishedFormSchema).mockRejectedValue(notPublishedError);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(notPublishedError);
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(403);
      expect(passedError.code).toBe('FORM_NOT_PUBLISHED');
    });

    it('calls next on unexpected error', async () => {
      mockReq.params = { id: 'form-uuid-1' };

      const error = new Error('Unexpected error');
      vi.mocked(NativeFormService.getPublishedFormSchema).mockRejectedValue(error);

      await FormController.getFormForRender(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // Story 9-33 review M3 — close the regression hole: the second call site of
  // flattenForRender in this controller (previewForm) must also forward the row
  // PK. Without this test a revert of the previewForm inline edit would pass CI.
  describe('previewForm', () => {
    const mockSchema = {
      id: 'inner-schema-id-DO-NOT-USE',
      title: 'Labour Survey',
      version: '1.0.0',
      status: 'published' as const,
      sections: [],
      choiceLists: {},
      createdAt: '2026-02-10T00:00:00.000Z',
    };

    const mockFlattened = {
      formId: 'form-uuid-9',
      title: 'Labour Survey',
      version: '1.0.0',
      questions: [],
      choiceLists: {},
    };

    it('forwards the row PK (:id param) to flattenForRender (Story 9-33 Bug #1)', async () => {
      mockReq.params = { id: 'form-uuid-9' };

      vi.mocked(NativeFormService.getFormSchema).mockResolvedValue(mockSchema);
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(mockFlattened);

      await FormController.previewForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(NativeFormService.getFormSchema).toHaveBeenCalledWith('form-uuid-9');
      expect(NativeFormService.flattenForRender).toHaveBeenCalledWith(mockSchema, 'form-uuid-9');
      expect(jsonMock).toHaveBeenCalledWith({ data: mockFlattened });
    });
  });

  describe('submitForm', () => {
    const validBody = {
      submissionId: '01924a5e-7c1a-7b2d-8f3e-4a5b6c7d8e9f',
      formId: '01924a5e-1111-7b2d-8f3e-4a5b6c7d8e9f',
      formVersion: '1.0.0',
      responses: { q1: 'answer1', q2: 42 },
      submittedAt: '2026-02-13T10:00:00.000Z',
    };

    // Story 9-54 AC5 — submitForm now loads + flattens the form to run the
    // synchronous required-answer gate before queueing. Default to a permissive
    // (no-required-question) flattened form so the pre-existing happy-path cases
    // are unaffected; gate-specific cases override below.
    const permissiveFlattened = {
      formId: validBody.formId,
      title: 'Test Form',
      version: '1.0.0',
      questions: [] as never[],
      choiceLists: {},
      sectionShowWhen: {},
      calculations: [] as never[],
    };
    beforeEach(() => {
      vi.mocked(NativeFormService.getFormSchema).mockResolvedValue({
        id: validBody.formId,
        title: 'Test Form',
        version: '1.0.0',
        status: 'published',
        sections: [],
        choiceLists: {},
        createdAt: '2026-02-13T10:00:00.000Z',
      } as never);
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(permissiveFlattened as never);
    });

    it('returns 201 with queued status on valid submission', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      // Story 9-58 (AC5.2) — the queued rawData carries the pre-generated
      // reference code (`_referenceCode`) so the ingestion worker assigns the
      // same code, and the response echoes it for the field officer to read back.
      expect(queueSubmissionForIngestion).toHaveBeenCalledWith({
        source: 'enumerator',
        submissionUid: validBody.submissionId,
        questionnaireFormId: validBody.formId,
        submitterId: 'user-123',
        submittedAt: validBody.submittedAt,
        rawData: { ...validBody.responses, _referenceCode: 'OSL-2026-TEST00' },
      });
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        data: { id: 'job-abc', status: 'queued', referenceCode: 'OSL-2026-TEST00' },
      });
    });

    it('IGNORES a client-supplied reference code and mints server-side (Story 9-58 review M2)', async () => {
      // The server is authoritative: a client-supplied `_referenceCode` (which
      // could be forged/duplicated) must NOT be trusted for persistence. The
      // queued rawData + echoed response both carry the SERVER code.
      mockReq.body = { ...validBody, responses: { ...validBody.responses, _referenceCode: 'OSL-2026-9F3K7Q' } };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-xyz');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          rawData: expect.objectContaining({ _referenceCode: 'OSL-2026-TEST00' }),
        }),
      );
      expect(jsonMock).toHaveBeenCalledWith({
        data: { id: 'job-xyz', status: 'queued', referenceCode: 'OSL-2026-TEST00' },
      });
    });

    it('returns 200 with duplicate status when submission already exists', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue(null);

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        // Story 9-58 — duplicate submissions echo referenceCode: null (no new
        // respondent created).
        data: { id: null, status: 'duplicate', referenceCode: null },
      });
    });

    it('returns validation error for missing required fields', async () => {
      mockReq.body = { submissionId: 'not-a-uuid' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(400);
    });

    it('rejects an incomplete submission with 422 before queueing (Story 9-54 AC5)', async () => {
      mockReq.body = { ...validBody, responses: { q2: 42 } }; // q1 required + missing
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(NativeFormService.flattenForRender).mockReturnValue({
        ...permissiveFlattened,
        questions: [
          { id: 'q1', type: 'text', name: 'q1', label: 'Q1', required: true, sectionId: 's', sectionTitle: 'S' },
        ],
      } as never);

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const err = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('INCOMPLETE_SUBMISSION');
      expect(err.statusCode).toBe(422);
      expect(err.details.fields).toContain('q1');
      expect(queueSubmissionForIngestion).not.toHaveBeenCalled();
    });

    it('rejects an under-15 submission with declined guardian consent before queueing (Story 9-55)', async () => {
      mockReq.body = {
        ...validBody,
        responses: {
          dob: '2015-01-01', // age < 15 vs real clock
          guardian_name: 'Adunni Okafor',
          guardian_relationship: 'parent',
          guardian_phone: '08031234567',
          guardian_consent: 'no', // present (completeness passes) but declined
          is_supervised_apprentice: 'yes',
        },
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      const guardianQ = (name: string) => ({
        id: `q-${name}`, type: 'text', name, label: name, required: true,
        sectionId: 'grp_guardian', sectionTitle: 'Guardian',
      });
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue({
        ...permissiveFlattened,
        questions: [
          { id: 'q-dob', type: 'date', name: 'dob', label: 'DOB', required: true, sectionId: 's1', sectionTitle: 'Identity' },
          guardianQ('guardian_name'),
          guardianQ('guardian_relationship'),
          guardianQ('guardian_phone'),
          guardianQ('guardian_consent'),
          guardianQ('is_supervised_apprentice'),
        ],
        sectionShowWhen: { grp_guardian: { field: 'age', operator: 'less_than', value: 15 } },
        calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
      } as never);

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const err = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('MINOR_GUARDIAN_CONSENT_REQUIRED');
      expect(err.statusCode).toBe(422);
      expect(queueSubmissionForIngestion).not.toHaveBeenCalled();
    });

    it('persists server-recomputed calculate fields into rawData (Story 9-54 AC1.3)', async () => {
      mockReq.body = { ...validBody, responses: { dob: '1984-06-06' } };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(NativeFormService.flattenForRender).mockReturnValue({
        ...permissiveFlattened,
        questions: [],
        calculations: [{ name: 'age', expression: 'int((today() - ${dob}) div 365.25)' }],
      } as never);
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-age');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          rawData: expect.objectContaining({ dob: '1984-06-06', age: expect.any(Number) }),
        }),
      );
    });

    it('accepts and forwards optional GPS coordinates in rawData', async () => {
      mockReq.body = {
        ...validBody,
        gpsLatitude: 7.3775,
        gpsLongitude: 3.9470,
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-xyz');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          rawData: expect.objectContaining({
            q1: 'answer1',
            q2: 42,
            _gpsLatitude: 7.3775,
            _gpsLongitude: 3.9470,
          }),
        })
      );
    });

    // -- Story 13-71 -------------------------------------------------------

    /**
     * A form that SERVES a geopoint question. `permissiveFlattened` has no
     * questions at all, so every pre-existing case above sits on AC3's exempt
     * side -- which is exactly why these cases must supply their own form. A gate
     * tested only against a form it cannot apply to is not tested at all.
     */
    const geopointFlattened = {
      ...permissiveFlattened,
      questions: [
        { name: 'site_location', type: 'geopoint', required: false, sectionId: 's1' },
      ] as never[],
    };

    /*
     * ⛔ REVIEW R7 — EVERY 13-71 CASE MUST SIT AFTER THE EFFECTIVE DATE.
     *
     * `validBody.submittedAt` is 2026-02-13, which is BEFORE the geopoint
     * requirement takes effect, so these cases would have run against a waived
     * gate and the acceptance tests would have passed for the wrong reason
     * entirely. Caught by the suite the moment the fence landed — which is the
     * whole argument for `pattern-test-that-passes-over-a-hole`: the question is
     * never "did it pass", it is "would it have passed if the code never ran".
     */
    /**
     * ⛔ DERIVED FROM THE FENCE, NOT RE-TYPED (adjudication 2026-09-23).
     *
     * This was the literal `2026-09-22T10:00:00.000Z` — post-effective against the
     * fence of the day (the 21st). When the fence moved to the 24th, that instant
     * fell BEHIND it and every enforcement assertion built on this body started
     * getting a waiver instead: `13-71 AC3 … refused 422` went red with
     * "expected null not to be null".
     *
     * ⭐ It went RED, not green, so the suite did its job — but R7 instructs
     * MOVING THIS FENCE AT EVERY DEPLOY, so a hardcoded "after" date breaks these
     * tests on a schedule. One hour past the constant is always after it, whatever
     * the constant becomes.
     */
    /*
     * ⛔ ULTRA REVIEW U2 — AND IT MUST LOOK LIKE A CURRENT CLIENT, NOT JUST A CURRENT DATE.
     *
     * The gate now waives for a payload with no `geopointRequirementAware` marker,
     * because a bundle that predates this feature cannot capture a position or file
     * a reason, and `isPermanentFailure` turns its 422 into a permanently parked
     * row — a whole day of fieldwork lost per un-updated device.
     *
     * ⭐ Adding the flag here went RED on exactly the two refusal cases, which is
     * the proof the waiver is load-bearing rather than decorative: without it,
     * every "is refused" assertion in this block would have been passing because
     * the submission was WAIVED, not because it was judged.
     */
    const postEffectiveBody = {
      ...validBody,
      submittedAt: new Date(GEOPOINT_REQUIREMENT_EFFECTIVE_FROM.getTime() + 60 * 60 * 1000).toISOString(),
      geopointRequirementAware: true,
    };

    /** The AppError handed to `next()`, or null when the submission was accepted. */
    function refusal(): AppError | null {
      const err = vi.mocked(mockNext).mock.calls[0]?.[0];
      return err instanceof AppError ? err : null;
    }

    it('13-71 AC3: an ENUMERATOR with neither coordinates nor a reason is refused 422', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = postEffectiveBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const err = refusal();
      expect(err).not.toBeNull();
      // The EXISTING shape -- the client's error handling needs no new branch.
      expect(err?.code).toBe('INCOMPLETE_SUBMISSION');
      expect(err?.statusCode).toBe(422);
      expect(err?.details).toEqual({ fields: ['site_location'] });
      // And nothing was queued. A refusal is not a deferral.
      expect(queueSubmissionForIngestion).not.toHaveBeenCalled();
    });

    it('13-71 AC3: an ENUMERATOR WITH coordinates is accepted', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = { ...postEffectiveBody, gpsLatitude: 7.3775, gpsLongitude: 3.947, gpsAccuracy: 12 };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          rawData: expect.objectContaining({ _gpsLatitude: 7.3775, _gpsAccuracy: 12 }),
        }),
      );
    });

    /*
     * ⛔ ULTRA REVIEW U12 — THIS TEST WAS WAIVED BEFORE IT REACHED THE BRANCH IT NAMES.
     *
     * It spread `...validBody`, whose `submittedAt` is 2026-02-13 — PRE-EFFECTIVE,
     * so R7's date fence returned before `isAnsweredGeopoint` was ever consulted.
     * Deleting the answer branch entirely left the suite green: the only test of
     * that branch proved nothing about it. [[pattern-test-that-passes-over-a-hole]]
     *
     * The file already defines `postEffectiveBody` for exactly this reason, and a
     * comment above it explains why `validBody` cannot be used here. The fence
     * opened a hole underneath a test that was correct when it was written.
     */
    it('13-71 AC3: the geopoint ANSWER satisfies the gate with no envelope coordinates', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = {
        ...postEffectiveBody,
        responses: {
          ...postEffectiveBody.responses,
          site_location: { latitude: 7.1, longitude: 3.1, accuracy: 9 },
        },
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    /**
     * ULTRA REVIEW U11 — and the position that satisfied the gate must REACH THE COLUMN.
     *
     * The gate accepting an answer-only position while the write path read only the
     * envelope is what produced a row that passed the requirement and then landed
     * with NULL coordinates and NULL reason. Asserting acceptance alone cannot see
     * that; this pins the rawData the worker will actually read.
     */
    it('13-71 U11: an answer-only position is queued so the worker can still find it', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = {
        ...postEffectiveBody,
        responses: {
          ...postEffectiveBody.responses,
          site_location: { latitude: 7.1, longitude: 3.1, accuracy: 9 },
        },
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const queued = vi.mocked(queueSubmissionForIngestion).mock.calls[0][0] as {
        rawData: Record<string, unknown>;
      };
      expect(queued.rawData.site_location).toEqual({ latitude: 7.1, longitude: 3.1, accuracy: 9 });
    });

    /**
     * ⛔ ULTRA REVIEW U7 — FORGED COORDINATES AND A FORGED COMPLETION TIME.
     *
     * `responses` is `z.record(z.unknown())`, so zod never inspects it. R6 stripped
     * two server-owned keys and left three: a client that OMITS the envelope field
     * and puts `_gpsLatitude` in the ANSWERS wrote it straight into `rawData` and
     * on into the column — forged positions in the base map, and a forged
     * `_completionTimeSeconds` that neutralises the speed-run heuristic.
     */
    it.each([
      ['_gpsLatitude', 9.999],
      ['_gpsLongitude', 9.999],
      ['_completionTimeSeconds', 1],
      ['_gpsAccuracy', 1],
      ['_gpsUnavailableReason', 'i-invented-this'],
      ['_referenceCode', 'OSL-9999-FORGED'],
    ])('13-71 U7: a client-supplied %s in the ANSWERS never reaches rawData', async (key, value) => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(permissiveFlattened as never);
      mockReq.body = {
        ...postEffectiveBody,
        responses: { ...postEffectiveBody.responses, [key]: value },
      };
      mockReq.user = { sub: 'user-123', role: 'data_entry_clerk' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const queued = vi.mocked(queueSubmissionForIngestion).mock.calls[0][0] as {
        rawData: Record<string, unknown>;
      };
      expect(queued.rawData[key]).not.toBe(value);
    });

    it('13-71 U7: a legitimate ENVELOPE value still reaches rawData', async () => {
      // The strip must not also remove what the validated path puts there.
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(permissiveFlattened as never);
      mockReq.body = {
        ...postEffectiveBody,
        gpsLatitude: 7.3775,
        gpsLongitude: 3.947,
        completionTimeSeconds: 240,
      };
      mockReq.user = { sub: 'user-123', role: 'data_entry_clerk' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const queued = vi.mocked(queueSubmissionForIngestion).mock.calls[0][0] as {
        rawData: Record<string, unknown>;
      };
      expect(queued.rawData._gpsLatitude).toBe(7.3775);
      expect(queued.rawData._completionTimeSeconds).toBe(240);
    });

    /**
     * ⛔ ULTRA REVIEW U2 — THE STALE-BUNDLE CASE.
     *
     * `sw.ts` calls `skipWaiting()` only on an explicit message, so a device can go
     * on serving the previous build indefinitely. Every interview it starts TODAY
     * carries a current `submittedAt` — past R7's date fence, therefore enforced —
     * while having no auto-capture and no escape hatch. The 422 is then classified
     * PERMANENT by `sync-manager`, so the row is parked and never retried.
     * Retrying cannot help: that payload can never satisfy the gate.
     */
    it('13-71 U2: a LEGACY client (no capability marker) is WAIVED, not permanently refused', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      // A current date, an enumerator, a geopoint form, and NO position — the exact
      // shape that is refused above. The only difference is the missing marker.
      const { geopointRequirementAware: _omitted, ...legacyBody } = postEffectiveBody;
      mockReq.body = legacyBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it('13-71 U2: an explicit `false` is treated as a legacy client too', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = { ...postEffectiveBody, geopointRequirementAware: false };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
    });

    it('13-71 U2: the marker does NOT excuse a current client — it still must comply', async () => {
      // ⭐ The waiver must not become an off switch. A build that declares itself
      // capable is held to the requirement.
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = { ...postEffectiveBody, geopointRequirementAware: true };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()?.code).toBe('INCOMPLETE_SUBMISSION');
    });

    it('13-71 AC4: an ENUMERATOR with a derived REASON and no coordinates is accepted', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = { ...postEffectiveBody, gpsUnavailableReason: 'permission_denied' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          rawData: expect.objectContaining({ _gpsUnavailableReason: 'permission_denied' }),
        }),
      );
    });

    it('13-71 AC4: an INVENTED reason is a 400, not an ungroupable string in the column', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = { ...postEffectiveBody, gpsUnavailableReason: 'phone_was_flat' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      // The whole point of AC6 is that the reason can be COUNTED. Free text would
      // turn the weekly ops read into a spelling exercise.
      expect(refusal()?.code).toBe('VALIDATION_ERROR');
      expect(queueSubmissionForIngestion).not.toHaveBeenCalled();
    });

    /**
     * AC7 -- REMOVE THE EXEMPTION AND THIS TEST FAILS.
     *
     * Same form, same empty payload, same missing position as the enumerator case
     * above; only the role differs. A clerk transcribing a paper form records the
     * OFFICE, and office coordinates filed as field captures would poison the base
     * map this story exists to enable. Five of seven prod roles map to `clerk`.
     */
    it('13-71 AC7: a CLERK with neither is ACCEPTED -- the exemption, asserted', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = postEffectiveBody;
      mockReq.user = { sub: 'clerk-1', role: 'data_entry_clerk' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'clerk' }),
      );
    });

    it('13-71 AC7: a PUBLIC user with neither is ACCEPTED', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = postEffectiveBody;
      mockReq.user = { sub: 'pub-1', role: 'public_user' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it('13-71 AC7: a SUPERVISOR (-> webapp) with neither is ACCEPTED', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = postEffectiveBody;
      mockReq.user = { sub: 'sup-1', role: 'supervisor' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    /**
     * AC3's FENCE. Two live submissions reference forms serving no geopoint
     * question (one on Public Core, one on a form row that no longer exists).
     * Keying the gate on the role alone would have made those permanently
     * unsubmittable -- a lockout, not a requirement.
     */
    it('13-71 AC3 FENCE: an ENUMERATOR on a form serving NO geopoint question is ACCEPTED', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(permissiveFlattened as never);
      mockReq.body = postEffectiveBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    /*
     * ⛔ ADVERSARIAL REVIEW R6 — THE ZOD ENUM GUARDS THE ENVELOPE, NOT THE COLUMN.
     *
     * `submitFormSchema.responses` is `z.record(z.unknown())`, so a `_gps*` key
     * carried inside the ANSWERS reached `rawData` verbatim and the ingestion
     * worker wrote it straight to the column — bypassing `z.enum` and
     * `z.number().nonnegative()` entirely. Proven against a real row before this
     * fix: the column read back `"i-invented-this-value"`.
     *
     * These two tests fail if the strip is removed from `submitForm`.
     */
    it('R6: a client-supplied _gpsUnavailableReason in the ANSWERS never reaches rawData', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = {
        ...validBody,
        responses: { ...validBody.responses, _gpsUnavailableReason: 'i-invented-this-value' },
        gpsLatitude: 7.3775,
        gpsLongitude: 3.947,
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      const queued = vi.mocked(queueSubmissionForIngestion).mock.calls[0][0] as {
        rawData: Record<string, unknown>;
      };
      // ⭐ Not "is not the invented value" — is ABSENT. This submission has a
      // position, so a reason not to have one must not exist on the row at all.
      expect(queued.rawData).not.toHaveProperty('_gpsUnavailableReason');
    });

    it('R6: a client-supplied _gpsAccuracy in the ANSWERS cannot forge the column', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = {
        ...validBody,
        // Negative — the envelope's `.nonnegative()` would have rejected it.
        // ⭐ And NO envelope accuracy is sent, deliberately: if one were, it would
        // overwrite the forged value anyway and this test would pass whether or
        // not the strip existed. The absence is what makes it mutation-sensitive.
        responses: { ...validBody.responses, _gpsAccuracy: -9999 },
        gpsLatitude: 7.3775,
        gpsLongitude: 3.947,
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      const queued = vi.mocked(queueSubmissionForIngestion).mock.calls[0][0] as {
        rawData: Record<string, unknown>;
      };
      expect(queued.rawData).not.toHaveProperty('_gpsAccuracy');
    });

    /*
     * ⛔ ADVERSARIAL REVIEW R7 — THE REQUIREMENT MUST NOT APPLY RETROACTIVELY.
     *
     * Every submission in an enumerator's offline queue on deploy day predates
     * auto-capture and carries no position. Without this fence each one is refused
     * 422 on its first sync, and `sync-manager.isPermanentFailure` treats a 422 as
     * PERMANENT — parked at MAX_RETRIES, never retried. The documented recovery
     * ("Reopen — nothing is lost") then re-captures the enumerator's CURRENT
     * position and files it as the interview location.
     */
    it('R7: an interview submitted BEFORE the requirement took effect is accepted with neither', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      mockReq.body = { ...postEffectiveBody, submittedAt: '2026-09-19T09:15:00.000Z' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      expect(refusal()).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it('R7: the fence is a DATE, not an off switch — a submission after it is still refused', async () => {
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(geopointFlattened as never);
      // ⛔ DERIVED FROM THE CONSTANT, NOT RE-TYPED (adjudication 2026-09-23). This
      // line used to hardcode `2026-09-21T00:00:00.000Z`. When the fence moved to
      // the 24th the literal fell BEHIND it, so the boundary case silently became
      // a pre-effective case and the test asserted the opposite of its own name.
      // A test that pins a constant by copying its value stops testing the
      // constant the moment it changes — and this constant is DESIGNED to change
      // at every deploy. Reading it keeps the boundary meaning "the boundary".
      mockReq.body = {
        ...postEffectiveBody,
        submittedAt: GEOPOINT_REQUIREMENT_EFFECTIVE_FROM.toISOString(),
      };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(mockReq as Request, mockRes as Response, mockNext);

      // ⭐ The boundary instant itself is INSIDE the requirement. A fence tested
      // only from the outside does not tell you where it is.
      expect(refusal()?.code).toBe('INCOMPLETE_SUBMISSION');
    });

    it('calls next on queue error', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      const queueError = new Error('Redis down');
      vi.mocked(queueSubmissionForIngestion).mockRejectedValue(queueError);

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(queueError);
    });

    it('sets source to "enumerator" for enumerator role', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-abc');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'enumerator' })
      );
    });

    it('sets source to "public" for public_user role', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-456', role: 'public_user' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-def');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'public' })
      );
    });

    it('sets source to "clerk" for data_entry_clerk role', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-789', role: 'data_entry_clerk' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-ghi');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'clerk' })
      );
    });

    it('defaults source to "webapp" for unknown roles', async () => {
      mockReq.body = validBody;
      mockReq.user = { sub: 'user-000', role: 'super_admin' };

      vi.mocked(queueSubmissionForIngestion).mockResolvedValue('job-jkl');

      await FormController.submitForm(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(queueSubmissionForIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'webapp' })
      );
    });
  });

  describe('getSubmissionSource', () => {
    it('maps public_user to "public"', () => {
      expect(FormController.getSubmissionSource('public_user')).toBe('public');
    });

    it('maps enumerator to "enumerator"', () => {
      expect(FormController.getSubmissionSource('enumerator')).toBe('enumerator');
    });

    it('maps data_entry_clerk to "clerk"', () => {
      expect(FormController.getSubmissionSource('data_entry_clerk')).toBe('clerk');
    });

    it('returns "webapp" for undefined role', () => {
      expect(FormController.getSubmissionSource(undefined)).toBe('webapp');
    });

    it('returns "webapp" for unknown role', () => {
      expect(FormController.getSubmissionSource('super_admin')).toBe('webapp');
    });
  });

  describe('checkNin (AC 3.7.3)', () => {
    it('returns available: true when NIN is not registered', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockResolvedValue(null);
      mockFindFirstUser.mockResolvedValue(null);

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: { available: true },
      });
    });

    it('returns available: false with reason "respondent" when NIN exists in respondents', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockResolvedValue({
        createdAt: new Date('2026-02-10T14:30:00.000Z'),
      });

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: {
          available: false,
          reason: 'respondent',
          registeredAt: '2026-02-10T14:30:00.000Z',
        },
      });
      // Should NOT check users table when found in respondents
      expect(mockFindFirstUser).not.toHaveBeenCalled();
    });

    it('returns available: false with reason "staff" when NIN exists in users (no date exposed)', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockResolvedValue(null);
      mockFindFirstUser.mockResolvedValue({ id: 'staff-user-001' });

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: { available: false, reason: 'staff' },
      });
    });

    it('Story 13-15 — runs the dup-check for a well-formed NIN that fails Mod-11 (format-only)', async () => {
      mockReq.body = { nin: '12345678901' }; // Fails the RETIRED Mod-11 check — must still be checked
      mockFindFirstRespondent.mockResolvedValue(null);
      mockFindFirstUser.mockResolvedValue(null);

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: { available: true } });
    });

    it('returns validation error for non-11-digit input', async () => {
      mockReq.body = { nin: '123' };

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(400);
    });

    it('calls next on database error', async () => {
      mockReq.body = { nin: '61961438053' };
      mockFindFirstRespondent.mockRejectedValue(new Error('DB connection lost'));

      await FormController.checkNin(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getSubmissionStatuses (AC 3.7.6)', () => {
    it('returns statuses for valid UIDs belonging to the user', async () => {
      mockReq.query = { uids: 'uid-1,uid-2' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      mockFindManySubmissions.mockResolvedValue([
        { submissionUid: 'uid-1', processed: true, processingError: null },
        { submissionUid: 'uid-2', processed: true, processingError: 'NIN_DUPLICATE: ...' },
      ]);

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({
        data: {
          'uid-1': { processed: true, processingError: null },
          'uid-2': { processed: true, processingError: 'NIN_DUPLICATE: ...' },
        },
      });
    });

    /**
     * Story 13-57 AC2 — THE SURFACE THAT LIGHTS UP FOR FREE, once the column is
     * actually written.
     *
     * This endpoint is the field officer's own status poll (and what the web
     * `sync-manager` reads to stop retrying an offline item). It has selected
     * `processing_error` since Story 3.7 — but on the human ingestion path that
     * column was NULL on all 284 production rows, so the surface has never once
     * shown a reason. This pins that 13-57's reason reaches the person who
     * submitted the form, in the terminal shape the story defines
     * (`processed: true` + a reason), rather than sitting in a log nobody greps.
     */
    it('13-57 — surfaces an UNPROCESSABLE_INPUT reason to the officer who submitted it', async () => {
      mockReq.query = { uids: 'uid-dead' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      mockFindManySubmissions.mockResolvedValue([
        {
          submissionUid: 'uid-dead',
          processed: true,
          processingError:
            'UNPROCESSABLE_INPUT: phone_number (wrong_length:expected_10_got_11) — the value could not be canonicalised to the shape respondents requires, so it was not written',
        },
      ]);

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      const payload = jsonMock.mock.calls[0][0] as {
        data: Record<string, { processed: boolean; processingError: string | null }>;
      };
      expect(payload.data['uid-dead'].processed).toBe(true);
      expect(payload.data['uid-dead'].processingError).toMatch(/^UNPROCESSABLE_INPUT: phone_number/);
    });

    it('returns 400 for empty UIDs', async () => {
      mockReq.query = { uids: '' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(400);
      expect(passedError.code).toBe('INVALID_UIDS');
    });

    it('returns 400 when more than 50 UIDs provided', async () => {
      const tooManyUids = Array.from({ length: 51 }, (_, i) => `uid-${i}`).join(',');
      mockReq.query = { uids: tooManyUids };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.code).toBe('INVALID_UIDS');
    });

    it('returns empty data for UIDs belonging to other users', async () => {
      mockReq.query = { uids: 'uid-other' };
      mockReq.user = { sub: 'user-123', role: 'enumerator' };
      mockFindManySubmissions.mockResolvedValue([]); // No matching submissions

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: {} });
    });

    it('returns 401 when user is not authenticated (AC 3.7.6)', async () => {
      mockReq.query = { uids: 'uid-1' };
      mockReq.user = undefined;

      await FormController.getSubmissionStatuses(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const passedError = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(passedError.statusCode).toBe(401);
      expect(passedError.code).toBe('AUTH_REQUIRED');
    });
  });
});
