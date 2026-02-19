import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { z } from 'zod';
import pino from 'pino';
import { AppError } from '@oslsr/utils';
import { verifySocketToken } from './auth.js';
import { getRoomName, canJoinRoom } from './rooms.js';
import { SessionService } from '../services/session.service.js';
import { MessageService } from '../services/message.service.js';

const logger = pino({
  name: 'realtime',
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/** Zod schema for message:send event payload (Story 4.2: persist-then-deliver) */
const messageSendSchema = z.object({
  recipientId: z.string().uuid().optional(),
  content: z.string().min(1).max(2000),
  type: z.enum(['direct', 'broadcast']).default('direct'),
});

/**
 * Initializes Socket.io transport on the given HTTP server.
 * Handles: JWT auth handshake, LGA-scoped room joining, structured logging.
 */
export function initializeRealtime(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
    // Limit to websocket to avoid long-polling overhead on single server
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? '';
      const user = await verifySocketToken(token);

      // Attach user to socket data for downstream handlers
      socket.data.user = user;
      next();
    } catch (error) {
      const appError = error instanceof AppError ? error : null;
      logger.warn({
        event: 'realtime.auth_failed',
        code: appError?.code ?? 'UNKNOWN',
        address: socket.handshake.address,
      });
      next(new Error(appError?.code ?? 'AUTH_REQUIRED'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const user = socket.data.user;

    // Session validation (auth step 5) — validate inactivity/absolute timeout
    try {
      const session = await SessionService.getUserSession(user.sub);
      if (session) {
        const validation = await SessionService.validateSession(session.sessionId);
        if (!validation.valid) {
          logger.warn({
            event: 'realtime.session_expired',
            userId: user.sub,
            reason: validation.reason,
          });
          socket.disconnect(true);
          return;
        }
        await SessionService.updateLastActivity(session.sessionId);
      }
    } catch (err) {
      logger.error({
        event: 'realtime.session_check_failed',
        userId: user.sub,
        error: (err as Error).message,
      });
      // Non-fatal: allow connection if session check fails (e.g. Redis down)
    }

    logger.info({
      event: 'realtime.connect',
      userId: user.sub,
      role: user.role,
      lgaId: user.lgaId,
    });

    // Auto-join LGA room if user has lgaId and authorized role
    if (user.lgaId) {
      const roomName = getRoomName(user.lgaId);
      if (canJoinRoom(user, roomName)) {
        socket.join(roomName);
        logger.info({
          event: 'realtime.room_joined',
          userId: user.sub,
          room: roomName,
        });
      }
    }

    // Story 4.2: Join user-specific room for direct message delivery
    socket.join(`user:${user.sub}`);

    // ── Story 4.2: Persist-then-deliver message handler ──────────────────
    socket.on('message:send', async (data: unknown) => {
      const parsed = messageSendSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'Invalid message payload',
          statusCode: 400,
        });
        return;
      }

      const { recipientId, content, type } = parsed.data;

      try {
        if (type === 'broadcast') {
          // Supervisor broadcast — persist then deliver to LGA room
          if (user.role !== 'supervisor') {
            socket.emit('error', {
              code: 'FORBIDDEN',
              message: 'Only supervisors can send broadcast messages',
              statusCode: 403,
            });
            return;
          }

          if (!user.lgaId) {
            socket.emit('error', {
              code: 'LGA_LOCK_REQUIRED',
              message: 'Field staff must be assigned to an LGA',
              statusCode: 403,
            });
            return;
          }

          const result = await MessageService.sendBroadcast(user.sub, content, user.lgaId);
          // Emit to individual assigned enumerator rooms (not LGA room) to prevent
          // non-assigned enumerators in the same LGA from receiving the event (AC4.2.2)
          const broadcastPayload = {
            id: result.message.id,
            senderId: user.sub,
            messageType: 'broadcast',
            content,
            sentAt: result.message.sentAt.toISOString(),
          };
          for (const enumeratorId of result.enumeratorIds) {
            io.to(`user:${enumeratorId}`).emit('message:received', broadcastPayload);
          }

          logger.info({ event: 'message.broadcast', messageId: result.message.id, supervisorId: user.sub });
        } else {
          // Direct message — persist then deliver to user room
          if (!recipientId) {
            socket.emit('error', {
              code: 'VALIDATION_ERROR',
              message: 'recipientId is required for direct messages',
              statusCode: 400,
            });
            return;
          }

          if (!user.lgaId) {
            socket.emit('error', {
              code: 'LGA_LOCK_REQUIRED',
              message: 'Field staff must be assigned to an LGA',
              statusCode: 403,
            });
            return;
          }

          const message = await MessageService.sendDirectMessage(
            user.sub,
            user.role,
            recipientId,
            content,
            user.lgaId,
          );

          io.to(`user:${recipientId}`).emit('message:received', {
            id: message.id,
            senderId: user.sub,
            messageType: 'direct',
            content,
            sentAt: message.sentAt.toISOString(),
          });

          logger.info({ event: 'message.sent', messageId: message.id, senderId: user.sub, recipientId });
        }
      } catch (err) {
        const appError = err instanceof AppError ? err : null;
        logger.error({
          event: 'message.delivery_failed',
          userId: user.sub,
          type,
          error: (err as Error).message,
        });
        socket.emit('error', {
          code: appError?.code ?? 'MESSAGE_SEND_FAILED',
          message: appError?.message ?? 'Failed to send message',
          statusCode: appError?.statusCode ?? 500,
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info({
        event: 'realtime.disconnect',
        userId: user.sub,
        reason,
      });
    });
  });

  return io;
}
