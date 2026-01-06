import { Router } from 'express';
import staffRoutes from './staff.routes.js';

const router = Router();

router.use('/staff', staffRoutes);

export default router;
