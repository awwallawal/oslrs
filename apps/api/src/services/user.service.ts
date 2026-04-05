import { db } from '../db/index.js';
import { users, roles, lgas } from '../db/schema/index.js';
import { eq, ne, and } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import type { UpdateProfilePayload } from '@oslsr/types';

export class UserService {
  /**
   * Get full profile data for the current user including resolved LGA name.
   */
  static async getProfile(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        status: users.status,
        lgaId: users.lgaId,
        lgaName: lgas.name,
        roleName: roles.name,
        homeAddress: users.homeAddress,
        bankName: users.bankName,
        accountNumber: users.accountNumber,
        accountName: users.accountName,
        nextOfKinName: users.nextOfKinName,
        nextOfKinPhone: users.nextOfKinPhone,
        liveSelfieOriginalUrl: users.liveSelfieOriginalUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(lgas, eq(users.lgaId, lgas.id))
      .where(eq(users.id, userId));

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    return user;
  }

  /**
   * Update user profile with TOCTOU-safe phone uniqueness check.
   * Story 9.1, AC#4: Partial updates for editable profile fields.
   */
  static async updateProfile(userId: string, data: UpdateProfilePayload) {
    return db.transaction(async (tx) => {
      // Lock the user row to prevent TOCTOU race
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!existing) {
        throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      }

      // Check phone uniqueness if phone is being updated (exclude self)
      if (data.phone) {
        const [duplicate] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phone, data.phone), ne(users.id, userId)));

        if (duplicate) {
          throw new AppError('DUPLICATE_PHONE', 'Phone number already in use', 409);
        }
      }

      // Update only provided fields
      const [updated] = await tx
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          homeAddress: users.homeAddress,
          bankName: users.bankName,
          accountNumber: users.accountNumber,
          accountName: users.accountName,
          nextOfKinName: users.nextOfKinName,
          nextOfKinPhone: users.nextOfKinPhone,
          status: users.status,
        });

      return updated;
    });
  }
}
