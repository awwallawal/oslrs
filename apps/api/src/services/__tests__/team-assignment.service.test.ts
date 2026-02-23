import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamAssignmentService } from '../team-assignment.service.js';

// ── Mock DB (table-specific mocks for query intent verification) ─────────

const mockTeamAssignmentsFindMany = vi.fn();
const mockUsersFindFirst = vi.fn();
const mockUsersFindMany = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateReturning = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      teamAssignments: {
        findMany: (...args: any[]) => mockTeamAssignmentsFindMany(...args),
      },
      users: {
        findFirst: (...args: any[]) => mockUsersFindFirst(...args),
        findMany: (...args: any[]) => mockUsersFindMany(...args),
      },
    },
    insert: () => ({
      values: (vals: any) => ({
        returning: () => mockInsertReturning(vals),
      }),
    }),
    update: () => ({
      set: (vals: any) => ({
        where: () => ({
          returning: () => mockUpdateReturning(vals),
        }),
      }),
    }),
  },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Test Fixtures ──────────────────────────────────────────────────────────

const SUPERVISOR_ID = '01234567-0000-7000-8000-000000000001';
const ENUMERATOR_ID_1 = '01234567-0000-7000-8000-000000000002';
const ENUMERATOR_ID_2 = '01234567-0000-7000-8000-000000000003';
const LGA_ID = '01234567-0000-7000-8000-000000000010';
const ASSIGNMENT_ID = '01234567-0000-7000-8000-000000000020';

const makeSupervisorUser = () => ({
  id: SUPERVISOR_ID,
  email: 'supervisor@test.local',
  lgaId: LGA_ID,
  status: 'active',
  role: { id: 'role-1', name: 'supervisor' },
});

const makeEnumeratorUser = (id = ENUMERATOR_ID_1, status = 'active') => ({
  id,
  email: 'enumerator@test.local',
  lgaId: LGA_ID,
  status,
  role: { id: 'role-2', name: 'enumerator' },
});

