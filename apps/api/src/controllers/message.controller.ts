/**
 * Message Controller
 *
 * REST endpoint handlers for team messaging.
 * Created in Story 4.2 (In-App Team Messaging).
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { MessageService } from '../services/message.service.js';
import { sendDirectMessageSchema, sendBroadcastSchema, getThreadQuerySchema } from '@oslsr/types';

export class MessageController {
  /**
   * POST /api/v1/messages/send
   * Send a direct message to an assigned team member.
   */
  static async sendDirect(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const parsed = sendDirectMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.errors[0].message, 400, {
          errors: parsed.error.errors,
        });
      }

      if (!user.lgaId) {
        throw new AppError('LGA_REQUIRED', 'LGA assignment is required for messaging', 403);
      }

      const message = await MessageService.sendDirectMessage(
        user.sub,
        user.role,
        parsed.data.recipientId,
        parsed.data.content,
        user.lgaId,
      );

      res.status(201).json({ data: message });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/messages/broadcast
   * Send a broadcast message to all assigned enumerators (supervisor only).
   */
  static async sendBroadcast(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      if (user.role !== 'supervisor') {
        throw new AppError('FORBIDDEN', 'Only supervisors can send broadcast messages', 403);
      }

      const parsed = sendBroadcastSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.errors[0].message, 400, {
          errors: parsed.error.errors,
        });
      }

      if (!user.lgaId) {
        throw new AppError('LGA_REQUIRED', 'LGA assignment is required for messaging', 403);
      }

      const result = await MessageService.sendBroadcast(
        user.sub,
        parsed.data.content,
        user.lgaId,
      );

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/messages/inbox
   * Get conversation list with latest message preview and unread counts.
   */
  static async getInbox(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const inbox = await MessageService.getInbox(user.sub);
      res.json({ data: inbox });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/messages/thread/:userId
   * Get paginated message thread with another user.
   */
  static async getThread(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const otherUserId = req.params.userId;
      if (!otherUserId) {
        throw new AppError('VALIDATION_ERROR', 'userId parameter is required', 400);
      }

      const parsed = getThreadQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.errors[0].message, 400, {
          errors: parsed.error.errors,
        });
      }

      const thread = await MessageService.getThread(
        user.sub,
        otherUserId,
        parsed.data.cursor,
        parsed.data.limit,
      );

      res.json({ data: thread });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/messages/thread/:userId/read
   * Batch mark all unread messages in a thread as read.
   */
  static async markThreadAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const otherUserId = req.params.userId;
      if (!otherUserId) {
        throw new AppError('VALIDATION_ERROR', 'userId parameter is required', 400);
      }

      const markedCount = await MessageService.markThreadAsRead(user.sub, otherUserId);
      res.json({ data: { markedCount } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/messages/:messageId/read
   * Mark a message as read.
   */
  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const { messageId } = req.params;
      if (!messageId) {
        throw new AppError('VALIDATION_ERROR', 'messageId parameter is required', 400);
      }

      const updated = await MessageService.markAsRead(messageId, user.sub);
      res.json({ data: { updated } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/messages/unread-count
   * Get total unread message count.
   */
  static async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const count = await MessageService.getUnreadCount(user.sub);
      res.json({ data: { count } });
    } catch (err) {
      next(err);
    }
  }
}
