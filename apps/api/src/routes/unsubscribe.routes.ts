import { Router } from 'express';
import { handleUnsubscribe } from '../controllers/unsubscribe.controller.js';
import { unsubscribeRateLimit } from '../middleware/rate-limit.js';

/**
 * Story 13-13 (AC5/AC7) — public one-click unsubscribe. Unauthenticated, per-IP rate-limited.
 *
 * POST = RFC 8058 One-Click (mail clients fire this from the List-Unsubscribe-Post header).
 * GET  = human click-through (renders a small confirmation page).
 * Both verify the same stateless HMAC token from the `?token=` query param.
 */
const router = Router();

router.post('/', unsubscribeRateLimit, handleUnsubscribe);
router.get('/', unsubscribeRateLimit, handleUnsubscribe);

export default router;
