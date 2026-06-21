/**
 * Questionnaire Controller Tests
 *
 * Story 9-33 review M3 — the third (and final) call site of
 * NativeFormService.flattenForRender lives in QuestionnaireController.getFormPreview.
 * Bug #1's fix forwards the `:id` URL param (the questionnaire_forms row PK) to
 * flattenForRender; this test locks that call site so a revert can't slip
 * through CI. No questionnaire-controller test file existed before this story.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// QuestionnaireService is stubbed — getFormPreview never touches it, and we want
// to avoid pulling its transitive DB/queue imports into this focused unit test.
// Story 9-44 F-016 — `download` needs `downloadForm`, so expose a spy for it.
const mockDownloadForm = vi.fn();
vi.mock('../../services/questionnaire.service.js', () => ({
  QuestionnaireService: { downloadForm: (...a: unknown[]) => mockDownloadForm(...a) },
}));
vi.mock('../../services/native-form.service.js');

import { QuestionnaireController } from '../questionnaire.controller.js';
import { NativeFormService } from '../../services/native-form.service.js';

describe('QuestionnaireController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    jsonMock = vi.fn();
    mockRes = { json: jsonMock };
    mockNext = vi.fn();
    mockReq = { params: {} };
  });

  describe('getFormPreview', () => {
    const mockSchema = {
      id: 'inner-schema-id-DO-NOT-USE',
      title: 'Questionnaire Preview',
      version: '2.0.0',
      status: 'published' as const,
      sections: [],
      choiceLists: {},
      createdAt: '2026-03-01T00:00:00.000Z',
    };

    const mockFlattened = {
      formId: 'qform-uuid-1',
      title: 'Questionnaire Preview',
      version: '2.0.0',
      questions: [],
      choiceLists: {},
    };

    it('forwards the row PK (:id param) to flattenForRender (Story 9-33 Bug #1)', async () => {
      mockReq.params = { id: 'qform-uuid-1' };

      vi.mocked(NativeFormService.getFormSchema).mockResolvedValue(mockSchema);
      vi.mocked(NativeFormService.flattenForRender).mockReturnValue(mockFlattened);

      await QuestionnaireController.getFormPreview(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(NativeFormService.getFormSchema).toHaveBeenCalledWith('qform-uuid-1');
      expect(NativeFormService.flattenForRender).toHaveBeenCalledWith(mockSchema, 'qform-uuid-1');
      expect(jsonMock).toHaveBeenCalledWith({ data: mockFlattened });
    });

    it('passes errors to next()', async () => {
      mockReq.params = { id: 'missing-id' };

      const notFound = new Error('Form not found');
      vi.mocked(NativeFormService.getFormSchema).mockRejectedValue(notFound);

      await QuestionnaireController.getFormPreview(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(notFound);
      expect(jsonMock).not.toHaveBeenCalled();
    });
  });

  // Story 9-44 AC#1 (F-016) — XLSForm download response headers.
  describe('download', () => {
    it('derives Content-Type from the allowlist + sanitizes the filename (no client-MIME / raw-name reflection)', async () => {
      const setHeaderMock = vi.fn();
      const sendMock = vi.fn();
      mockReq.params = { id: 'form-1' };
      const res = { setHeader: setHeaderMock, send: sendMock } as unknown as Response;

      // Stored client MIME is a lie; filename carries a hostile char.
      mockDownloadForm.mockResolvedValue({
        buffer: Buffer.from('PK\x03\x04'),
        fileName: 'my form".xlsx',
        mimeType: 'text/html',
      });

      await QuestionnaireController.download(mockReq as Request, res, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const cd = setHeaderMock.mock.calls.find((c) => c[0] === 'Content-Disposition')![1] as string;
      expect(cd).not.toContain('my form"'); // raw name not reflected
      expect(cd).toContain("filename*=UTF-8''");
      expect(sendMock).toHaveBeenCalled();
    });
  });
});
