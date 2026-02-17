/**
 * Team Assignment Service
 *
 * Manages supervisor-enumerator team assignments.
 * Created in prep-8 (Supervisor Team Assignment Schema).
 *
 * Key behaviors:
 * - getEnumeratorIdsForSupervisor: direct assignment lookup with LGA fallback
 * - createAssignment: role-validated assignment creation
 * - removeAssignment: soft-delete via unassigned_at timestamp
 */

import { db } from '../db/index.js';
import { teamAssignments, users } from '../db/schema/index.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'team-assignment-service' });

/** Active user statuses eligible for team assignment */
const ACTIVE_USER_STATUSES = ['active', 'verified'] as const;

export class TeamAssignmentService {
  /**
   * Get enumerator IDs assigned to a supervisor.
   * Falls back to LGA-scoped query if no explicit assignments exist.
   * Excludes inactive/suspended/deactivated enumerators in both paths.
   */
  static async getEnumeratorIdsForSupervisor(supervisorId: string): Promise<string[]> {
    // Direct assignment lookup — active records only, include enumerator for status check
    const assignments = await db.query.teamAssignments.findMany({
      where: and(
        eq(teamAssignments.supervisorId, supervisorId),
        isNull(teamAssignments.unassignedAt),
      ),
      with: { enumerator: true },
    });

    if (assignments.length > 0) {
      return assignments
        .filter((a) => {
          const status = a.enumerator?.status;
          return status === 'active' || status === 'verified';
        })
        .map((a) => a.enumeratorId);
    }

    // Fallback: LGA-scoped query
    logger.warn({ event: 'team.assignment.lga_fallback', supervisorId });

    const supervisor = await db.query.users.findFirst({
      where: eq(users.id, supervisorId),
      with: { role: true },
    });

    if (!supervisor?.lgaId) {
      return [];
    }

    // Find active enumerators in the same LGA
    const lgaUsers = await db.query.users.findMany({
      where: and(
        eq(users.lgaId, supervisor.lgaId),
        inArray(users.status, [...ACTIVE_USER_STATUSES]),
      ),
      with: { role: true },
    });

    return lgaUsers
      .filter((u) => u.role?.name === 'enumerator')
      .map((u) => u.id);
  }

  /**
   * Create a new team assignment with role validation.
   * Throws INVALID_ROLE_ASSIGNMENT if roles don't match.
   * Throws ENUMERATOR_ALREADY_ASSIGNED if enumerator has an active assignment.
   */
  static async createAssignment(
    supervisorId: string,
    enumeratorId: string,
    lgaId: string,
  ): Promise<typeof teamAssignments.$inferSelect> {
    // Validate supervisor role
    const supervisor = await db.query.users.findFirst({
      where: eq(users.id, supervisorId),
      with: { role: true },
    });

    if (!supervisor) {
      throw new AppError('USER_NOT_FOUND', 'Supervisor not found', 404);
    }

    if (supervisor.role?.name !== 'supervisor') {
      throw new AppError(
        'INVALID_ROLE_ASSIGNMENT',
        `User ${supervisorId} does not have the supervisor role`,
        400,
      );
    }

    // Validate enumerator role
    const enumerator = await db.query.users.findFirst({
      where: eq(users.id, enumeratorId),
      with: { role: true },
    });

    if (!enumerator) {
      throw new AppError('USER_NOT_FOUND', 'Enumerator not found', 404);
    }

    if (enumerator.role?.name !== 'enumerator') {
      throw new AppError(
        'INVALID_ROLE_ASSIGNMENT',
        `User ${enumeratorId} does not have the enumerator role`,
        400,
      );
    }

    try {
      const [assignment] = await db
        .insert(teamAssignments)
        .values({
          supervisorId,
          enumeratorId,
          lgaId,
          isSeeded: false,
        })
        .returning();

      logger.info({
        event: 'team.assignment.created',
        assignmentId: assignment.id,
        supervisorId,
        enumeratorId,
        lgaId,
      });

      return assignment;
    } catch (error: unknown) {
      // Handle partial unique index violation (duplicate active assignment)
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === '23505') {
        throw new AppError(
          'ENUMERATOR_ALREADY_ASSIGNED',
          `Enumerator ${enumeratorId} already has an active assignment`,
          409,
        );
      }
      throw error;
    }
  }

  /**
   * Soft-delete an assignment by setting unassigned_at.
   * Only matches active assignments (unassigned_at IS NULL).
   */
  static async removeAssignment(assignmentId: string): Promise<void> {
    const [updated] = await db
      .update(teamAssignments)
      .set({ unassignedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(teamAssignments.id, assignmentId),
        isNull(teamAssignments.unassignedAt),
      ))
      .returning();

    if (!updated) {
      throw new AppError('ASSIGNMENT_NOT_FOUND', 'Active assignment not found', 404);
    }

    logger.info({
      event: 'team.assignment.removed',
      assignmentId,
      supervisorId: updated.supervisorId,
      enumeratorId: updated.enumeratorId,
    });
  }
}
