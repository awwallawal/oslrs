import { Router } from 'express';
import multer from 'multer';
import { StaffController } from '../controllers/staff.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';

const router = Router();
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// All routes require Super Admin
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

router.post('/manual', StaffController.createManual);
router.post('/import', upload.single('file'), StaffController.importCsv);
router.get('/import/:jobId', StaffController.getImportStatus);

export default router;
