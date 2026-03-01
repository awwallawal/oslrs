/**
 * Remuneration Service — Bulk Payment Recording & Temporal Versioning
 *
 * Story 6.4: Handles payment batch creation, record correction,
 * receipt file uploads, and staff payment history queries.
 *
 * All amounts stored in kobo (1 Naira = 100 kobo).
 * Never UPDATE payment_records — temporal versioning with effectiveFrom/effectiveUntil.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { eq, and, isNull, desc, sql, inArray, gte, lte, ilike } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import { db } from '../db/index.js';
import { paymentBatches, paymentRecords, paymentFiles, paymentDisputes } from '../db/schema/remuneration.js';
import { users } from '../db/schema/users.js';
import { lgas } from '../db/schema/lgas.js';
import { roles } from '../db/schema/roles.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { AppError } from '@oslsr/utils';
import { queuePaymentNotificationEmail, queueDisputeNotificationEmail, queueDisputeResolutionEmail } from '../queues/email.queue.js';
import { getIO } from '../realtime/index.js';

const logger = pino({ name: 'remuneration-service' });

/** S3 client for receipt file storage (same config as PhotoProcessingService) */
function createS3Client(): { client: S3Client; bucketName: string } {
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const config: S3ClientConfig = { region };

  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true;
  }

  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    };
  }

  return {
    client: new S3Client(config),
    bucketName: process.env.S3_BUCKET_NAME || 'oslsr-media',
  };
}

export interface CreateBatchInput {
  trancheName: string;
  trancheNumber: number;
  amount: number; // in kobo
  staffIds: string[];
  bankReference?: string;
  description?: string;
  lgaId?: string;
  roleFilter?: string;
  receiptFile?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}

export interface CorrectRecordInput {
  newAmount: number; // in kobo
  reason: string;
}

