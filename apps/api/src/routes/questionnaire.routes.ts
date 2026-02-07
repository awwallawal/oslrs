import { Router } from 'express';
import { QuestionnaireController } from '../controllers/questionnaire.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { xlsformUpload, handleMulterError, validateFileContent } from '../middleware/upload.middleware.js';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

const router = Router();

// Validate UUID format for :id param before hitting database
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, _res, next, value) => {
  if (!UUID_REGEX.test(value)) {
    return next(new AppError('INVALID_ID', 'Invalid questionnaire ID format', 400));
  }
  next();
});

// All routes require Super Admin
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

// Native form endpoints
router.post('/native', QuestionnaireController.createNativeForm);
router.get('/:id/schema', QuestionnaireController.getFormSchema);
router.put('/:id/schema', QuestionnaireController.updateFormSchema);
router.post('/:id/publish', QuestionnaireController.publishNativeForm);
router.get('/:id/preview', QuestionnaireController.getFormPreview);

// Upload new XLSForm
router.post(
  '/upload',
  xlsformUpload.single('file'),
  handleMulterError,
  validateFileContent,
  QuestionnaireController.upload
);

// List all questionnaire forms
router.get('/', QuestionnaireController.list);

// Get specific form by UUID
router.get('/:id', QuestionnaireController.getById);

// Get version history by logical form_id
router.get('/form/:formId/versions', QuestionnaireController.getVersions);

// Update form status
router.patch('/:id/status', QuestionnaireController.updateStatus);

// Delete draft form
router.delete('/:id', QuestionnaireController.delete);

// Download original file
router.get('/:id/download', QuestionnaireController.download);

export default router;
