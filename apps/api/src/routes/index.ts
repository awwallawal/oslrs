import { Router } from 'express';
import staffRoutes from './staff.routes.js';
import authRoutes from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import devRoutes from './dev.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/staff', staffRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);

// Dev routes (only available in non-production)
if (process.env.NODE_ENV !== 'production') {
  router.use('/dev', devRoutes);
}

export default router;
