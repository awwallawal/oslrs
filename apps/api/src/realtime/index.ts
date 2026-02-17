import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { z } from 'zod';
import pino from 'pino';
import { AppError } from '@oslsr/utils';
import { verifySocketToken } from './auth.js';
import { getRoomName, canJoinRoom } from './rooms.js';
import { SessionService } from '../services/session.service.js';

const logger = pino({
  name: 'realtime',
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
});

/** Zod schema for message:send event payload */
const messageSendSchema = z.object({
  targetLgaId: z.string().optional(),
  content: z.string().min(1).max(5000),
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

    // ── Message relay with Zod validation ────────────────────────────────
    socket.on('message:send', (data: unknown) => {
      const parsed = messageSendSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'Invalid message payload',
          statusCode: 400,
        });
        return;
      }

      const { targetLgaId, content } = parsed.data;
      const senderRoom = user.lgaId ? getRoomName(user.lgaId) : null;
      const targetRoom = targetLgaId ? getRoomName(targetLgaId) : senderRoom;

      if (!targetRoom || !canJoinRoom(user, targetRoom)) {
        logger.warn({
          event: 'realtime.boundary_violation',
          userId: user.sub,
          role: user.role,
          userLga: user.lgaId,
          targetRoom,
        });
        socket.emit('error', {
          code: 'TEAM_BOUNDARY_VIOLATION',
          message: 'Cannot send messages outside your assigned team',
          statusCode: 403,
        });
        return;
      }

      // Broadcast to the LGA room (excluding sender)
      socket.to(targetRoom).emit('message:received', {
        senderId: user.sub,
        senderRole: user.role,
        content,
        timestamp: new Date().toISOString(),
      });
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
