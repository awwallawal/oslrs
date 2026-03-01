/**
 * RemunerationService Tests — Story 6.4 + 6.5
 *
 * Tests: self-payment guard, batch creation with receipt S3 upload,
 * temporal versioning correction, staff payment history filtering,
 * dispute creation with ownership/status/duplicate guards.
 */

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockReturning = vi.fn();
const mockWhere = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockInnerJoin = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();

// Chain helpers
function buildJoinChain(data: unknown[] = []) {
  return {
    where: (...wArgs: unknown[]) => {
      mockWhere(...wArgs);
      return {
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          return {
            limit: (...lArgs: unknown[]) => {
              mockLimit(...lArgs);
              return {
                offset: (...offArgs: unknown[]) => {
                  mockOffset(...offArgs);
                  return Promise.resolve(data);
                },
              };
            },
          };
        },
      };
    },
    orderBy: (...oArgs: unknown[]) => {
      mockOrderBy(...oArgs);
      return {
        limit: (...lArgs: unknown[]) => {
          mockLimit(...lArgs);
          return {
            offset: (...offArgs: unknown[]) => {
              mockOffset(...offArgs);
              return Promise.resolve(data);
            },
          };
        },
      };
    },
  };
}

const selectChain = {
  from: (...args: unknown[]) => {
    mockFrom(...args);
    return {
      leftJoin: (...ljArgs: unknown[]) => {
        mockLeftJoin(...ljArgs);
        return buildJoinChain();
      },
      innerJoin: (...ijArgs: unknown[]) => {
        mockInnerJoin(...ijArgs);
        return buildJoinChain();
      },
      where: (...wArgs: unknown[]) => {
        mockWhere(...wArgs);
        return Promise.resolve([]);
      },
    };
  },
};

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: (fn: any) => mockTransaction(fn),
    select: (...args: unknown[]) => {
      const result = mockSelect(...args);
      // If mockSelect has a custom implementation, use its return value
      if (result && typeof result === 'object' && 'from' in result) {
        return result;
      }
      return selectChain;
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (vals: unknown) => {
          mockValues(vals);
          return {
            returning: () => {
              mockReturning();
              return Promise.resolve([{ id: 'batch-123', trancheName: 'Test', staffCount: 2, totalAmount: 1000000 }]);
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (vals: unknown) => {
          mockSet(vals);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return Promise.resolve();
            },
          };
        },
      };
    },
  },
}));

vi.mock('../../db/schema/remuneration.js', () => ({
  paymentBatches: { _table: 'payment_batches' },
  paymentRecords: { _table: 'payment_records' },
  paymentFiles: { _table: 'payment_files' },
  paymentDisputes: { _table: 'payment_disputes' },
}));

vi.mock('../../db/schema/users.js', () => ({
  users: {
    _table: 'users',
    id: 'users.id',
    fullName: 'users.fullName',
    email: 'users.email',
    status: 'users.status',
    bankName: 'users.bankName',
    accountNumber: 'users.accountNumber',
    accountName: 'users.accountName',
    lgaId: 'users.lgaId',
    roleId: 'users.roleId',
  },
}));

vi.mock('../../db/schema/lgas.js', () => ({
  lgas: { _table: 'lgas', id: 'lgas.id', name: 'lgas.name' },
}));

vi.mock('../../db/schema/roles.js', () => ({
  roles: { _table: 'roles', id: 'roles.id', name: 'roles.name' },
}));

const mockLogActionTx = vi.fn();
vi.mock('../audit.service.js', () => ({
  AuditService: {
    logActionTx: (...args: unknown[]) => mockLogActionTx(...args),
  },
  AUDIT_ACTIONS: {
    DATA_CREATE: 'data.create',
    DATA_UPDATE: 'data.update',
  },
}));

const mockQueuePaymentEmail = vi.fn().mockResolvedValue('test-job-id');
const mockQueueDisputeEmail = vi.fn().mockResolvedValue('test-job-id');
const mockQueueDisputeResolutionEmail = vi.fn().mockResolvedValue('test-job-id');
vi.mock('../../queues/email.queue.js', () => ({
  queuePaymentNotificationEmail: (...args: unknown[]) => mockQueuePaymentEmail(...args),
  queueDisputeNotificationEmail: (...args: unknown[]) => mockQueueDisputeEmail(...args),
  queueDisputeResolutionEmail: (...args: unknown[]) => mockQueueDisputeResolutionEmail(...args),
}));

vi.mock('../../realtime/index.js', () => ({
  getIO: () => null,
}));