export class RemunerationService {
  /**
   * Create a payment batch with individual records for each staff member.
   * AC1: Single transaction for batch + records.
   * AC3: Self-payment prevention.
   */
  static async createPaymentBatch(
    input: CreateBatchInput,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // AC3: Self-payment guard
    if (input.staffIds.includes(actorId)) {
      throw new AppError(
        'CANNOT_RECORD_SELF_PAYMENT',
        'Cannot record payment to yourself. Ask another Super Admin.',
        400,
      );
    }

    let receiptFileRecord: { id: string; s3Key: string } | null = null;

    // Upload receipt to S3 before transaction (if provided)
    if (input.receiptFile) {
      const { client, bucketName } = createS3Client();
      const ext = input.receiptFile.originalname.split('.').pop() || 'bin';
      const fileId = uuidv7();
      const s3Key = `payment-receipts/${fileId}.${ext}`;

      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: input.receiptFile.buffer,
        ContentType: input.receiptFile.mimetype,
      }));

      receiptFileRecord = { id: fileId, s3Key };
    }

    // Single transaction: file record + batch + individual records + audit
    const result = await db.transaction(async (tx) => {
      // Create payment_files record if receipt uploaded
      let receiptFileId: string | null = null;
      let preGeneratedBatchId: string | undefined;

      if (receiptFileRecord && input.receiptFile) {
        preGeneratedBatchId = uuidv7(); // pre-generate batch ID for file entity ref

        await tx.insert(paymentFiles).values({
          id: receiptFileRecord.id,
          entityType: 'receipt',
          entityId: preGeneratedBatchId,
          originalFilename: input.receiptFile.originalname,
          s3Key: receiptFileRecord.s3Key,
          mimeType: input.receiptFile.mimetype,
          sizeBytes: input.receiptFile.size,
          uploadedBy: actorId,
        });

        receiptFileId = receiptFileRecord.id;
      }

      // Create batch (with pre-generated ID if receipt exists, otherwise auto-generated)
      const [batch] = await tx.insert(paymentBatches).values({
        ...(preGeneratedBatchId ? { id: preGeneratedBatchId } : {}),
        trancheNumber: input.trancheNumber,
        trancheName: input.trancheName,
        description: input.description ?? null,
        bankReference: input.bankReference ?? null,
        receiptFileId,
        lgaId: input.lgaId ?? null,
        roleFilter: input.roleFilter ?? null,
        staffCount: input.staffIds.length,
        totalAmount: input.amount * input.staffIds.length,
        recordedBy: actorId,
      }).returning();

      // Create individual payment records
      const recordValues = input.staffIds.map((userId) => ({
        batchId: batch.id,
        userId,
        amount: input.amount,
        status: 'active' as const,
        createdBy: actorId,
      }));

      await tx.insert(paymentRecords).values(recordValues);

      // Audit log
      await AuditService.logActionTx(tx, {
        actorId,
        action: AUDIT_ACTIONS.DATA_CREATE,
        targetResource: 'payment_batch',
        targetId: batch.id,
        details: {
          trancheName: input.trancheName,
          staffCount: input.staffIds.length,
          amountPerStaff: input.amount,
          totalAmount: input.amount * input.staffIds.length,
        },
        ipAddress,
        userAgent,
      });

      return batch;
    });

    // Fire-and-forget: queue notification emails (outside transaction)
    this.queueBatchNotifications(input, result.id).catch((err) => {
      logger.warn({
        event: 'remuneration.notification_queue_failed',
        batchId: result.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    logger.info({
      event: 'remuneration.batch_created',
      batchId: result.id,
      staffCount: input.staffIds.length,
      totalAmount: input.amount * input.staffIds.length,
    });

    return result;
  }

  /**
   * Queue notification emails for each staff in the batch.
   * AC4: Fire-and-forget — email failures never roll back payment.
   */
  private static async queueBatchNotifications(input: CreateBatchInput, batchId: string) {
    // Look up staff names/emails for personalized notifications
    const staffMembers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, input.staffIds));

    for (const staff of staffMembers) {
      if (!staff.email) continue;
      try {
        await queuePaymentNotificationEmail({
          email: staff.email,
          staffName: staff.fullName || 'Staff Member',
          amount: input.amount,
          trancheName: input.trancheName,
          date: new Date().toLocaleDateString('en-NG'),
          bankReference: input.bankReference || 'N/A',
        }, staff.id);
      } catch (err) {
        logger.warn({
          event: 'remuneration.notification_failed',
          userId: staff.id,
          batchId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Correct a payment record using temporal versioning.
   * AC6: Close old version (effectiveUntil = NOW), insert new version.
   */
  static async correctPaymentRecord(
    recordId: string,
    input: CorrectRecordInput,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return db.transaction(async (tx) => {
      // Fetch existing active record
      const [existing] = await tx
        .select()
        .from(paymentRecords)
        .where(and(
          eq(paymentRecords.id, recordId),
          isNull(paymentRecords.effectiveUntil),
        ));

      if (!existing) {
        throw new AppError(
          'RECORD_NOT_FOUND',
          'Payment record not found or already corrected',
          404,
        );
      }

      const now = new Date();

      // Close old version
      await tx
        .update(paymentRecords)
        .set({
          effectiveUntil: now,
          status: 'corrected',
        })
        .where(eq(paymentRecords.id, recordId));

      // Insert new corrected version
      const [newRecord] = await tx.insert(paymentRecords).values({
        batchId: existing.batchId,
        userId: existing.userId,
        amount: input.newAmount,
        status: 'active',
        effectiveFrom: now,
        createdBy: actorId,
      }).returning();

      // Audit log
      await AuditService.logActionTx(tx, {
        actorId,
        action: AUDIT_ACTIONS.DATA_UPDATE,
        targetResource: 'payment_record',
        targetId: newRecord.id,
        details: {
          previousRecordId: recordId,
          previousAmount: existing.amount,
          newAmount: input.newAmount,
          reason: input.reason,
        },
        ipAddress,
        userAgent,
      });

      return newRecord;
    });
  }

  /**
   * List payment batches with pagination and optional filters.
   */
  static async getPaymentBatches(filters?: {
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    const batches = await db
      .select({
        id: paymentBatches.id,
        trancheNumber: paymentBatches.trancheNumber,
        trancheName: paymentBatches.trancheName,
        description: paymentBatches.description,
        bankReference: paymentBatches.bankReference,
        staffCount: paymentBatches.staffCount,
        totalAmount: paymentBatches.totalAmount,
        status: paymentBatches.status,
        lgaId: paymentBatches.lgaId,
        roleFilter: paymentBatches.roleFilter,
        recordedBy: paymentBatches.recordedBy,
        createdAt: paymentBatches.createdAt,
        recordedByName: users.fullName,
      })
      .from(paymentBatches)
      .leftJoin(users, eq(paymentBatches.recordedBy, users.id))
      .orderBy(desc(paymentBatches.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentBatches);

    return {
      data: batches,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get batch detail with all individual records.
   */
  static async getBatchDetail(batchId: string) {
    const [batch] = await db
      .select({
        id: paymentBatches.id,
        trancheNumber: paymentBatches.trancheNumber,
        trancheName: paymentBatches.trancheName,
        description: paymentBatches.description,
        bankReference: paymentBatches.bankReference,
        receiptFileId: paymentBatches.receiptFileId,
        staffCount: paymentBatches.staffCount,
        totalAmount: paymentBatches.totalAmount,
        status: paymentBatches.status,
        lgaId: paymentBatches.lgaId,
        roleFilter: paymentBatches.roleFilter,
        recordedBy: paymentBatches.recordedBy,
        createdAt: paymentBatches.createdAt,
        recordedByName: users.fullName,
      })
      .from(paymentBatches)
      .leftJoin(users, eq(paymentBatches.recordedBy, users.id))
      .where(eq(paymentBatches.id, batchId));

    if (!batch) {
      throw new AppError('BATCH_NOT_FOUND', 'Payment batch not found', 404);
    }

    // Fetch individual records with staff info
    const records = await db
      .select({
        id: paymentRecords.id,
        userId: paymentRecords.userId,
        amount: paymentRecords.amount,
        status: paymentRecords.status,
        effectiveFrom: paymentRecords.effectiveFrom,
        effectiveUntil: paymentRecords.effectiveUntil,
        createdAt: paymentRecords.createdAt,
        staffName: users.fullName,
        staffEmail: users.email,
      })
      .from(paymentRecords)
      .leftJoin(users, eq(paymentRecords.userId, users.id))
      .where(eq(paymentRecords.batchId, batchId))
      .orderBy(desc(paymentRecords.createdAt));

    // Fetch receipt file if exists
    let receiptFile = null;
    if (batch.receiptFileId) {
      const [file] = await db
        .select()
        .from(paymentFiles)
        .where(eq(paymentFiles.id, batch.receiptFileId));
      receiptFile = file ?? null;
    }

    return { ...batch, records, receiptFile };
  }

  /**
   * Get staff payment history (active records only by default).
   * AC2: Query where effectiveUntil IS NULL for active records.
   */
  static async getStaffPaymentHistory(
    userId: string,
    filters?: { includeCorrections?: boolean; page?: number; limit?: number },
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;
    const includeCorrections = filters?.includeCorrections ?? false;

    const conditions = [eq(paymentRecords.userId, userId)];
    if (!includeCorrections) {
      conditions.push(isNull(paymentRecords.effectiveUntil));
    }

    // Subquery: get the latest (most recent) dispute per payment record
    // This prevents duplicate rows when a record has multiple disputes (resolved + reopened).
    const latestDisputeSq = db
      .select({
        id: paymentDisputes.id,
        paymentRecordId: paymentDisputes.paymentRecordId,
        status: paymentDisputes.status,
        staffComment: paymentDisputes.staffComment,
        adminResponse: paymentDisputes.adminResponse,
        resolvedAt: paymentDisputes.resolvedAt,
        reopenCount: paymentDisputes.reopenCount,
        createdAt: paymentDisputes.createdAt,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${paymentDisputes.paymentRecordId} ORDER BY ${paymentDisputes.createdAt} DESC)`.as('rn'),
      })
      .from(paymentDisputes)
      .as('latest_dispute');

    const records = await db
      .select({
        id: paymentRecords.id,
        batchId: paymentRecords.batchId,
        amount: paymentRecords.amount,
        status: paymentRecords.status,
        effectiveFrom: paymentRecords.effectiveFrom,
        effectiveUntil: paymentRecords.effectiveUntil,
        createdAt: paymentRecords.createdAt,
        trancheName: paymentBatches.trancheName,
        trancheNumber: paymentBatches.trancheNumber,
        bankReference: paymentBatches.bankReference,
        // Story 6.5: Latest dispute info via LEFT JOIN subquery
        disputeId: latestDisputeSq.id,
        disputeStatus: latestDisputeSq.status,
        disputeComment: latestDisputeSq.staffComment,
        disputeAdminResponse: latestDisputeSq.adminResponse,
        disputeResolvedAt: latestDisputeSq.resolvedAt,
        disputeReopenCount: latestDisputeSq.reopenCount,
        disputeCreatedAt: latestDisputeSq.createdAt,
      })
      .from(paymentRecords)
      .innerJoin(paymentBatches, eq(paymentRecords.batchId, paymentBatches.id))
      .leftJoin(latestDisputeSq, and(
        eq(paymentRecords.id, latestDisputeSq.paymentRecordId),
        eq(latestDisputeSq.rn, 1),
      ))
      .where(and(...conditions))
      .orderBy(desc(paymentRecords.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentRecords)
      .where(and(...conditions));

    return {
      data: records,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Download a receipt file from S3.
   */
  static async getFileStream(fileId: string) {
    const [file] = await db
      .select()
      .from(paymentFiles)
      .where(eq(paymentFiles.id, fileId));

    if (!file) {
      throw new AppError('FILE_NOT_FOUND', 'File not found', 404);
    }

    const { client, bucketName } = createS3Client();
    const response = await client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: file.s3Key,
    }));

    if (!response.Body) {
      throw new AppError('FILE_NOT_FOUND', 'File not found in storage', 404);
    }

    return {
      stream: response.Body,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  }

  /**
   * Get eligible staff for payment recording (filtered by role/LGA).
   */
  static async getEligibleStaff(filters?: { roleFilter?: string; lgaId?: string }) {
    const conditions = [
      eq(users.status, 'active'),
    ];

    if (filters?.lgaId) {
      conditions.push(eq(users.lgaId, filters.lgaId));
    }

    if (filters?.roleFilter) {
      conditions.push(eq(roles.name, filters.roleFilter));
    }

    const staffList = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        bankName: users.bankName,
        accountNumber: users.accountNumber,
        accountName: users.accountName,
        lgaId: users.lgaId,
        lgaName: lgas.name,
        roleId: users.roleId,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(lgas, eq(users.lgaId, lgas.id))
      .where(and(...conditions))
      .orderBy(users.fullName);

    return staffList;
  }

  /**
   * Open a dispute on a payment record (staff-initiated).
   * Story 6.5, AC3: Creates dispute, updates record status, queues notification.
   */
  static async openDispute(
    paymentRecordId: string,
    staffComment: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // All validation inside transaction to prevent TOCTOU race conditions.
    // SELECT FOR UPDATE locks the payment record row until commit.
    const dispute = await db.transaction(async (tx) => {
      // Fetch + lock the payment record
      const [record] = await tx
        .select({
          id: paymentRecords.id,
          userId: paymentRecords.userId,
          status: paymentRecords.status,
          amount: paymentRecords.amount,
          batchId: paymentRecords.batchId,
        })
        .from(paymentRecords)
        .where(eq(paymentRecords.id, paymentRecordId))
        .for('update');

      if (!record) {
        throw new AppError('NOT_FOUND', 'Payment record not found', 404);
      }

      // Ownership guard: staff can only dispute their own records
      if (record.userId !== actorId) {
        throw new AppError('FORBIDDEN', 'Can only dispute your own payment records', 403);
      }

      // Status guard: only active records can be disputed
      if (record.status !== 'active') {
        throw new AppError('INVALID_STATUS', 'Only active payment records can be disputed', 400);
      }

      // Check for existing open dispute (inside transaction for consistency)
      const [existingDispute] = await tx
        .select({ id: paymentDisputes.id })
        .from(paymentDisputes)
        .where(and(
          eq(paymentDisputes.paymentRecordId, paymentRecordId),
          sql`${paymentDisputes.status} NOT IN ('resolved', 'closed')`,
        ));

      if (existingDispute) {
        throw new AppError('DUPLICATE_DISPUTE', 'An open dispute already exists for this payment record', 409);
      }

      // Create dispute record
      const [newDispute] = await tx.insert(paymentDisputes).values({
        paymentRecordId,
        status: 'disputed',
        staffComment,
        openedBy: actorId,
      }).returning();

      // Update payment record status (denormalized flag)
      await tx
        .update(paymentRecords)
        .set({ status: 'disputed' })
        .where(eq(paymentRecords.id, paymentRecordId));

      await AuditService.logActionTx(tx, {
        actorId,
        action: AUDIT_ACTIONS.DATA_CREATE,
        targetResource: 'payment_dispute',
        targetId: newDispute.id,
        details: {
          paymentRecordId,
          staffComment: staffComment.substring(0, 100),
        },
        ipAddress,
        userAgent,
      });

      return { newDispute, record };
    });

    // Fire-and-forget: notification email to Super Admin
    this.queueDisputeNotification(actorId, dispute.record.batchId, dispute.record.amount, staffComment).catch((err) => {
      logger.warn({
        event: 'dispute.notification_failed',
        paymentRecordId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    logger.info({
      event: 'remuneration.dispute_opened',
      disputeId: dispute.newDispute.id,
      paymentRecordId,
      actorId,
    });

    return dispute.newDispute;
  }

  /**
   * Queue dispute notification email to Super Admin(s).
   */
  private static async queueDisputeNotification(
    actorId: string,
    batchId: string,
    amount: number,
    staffComment: string,
  ) {
    // Look up staff name
    const [staff] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, actorId));

    // Look up batch info
    const [batch] = await db
      .select({ trancheName: paymentBatches.trancheName })
      .from(paymentBatches)
      .where(eq(paymentBatches.id, batchId));

    // Look up Super Admin emails
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(
        eq(roles.name, 'super_admin'),
        inArray(users.status, ['active', 'verified']),
      ));

    const staffName = staff?.fullName || 'Staff Member';
    const trancheName = batch?.trancheName || 'Unknown Tranche';

    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await queueDisputeNotificationEmail({
          to: admin.email,
          staffName,
          trancheName,
          amount,
          commentExcerpt: staffComment.substring(0, 100),
        }, actorId);
      } catch (err) {
        logger.warn({
          event: 'dispute.email_queue_failed',
          adminEmail: admin.email,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Get dispute by payment record ID.
   */
  static async getDisputeByRecordId(paymentRecordId: string) {
    const [dispute] = await db
      .select({
        id: paymentDisputes.id,
        paymentRecordId: paymentDisputes.paymentRecordId,
        status: paymentDisputes.status,
        staffComment: paymentDisputes.staffComment,
        adminResponse: paymentDisputes.adminResponse,
        resolvedAt: paymentDisputes.resolvedAt,
        reopenCount: paymentDisputes.reopenCount,
        createdAt: paymentDisputes.createdAt,
        updatedAt: paymentDisputes.updatedAt,
        openedByName: users.fullName,
      })
      .from(paymentDisputes)
      .leftJoin(users, eq(paymentDisputes.openedBy, users.id))
      .where(eq(paymentDisputes.paymentRecordId, paymentRecordId))
      .orderBy(desc(paymentDisputes.createdAt));

    return dispute ?? null;
  }

  /**
   * Get staff's own disputes with pagination.
   */
  static async getStaffDisputes(
    userId: string,
    filters?: { page?: number; limit?: number },
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    const disputes = await db
      .select({
        id: paymentDisputes.id,
        paymentRecordId: paymentDisputes.paymentRecordId,
        status: paymentDisputes.status,
        staffComment: paymentDisputes.staffComment,
        adminResponse: paymentDisputes.adminResponse,
        resolvedAt: paymentDisputes.resolvedAt,
        reopenCount: paymentDisputes.reopenCount,
        createdAt: paymentDisputes.createdAt,
        trancheName: paymentBatches.trancheName,
        amount: paymentRecords.amount,
      })
      .from(paymentDisputes)
      .innerJoin(paymentRecords, eq(paymentDisputes.paymentRecordId, paymentRecords.id))
      .innerJoin(paymentBatches, eq(paymentRecords.batchId, paymentBatches.id))
      .where(eq(paymentDisputes.openedBy, userId))
      .orderBy(desc(paymentDisputes.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentDisputes)
      .where(eq(paymentDisputes.openedBy, userId));

    return {
      data: disputes,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Story 6.6: Admin Dispute Resolution Queue
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get paginated dispute queue for Super Admin (AC1).
   * Joins payment_records → payment_batches → users for full context.
   */
  static async getDisputeQueue(filters?: {
    status?: string[];
    lgaId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    const staffAlias = users;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.status?.length) {
      conditions.push(inArray(paymentDisputes.status, filters.status as typeof paymentDisputes.status.enumValues));
    }
    if (filters?.lgaId) {
      conditions.push(eq(staffAlias.lgaId, filters.lgaId));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(paymentDisputes.createdAt, new Date(filters.dateFrom)));
    }
    if (filters?.dateTo) {
      conditions.push(lte(paymentDisputes.createdAt, new Date(filters.dateTo)));
    }
    if (filters?.search) {
      conditions.push(ilike(staffAlias.fullName, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const disputes = await db
      .select({
        id: paymentDisputes.id,
        paymentRecordId: paymentDisputes.paymentRecordId,
        status: paymentDisputes.status,
        staffComment: paymentDisputes.staffComment,
        adminResponse: paymentDisputes.adminResponse,
        reopenCount: paymentDisputes.reopenCount,
        createdAt: paymentDisputes.createdAt,
        resolvedAt: paymentDisputes.resolvedAt,
        // Payment details
        amount: paymentRecords.amount,
        trancheName: paymentBatches.trancheName,
        trancheNumber: paymentBatches.trancheNumber,
        bankReference: paymentBatches.bankReference,
        batchDate: paymentBatches.createdAt,
        // Staff info
        staffName: staffAlias.fullName,
        staffEmail: staffAlias.email,
        openedBy: paymentDisputes.openedBy,
      })
      .from(paymentDisputes)
      .innerJoin(paymentRecords, eq(paymentDisputes.paymentRecordId, paymentRecords.id))
      .innerJoin(paymentBatches, eq(paymentRecords.batchId, paymentBatches.id))
      .innerJoin(staffAlias, eq(paymentDisputes.openedBy, staffAlias.id))
      .where(whereClause)
      .orderBy(desc(paymentDisputes.createdAt))
      .limit(limit)
      .offset(offset);

    // Count query with same filters
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentDisputes)
      .innerJoin(paymentRecords, eq(paymentDisputes.paymentRecordId, paymentRecords.id))
      .innerJoin(paymentBatches, eq(paymentRecords.batchId, paymentBatches.id))
      .innerJoin(staffAlias, eq(paymentDisputes.openedBy, staffAlias.id));

    const [{ count }] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    return {
      data: disputes,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get dispute detail with full relations (AC2).
   */
  static async getDisputeDetail(disputeId: string) {
    // Single query with LEFT JOINs for lga, role, and scalar subquery for resolver name.
    // Reduces from 5 queries (main + 4 sequential) to 1 + 1 conditional evidence query.
    const [dispute] = await db
      .select({
        id: paymentDisputes.id,
        paymentRecordId: paymentDisputes.paymentRecordId,
        status: paymentDisputes.status,
        staffComment: paymentDisputes.staffComment,
        adminResponse: paymentDisputes.adminResponse,
        evidenceFileId: paymentDisputes.evidenceFileId,
        reopenCount: paymentDisputes.reopenCount,
        createdAt: paymentDisputes.createdAt,
        updatedAt: paymentDisputes.updatedAt,
        resolvedAt: paymentDisputes.resolvedAt,
        resolvedBy: paymentDisputes.resolvedBy,
        openedBy: paymentDisputes.openedBy,
        // Payment details
        amount: paymentRecords.amount,
        recordStatus: paymentRecords.status,
        // Batch details
        trancheName: paymentBatches.trancheName,
        trancheNumber: paymentBatches.trancheNumber,
        bankReference: paymentBatches.bankReference,
        batchDate: paymentBatches.createdAt,
        // Staff info
        staffName: users.fullName,
        staffEmail: users.email,
        staffLgaId: users.lgaId,
        staffRoleId: users.roleId,
        // Resolved via LEFT JOINs (previously separate queries)
        staffLgaName: lgas.name,
        staffRoleName: roles.name,
        // Resolver name via scalar subquery (avoids needing a table alias for users)
        resolvedByName: sql<string | null>`(SELECT full_name FROM users WHERE id = ${paymentDisputes.resolvedBy})`,
      })
      .from(paymentDisputes)
      .innerJoin(paymentRecords, eq(paymentDisputes.paymentRecordId, paymentRecords.id))
      .innerJoin(paymentBatches, eq(paymentRecords.batchId, paymentBatches.id))
      .innerJoin(users, eq(paymentDisputes.openedBy, users.id))
      .leftJoin(lgas, eq(users.lgaId, lgas.id))
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(paymentDisputes.id, disputeId));

    if (!dispute) {
      throw new AppError('NOT_FOUND', 'Dispute not found', 404);
    }

    // Fetch evidence file if exists (conditional — avoids unnecessary query)
    let evidenceFile = null;
    if (dispute.evidenceFileId) {
      const [file] = await db
        .select()
        .from(paymentFiles)
        .where(eq(paymentFiles.id, dispute.evidenceFileId));
      evidenceFile = file ?? null;
    }

    return {
      ...dispute,
      evidenceFile,
    };
  }

  /**
   * Get dispute queue statistics (AC1).
   * Returns aggregate counts: total open, pending, resolved this month, closed.
   */
  static async getDisputeStats() {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Single query with conditional COUNTs (replaces 4 separate queries)
    const [stats] = await db
      .select({
        totalOpen: sql<number>`count(*) FILTER (WHERE ${paymentDisputes.status} IN ('disputed', 'pending_resolution', 'reopened'))::int`,
        pending: sql<number>`count(*) FILTER (WHERE ${paymentDisputes.status} = 'pending_resolution')::int`,
        resolvedThisMonth: sql<number>`count(*) FILTER (WHERE ${paymentDisputes.status} = 'resolved' AND ${paymentDisputes.resolvedAt} >= ${firstOfMonth})::int`,
        closed: sql<number>`count(*) FILTER (WHERE ${paymentDisputes.status} = 'closed')::int`,
      })
      .from(paymentDisputes);

    return {
      totalOpen: stats.totalOpen,
      pending: stats.pending,
      resolvedThisMonth: stats.resolvedThisMonth,
      closed: stats.closed,
    };
  }

  /**
   * Acknowledge a dispute (AC3).
   * Transition: disputed → pending_resolution.
   */
  static async acknowledgeDispute(
    disputeId: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const result = await db.transaction(async (tx) => {
      // Lock dispute row
      const [dispute] = await tx
        .select({
          id: paymentDisputes.id,
          status: paymentDisputes.status,
          openedBy: paymentDisputes.openedBy,
          paymentRecordId: paymentDisputes.paymentRecordId,
        })
        .from(paymentDisputes)
        .where(eq(paymentDisputes.id, disputeId))
        .for('update');

      if (!dispute) {
        throw new AppError('NOT_FOUND', 'Dispute not found', 404);
      }

      if (dispute.status !== 'disputed') {
        throw new AppError(
          'INVALID_STATUS',
          `Cannot acknowledge dispute with status '${dispute.status}'. Expected 'disputed'.`,
          400,
        );
      }

      // Transition to pending_resolution
      const [updated] = await tx
        .update(paymentDisputes)
        .set({
          status: 'pending_resolution',
          updatedAt: new Date(),
        })
        .where(eq(paymentDisputes.id, disputeId))
        .returning();

      await AuditService.logActionTx(tx, {
        actorId,
        action: 'payment.dispute_acknowledged',
        targetResource: 'payment_dispute',
        targetId: disputeId,
        details: {
          previousStatus: 'disputed',
          newStatus: 'pending_resolution',
        },
        ipAddress,
        userAgent,
      });

      return { updated, openedBy: dispute.openedBy, paymentRecordId: dispute.paymentRecordId };
    });

    // Fire-and-forget: notify staff that dispute is being reviewed
    this.queueAcknowledgeNotification(result.openedBy, result.paymentRecordId).catch((err) => {
      logger.warn({
        event: 'dispute.acknowledge_notification_failed',
        disputeId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    // Real-time notification to staff via Socket.io
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${result.openedBy}`).emit('dispute:acknowledged', {
          disputeId,
          status: 'pending_resolution',
        });
      }
    } catch (err) {
      logger.warn({ event: 'dispute.socket_emit_failed', disputeId, error: (err as Error).message });
    }

    logger.info({
      event: 'remuneration.dispute_acknowledged',
      disputeId,
      actorId,
    });

    return result.updated;
  }

  /**
   * Queue acknowledge notification email to staff.
   */
  private static async queueAcknowledgeNotification(staffId: string, paymentRecordId: string) {
    const [staff] = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, staffId));

    if (!staff?.email) return;

    // Look up tranche info via payment record
    const [record] = await db
      .select({ batchId: paymentRecords.batchId, amount: paymentRecords.amount })
      .from(paymentRecords)
      .where(eq(paymentRecords.id, paymentRecordId));

    let trancheName = 'Unknown Tranche';
    if (record) {
      const [batch] = await db
        .select({ trancheName: paymentBatches.trancheName })
        .from(paymentBatches)
        .where(eq(paymentBatches.id, record.batchId));
      trancheName = batch?.trancheName ?? trancheName;
    }

    await queueDisputeResolutionEmail({
      staffEmail: staff.email,
      staffName: staff.fullName || 'Staff Member',
      trancheName,
      amount: record?.amount ?? 0,
      adminResponse: 'Your dispute has been acknowledged and is being reviewed.',
      hasEvidence: false,
      action: 'acknowledged',
    }, staffId);
  }

  /**
   * Resolve a dispute with admin response and optional evidence (AC4).
   * Transition: pending_resolution|reopened → resolved.
   */
  static async resolveDispute(
    disputeId: string,
    adminResponse: string,
    evidenceFile: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    let evidenceFileRecord: { id: string; s3Key: string } | null = null;

    // Upload evidence to S3 before transaction (if provided)
    if (evidenceFile) {
      const { client, bucketName } = createS3Client();
      const ext = evidenceFile.originalname.split('.').pop() || 'bin';
      const fileId = uuidv7();
      const s3Key = `dispute-evidence/${disputeId}/${fileId}.${ext}`;

      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: evidenceFile.buffer,
        ContentType: evidenceFile.mimetype,
      }));

      evidenceFileRecord = { id: fileId, s3Key };
    }

    const result = await db.transaction(async (tx) => {
      // Lock dispute row
      const [dispute] = await tx
        .select({
          id: paymentDisputes.id,
          status: paymentDisputes.status,
          openedBy: paymentDisputes.openedBy,
          paymentRecordId: paymentDisputes.paymentRecordId,
        })
        .from(paymentDisputes)
        .where(eq(paymentDisputes.id, disputeId))
        .for('update');

      if (!dispute) {
        throw new AppError('NOT_FOUND', 'Dispute not found', 404);
      }

      if (dispute.status !== 'pending_resolution' && dispute.status !== 'reopened') {
        throw new AppError(
          'INVALID_STATUS',
          `Cannot resolve dispute with status '${dispute.status}'. Expected 'pending_resolution' or 'reopened'.`,
          400,
        );
      }

      // Create payment_files record for evidence if uploaded
      let evidenceFileId: string | null = null;
      if (evidenceFileRecord && evidenceFile) {
        await tx.insert(paymentFiles).values({
          id: evidenceFileRecord.id,
          entityType: 'dispute_evidence',
          entityId: disputeId,
          originalFilename: evidenceFile.originalname,
          s3Key: evidenceFileRecord.s3Key,
          mimeType: evidenceFile.mimetype,
          sizeBytes: evidenceFile.size,
          uploadedBy: actorId,
        });
        evidenceFileId = evidenceFileRecord.id;
      }

      // Resolve dispute
      const [updated] = await tx
        .update(paymentDisputes)
        .set({
          status: 'resolved',
          adminResponse,
          resolvedBy: actorId,
          resolvedAt: new Date(),
          ...(evidenceFileId ? { evidenceFileId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(paymentDisputes.id, disputeId))
        .returning();

      await AuditService.logActionTx(tx, {
        actorId,
        action: 'payment.dispute_resolved',
        targetResource: 'payment_dispute',
        targetId: disputeId,
        details: {
          previousStatus: dispute.status,
          newStatus: 'resolved',
          hasEvidence: !!evidenceFileId,
          adminResponse: adminResponse.substring(0, 100),
        },
        ipAddress,
        userAgent,
      });

      return { updated, openedBy: dispute.openedBy, paymentRecordId: dispute.paymentRecordId };
    });

    // Fire-and-forget: notify staff of resolution
    this.queueResolveNotification(result.openedBy, result.paymentRecordId, adminResponse, !!evidenceFileRecord).catch((err) => {
      logger.warn({
        event: 'dispute.resolution_notification_failed',
        disputeId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    // Real-time notification to staff via Socket.io
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${result.openedBy}`).emit('dispute:resolved', {
          disputeId,
          status: 'resolved',
          adminResponse: adminResponse.substring(0, 100),
        });
      }
    } catch (err) {
      logger.warn({ event: 'dispute.socket_emit_failed', disputeId, error: (err as Error).message });
    }

    logger.info({
      event: 'remuneration.dispute_resolved',
      disputeId,
      actorId,
      hasEvidence: !!evidenceFileRecord,
    });

    return result.updated;
  }

  /**
   * Queue resolution notification email to staff.
   */
  private static async queueResolveNotification(
    staffId: string,
    paymentRecordId: string,
    adminResponse: string,
    hasEvidence: boolean,
  ) {
    const [staff] = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, staffId));

    if (!staff?.email) return;

    const [record] = await db
      .select({ batchId: paymentRecords.batchId, amount: paymentRecords.amount })
      .from(paymentRecords)
      .where(eq(paymentRecords.id, paymentRecordId));

    let trancheName = 'Unknown Tranche';
    if (record) {
      const [batch] = await db
        .select({ trancheName: paymentBatches.trancheName })
        .from(paymentBatches)
        .where(eq(paymentBatches.id, record.batchId));
      trancheName = batch?.trancheName ?? trancheName;
    }

    await queueDisputeResolutionEmail({
      staffEmail: staff.email,
      staffName: staff.fullName || 'Staff Member',
      trancheName,
      amount: record?.amount ?? 0,
      adminResponse,
      hasEvidence,
      action: 'resolved',
    }, staffId);
  }

  /**
   * Reopen a dispute (AC5).
   * Transition: resolved → reopened. Staff-only (original openedBy).
   */
  static async reopenDispute(
    disputeId: string,
    staffComment: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const result = await db.transaction(async (tx) => {
      // Lock dispute row
      const [dispute] = await tx
        .select({
          id: paymentDisputes.id,
          status: paymentDisputes.status,
          openedBy: paymentDisputes.openedBy,
          staffComment: paymentDisputes.staffComment,
          paymentRecordId: paymentDisputes.paymentRecordId,
        })
        .from(paymentDisputes)
        .where(eq(paymentDisputes.id, disputeId))
        .for('update');

      if (!dispute) {
        throw new AppError('NOT_FOUND', 'Dispute not found', 404);
      }

      if (dispute.status !== 'resolved') {
        throw new AppError(
          'INVALID_STATUS',
          `Cannot reopen dispute with status '${dispute.status}'. Expected 'resolved'.`,
          400,
        );
      }

      // Only the original staff member can reopen
      if (dispute.openedBy !== actorId) {
        throw new AppError('FORBIDDEN', 'Only the staff member who opened the dispute can reopen it', 403);
      }

      // Append reopen comment with separator
      const separator = '\n\n---\n';
      const reopenEntry = `[Reopened ${new Date().toISOString()}]\n${staffComment}`;
      const updatedComment = dispute.staffComment + separator + reopenEntry;

      const [updated] = await tx
        .update(paymentDisputes)
        .set({
          status: 'reopened',
          staffComment: updatedComment,
          reopenCount: sql`reopen_count + 1`,
          updatedAt: new Date(),
        })
        .where(eq(paymentDisputes.id, disputeId))
        .returning();

      await AuditService.logActionTx(tx, {
        actorId,
        action: 'payment.dispute_reopened',
        targetResource: 'payment_dispute',
        targetId: disputeId,
        details: {
          previousStatus: 'resolved',
          newStatus: 'reopened',
          reopenCount: updated.reopenCount,
          staffComment: staffComment.substring(0, 100),
        },
        ipAddress,
        userAgent,
      });

      return { updated, paymentRecordId: dispute.paymentRecordId };
    });

    // Fire-and-forget: notify Super Admin(s) of reopened dispute
    this.queueReopenNotification(actorId, result.paymentRecordId, staffComment).catch((err) => {
      logger.warn({
        event: 'dispute.reopen_notification_failed',
        disputeId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    logger.info({
      event: 'remuneration.dispute_reopened',
      disputeId,
      actorId,
    });

    return result.updated;
  }

  /**
   * Queue reopen notification to Super Admin(s).
   * Reuses queueDisputeNotificationEmail from Story 6-5.
   */
  private static async queueReopenNotification(
    staffId: string,
    paymentRecordId: string,
    staffComment: string,
  ) {
    const [staff] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, staffId));

    const [record] = await db
      .select({ batchId: paymentRecords.batchId, amount: paymentRecords.amount })
      .from(paymentRecords)
      .where(eq(paymentRecords.id, paymentRecordId));

    let trancheName = 'Unknown Tranche';
    if (record) {
      const [batch] = await db
        .select({ trancheName: paymentBatches.trancheName })
        .from(paymentBatches)
        .where(eq(paymentBatches.id, record.batchId));
      trancheName = batch?.trancheName ?? trancheName;
    }

    // Reuse existing admin notification mechanism (notify all Super Admins)
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(
        eq(roles.name, 'super_admin'),
        inArray(users.status, ['active', 'verified']),
      ));

    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await queueDisputeNotificationEmail({
          to: admin.email,
          staffName: staff?.fullName || 'Staff Member',
          trancheName,
          amount: record?.amount ?? 0,
          commentExcerpt: `[REOPENED] ${staffComment.substring(0, 90)}`,
        }, staffId);
      } catch (err) {
        logger.warn({
          event: 'dispute.reopen_email_failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Auto-close resolved disputes older than 30 days (AC6).
   * Transition: resolved (30+ days) → closed.
   * Called by the dispute-autoclose cron job.
   */
  static async autoCloseResolvedDisputes() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find disputes eligible for auto-close
    const eligible = await db
      .select({
        id: paymentDisputes.id,
        paymentRecordId: paymentDisputes.paymentRecordId,
      })
      .from(paymentDisputes)
      .where(and(
        eq(paymentDisputes.status, 'resolved'),
        lte(paymentDisputes.resolvedAt, thirtyDaysAgo),
      ));

    if (eligible.length === 0) {
      return { closedCount: 0 };
    }

    const disputeIds = eligible.map((d) => d.id);

    // Batch update in transaction with audit logging
    await db.transaction(async (tx) => {
      await tx
        .update(paymentDisputes)
        .set({
          status: 'closed',
          updatedAt: new Date(),
        })
        .where(inArray(paymentDisputes.id, disputeIds));

      // Audit log for each closed dispute
      for (const dispute of eligible) {
        await AuditService.logActionTx(tx, {
          actorId: null, // System actor — no user context for cron jobs
          action: 'payment.dispute_auto_closed',
          targetResource: 'payment_dispute',
          targetId: dispute.id,
          details: {
            previousStatus: 'resolved',
            newStatus: 'closed',
            reason: 'Auto-closed after 30 days of resolution',
          },
        });
      }
    });

    logger.info({
      event: 'remuneration.disputes_auto_closed',
      closedCount: eligible.length,
      disputeIds,
    });

    return { closedCount: eligible.length };
  }
}
