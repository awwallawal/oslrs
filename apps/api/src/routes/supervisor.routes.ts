import { Router } from 'express';
import { SupervisorController } from '../controllers/supervisor.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.SUPERVISOR));

// Team overview — enumerator counts for supervisor's LGA
router.get('/team-overview', SupervisorController.getTeamOverview);

// Pending alerts — unprocessed/failed submission counts for supervisor's LGA
router.get('/pending-alerts', SupervisorController.getPendingAlerts);

export default router;
