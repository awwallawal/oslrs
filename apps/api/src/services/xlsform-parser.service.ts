import * as XLSX from 'xlsx';
import { AppError } from '@oslsr/utils';
import type {
  ParsedXlsform,
  XlsformSurveyRow,
  XlsformChoiceRow,
  XlsformSettings,
  XlsformValidationResult,
  XlsformValidationIssue,
} from '@oslsr/types';
import {
  OSLSR_REQUIRED_FIELDS,
  OSLSR_CONDITIONAL_FIELDS,
  OSLSR_RECOMMENDED_FIELDS,
  OSLSR_REQUIRED_CHOICE_LISTS,
} from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'xlsform-parser-service' });

// Required columns for each worksheet
const REQUIRED_SURVEY_COLUMNS = ['type', 'name', 'label'];
const REQUIRED_CHOICES_COLUMNS = ['list_name', 'name', 'label'];
const REQUIRED_SETTINGS_FIELDS = ['form_id', 'version', 'form_title'];

// Valid XLSForm question types
const VALID_QUESTION_TYPES = [
  // Basic types
  'text', 'integer', 'decimal', 'date', 'time', 'datetime', 'note',
  // Select types
  'select_one', 'select_multiple', 'rank',
  // Media types
  'image', 'audio', 'video', 'file',
  // Location types
  'geopoint', 'geotrace', 'geoshape',
  // Structure types
  'begin_group', 'end_group', 'begin_repeat', 'end_repeat',
  // Metadata types
  'start', 'end', 'deviceid', 'phonenumber', 'username', 'email',
  'audit', 'calculate', 'hidden', 'xml-external',
  // Acknowledge type
  'acknowledge', 'range', 'barcode',
];

// Field types that require labels (user-facing input fields)
// These are shown to users in ODK Collect and MUST have labels
const TYPES_REQUIRING_LABELS = [
  'text', 'integer', 'decimal', 'date', 'time', 'datetime',
  'select_one', 'select_multiple', 'rank',
  'image', 'audio', 'video', 'file',
  'geopoint', 'geotrace', 'geoshape',
  'acknowledge', 'range', 'barcode',
];

/**
 * Types that do NOT require labels (metadata, structure, calculated fields).
 * Documented here for reference - these types are implicitly excluded from label validation
 * because they are not in TYPES_REQUIRING_LABELS above.
 *
 * Includes: start, end, deviceid, phonenumber, username, email,
 * audit, calculate, hidden, xml-external, begin_group, end_group,
 * begin_repeat, end_repeat, note (notes have their own display text)
 */

/**
 * XLSForm Parser Service
 * Parses and validates XLSForm files (.xlsx and .xml)
 */
export class XlsformParserService {
  /**
   * Parse an XLSX file buffer into structured form data
   */
  static parseXlsxFile(buffer: Buffer): ParsedXlsform {
    logger.info({ event: 'xlsform.parse_xlsx_started' });

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (error) {
      logger.error({ event: 'xlsform.parse_xlsx_failed', error: (error as Error).message });
      throw new AppError(
        'XLSFORM_PARSE_ERROR',
        'Failed to parse Excel file. Ensure it is a valid .xlsx file.',
        400
      );
    }

    // Check for required worksheets
    const sheetNames = workbook.SheetNames.map(s => s.toLowerCase());
    const hasRequiredSheets = ['survey', 'choices', 'settings'].every(
      required => sheetNames.includes(required)
    );

    if (!hasRequiredSheets) {
      const missing = ['survey', 'choices', 'settings'].filter(
        required => !sheetNames.includes(required)
      );
      throw new AppError(
        'XLSFORM_MISSING_WORKSHEETS',
        `Missing required worksheets: ${missing.join(', ')}`,
        400,
        { missingWorksheets: missing }
      );
    }

    // Find actual sheet names (case-insensitive)
    const findSheet = (name: string) =>
      workbook.SheetNames.find(s => s.toLowerCase() === name) || name;

    // Parse each worksheet
    const surveySheet = workbook.Sheets[findSheet('survey')];
    const choicesSheet = workbook.Sheets[findSheet('choices')];
    const settingsSheet = workbook.Sheets[findSheet('settings')];

    const survey = XLSX.utils.sheet_to_json<XlsformSurveyRow>(surveySheet, { defval: '' });
    const choices = XLSX.utils.sheet_to_json<XlsformChoiceRow>(choicesSheet, { defval: '' });
    const settingsRows = XLSX.utils.sheet_to_json<Record<string, string>>(settingsSheet, { defval: '' });

    // Settings is typically a single row
    const settings: XlsformSettings = {
      form_id: settingsRows[0]?.form_id || '',
      version: settingsRows[0]?.version || '',
      form_title: settingsRows[0]?.form_title || '',
      ...settingsRows[0],
    };

    logger.info({
      event: 'xlsform.parse_xlsx_success',
      surveyRows: survey.length,
      choiceRows: choices.length,
      formId: settings.form_id,
    });

    return { survey, choices, settings };
  }

