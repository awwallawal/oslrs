import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.js';
import { publicVerificationRateLimit } from '../middleware/rate-limit.js';

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
router.get('/verify/:id', publicVerificationRateLimit, UserController.verifyStaff);

export { router as userRoutes };
