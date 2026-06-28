import { Router } from 'express';
import { handleResendWebhook } from '../controllers/webhook.controller.js';

/**
 * Story 13-9 (AC3) — webhook routes. Mounted in app.ts with express.raw BEFORE express.json
 * (the Svix signature needs the unparsed body), NOT under the normal /api/v1 router.
 */
const webhookRoutes = Router();

webhookRoutes.post('/resend', handleResendWebhook);

export default webhookRoutes;
