import { Router } from 'express';
import staffRoutes from './staff.routes.js';
import authRoutes from './auth.routes.js';

const router = Router();

router.use('/staff', staffRoutes);
router.use('/auth', authRoutes);

export default router;
