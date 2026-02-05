import { Router } from 'express';
import { QuestionnaireController } from '../controllers/questionnaire.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { xlsformUpload, handleMulterError, validateFileContent } from '../middleware/upload.middleware.js';
import { UserRole } from '@oslsr/types';

const router = Router();

// All routes require Super Admin
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

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
