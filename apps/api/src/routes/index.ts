import { Router } from 'express';
import staffRoutes from './staff.routes.js';
import authRoutes from './auth.routes.js';
import { userRoutes } from './user.routes.js';

const router = Router();

router.use('/staff', staffRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

export default router;
