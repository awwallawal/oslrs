import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { XlsformParserService } from '../xlsform-parser.service.js';
import type { XlsformSurveyRow, XlsformChoiceRow } from '@oslsr/types';

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
 * Create a valid OSLSR-compliant XLSForm
 */
function createValidOslsrForm(): Buffer {
  const survey: Partial<XlsformSurveyRow>[] = [
    { type: 'start', name: 'start' },
    { type: 'end', name: 'end' },
    { type: 'note', name: 'intro', label: 'Welcome to the OSLSR Registration Survey' },
    { type: 'select_one yes_no', name: 'consent_marketplace', label: 'Do you consent to marketplace?', required: 'yes' },
    { type: 'select_one yes_no', name: 'consent_enriched', label: 'Do you consent to enriched data?', required: 'yes' },
    { type: 'text', name: 'nin', label: 'National Identification Number', required: 'yes', constraint: "string-length(.) = 11 and regex(., '^[0-9]+$')" },
    { type: 'text', name: 'phone_number', label: 'Phone Number', required: 'yes', constraint: "regex(., '^[0][7-9][0-1][0-9]{8}$')" },
    { type: 'select_one lga_list', name: 'lga_id', label: 'LGA of Residence', required: 'yes' },
    { type: 'select_one experience_list', name: 'years_experience', label: 'Years of Experience', required: 'yes' },
    { type: 'select_multiple skill_list', name: 'skills_possessed', label: 'Skills', required: 'yes' },
    { type: 'select_one emp_type', name: 'employment_type', label: 'Employment Type' },
  ];

  // Create 33 LGAs for Oyo State
  const lgaChoices: Partial<XlsformChoiceRow>[] = [];
  const lgaNames = [
    'Afijio', 'Akinyele', 'Atiba', 'Atisbo', 'Egbeda', 'Ibadan North',
    'Ibadan North-East', 'Ibadan North-West', 'Ibadan South-East', 'Ibadan South-West',
    'Ibarapa Central', 'Ibarapa East', 'Ibarapa North', 'Ido', 'Irepo', 'Iseyin',
    'Itesiwaju', 'Iwajowa', 'Kajola', 'Lagelu', 'Ogbomosho North', 'Ogbomosho South',
    'Ogo Oluwa', 'Olorunsogo', 'Oluyole', 'Ona Ara', 'Orelope', 'Ori Ire',
    'Oyo East', 'Oyo West', 'Saki East', 'Saki West', 'Surulere',
  ];
  lgaNames.forEach((name, idx) => {
    lgaChoices.push({ list_name: 'lga_list', name: `lga_${idx + 1}`, label: name });
  });

  // Create 50+ skills
  const skillChoices: Partial<XlsformChoiceRow>[] = [];
  const skillNames = [
    'Carpentry', 'Plumbing', 'Electrical', 'Welding', 'Masonry', 'Painting',
    'Tiling', 'Roofing', 'HVAC', 'Auto Mechanic', 'Tailoring', 'Fashion Design',
    'Hairdressing', 'Barbing', 'Makeup Artistry', 'Catering', 'Baking', 'Event Planning',
    'Photography', 'Videography', 'Graphic Design', 'Web Development', 'Mobile App Dev',
    'Data Entry', 'Typing', 'Bookkeeping', 'Accounting', 'Teaching', 'Tutoring',
    'Nursing', 'Midwifery', 'Pharmacy Tech', 'Lab Tech', 'Driving', 'Logistics',
    'Security', 'Cleaning', 'Laundry', 'Farming', 'Livestock', 'Fishery',
    'Furniture Making', 'Upholstery', 'Shoe Making', 'Leather Works', 'Jewelry Making',
    'Beadwork', 'Pottery', 'Sculpting', 'Music', 'Dance',
  ];
  skillNames.forEach((name, idx) => {
    skillChoices.push({ list_name: 'skill_list', name: `skill_${idx + 1}`, label: name });
  });

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

  // Yes/No choices
  const yesNoChoices: Partial<XlsformChoiceRow>[] = [
    { list_name: 'yes_no', name: 'yes', label: 'Yes' },
    { list_name: 'yes_no', name: 'no', label: 'No' },
  ];

  const choices = [...lgaChoices, ...skillChoices, ...experienceChoices, ...empTypeChoices, ...yesNoChoices];

  const settings = [{
    form_id: 'oslsr_registration_v1',
    version: '2024.01',
    form_title: 'OSLSR Artisan Registration Form',
  }];

  return createXlsxBuffer(survey, choices, settings);
}

