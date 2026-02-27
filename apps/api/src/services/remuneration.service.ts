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
import { eq, and, isNull, desc, sql, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import { db } from '../db/index.js';
import { paymentBatches, paymentRecords, paymentFiles } from '../db/schema/remuneration.js';
import { users } from '../db/schema/users.js';
import { lgas } from '../db/schema/lgas.js';
import { roles } from '../db/schema/roles.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { AppError } from '@oslsr/utils';
import { queuePaymentNotificationEmail } from '../queues/email.queue.js';

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
      })
      .from(paymentRecords)
      .innerJoin(paymentBatches, eq(paymentRecords.batchId, paymentBatches.id))
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
}
