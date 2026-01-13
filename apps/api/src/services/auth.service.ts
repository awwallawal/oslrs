import { db } from '../db/index.js';
import { users, auditLogs } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { AppError, hashPassword } from '@oslsr/utils';
import type { ActivationPayload } from '@oslsr/types';

export class AuthService {
  /**
   * Activates a staff account using an invitation token.
   * @param token Secure invitation token
   * @param data Profile data and password
   */
  static async activateAccount(token: string, data: ActivationPayload): Promise<any> {
    // 1. Find user by token
    const user = await db.query.users.findFirst({
      where: eq(users.invitationToken, token)
    });

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'The invitation token is invalid or has already been used.', 401);
    }

    if (user.status !== 'invited') {
        throw new AppError('AUTH_ALREADY_ACTIVATED', 'This account has already been activated.', 400);
    }

    // Check expiry (24 hours)
    if (user.invitedAt) {
      const expiryDate = new Date(user.invitedAt);
      expiryDate.setHours(expiryDate.getHours() + 24);
      if (new Date() > expiryDate) {
        throw new AppError('AUTH_TOKEN_EXPIRED', 'Invitation token has expired.', 401);
      }
    }

    // 2. Hash password
    const passwordHash = await hashPassword(data.password);

    try {
      // 3. Update user and log audit in a transaction
      return await db.transaction(async (tx) => {
        // Double check NIN uniqueness within transaction
        const existingNin = await tx.query.users.findFirst({
            where: and(eq(users.nin, data.nin))
        });
        
        if (existingNin && existingNin.id !== user.id) {
            throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered to another account.', 409);
        }

        const [updatedUser] = await tx.update(users)
          .set({
            passwordHash,
            nin: data.nin,
            dateOfBirth: data.dateOfBirth,
            homeAddress: data.homeAddress,
            bankName: data.bankName,
            accountNumber: data.accountNumber,
            accountName: data.accountName,
            nextOfKinName: data.nextOfKinName,
            nextOfKinPhone: data.nextOfKinPhone,
            status: 'active',
            invitationToken: null, // Invalidate token
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id))
          .returning();

        await tx.insert(auditLogs).values({
          actorId: user.id,
          action: 'user.activated',
          targetResource: 'users',
          targetId: user.id,
          details: { activatedAt: new Date().toISOString() },
          ipAddress: 'system', // TODO: Pass from controller
          userAgent: 'system'
        });

        return updatedUser;
      });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      
      // Handle unique constraint violations
      if (err.code === '23505') {
        if (err.constraint_name === 'users_nin_unique') {
            throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered.', 409);
        }
        if (err.constraint_name === 'users_email_unique') {
            throw new AppError('EMAIL_EXISTS', 'Email already exists.', 409);
        }
        // Fallback for other unique constraints
        throw new AppError('CONFLICT', 'A conflict occurred with existing data.', 409);
      }
      throw err;
    }
  }
}
