import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireFreshReAuthExceptPasswordless } from '../middleware/sensitive-action.js';
import { publicVerificationRateLimit, profileUpdateRateLimit } from '../middleware/rate-limit.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/webp') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed.'));
    }
  }
});

router.post('/selfie', authenticate, upload.single('file'), UserController.uploadSelfie);
router.get('/id-card', authenticate, UserController.downloadIDCard);
router.get('/profile', authenticate, UserController.getProfile);
// Story 13-18 — profile mutation (includes bank fields) requires step-up
// re-auth; passwordless magic-link accounts are exempt (cannot re-auth).
// Rate limiter runs BEFORE the gate (review L1) so graceless probes — each
// costing a Redis GET + DB SELECT — are capped by the per-user limiter.
router.patch('/profile', authenticate, profileUpdateRateLimit, requireFreshReAuthExceptPasswordless, UserController.updateProfile);
router.get('/verify/:id', publicVerificationRateLimit, UserController.verifyStaff);
// Story 9-43 AC#4 (F-020) — proxy the verification photo (no raw signed Spaces URL in the body).
router.get('/verify/:id/photo', publicVerificationRateLimit, UserController.verifyStaffPhoto);

export { router as userRoutes };