/**
 * Create a minimal valid XLSForm (not OSLSR-compliant)
 */
function createMinimalValidForm(): Buffer {
  const survey: Partial<XlsformSurveyRow>[] = [
    { type: 'text', name: 'full_name', label: 'Full Name' },
    { type: 'integer', name: 'age', label: 'Age' },
  ];

  const choices: Partial<XlsformChoiceRow>[] = [
    { list_name: 'gender', name: 'male', label: 'Male' },
    { list_name: 'gender', name: 'female', label: 'Female' },
  ];

  const settings = [{
    form_id: 'minimal_form',
    version: '1.0',
    form_title: 'Minimal Test Form',
  }];

  return createXlsxBuffer(survey, choices, settings);
}

describe('XlsformParserService', () => {
  describe('parseXlsxFile', () => {
    it('should parse a valid XLSX file successfully', () => {
      const buffer = createMinimalValidForm();
      const result = XlsformParserService.parseXlsxFile(buffer);

      expect(result.survey).toHaveLength(2);
      expect(result.choices).toHaveLength(2);
      expect(result.settings.form_id).toBe('minimal_form');
      expect(result.settings.version).toBe('1.0');
      expect(result.settings.form_title).toBe('Minimal Test Form');
    });

    it('should parse survey rows with all fields', () => {
      const buffer = createMinimalValidForm();
      const result = XlsformParserService.parseXlsxFile(buffer);

      expect(result.survey[0]).toMatchObject({
        type: 'text',
        name: 'full_name',
        label: 'Full Name',
      });
    });

    it('should throw error for invalid buffer (missing worksheets)', () => {
      // Note: xlsx library is very forgiving and parses most invalid data as empty workbooks.
      // The error surfaces as "missing required worksheets" rather than parse error.
      const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

      expect(() => XlsformParserService.parseXlsxFile(invalidBuffer))
        .toThrow('Missing required worksheets');
    });

    it('should throw error for missing survey worksheet', () => {
      const workbook = XLSX.utils.book_new();
      const choicesSheet = XLSX.utils.json_to_sheet([{ list_name: 'test', name: 'a', label: 'A' }]);
      const settingsSheet = XLSX.utils.json_to_sheet([{ form_id: 'test', version: '1', form_title: 'Test' }]);
      XLSX.utils.book_append_sheet(workbook, choicesSheet, 'choices');
      XLSX.utils.book_append_sheet(workbook, settingsSheet, 'settings');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      expect(() => XlsformParserService.parseXlsxFile(buffer))
        .toThrow('Missing required worksheets: survey');
    });

    it('should throw error for missing choices worksheet', () => {
      const workbook = XLSX.utils.book_new();
      const surveySheet = XLSX.utils.json_to_sheet([{ type: 'text', name: 'q1', label: 'Q1' }]);
      const settingsSheet = XLSX.utils.json_to_sheet([{ form_id: 'test', version: '1', form_title: 'Test' }]);
      XLSX.utils.book_append_sheet(workbook, surveySheet, 'survey');
      XLSX.utils.book_append_sheet(workbook, settingsSheet, 'settings');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      expect(() => XlsformParserService.parseXlsxFile(buffer))
        .toThrow('Missing required worksheets: choices');
    });

    it('should handle case-insensitive worksheet names', () => {
      const workbook = XLSX.utils.book_new();
      const surveySheet = XLSX.utils.json_to_sheet([{ type: 'text', name: 'q1', label: 'Q1' }]);
      const choicesSheet = XLSX.utils.json_to_sheet([{ list_name: 'test', name: 'a', label: 'A' }]);
      const settingsSheet = XLSX.utils.json_to_sheet([{ form_id: 'test', version: '1', form_title: 'Test' }]);
      XLSX.utils.book_append_sheet(workbook, surveySheet, 'SURVEY');
      XLSX.utils.book_append_sheet(workbook, choicesSheet, 'Choices');
      XLSX.utils.book_append_sheet(workbook, settingsSheet, 'Settings');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = XlsformParserService.parseXlsxFile(buffer);
      expect(result.survey).toHaveLength(1);
      expect(result.settings.form_id).toBe('test');
    });
  });

  describe('parseXmlFile', () => {
    it('should parse a valid XForm XML file', () => {
      const xmlContent = `<?xml version="1.0"?>
        <h:html xmlns="http://www.w3.org/2002/xforms" xmlns:h="http://www.w3.org/1999/xhtml">
          <h:head>
            <h:title>Test Form</h:title>
            <model>
              <instance>
                <data id="test_form" version="2024.01">
                </data>
              </instance>
            </model>
          </h:head>
          <h:body></h:body>
        </h:html>`;

      const buffer = Buffer.from(xmlContent, 'utf-8');
      const result = XlsformParserService.parseXmlFile(buffer);

      expect(result.settings.form_id).toBe('test_form');
      expect(result.settings.version).toBe('2024.01');
      expect(result.settings.form_title).toBe('Test Form');
      expect(result.survey).toHaveLength(0); // XML parsing returns empty survey
      expect(result.choices).toHaveLength(0);
    });

    it('should throw error for invalid XML without html root', () => {
      const invalidXml = Buffer.from('<invalid>not xform</invalid>', 'utf-8');

      expect(() => XlsformParserService.parseXmlFile(invalidXml))
        .toThrow('Missing root html element');
    });

    it('should throw error for XML without XForms namespace', () => {
      const xmlWithoutNamespace = Buffer.from(`<?xml version="1.0"?>
        <h:html xmlns:h="http://www.w3.org/1999/xhtml">
          <h:head><h:title>Test</h:title></h:head>
          <h:body></h:body>
        </h:html>`, 'utf-8');

      expect(() => XlsformParserService.parseXmlFile(xmlWithoutNamespace))
        .toThrow('Missing XForms namespace');
    });
  });

  describe('validateStructure', () => {
    it('should return no errors for valid structure', () => {
      const buffer = createMinimalValidForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateStructure(formData);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('should detect missing settings fields', () => {
      const survey = [{ type: 'text', name: 'q1', label: 'Q1' }];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: '', version: '', form_title: '' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const settingsErrors = issues.filter(
        i => i.worksheet === 'settings' && i.severity === 'error'
      );
      expect(settingsErrors.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect invalid question types', () => {
      const survey = [{ type: 'invalid_type', name: 'q1', label: 'Q1' }];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const typeErrors = issues.filter(
        i => i.column === 'type' && i.severity === 'error'
      );
      expect(typeErrors.length).toBe(1);
      expect(typeErrors[0].message).toContain("Invalid question type 'invalid_type'");
    });

    it('should suggest corrections for common typos', () => {
      const survey = [{ type: 'textt', name: 'q1', label: 'Q1' }];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const typeErrors = issues.filter(i => i.column === 'type');
      expect(typeErrors[0].suggestion).toContain("'text'");
    });

    it('should detect duplicate field names', () => {
      const survey = [
        { type: 'text', name: 'duplicate_name', label: 'Q1' },
        { type: 'integer', name: 'duplicate_name', label: 'Q2' },
      ];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const duplicateErrors = issues.filter(
        i => i.message.includes('Duplicate field name')
      );
      expect(duplicateErrors.length).toBe(1);
    });

    it('should detect missing choice list references', () => {
      const survey = [
        { type: 'select_one nonexistent_list', name: 'q1', label: 'Q1' },
      ];
      const choices = [{ list_name: 'other_list', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const listErrors = issues.filter(
        i => i.message.includes('not found in choices')
      );
      expect(listErrors.length).toBe(1);
      expect(listErrors[0].message).toContain('nonexistent_list');
    });

    it('should detect empty survey worksheet', () => {
      const workbook = XLSX.utils.book_new();
      const surveySheet = XLSX.utils.json_to_sheet([]);
      const choicesSheet = XLSX.utils.json_to_sheet([{ list_name: 'test', name: 'a', label: 'A' }]);
      const settingsSheet = XLSX.utils.json_to_sheet([{ form_id: 'test', version: '1', form_title: 'Test' }]);
      XLSX.utils.book_append_sheet(workbook, surveySheet, 'survey');
      XLSX.utils.book_append_sheet(workbook, choicesSheet, 'choices');
      XLSX.utils.book_append_sheet(workbook, settingsSheet, 'settings');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const emptyErrors = issues.filter(
        i => i.message.includes('Survey worksheet is empty')
      );
      expect(emptyErrors.length).toBe(1);
    });

    it('should detect missing labels on user-facing fields (BF-2.5-2-1)', () => {
      // This test verifies the fix for the ODK Central rejection issue
      // where geopoint and other user-facing fields without labels cause publish failure
      const survey = [
        { type: 'geopoint', name: 'gps_location', label: '' }, // Missing label - should error
        { type: 'text', name: 'name', label: 'Full Name' }, // Has label - OK
        { type: 'integer', name: 'age', label: '' }, // Missing label - should error
        { type: 'calculate', name: 'calc', label: '' }, // Calculate doesn't need label - OK
        { type: 'start', name: 'start_time', label: '' }, // Metadata doesn't need label - OK
      ];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      // Should have errors for gps_location and age (missing labels)
      const labelErrors = issues.filter(
        i => i.column === 'label' && i.severity === 'error'
      );
      expect(labelErrors.length).toBe(2);

      const fieldNames = labelErrors.map(e => e.field);
      expect(fieldNames).toContain('gps_location');
      expect(fieldNames).toContain('age');

      // Error messages should be helpful
      expect(labelErrors[0].message).toContain('requires a label');
      expect(labelErrors[0].message).toContain('ODK Central will reject');
    });

    it('should not require labels for metadata and structure types', () => {
      const survey = [
        { type: 'start', name: 'start_time', label: '' },
        { type: 'end', name: 'end_time', label: '' },
        { type: 'deviceid', name: 'device_id', label: '' },
        { type: 'calculate', name: 'calc_field', label: '' },
        { type: 'begin_group', name: 'grp1', label: 'Group 1' },
        { type: 'text', name: 'q1', label: 'Question' },
        { type: 'end_group', name: 'grp1', label: '' },
      ];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      // Should NOT have label errors for metadata types
      const labelErrors = issues.filter(
        i => i.column === 'label' && i.severity === 'error'
      );
      expect(labelErrors.length).toBe(0);
    });

    it('should detect missing labels on all user-facing input types', () => {
      // Test all types that require labels
      const survey = [
        { type: 'text', name: 'f1', label: '' },
        { type: 'integer', name: 'f2', label: '' },
        { type: 'decimal', name: 'f3', label: '' },
        { type: 'date', name: 'f4', label: '' },
        { type: 'geopoint', name: 'f5', label: '' },
        { type: 'image', name: 'f6', label: '' },
        { type: 'select_one list', name: 'f7', label: '' },
        { type: 'select_multiple list', name: 'f8', label: '' },
      ];
      const choices = [{ list_name: 'list', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);

      const issues = XlsformParserService.validateStructure(formData);

      const labelErrors = issues.filter(
        i => i.column === 'label' && i.severity === 'error'
      );
      // All 8 fields should have missing label errors
      expect(labelErrors.length).toBe(8);
    });
  });

  describe('validateSchema (OSLSR compliance)', () => {
    it('should validate OSLSR-compliant form with no errors', () => {
      const buffer = createValidOslsrForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateSchema(formData);

      const errors = issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('should detect missing required OSLSR fields', () => {
      const buffer = createMinimalValidForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateSchema(formData);

      const errors = issues.filter(i => i.severity === 'error');
      // Should have errors for: consent_marketplace, consent_enriched, nin, phone_number, lga_id, years_experience, skills_possessed
      expect(errors.length).toBeGreaterThanOrEqual(7);

      const missingFields = errors.map(e => e.field);
      expect(missingFields).toContain('nin');
      expect(missingFields).toContain('phone_number');
      expect(missingFields).toContain('lga_id');
    });

    it('should warn about missing NIN constraint', () => {
      // Create form with NIN but without proper constraint
      const survey = [
        { type: 'text', name: 'nin', label: 'NIN' },
        { type: 'text', name: 'phone_number', label: 'Phone' },
        { type: 'select_one yes_no', name: 'consent_marketplace', label: 'Consent MP' },
        { type: 'select_one yes_no', name: 'consent_enriched', label: 'Consent Enr' },
        { type: 'select_one lga_list', name: 'lga_id', label: 'LGA' },
        { type: 'select_one exp_list', name: 'years_experience', label: 'Experience' },
        { type: 'select_multiple skill_list', name: 'skills_possessed', label: 'Skills' },
      ];

      // Minimal choices to pass structure validation
      const choices: Partial<XlsformChoiceRow>[] = [
        { list_name: 'yes_no', name: 'yes', label: 'Yes' },
        { list_name: 'yes_no', name: 'no', label: 'No' },
      ];

      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateSchema(formData);

      const ninWarnings = issues.filter(
        i => i.field === 'nin' && i.severity === 'warning'
      );
      expect(ninWarnings.length).toBe(1);
      expect(ninWarnings[0].message).toContain('11-digit validation');
    });

    it('should warn about missing phone_number regex constraint', () => {
      const survey = [
        { type: 'text', name: 'nin', label: 'NIN', constraint: "string-length(.) = 11" },
        { type: 'text', name: 'phone_number', label: 'Phone' }, // No regex constraint
        { type: 'select_one yes_no', name: 'consent_marketplace', label: 'Consent MP' },
        { type: 'select_one yes_no', name: 'consent_enriched', label: 'Consent Enr' },
        { type: 'select_one lga_list', name: 'lga_id', label: 'LGA' },
        { type: 'select_one exp_list', name: 'years_experience', label: 'Experience' },
        { type: 'select_multiple skill_list', name: 'skills_possessed', label: 'Skills' },
      ];

      const choices: Partial<XlsformChoiceRow>[] = [
        { list_name: 'yes_no', name: 'yes', label: 'Yes' },
      ];

      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateSchema(formData);

      const phoneWarnings = issues.filter(
        i => i.field === 'phone_number' && i.severity === 'warning'
      );
      expect(phoneWarnings.length).toBe(1);
      expect(phoneWarnings[0].message).toContain('Nigerian mobile format');
    });

    it('should detect missing required choice lists', () => {
      const buffer = createMinimalValidForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateSchema(formData);

      const choiceListErrors = issues.filter(
        i => i.worksheet === 'choices' && i.severity === 'error'
      );

      const missingLists = choiceListErrors.map(e => e.field);
      expect(missingLists).toContain('lga_list');
      expect(missingLists).toContain('skill_list');
      expect(missingLists).toContain('experience_list');
      expect(missingLists).toContain('emp_type');
    });

    it('should warn about insufficient options in choice lists', () => {
      // Create form with lga_list but only 10 options (need 33)
      const survey = [
        { type: 'select_one lga_list', name: 'lga_id', label: 'LGA' },
      ];

      const choices: Partial<XlsformChoiceRow>[] = [];
      for (let i = 1; i <= 10; i++) {
        choices.push({ list_name: 'lga_list', name: `lga_${i}`, label: `LGA ${i}` });
      }

      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateSchema(formData);

      const lgaWarnings = issues.filter(
        i => i.field === 'lga_list' && i.severity === 'warning'
      );
      expect(lgaWarnings.length).toBe(1);
      expect(lgaWarnings[0].message).toContain('10 options');
      expect(lgaWarnings[0].message).toContain('33');
    });
  });

  describe('validate (full validation)', () => {
    it('should return isValid=true for OSLSR-compliant form', () => {
      const buffer = createValidOslsrForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const result = XlsformParserService.validate(formData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.formId).toBe('oslsr_registration_v1');
      expect(result.version).toBe('2024.01');
      expect(result.title).toBe('OSLSR Artisan Registration Form');
    });

    it('should return isValid=false when errors exist', () => {
      const buffer = createMinimalValidForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const result = XlsformParserService.validate(formData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should separate errors and warnings', () => {
      const buffer = createMinimalValidForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const result = XlsformParserService.validate(formData);

      // Should have both errors and warnings
      expect(result.errors.every(e => e.severity === 'error')).toBe(true);
      expect(result.warnings.every(w => w.severity === 'warning')).toBe(true);
    });

    it('should return warnings even when valid', () => {
      const buffer = createValidOslsrForm();
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const result = XlsformParserService.validate(formData);

      // Form is valid but may have warnings about conditional/recommended fields
      expect(result.isValid).toBe(true);
      // Check structure - warnings should be array
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should validate XML files with limited checks (isXml=true)', () => {
      const xmlContent = `<?xml version="1.0"?>
        <h:html xmlns="http://www.w3.org/2002/xforms" xmlns:h="http://www.w3.org/1999/xhtml">
          <h:head>
            <h:title>Test Form</h:title>
            <model>
              <instance>
                <data id="test_form" version="2024.01">
                </data>
              </instance>
            </model>
          </h:head>
          <h:body></h:body>
        </h:html>`;

      const buffer = Buffer.from(xmlContent, 'utf-8');
      const formData = XlsformParserService.parseXmlFile(buffer);
      const result = XlsformParserService.validate(formData, true);

      // Should be valid - settings are extractable
      expect(result.isValid).toBe(true);
      // Should have a warning about limited XML validation
      expect(result.warnings.some(w => w.message.includes('XML files receive namespace validation only'))).toBe(true);
    });

    it('should reject XML with unknown form_id when isXml=true', () => {
      // XML without a data id= attribute
      const xmlContent = `<?xml version="1.0"?>
        <h:html xmlns="http://www.w3.org/2002/xforms" xmlns:h="http://www.w3.org/1999/xhtml">
          <h:head><h:title>Test</h:title></h:head>
          <h:body></h:body>
        </h:html>`;

      const buffer = Buffer.from(xmlContent, 'utf-8');
      const formData = XlsformParserService.parseXmlFile(buffer);
      const result = XlsformParserService.validate(formData, true);

      // 'unknown' form_id should fail
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.column === 'form_id')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle select_multiple type correctly', () => {
      const survey = [
        { type: 'select_multiple options', name: 'multi', label: 'Select Multiple' },
      ];
      const choices = [
        { list_name: 'options', name: 'a', label: 'A' },
        { list_name: 'options', name: 'b', label: 'B' },
      ];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateStructure(formData);

      // Should not have type error for select_multiple
      const typeErrors = issues.filter(
        i => i.column === 'type' && i.field === 'multi'
      );
      expect(typeErrors).toHaveLength(0);
    });

    it('should handle group types correctly', () => {
      const survey = [
        { type: 'begin_group', name: 'group1', label: 'Group 1' },
        { type: 'text', name: 'q1', label: 'Question 1' },
        { type: 'end_group', name: 'group1' },
      ];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateStructure(formData);

      const groupErrors = issues.filter(
        i => i.column === 'type' && (i.row === 2 || i.row === 4)
      );
      expect(groupErrors).toHaveLength(0);
    });

    it('should skip empty rows in validation', () => {
      const survey = [
        { type: 'text', name: 'q1', label: 'Q1' },
        { type: '', name: '', label: '' }, // Empty row
        { type: 'integer', name: 'q2', label: 'Q2' },
      ];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateStructure(formData);

      // Should not have errors for empty row
      const emptyRowErrors = issues.filter(i => i.row === 3);
      expect(emptyRowErrors).toHaveLength(0);
    });

    it('should handle metadata types correctly', () => {
      const survey = [
        { type: 'start', name: 'start' },
        { type: 'end', name: 'end' },
        { type: 'deviceid', name: 'device' },
        { type: 'username', name: 'user' },
        { type: 'calculate', name: 'calc', calculation: '1+1' },
      ];
      const choices = [{ list_name: 'test', name: 'a', label: 'A' }];
      const settings = [{ form_id: 'test', version: '1', form_title: 'Test' }];
      const buffer = createXlsxBuffer(survey, choices, settings);
      const formData = XlsformParserService.parseXlsxFile(buffer);
      const issues = XlsformParserService.validateStructure(formData);

      const metadataErrors = issues.filter(
        i => i.column === 'type' && ['start', 'end', 'deviceid', 'username', 'calculate'].includes(String(i.field))
      );
      expect(metadataErrors).toHaveLength(0);
    });
  });
});