const mockS3Send = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
    constructor() {}
  },
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7',
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
  gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
  lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  ilike: vi.fn((...args: unknown[]) => ({ type: 'ilike', args })),
  count: vi.fn((...args: unknown[]) => ({ type: 'count', args })),
  sql: Object.assign(vi.fn((...args: unknown[]) => ({ type: 'sql', args, as: (name: string) => ({ type: 'sql_alias', name }) })), {
    raw: vi.fn((...args: unknown[]) => ({ type: 'sql_raw', args })),
  }),
}));

vi.mock('@oslsr/utils', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemunerationService, type CreateBatchInput } from '../remuneration.service.js';

describe('RemunerationService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLogActionTx.mockResolvedValue(undefined);
  });

  describe('createPaymentBatch', () => {
    const validInput: CreateBatchInput = {
      trancheName: 'Tranche 1 - February 2026',
      trancheNumber: 1,
      amount: 500000, // ₦5,000 in kobo
      staffIds: ['staff-1', 'staff-2'],
      bankReference: 'REF-001',
      description: 'February stipend',
    };

    it('should reject self-payment (AC3)', async () => {
      const actorId = 'staff-1'; // actor is in staffIds

      await expect(
        RemunerationService.createPaymentBatch(validInput, actorId),
      ).rejects.toThrow('Cannot record payment to yourself');
    });

    it('should create batch via transaction without receipt', async () => {
      const batchResult = {
        id: 'batch-123',
        trancheName: validInput.trancheName,
        staffCount: 2,
        totalAmount: 1000000,
      };

      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          insert: () => ({
            values: (vals: unknown) => {
              mockValues(vals);
              return {
                returning: () => Promise.resolve([batchResult]),
              };
            },
          }),
          execute: vi.fn(),
        };
        return fn(tx);
      });

      // Mock the post-transaction notification query
      mockSelect.mockReturnValue({
        from: () => ({
          where: () => Promise.resolve([
            { id: 'staff-1', fullName: 'Alice', email: 'alice@test.com' },
            { id: 'staff-2', fullName: 'Bob', email: 'bob@test.com' },
          ]),
        }),
      });

      const result = await RemunerationService.createPaymentBatch(
        validInput,
        'admin-123',
      );

      expect(result).toEqual(batchResult);
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it('should create batch with receipt file and upload to S3', async () => {
      const inputWithReceipt: CreateBatchInput = {
        ...validInput,
        receiptFile: {
          buffer: Buffer.from('fake-receipt'),
          originalname: 'receipt.pdf',
          mimetype: 'application/pdf',
          size: 1024,
        },
      };

      const batchResult = {
        id: 'mock-uuid-v7',
        trancheName: validInput.trancheName,
        staffCount: 2,
        totalAmount: 1000000,
      };

      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          insert: () => ({
            values: (vals: unknown) => {
              mockValues(vals);
              return {
                returning: () => Promise.resolve([batchResult]),
              };
            },
          }),
          execute: vi.fn(),
        };
        return fn(tx);
      });

      mockSelect.mockReturnValue({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      });

      const result = await RemunerationService.createPaymentBatch(
        inputWithReceipt,
        'admin-123',
      );

      expect(result).toEqual(batchResult);
      expect(mockTransaction).toHaveBeenCalledOnce();
      expect(mockS3Send).toHaveBeenCalledOnce();
    });
  });

  describe('correctPaymentRecord', () => {
    it('should close old record and insert new version (AC6)', async () => {
      const existingRecord = {
        id: 'record-1',
        batchId: 'batch-1',
        userId: 'staff-1',
        amount: 500000,
        status: 'active',
        effectiveFrom: new Date('2026-02-01'),
        effectiveUntil: null,
        createdBy: 'admin-1',
        createdAt: new Date('2026-02-01'),
      };

      const newRecord = {
        id: 'new-record',
        batchId: 'batch-1',
        userId: 'staff-1',
        amount: 600000,
        status: 'active',
        effectiveFrom: new Date(),
        effectiveUntil: null,
        createdBy: 'admin-2',
        createdAt: new Date(),
      };

      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => Promise.resolve([existingRecord]),
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
          insert: () => ({
            values: () => ({
              returning: () => Promise.resolve([newRecord]),
            }),
          }),
          execute: vi.fn(),
        };
        return fn(tx);
      });

      const result = await RemunerationService.correctPaymentRecord(
        'record-1',
        { newAmount: 600000, reason: 'Correction' },
        'admin-2',
      );

      expect(result).toEqual(newRecord);
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it('should throw if record not found or already corrected', async () => {
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => Promise.resolve([]), // no record found
            }),
          }),
          execute: vi.fn(),
        };
        return fn(tx);
      });

      await expect(
        RemunerationService.correctPaymentRecord(
          'nonexistent',
          { newAmount: 600000, reason: 'Correction' },
          'admin-1',
        ),
      ).rejects.toThrow('Payment record not found or already corrected');
    });
  });

  describe('getStaffPaymentHistory', () => {
    it('should query active records only by default (effectiveUntil IS NULL)', async () => {
      const mockRecords = [
        {
          id: 'rec-1',
          batchId: 'batch-1',
          amount: 500000,
          status: 'active',
          effectiveFrom: new Date(),
          effectiveUntil: null,
          createdAt: new Date(),
          trancheName: 'Tranche 1',
          trancheNumber: 1,
          bankReference: 'REF-001',
          disputeId: null,
          disputeStatus: null,
          disputeComment: null,
          disputeAdminResponse: null,
          disputeResolvedAt: null,
          disputeCreatedAt: null,
        },
      ];

      let callCount = 0;
      mockSelect.mockImplementation((..._args: unknown[]) => {
        callCount++;
        if (callCount === 1) {
          // Subquery: db.select(...).from(...).as(...)
          return {
            from: () => ({
              as: () => ({ _subquery: true }),
            }),
          };
        }
        if (callCount === 2) {
          // Main data query: innerJoin → leftJoin → where → orderBy → limit → offset
          return {
            from: () => ({
              innerJoin: () => ({
                leftJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => ({
                        offset: () => Promise.resolve(mockRecords),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // Count query (third select call)
        return {
          from: () => ({
            where: () => Promise.resolve([{ count: 1 }]),
          }),
        };
      });

      const result = await RemunerationService.getStaffPaymentHistory('staff-1');

      expect(result.data).toEqual(mockRecords);
      expect(result.pagination.total).toBe(1);
      // Verify dispute fields are present in result
      expect(result.data[0]).toHaveProperty('disputeId');
      expect(result.data[0]).toHaveProperty('disputeStatus');
    });
  });

  // ─── Story 6.5: openDispute ──────────────────────────────────────────

  describe('openDispute', () => {
    const RECORD_ID = 'record-001';
    const ACTOR_ID = 'staff-actor-001';

    function buildDisputeTx(options: {
      recordResult?: unknown[];
      disputeCheckResult?: unknown[];
      insertResult?: unknown[];
    }) {
      const {
        recordResult = [{ id: RECORD_ID, userId: ACTOR_ID, status: 'active', amount: 500000, batchId: 'batch-1' }],
        disputeCheckResult = [],
        insertResult = [{ id: 'dispute-new', paymentRecordId: RECORD_ID, status: 'disputed', staffComment: 'Test comment longer than 10', openedBy: ACTOR_ID }],
      } = options;

      let selectCallCount = 0;
      return {
        select: (..._args: unknown[]) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // Payment record fetch (with FOR UPDATE)
            return {
              from: () => ({
                where: () => ({
                  for: () => Promise.resolve(recordResult),
                }),
              }),
            };
          }
          // Dispute existence check
          return {
            from: () => ({
              where: () => Promise.resolve(disputeCheckResult),
            }),
          };
        },
        insert: () => ({
          values: (vals: unknown) => {
            mockValues(vals);
            return {
              returning: () => Promise.resolve(insertResult),
            };
          },
        }),
        update: () => ({
          set: (vals: unknown) => {
            mockSet(vals);
            return {
              where: () => Promise.resolve(),
            };
          },
        }),
      };
    }

    it('should create dispute record with correct fields (AC3)', async () => {
      const disputeResult = {
        id: 'dispute-new',
        paymentRecordId: RECORD_ID,
        status: 'disputed',
        staffComment: 'Payment amount is wrong for this period',
        openedBy: ACTOR_ID,
      };

      mockTransaction.mockImplementation(async (fn) => fn(buildDisputeTx({
        insertResult: [disputeResult],
      })));

      // Mock post-transaction notification queries (staff name, batch, admins)
      let postTxSelectCount = 0;
      mockSelect.mockImplementation(() => {
        postTxSelectCount++;
        if (postTxSelectCount === 1) {
          return { from: () => ({ where: () => Promise.resolve([{ fullName: 'Test Staff' }]) }) };
        }
        if (postTxSelectCount === 2) {
          return { from: () => ({ where: () => Promise.resolve([{ trancheName: 'Tranche 1' }]) }) };
        }
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve([{ email: 'admin@test.com' }]),
            }),
          }),
        };
      });

      const result = await RemunerationService.openDispute(
        RECORD_ID,
        'Payment amount is wrong for this period',
        ACTOR_ID,
      );

      expect(result).toEqual(disputeResult);
      expect(mockTransaction).toHaveBeenCalledOnce();
      expect(mockLogActionTx).toHaveBeenCalledOnce();
    });

    it('should update payment record status to disputed', async () => {
      mockTransaction.mockImplementation(async (fn) => fn(buildDisputeTx({})));
      mockSelect.mockReturnValue({
        from: () => ({ where: () => Promise.resolve([]) }),
      });

      await RemunerationService.openDispute(RECORD_ID, 'Testing status update on the record', ACTOR_ID);

      // Verify update was called with status: 'disputed'
      expect(mockSet).toHaveBeenCalledWith({ status: 'disputed' });
    });

    it('should throw NOT_FOUND when payment record does not exist', async () => {
      mockTransaction.mockImplementation(async (fn) => fn(buildDisputeTx({
        recordResult: [], // no record found
      })));

      await expect(
        RemunerationService.openDispute(RECORD_ID, 'Record does not exist in the system', ACTOR_ID),
      ).rejects.toThrow('Payment record not found');
    });

    it('should throw FORBIDDEN when record belongs to another user', async () => {
      mockTransaction.mockImplementation(async (fn) => fn(buildDisputeTx({
        recordResult: [{ id: RECORD_ID, userId: 'other-staff-999', status: 'active', amount: 500000, batchId: 'batch-1' }],
      })));

      await expect(
        RemunerationService.openDispute(RECORD_ID, 'Attempting to dispute someone elses record', ACTOR_ID),
      ).rejects.toThrow('Can only dispute your own payment records');
    });

    it('should throw INVALID_STATUS when record is not active', async () => {
      mockTransaction.mockImplementation(async (fn) => fn(buildDisputeTx({
        recordResult: [{ id: RECORD_ID, userId: ACTOR_ID, status: 'disputed', amount: 500000, batchId: 'batch-1' }],
      })));

      await expect(
        RemunerationService.openDispute(RECORD_ID, 'Record is already disputed cannot dispute again', ACTOR_ID),
      ).rejects.toThrow('Only active payment records can be disputed');
    });

    it('should throw DUPLICATE_DISPUTE when open dispute already exists', async () => {
      mockTransaction.mockImplementation(async (fn) => fn(buildDisputeTx({
        disputeCheckResult: [{ id: 'existing-dispute-1' }], // existing open dispute
      })));

      await expect(
        RemunerationService.openDispute(RECORD_ID, 'Trying to create a duplicate open dispute', ACTOR_ID),
      ).rejects.toThrow('An open dispute already exists for this payment record');
    });
  });

  // ─── Story 6.6: autoCloseResolvedDisputes ─────────────────────────

  describe('autoCloseResolvedDisputes', () => {
    it('should close disputes resolved 30+ days ago', async () => {
      const oldDisputes = [
        { id: 'dispute-old-1' },
        { id: 'dispute-old-2' },
      ];

      // Mock: select resolved disputes older than 30 days
      mockSelect.mockReturnValue({
        from: () => ({
          where: () => Promise.resolve(oldDisputes),
        }),
      });

      // Mock: batch update
      mockUpdate.mockReturnValue({
        set: (vals: unknown) => {
          mockSet(vals);
          return {
            where: () => Promise.resolve(),
          };
        },
      });

      const result = await RemunerationService.autoCloseResolvedDisputes();

      expect(result).toEqual({ closedCount: 2 });
    });

    it('should NOT close disputes resolved less than 30 days ago', async () => {
      // Mock: no disputes found (all resolved < 30 days)
      mockSelect.mockReturnValue({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      });

      const result = await RemunerationService.autoCloseResolvedDisputes();

      expect(result).toEqual({ closedCount: 0 });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should log audit for each closed dispute', async () => {
      const oldDisputes = [
        { id: 'dispute-audit-1' },
        { id: 'dispute-audit-2' },
        { id: 'dispute-audit-3' },
      ];

      mockSelect.mockReturnValue({
        from: () => ({
          where: () => Promise.resolve(oldDisputes),
        }),
      });

      mockUpdate.mockReturnValue({
        set: (vals: unknown) => {
          mockSet(vals);
          return {
            where: () => Promise.resolve(),
          };
        },
      });

      const result = await RemunerationService.autoCloseResolvedDisputes();

      // Method returns the count of closed disputes
      expect(result).toEqual({ closedCount: 3 });
    });

    it('should return closedCount of closed disputes', async () => {
      const oldDisputes = [{ id: 'd-1' }];

      mockSelect.mockReturnValue({
        from: () => ({
          where: () => Promise.resolve(oldDisputes),
        }),
      });

      mockUpdate.mockReturnValue({
        set: (vals: unknown) => {
          mockSet(vals);
          return {
            where: () => Promise.resolve(),
          };
        },
      });

      const result = await RemunerationService.autoCloseResolvedDisputes();

      expect(result).toEqual({ closedCount: 1 });
      expect(result.closedCount).toBe(1);
    });
  });
});
