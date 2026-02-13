import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { db } from '../../db/index.js';
import {
  questionnaireForms,
  questionnaireFiles,
  questionnaireVersions,
} from '../../db/schema/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { QuestionnaireService } from '../questionnaire.service.js';
import { hashPassword } from '@oslsr/utils';
import { modulus11Generate } from '@oslsr/utils/src/validation';
import type { XlsformSurveyRow, XlsformChoiceRow } from '@oslsr/types';
import { uuidv7 } from 'uuidv7';

// Test user setup
let testUserId: string;
const testFormIds: string[] = [];

/**
 * Helper to create an XLSX buffer from sheet data
 */
function createXlsxBuffer(
  surveyData: Partial<XlsformSurveyRow>[],
  choicesData: Partial<XlsformChoiceRow>[],
  settingsData: Record<string, string>[]
): Buffer {
  const workbook = XLSX.utils.book_new();

  const surveySheet = XLSX.utils.json_to_sheet(surveyData);
  XLSX.utils.book_append_sheet(workbook, surveySheet, 'survey');

  const choicesSheet = XLSX.utils.json_to_sheet(choicesData);
  XLSX.utils.book_append_sheet(workbook, choicesSheet, 'choices');

  const settingsSheet = XLSX.utils.json_to_sheet(settingsData);
  XLSX.utils.book_append_sheet(workbook, settingsSheet, 'settings');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Create a valid OSLSR-compliant XLSForm for testing
 */
function createValidOslsrForm(formId: string = 'test_form', version: string = '1.0.0'): Buffer {
  const survey: Partial<XlsformSurveyRow>[] = [
    { type: 'start', name: 'start' },
    { type: 'end', name: 'end' },
    { type: 'select_one yes_no', name: 'consent_marketplace', label: 'Consent MP', required: 'yes' },
    { type: 'select_one yes_no', name: 'consent_enriched', label: 'Consent Enr', required: 'yes' },
    { type: 'text', name: 'nin', label: 'NIN', required: 'yes', constraint: "string-length(.) = 11 and regex(., '^[0-9]+$')" },
    { type: 'text', name: 'phone_number', label: 'Phone', required: 'yes', constraint: "regex(., '^[0][7-9][0-1][0-9]{8}$')" },
    { type: 'select_one lga_list', name: 'lga_id', label: 'LGA', required: 'yes' },
    { type: 'select_one experience_list', name: 'years_experience', label: 'Experience', required: 'yes' },
    { type: 'select_multiple skill_list', name: 'skills_possessed', label: 'Skills', required: 'yes' },
  ];

  // Create 33 LGAs
  const lgaChoices: Partial<XlsformChoiceRow>[] = [];
  for (let i = 1; i <= 33; i++) {
    lgaChoices.push({ list_name: 'lga_list', name: `lga_${i}`, label: `LGA ${i}` });
  }

  // Create 50+ skills
  const skillChoices: Partial<XlsformChoiceRow>[] = [];
  for (let i = 1; i <= 50; i++) {
    skillChoices.push({ list_name: 'skill_list', name: `skill_${i}`, label: `Skill ${i}` });
  }

  // Experience ranges
  const experienceChoices: Partial<XlsformChoiceRow>[] = [
    { list_name: 'experience_list', name: 'exp_0_1', label: 'Less than 1 year' },
    { list_name: 'experience_list', name: 'exp_1_3', label: '1-3 years' },
    { list_name: 'experience_list', name: 'exp_3_5', label: '3-5 years' },
    { list_name: 'experience_list', name: 'exp_5_10', label: '5-10 years' },
    { list_name: 'experience_list', name: 'exp_10_plus', label: 'More than 10 years' },
  ];

  // Employment types
  const empTypeChoices: Partial<XlsformChoiceRow>[] = [
    { list_name: 'emp_type', name: 'employed', label: 'Employed' },
    { list_name: 'emp_type', name: 'self_employed', label: 'Self-Employed' },
    { list_name: 'emp_type', name: 'unemployed', label: 'Unemployed' },
    { list_name: 'emp_type', name: 'student', label: 'Student' },
    { list_name: 'emp_type', name: 'retired', label: 'Retired' },
    { list_name: 'emp_type', name: 'contractor', label: 'Contractor' },
  ];

  const yesNoChoices: Partial<XlsformChoiceRow>[] = [
    { list_name: 'yes_no', name: 'yes', label: 'Yes' },
    { list_name: 'yes_no', name: 'no', label: 'No' },
  ];

  const choices = [...lgaChoices, ...skillChoices, ...experienceChoices, ...empTypeChoices, ...yesNoChoices];

  const settings = [{
    form_id: formId,
    version: version,
    form_title: 'Test OSLSR Form',
  }];

  return createXlsxBuffer(survey, choices, settings);
}

describe('QuestionnaireService', () => {
  beforeAll(async () => {
    // Explicit 30s timeout: bcrypt hashing + DB inserts can exceed default
    // hookTimeout under parallel thread-pool load
    // Ensure super_admin role exists
    await db.insert(roles).values([
      { name: 'super_admin', description: 'Super Admin' },
    ]).onConflictDoNothing();

    const superAdminRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'super_admin'),
    });

    // Create test user with proper UUID and NIN
    const userId = uuidv7();
    const timestamp = Date.now();
    // Generate a valid NIN using modulus-11
    const ninBase = String(timestamp % 10000000000).padStart(10, '0');
    let testNin: string;
    try {
      testNin = modulus11Generate(ninBase);
    } catch {
      // If check digit is 10, increment and retry
      testNin = modulus11Generate(String((parseInt(ninBase) + 1) % 10000000000).padStart(10, '0'));
    }

    await db.insert(users).values({
      id: userId,
      fullName: 'Test Admin',
      email: `test-admin-${timestamp}@example.com`,
      phone: `+23480${timestamp.toString().slice(-8)}`,
      nin: testNin,
      passwordHash: await hashPassword('TestPass123!'),
      roleId: superAdminRole!.id,
      status: 'active',
      emailVerified: true,
    });

    testUserId = userId;
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    if (testFormIds.length > 0) {
      // Delete audit logs for test forms
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, testFormIds));
      // Delete version records
      await db.delete(questionnaireVersions).where(inArray(questionnaireVersions.questionnaireFormId, testFormIds));
      // Files are cascade deleted via FK
      await db.delete(questionnaireForms).where(inArray(questionnaireForms.id, testFormIds));
    }
    // Delete test user
    if (testUserId) {
      await db.delete(auditLogs).where(eq(auditLogs.actorId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('uploadForm', () => {
    it('should upload a valid OSLSR form successfully', async () => {
      const buffer = createValidOslsrForm(`upload_test_${Date.now()}`, '1.0.0');
      const file = {
        buffer,
        originalname: 'test-form.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const result = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(result.id);

      expect(result.id).toBeDefined();
      expect(result.version).toBe('1.0.0');
      expect(result.status).toBe('draft');
      expect(result.validation.isValid).toBe(true);
    });

    it('should reject invalid file types', async () => {
      const file = {
        buffer: Buffer.from('not a form'),
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 10,
      };

      await expect(QuestionnaireService.uploadForm(file, testUserId))
        .rejects.toThrow('Only .xlsx and .xml files are allowed');
    });

    it('should reject duplicate files (same hash)', async () => {
      const formId = `dup_test_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'duplicate-test.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      // First upload should succeed
      const result1 = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(result1.id);

      // Second upload with same buffer should fail
      await expect(QuestionnaireService.uploadForm(file, testUserId))
        .rejects.toThrow('This file has already been uploaded');
    });

    it('should auto-increment version for same form_id', async () => {
      const formId = `version_test_${Date.now()}`;

      // First upload
      const buffer1 = createValidOslsrForm(formId, '1.0.0');
      const file1 = {
        buffer: buffer1,
        originalname: 'v1.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer1.length,
      };
      const result1 = await QuestionnaireService.uploadForm(file1, testUserId);
      testFormIds.push(result1.id);
      expect(result1.version).toBe('1.0.0');

      // Second upload with same form_id but different content
      // Modify the buffer slightly to get different hash
      const buffer2 = createValidOslsrForm(formId, '1.0.0');
      // Add a comment to make it different
      const workbook = XLSX.read(buffer2, { type: 'buffer' });
      workbook.Sheets['survey']['A100'] = { t: 's', v: 'comment' };
      const modifiedBuffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const file2 = {
        buffer: modifiedBuffer,
        originalname: 'v2.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: modifiedBuffer.length,
      };
      const result2 = await QuestionnaireService.uploadForm(file2, testUserId);
      testFormIds.push(result2.id);

      // Should have incremented patch since 1.0.0 exists
      expect(result2.version).toBe('1.0.1');
    });

    it('should reject forms that fail validation', async () => {
      // Create a form missing required fields
      const survey = [{ type: 'text', name: 'q1', label: 'Q1' }];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: `invalid_${Date.now()}`, version: '1.0', form_title: 'Invalid Form' }];
      const buffer = createXlsxBuffer(survey, choices, settings);

      const file = {
        buffer,
        originalname: 'invalid.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      await expect(QuestionnaireService.uploadForm(file, testUserId))
        .rejects.toThrow('Form validation failed');
    });

    it('should store change notes with version', async () => {
      const formId = `notes_test_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'with-notes.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const result = await QuestionnaireService.uploadForm(file, testUserId, 'Initial upload for testing');
      testFormIds.push(result.id);

      // Verify change notes were stored
      const versions = await QuestionnaireService.getFormVersions(formId);
      expect(versions[0].versions[0].changeNotes).toBe('Initial upload for testing');
    });
  });

  describe('getFormById', () => {
    it('should return form with version history', async () => {
      const formId = `getbyid_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'getbyid.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(uploaded.id);

      const result = await QuestionnaireService.getFormById(uploaded.id);

      expect(result).not.toBeNull();
      expect(result!.formId).toBe(formId);
      expect(result!.versions).toHaveLength(1);
      expect(result!.status).toBe('draft');
    });

    it('should return null for non-existent form', async () => {
      const result = await QuestionnaireService.getFormById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  describe('listForms', () => {
    it('should paginate results', async () => {
      const result = await QuestionnaireService.listForms({ page: 1, pageSize: 5 });

      expect(result.data).toBeDefined();
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(5);
      expect(result.data.length).toBeLessThanOrEqual(5);
    });

    it('should filter by status', async () => {
      const result = await QuestionnaireService.listForms({ status: 'draft' });

      result.data.forEach(form => {
        expect(form.status).toBe('draft');
      });
    });
  });

  describe('updateFormStatus', () => {
    it('should transition draft to published', async () => {
      const formId = `status_test_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'status-test.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(uploaded.id);

      await QuestionnaireService.updateFormStatus(uploaded.id, 'published', testUserId);

      const updated = await QuestionnaireService.getFormById(uploaded.id);
      expect(updated!.status).toBe('published');
    });

    it('should reject invalid status transitions', async () => {
      const formId = `invalid_trans_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'invalid-trans.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(uploaded.id);

      // Draft cannot go directly to deprecated
      await expect(QuestionnaireService.updateFormStatus(uploaded.id, 'deprecated', testUserId))
        .rejects.toThrow("Cannot transition from 'draft' to 'deprecated'");
    });

    it('should create audit log on status change', async () => {
      const formId = `audit_status_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'audit-status.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(uploaded.id);

      await QuestionnaireService.updateFormStatus(uploaded.id, 'published', testUserId);

      // Check audit log exists
      const logs = await db.query.auditLogs.findMany({
        where: eq(auditLogs.targetId, uploaded.id),
      });

      const statusChangeLog = logs.find(l => l.action === 'questionnaire.status_change');
      expect(statusChangeLog).toBeDefined();
      expect(statusChangeLog!.details).toMatchObject({
        previousStatus: 'draft',
        newStatus: 'published',
      });
    });
  });

  describe('deleteForm', () => {
    it('should delete draft forms', async () => {
      const formId = `delete_test_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'delete-test.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      // Don't add to testFormIds since we're deleting it

      await QuestionnaireService.deleteForm(uploaded.id, testUserId);

      const deleted = await QuestionnaireService.getFormById(uploaded.id);
      expect(deleted).toBeNull();
    });

    it('should reject deletion of published forms', async () => {
      const formId = `no_delete_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'no-delete.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(uploaded.id);

      await QuestionnaireService.updateFormStatus(uploaded.id, 'published', testUserId);

      await expect(QuestionnaireService.deleteForm(uploaded.id, testUserId))
        .rejects.toThrow('Only draft or archived forms can be deleted');
    });
  });

  describe('downloadForm', () => {
    it('should return the original file buffer', async () => {
      const formId = `download_test_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'download-test.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const uploaded = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(uploaded.id);

      const download = await QuestionnaireService.downloadForm(uploaded.id);

      expect(download.fileName).toBe('download-test.xlsx');
      expect(download.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(download.buffer.equals(buffer)).toBe(true);
    });
  });

  describe('auto-conversion to native format', () => {
    it('should store uploaded form with isNative=true and formSchema', async () => {
      const formId = `native_test_${Date.now()}`;
      const buffer = createValidOslsrForm(formId, '1.0.0');
      const file = {
        buffer,
        originalname: 'native-test.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const result = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(result.id);

      // Verify the DB record has isNative and formSchema set
      const form = await QuestionnaireService.getFormById(result.id);
      expect(form).not.toBeNull();
      expect(form!.isNative).toBe(true);
    });

    it('should produce a valid NativeFormSchema with sections from grouped form', async () => {
      // Create a form WITH begin_group/end_group to verify full conversion
      const survey: Partial<XlsformSurveyRow>[] = [
        { type: 'start', name: 'start' },
        { type: 'end', name: 'end' },
        { type: 'begin_group', name: 'grp_intro', label: 'Introduction' },
        { type: 'select_one yes_no', name: 'consent_marketplace', label: 'Consent MP', required: 'yes' },
        { type: 'select_one yes_no', name: 'consent_enriched', label: 'Consent Enr', required: 'yes' },
        { type: 'end_group', name: 'end_grp_intro' },
        { type: 'begin_group', name: 'grp_bio', label: 'Biographical' },
        { type: 'text', name: 'nin', label: 'NIN', required: 'yes', constraint: "string-length(.) = 11 and regex(., '^[0-9]+$')" },
        { type: 'text', name: 'phone_number', label: 'Phone', required: 'yes', constraint: "regex(., '^[0][7-9][0-1][0-9]{8}$')" },
        { type: 'select_one lga_list', name: 'lga_id', label: 'LGA', required: 'yes' },
        { type: 'select_one experience_list', name: 'years_experience', label: 'Experience', required: 'yes' },
        { type: 'select_multiple skill_list', name: 'skills_possessed', label: 'Skills', required: 'yes' },
        { type: 'end_group', name: 'end_grp_bio' },
      ];

      // Create 33 LGAs
      const lgaChoices: Partial<XlsformChoiceRow>[] = [];
      for (let i = 1; i <= 33; i++) {
        lgaChoices.push({ list_name: 'lga_list', name: `lga_${i}`, label: `LGA ${i}` });
      }

      // Create 50+ skills
      const skillChoices: Partial<XlsformChoiceRow>[] = [];
      for (let i = 1; i <= 50; i++) {
        skillChoices.push({ list_name: 'skill_list', name: `skill_${i}`, label: `Skill ${i}` });
      }

      const experienceChoices: Partial<XlsformChoiceRow>[] = [
        { list_name: 'experience_list', name: 'exp_0_1', label: 'Less than 1 year' },
        { list_name: 'experience_list', name: 'exp_1_3', label: '1-3 years' },
        { list_name: 'experience_list', name: 'exp_3_5', label: '3-5 years' },
        { list_name: 'experience_list', name: 'exp_5_10', label: '5-10 years' },
        { list_name: 'experience_list', name: 'exp_10_plus', label: 'More than 10 years' },
      ];

      const empTypeChoices: Partial<XlsformChoiceRow>[] = [
        { list_name: 'emp_type', name: 'employed', label: 'Employed' },
        { list_name: 'emp_type', name: 'self_employed', label: 'Self-Employed' },
        { list_name: 'emp_type', name: 'unemployed', label: 'Unemployed' },
        { list_name: 'emp_type', name: 'student', label: 'Student' },
        { list_name: 'emp_type', name: 'retired', label: 'Retired' },
        { list_name: 'emp_type', name: 'contractor', label: 'Contractor' },
      ];

      const yesNoChoices: Partial<XlsformChoiceRow>[] = [
        { list_name: 'yes_no', name: 'yes', label: 'Yes' },
        { list_name: 'yes_no', name: 'no', label: 'No' },
      ];

      const formId = `grouped_native_${Date.now()}`;
      const choices = [...lgaChoices, ...skillChoices, ...experienceChoices, ...empTypeChoices, ...yesNoChoices];
      const settings = [{ form_id: formId, version: '1.0.0', form_title: 'Grouped Test Form' }];
      const buffer = createXlsxBuffer(survey, choices, settings);

      const file = {
        buffer,
        originalname: 'grouped-native.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };

      const result = await QuestionnaireService.uploadForm(file, testUserId);
      testFormIds.push(result.id);

      // Verify native conversion happened correctly
      const dbRecord = await db.query.questionnaireForms.findFirst({
        where: eq(questionnaireForms.id, result.id),
      });

      expect(dbRecord!.isNative).toBe(true);
      expect(dbRecord!.formSchema).toBeDefined();

      const schema = dbRecord!.formSchema as any;
      expect(schema.sections).toHaveLength(2);
      expect(schema.sections[0].title).toBe('Introduction');
      expect(schema.sections[0].questions).toHaveLength(2);
      expect(schema.sections[1].title).toBe('Biographical');
      expect(schema.sections[1].questions).toHaveLength(5);
      expect(schema.choiceLists).toBeDefined();
      expect(Object.keys(schema.choiceLists).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('generateVersion', () => {
    it('should return requested version if no existing versions', () => {
      const result = QuestionnaireService.generateVersion('2.0.0', []);
      expect(result).toBe('2.0.0');
    });

    it('should return default version if no requested and no existing', () => {
      const result = QuestionnaireService.generateVersion('', []);
      expect(result).toBe('1.0.0');
    });

    it('should increment if requested version exists', () => {
      const result = QuestionnaireService.generateVersion('1.0.0', ['1.0.0']);
      expect(result).toBe('1.0.1');
    });

    it('should use requested version if higher than existing', () => {
      const result = QuestionnaireService.generateVersion('2.0.0', ['1.0.0', '1.1.0']);
      expect(result).toBe('2.0.0');
    });

    it('should auto-increment minor if requested is lower', () => {
      const result = QuestionnaireService.generateVersion('1.0.0', ['1.5.0']);
      expect(result).toBe('1.6.0');
    });
  });

  describe('computeFileHash', () => {
    it('should return consistent SHA-256 hash', () => {
      const buffer = Buffer.from('test content');
      const hash1 = QuestionnaireService.computeFileHash(buffer);
      const hash2 = QuestionnaireService.computeFileHash(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should return different hash for different content', () => {
      const hash1 = QuestionnaireService.computeFileHash(Buffer.from('content 1'));
      const hash2 = QuestionnaireService.computeFileHash(Buffer.from('content 2'));

      expect(hash1).not.toBe(hash2);
    });
  });
});