  /**
   * Parse an XML file buffer (XForm format)
   */
  static parseXmlFile(buffer: Buffer): ParsedXlsform {
    logger.info({ event: 'xlsform.parse_xml_started' });

    const xmlString = buffer.toString('utf-8');

    // Basic XML validation
    if (!xmlString.includes('<h:html') && !xmlString.includes('<html')) {
      throw new AppError(
        'XLSFORM_INVALID_XML',
        'Invalid XForm XML: Missing root html element',
        400
      );
    }

    // Check for XForm namespace
    const hasXformsNamespace = xmlString.includes('http://www.w3.org/2002/xforms') ||
      xmlString.includes('xmlns:xf=') ||
      xmlString.includes('xmlns="http://www.w3.org/2002/xforms"');

    if (!hasXformsNamespace) {
      throw new AppError(
        'XLSFORM_INVALID_XML',
        'Invalid XForm XML: Missing XForms namespace declaration',
        400
      );
    }

    // Extract form ID from instance (look for id= within data or instance element)
    const formIdMatch = xmlString.match(/<data[^>]+id="([^"]+)"/) ||
      xmlString.match(/<instance[^>]*>[^<]*<[^>]+id="([^"]+)"/);
    // Extract version from data element (not XML declaration)
    const versionMatch = xmlString.match(/<data[^>]+version="([^"]+)"/) ||
      xmlString.match(/<instance[^>]*>[^<]*<[^>]+version="([^"]+)"/);
    const titleMatch = xmlString.match(/<h:title>([^<]+)<\/h:title>/) ||
      xmlString.match(/<title>([^<]+)<\/title>/);

    // For XML files, we return minimal parsed data
    // Full XForm parsing would require a proper XML parser
    const settings: XlsformSettings = {
      form_id: formIdMatch?.[1] || 'unknown',
      version: versionMatch?.[1] || '1',
      form_title: titleMatch?.[1] || 'Untitled Form',
    };

    logger.info({
      event: 'xlsform.parse_xml_success',
      formId: settings.form_id,
    });

    // XML parsing returns empty survey/choices - validation is done at XML level
    return {
      survey: [],
      choices: [],
      settings,
    };
  }

  /**
   * Validate XLSForm structure (worksheets, columns)
   */
  static validateStructure(formData: ParsedXlsform): XlsformValidationIssue[] {
    const issues: XlsformValidationIssue[] = [];

    // Validate settings fields
    for (const field of REQUIRED_SETTINGS_FIELDS) {
      if (!formData.settings[field]) {
        issues.push({
          worksheet: 'settings',
          column: field,
          message: `Required field '${field}' is missing in settings worksheet`,
          severity: 'error',
        });
      }
    }

    // Validate survey has required columns (check first row keys)
    if (formData.survey.length > 0) {
      const surveyColumns = Object.keys(formData.survey[0]);
      for (const col of REQUIRED_SURVEY_COLUMNS) {
        if (!surveyColumns.includes(col)) {
          issues.push({
            worksheet: 'survey',
            column: col,
            message: `Required column '${col}' is missing in survey worksheet`,
            severity: 'error',
          });
        }
      }
    } else {
      issues.push({
        worksheet: 'survey',
        message: 'Survey worksheet is empty',
        severity: 'error',
      });
    }

    // Validate choices has required columns
    if (formData.choices.length > 0) {
      const choicesColumns = Object.keys(formData.choices[0]);
      for (const col of REQUIRED_CHOICES_COLUMNS) {
        if (!choicesColumns.includes(col)) {
          issues.push({
            worksheet: 'choices',
            column: col,
            message: `Required column '${col}' is missing in choices worksheet`,
            severity: 'error',
          });
        }
      }
    }

    // Validate survey rows
    const fieldNames = new Set<string>();
    formData.survey.forEach((row, index) => {
      const rowNum = index + 2; // +2 for header row and 0-indexing

      // Skip empty rows
      if (!row.type && !row.name) return;

      // Validate question type
      if (row.type) {
        const baseType = row.type.split(' ')[0]; // Handle "select_one list_name"
        if (!VALID_QUESTION_TYPES.includes(baseType)) {
          // Check for typos
          const suggestion = XlsformParserService.suggestType(baseType);
          issues.push({
            worksheet: 'survey',
            row: rowNum,
            column: 'type',
            message: `Invalid question type '${baseType}'`,
            severity: 'error',
            suggestion: suggestion ? `Did you mean '${suggestion}'?` : undefined,
          });
        }
      }

      // Validate unique field names
      if (row.name) {
        if (fieldNames.has(row.name)) {
          issues.push({
            worksheet: 'survey',
            row: rowNum,
            column: 'name',
            field: row.name,
            message: `Duplicate field name '${row.name}'`,
            severity: 'error',
          });
        }
        fieldNames.add(row.name);
      }

      // Validate select questions have valid list references
      if (row.type?.startsWith('select_one') || row.type?.startsWith('select_multiple')) {
        const listName = row.type.split(' ')[1];
        if (listName) {
          const listExists = formData.choices.some(c => c.list_name === listName);
          if (!listExists) {
            issues.push({
              worksheet: 'survey',
              row: rowNum,
              column: 'type',
              message: `Choice list '${listName}' referenced but not found in choices worksheet`,
              severity: 'error',
            });
          }
        }
      }

      // Validate user-facing fields have labels (BF-2.5-2-1: Missing label validation)
      // ODK Central rejects forms with user-facing fields missing labels
      if (row.type) {
        const baseType = row.type.split(' ')[0].toLowerCase();
        const requiresLabel = TYPES_REQUIRING_LABELS.includes(baseType);
        const hasLabel = row.label && String(row.label).trim().length > 0;

        if (requiresLabel && !hasLabel) {
          issues.push({
            worksheet: 'survey',
            row: rowNum,
            column: 'label',
            field: row.name,
            message: `Field '${row.name}' (type: ${row.type}) requires a label. ODK Central will reject forms with missing labels on user-facing fields.`,
            severity: 'error',
            suggestion: `Add a descriptive label for this field in the 'label' column`,
          });
        }
      }
    });

    return issues;
  }

  /**
   * Validate OSLSR-specific schema requirements
   */
  static validateSchema(formData: ParsedXlsform): XlsformValidationIssue[] {
    const issues: XlsformValidationIssue[] = [];
    const fieldNames = new Set(formData.survey.map(row => row.name));

    // Check required OSLSR fields
    for (const requiredField of OSLSR_REQUIRED_FIELDS) {
      if (!fieldNames.has(requiredField)) {
        issues.push({
          worksheet: 'survey',
          field: requiredField,
          message: `Required OSLSR field '${requiredField}' not found`,
          severity: 'error',
        });
      }
    }

    // Check NIN constraint (11-digit validation)
    const ninField = formData.survey.find(row => row.name === 'nin');
    if (ninField && !ninField.constraint?.includes('11')) {
      issues.push({
        worksheet: 'survey',
        field: 'nin',
        message: "NIN field should have constraint for 11-digit validation",
        severity: 'warning',
        suggestion: "Add constraint: string-length(.) = 11 and regex(., '^[0-9]+$')",
      });
    }

    // Check phone_number constraint
    const phoneField = formData.survey.find(row => row.name === 'phone_number');
    if (phoneField && !phoneField.constraint?.includes('regex')) {
      issues.push({
        worksheet: 'survey',
        field: 'phone_number',
        message: "Phone field should have Nigerian mobile format constraint",
        severity: 'warning',
        suggestion: "Add constraint: regex(., '^[0][7-9][0-1][0-9]{8}$')",
      });
    }

    // Check conditional fields (warn if missing)
    for (const [fieldName, config] of Object.entries(OSLSR_CONDITIONAL_FIELDS)) {
      if (!fieldNames.has(fieldName)) {
        issues.push({
          worksheet: 'survey',
          field: fieldName,
          message: `Conditional field '${fieldName}' not found. ${config.description} will not be captured.`,
          severity: 'warning',
        });
      }
    }

    // Check recommended fields (warn if missing)
    for (const field of OSLSR_RECOMMENDED_FIELDS) {
      if (!fieldNames.has(field)) {
        issues.push({
          worksheet: 'survey',
          field: field,
          message: `Recommended field '${field}' not found`,
          severity: 'warning',
        });
      }
    }

    // Check required choice lists
    const choiceListNames = new Set(formData.choices.map(c => c.list_name));
    for (const [listName, config] of Object.entries(OSLSR_REQUIRED_CHOICE_LISTS)) {
      if (!choiceListNames.has(listName)) {
        issues.push({
          worksheet: 'choices',
          field: listName,
          message: `Required choice list '${listName}' (${config.description}) not found`,
          severity: 'error',
        });
      } else {
        // Count options in list
        const optionCount = formData.choices.filter(c => c.list_name === listName).length;
        if (optionCount < config.minOptions) {
          issues.push({
            worksheet: 'choices',
            field: listName,
            message: `Choice list '${listName}' has ${optionCount} options, minimum required is ${config.minOptions}`,
            severity: 'warning',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Full validation combining structure and schema checks.
   * For XML files (empty survey/choices), only settings are validated —
   * field-level and OSLSR schema validation require parsed worksheet data
   * which is only available from .xlsx files.
   */
  static validate(formData: ParsedXlsform, isXml = false): XlsformValidationResult {
    const allIssues: XlsformValidationIssue[] = [];

    if (isXml) {
      // XML files: validate settings only; field extraction requires a full XForm parser
      for (const field of REQUIRED_SETTINGS_FIELDS) {
        if (!formData.settings[field] || formData.settings[field] === 'unknown') {
          allIssues.push({
            worksheet: 'settings',
            column: field,
            message: `Required field '${field}' could not be extracted from XML`,
            severity: 'error',
          });
        }
      }
      allIssues.push({
        worksheet: 'survey',
        message: 'XML files receive namespace validation only. Upload .xlsx for full OSLSR schema validation.',
        severity: 'warning',
      });
    } else {
      allIssues.push(...this.validateStructure(formData));
      allIssues.push(...this.validateSchema(formData));
    }

    const errors = allIssues.filter(i => i.severity === 'error');
    const warnings = allIssues.filter(i => i.severity === 'warning');

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      formId: formData.settings.form_id,
      version: formData.settings.version,
      title: formData.settings.form_title,
    };
  }

  /**
   * Suggest correct type for common typos
   */
  private static suggestType(typo: string): string | null {
    const typoLower = typo.toLowerCase();
    const suggestions: Record<string, string> = {
      'textt': 'text',
      'txt': 'text',
      'intger': 'integer',
      'int': 'integer',
      'deciaml': 'decimal',
      'date_time': 'datetime',
      'slect_one': 'select_one',
      'select': 'select_one',
      'selectone': 'select_one',
      'select_1': 'select_one',
      'slect_multiple': 'select_multiple',
      'selectmultiple': 'select_multiple',
      'select_multi': 'select_multiple',
      'gps': 'geopoint',
      'location': 'geopoint',
      'geo': 'geopoint',
      'pic': 'image',
      'photo': 'image',
      'picture': 'image',
    };

    return suggestions[typoLower] || null;
  }
}
