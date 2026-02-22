import { Router } from 'express';
import staffRoutes from './staff.routes.js';
import authRoutes from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import devRoutes from './dev.routes.js';
import adminRoutes from './admin.routes.js';
import questionnaireRoutes from './questionnaire.routes.js';
import rolesRoutes from './roles.routes.js';
import formRoutes from './form.routes.js';
import supervisorRoutes from './supervisor.routes.js';
import messageRoutes from './message.routes.js';
import fraudThresholdsRoutes from './fraud-thresholds.routes.js';
import fraudDetectionsRoutes from './fraud-detections.routes.js';
import reportRoutes from './report.routes.js';

const router = Router();

router.use('/staff', staffRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/questionnaires', questionnaireRoutes);
router.use('/roles', rolesRoutes);
router.use('/forms', formRoutes);
router.use('/supervisor', supervisorRoutes);
router.use('/messages', messageRoutes);
router.use('/fraud-thresholds', fraudThresholdsRoutes);
router.use('/fraud-detections', fraudDetectionsRoutes);
router.use('/reports', reportRoutes);

// Dev routes (only available in non-production)
if (process.env.NODE_ENV !== 'production') {
  router.use('/dev', devRoutes);
}

export default router;
