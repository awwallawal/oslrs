import { Router } from 'express';
import { MessageController } from '../controllers/message.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, requireLgaLock } from '../middleware/rbac.js';
import { messageRateLimit } from '../middleware/message-rate-limit.js';
import { UserRole } from '@oslsr/types';

const router = Router();

// All message routes require authentication + supervisor/enumerator role + LGA lock
router.use(authenticate);
router.use(authorize(UserRole.SUPERVISOR, UserRole.ENUMERATOR));
router.use(requireLgaLock());

// Send direct message to assigned team member (rate limited)
router.post('/send', messageRateLimit, MessageController.sendDirect);

// Send broadcast to all assigned enumerators (rate limited, supervisor-only guard in controller)
router.post('/broadcast', messageRateLimit, MessageController.sendBroadcast);

// Get conversation inbox
router.get('/inbox', MessageController.getInbox);

// Get message thread with a specific user
router.get('/thread/:userId', MessageController.getThread);

// Batch mark all messages in a thread as read
router.patch('/thread/:userId/read', MessageController.markThreadAsRead);

// Mark a single message as read
router.patch('/:messageId/read', MessageController.markAsRead);

// Get unread message count
router.get('/unread-count', MessageController.getUnreadCount);

export default router;