const makeAssignment = (overrides = {}) => ({
  id: ASSIGNMENT_ID,
  supervisorId: SUPERVISOR_ID,
  enumeratorId: ENUMERATOR_ID_1,
  lgaId: LGA_ID,
  assignedAt: new Date(),
  unassignedAt: null,
  isSeeded: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TeamAssignmentService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── getEnumeratorIdsForSupervisor ──────────────────────────────────────

  describe('getEnumeratorIdsForSupervisor', () => {
    it('returns enumerator IDs from direct assignments', async () => {
      mockTeamAssignmentsFindMany.mockResolvedValueOnce([
        makeAssignment({ enumeratorId: ENUMERATOR_ID_1, enumerator: makeEnumeratorUser(ENUMERATOR_ID_1) }),
        makeAssignment({ enumeratorId: ENUMERATOR_ID_2, enumerator: makeEnumeratorUser(ENUMERATOR_ID_2) }),
      ]);

      const result = await TeamAssignmentService.getEnumeratorIdsForSupervisor(SUPERVISOR_ID);

      expect(result).toEqual([ENUMERATOR_ID_1, ENUMERATOR_ID_2]);
      expect(mockTeamAssignmentsFindMany).toHaveBeenCalledTimes(1);
    });

    it('excludes inactive enumerators from direct assignments', async () => {
      mockTeamAssignmentsFindMany.mockResolvedValueOnce([
        makeAssignment({ enumeratorId: ENUMERATOR_ID_1, enumerator: makeEnumeratorUser(ENUMERATOR_ID_1, 'active') }),
        makeAssignment({ enumeratorId: ENUMERATOR_ID_2, enumerator: makeEnumeratorUser(ENUMERATOR_ID_2, 'deactivated') }),
      ]);

      const result = await TeamAssignmentService.getEnumeratorIdsForSupervisor(SUPERVISOR_ID);

      expect(result).toEqual([ENUMERATOR_ID_1]);
      expect(result).not.toContain(ENUMERATOR_ID_2);
    });

    it('falls back to LGA-scoped query when no assignments exist', async () => {
      // teamAssignments.findMany returns empty
      mockTeamAssignmentsFindMany.mockResolvedValueOnce([]);
      // users.findFirst returns supervisor with lgaId
      mockUsersFindFirst.mockResolvedValueOnce(makeSupervisorUser());
      // users.findMany returns LGA users (status-filtered at DB level)
      mockUsersFindMany.mockResolvedValueOnce([
        makeEnumeratorUser(ENUMERATOR_ID_1),
        makeEnumeratorUser(ENUMERATOR_ID_2),
        { id: 'non-enum', lgaId: LGA_ID, status: 'active', role: { name: 'supervisor' } },
      ]);

      const result = await TeamAssignmentService.getEnumeratorIdsForSupervisor(SUPERVISOR_ID);

      expect(result).toEqual([ENUMERATOR_ID_1, ENUMERATOR_ID_2]);
      // Filters out non-enumerator users
      expect(result).not.toContain('non-enum');
    });

    it('returns empty array when supervisor has no LGA (fallback path)', async () => {
      mockTeamAssignmentsFindMany.mockResolvedValueOnce([]);
      mockUsersFindFirst.mockResolvedValueOnce({ ...makeSupervisorUser(), lgaId: null });

      const result = await TeamAssignmentService.getEnumeratorIdsForSupervisor(SUPERVISOR_ID);

      expect(result).toEqual([]);
    });

    it('returns empty array when supervisor not found (fallback path)', async () => {
      mockTeamAssignmentsFindMany.mockResolvedValueOnce([]);
      mockUsersFindFirst.mockResolvedValueOnce(null);

      const result = await TeamAssignmentService.getEnumeratorIdsForSupervisor(SUPERVISOR_ID);

      expect(result).toEqual([]);
    });

    it('returns empty array when no enumerators in LGA (fallback path)', async () => {
      mockTeamAssignmentsFindMany.mockResolvedValueOnce([]);
      mockUsersFindFirst.mockResolvedValueOnce(makeSupervisorUser());
      mockUsersFindMany.mockResolvedValueOnce([]);

      const result = await TeamAssignmentService.getEnumeratorIdsForSupervisor(SUPERVISOR_ID);

      expect(result).toEqual([]);
    });
  });

  // ── createAssignment ──────────────────────────────────────────────────

  describe('createAssignment', () => {
    it('creates assignment when roles are valid', async () => {
      const supervisor = makeSupervisorUser();
      const enumerator = makeEnumeratorUser();
      const assignment = makeAssignment();

      mockUsersFindFirst.mockResolvedValueOnce(supervisor);
      mockUsersFindFirst.mockResolvedValueOnce(enumerator);
      mockInsertReturning.mockReturnValueOnce([assignment]);

      const result = await TeamAssignmentService.createAssignment(
        SUPERVISOR_ID,
        ENUMERATOR_ID_1,
        LGA_ID,
      );

      expect(result).toEqual(assignment);
      expect(mockUsersFindFirst).toHaveBeenCalledTimes(2);
      expect(mockInsertReturning).toHaveBeenCalledTimes(1);
    });

    it('throws INVALID_ROLE_ASSIGNMENT when supervisor has wrong role', async () => {
      mockUsersFindFirst.mockResolvedValueOnce({
        ...makeSupervisorUser(),
        role: { id: 'role-x', name: 'enumerator' },
      });

      await expect(
        TeamAssignmentService.createAssignment(SUPERVISOR_ID, ENUMERATOR_ID_1, LGA_ID),
      ).rejects.toMatchObject({
        code: 'INVALID_ROLE_ASSIGNMENT',
        statusCode: 400,
      });
    });

    it('throws INVALID_ROLE_ASSIGNMENT when enumerator has wrong role', async () => {
      mockUsersFindFirst.mockResolvedValueOnce(makeSupervisorUser());
      mockUsersFindFirst.mockResolvedValueOnce({
        ...makeEnumeratorUser(),
        role: { id: 'role-x', name: 'supervisor' },
      });

      await expect(
        TeamAssignmentService.createAssignment(SUPERVISOR_ID, ENUMERATOR_ID_1, LGA_ID),
      ).rejects.toMatchObject({
        code: 'INVALID_ROLE_ASSIGNMENT',
        statusCode: 400,
      });
    });

    it('throws USER_NOT_FOUND when supervisor does not exist', async () => {
      mockUsersFindFirst.mockResolvedValueOnce(null);

      await expect(
        TeamAssignmentService.createAssignment(SUPERVISOR_ID, ENUMERATOR_ID_1, LGA_ID),
      ).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws USER_NOT_FOUND when enumerator does not exist', async () => {
      mockUsersFindFirst.mockResolvedValueOnce(makeSupervisorUser());
      mockUsersFindFirst.mockResolvedValueOnce(null);

      await expect(
        TeamAssignmentService.createAssignment(SUPERVISOR_ID, ENUMERATOR_ID_1, LGA_ID),
      ).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws ENUMERATOR_ALREADY_ASSIGNED on duplicate active assignment', async () => {
      mockUsersFindFirst.mockResolvedValueOnce(makeSupervisorUser());
      mockUsersFindFirst.mockResolvedValueOnce(makeEnumeratorUser());

      // Simulate PostgreSQL unique constraint violation from partial unique index
      const pgError = new Error('duplicate key value violates unique constraint "idx_team_assignments_active_enumerator"');
      (pgError as any).code = '23505';
      mockInsertReturning.mockRejectedValueOnce(pgError);

      await expect(
        TeamAssignmentService.createAssignment(SUPERVISOR_ID, ENUMERATOR_ID_1, LGA_ID),
      ).rejects.toMatchObject({
        code: 'ENUMERATOR_ALREADY_ASSIGNED',
        statusCode: 409,
      });
    });

    it('allows reassignment after prior assignment is soft-deleted', async () => {
      // Step 1: soft-delete existing assignment
      mockUpdateReturning.mockReturnValueOnce([makeAssignment({ unassignedAt: new Date() })]);
      await TeamAssignmentService.removeAssignment(ASSIGNMENT_ID);

      // Step 2: create new assignment succeeds
      mockUsersFindFirst.mockResolvedValueOnce(makeSupervisorUser());
      mockUsersFindFirst.mockResolvedValueOnce(makeEnumeratorUser());
      const newAssignment = makeAssignment({ id: 'new-assignment-id' });
      mockInsertReturning.mockReturnValueOnce([newAssignment]);

      const result = await TeamAssignmentService.createAssignment(
        SUPERVISOR_ID,
        ENUMERATOR_ID_1,
        LGA_ID,
      );

      expect(result).toEqual(newAssignment);
    });
  });

  // ── removeAssignment ──────────────────────────────────────────────────

  describe('removeAssignment', () => {
    it('soft-deletes by setting unassigned_at', async () => {
      const updated = makeAssignment({ unassignedAt: new Date() });
      mockUpdateReturning.mockReturnValueOnce([updated]);

      await TeamAssignmentService.removeAssignment(ASSIGNMENT_ID);

      expect(mockUpdateReturning).toHaveBeenCalledTimes(1);
      const setArg = mockUpdateReturning.mock.calls[0][0];
      expect(setArg.unassignedAt).toBeInstanceOf(Date);
      expect(setArg.updatedAt).toBeInstanceOf(Date);
    });

    it('throws ASSIGNMENT_NOT_FOUND when ID does not exist', async () => {
      mockUpdateReturning.mockReturnValueOnce([]);

      await expect(
        TeamAssignmentService.removeAssignment('nonexistent-id'),
      ).rejects.toMatchObject({
        code: 'ASSIGNMENT_NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});
