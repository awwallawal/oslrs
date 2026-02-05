/**
 * XLSForm Validation Script
 *
 * Analyzes an XLSForm (.xlsx) file for common issues before uploading to ODK Central.
 *
 * Usage: npx tsx apps/api/scripts/validate-xlsform.ts <path-to-xlsx>
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const filePath = process.argv[2];

if (!filePath) {
  console.log('Usage: npx tsx apps/api/scripts/validate-xlsform.ts <path-to-xlsx>');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
  console.log(`❌ File not found: ${absolutePath}`);
  process.exit(1);
}

console.log(`\n📋 Validating XLSForm: ${absolutePath}\n`);
console.log('='.repeat(60));

// Read the workbook
const workbook = XLSX.readFile(absolutePath);

console.log(`\n📑 Sheets found: ${workbook.SheetNames.join(', ')}\n`);

// Check required sheets
const requiredSheets = ['survey', 'choices'];
const missingSheets = requiredSheets.filter(s => !workbook.SheetNames.includes(s));

if (missingSheets.length > 0) {
  console.log(`❌ Missing required sheets: ${missingSheets.join(', ')}`);
}

// Parse survey sheet
const surveySheet = workbook.Sheets['survey'];
if (!surveySheet) {
  console.log('❌ No "survey" sheet found!');
  process.exit(1);
}

const surveyData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(surveySheet);

console.log(`\n📝 Survey Sheet Analysis (${surveyData.length} rows)\n`);
console.log('-'.repeat(60));

// Find issues
const issues: string[] = [];
const warnings: string[] = [];

// Check each row
surveyData.forEach((row, index) => {
  const rowNum = index + 2; // Excel is 1-indexed, plus header row
  const type = String(row['type'] || '').trim();
  const name = String(row['name'] || '').trim();
  const label = row['label'] || row['label::English'] || row['label::english'] || '';
  const hint = row['hint'] || row['hint::English'] || row['hint::english'] || '';

  // Skip notes, begin/end group, calculate
  const skipTypes = ['note', 'begin_group', 'begin group', 'end_group', 'end group', 'calculate', 'start', 'end', 'deviceid', 'today'];
  if (skipTypes.some(t => type.toLowerCase().includes(t))) {
    return;
  }

  // Skip empty rows
  if (!type && !name) {
    return;
  }

  // Check for missing label on input fields
  const inputTypes = ['text', 'integer', 'decimal', 'date', 'time', 'datetime', 'geopoint', 'geotrace', 'geoshape', 'image', 'audio', 'video', 'file', 'barcode', 'select_one', 'select_multiple', 'rank'];

  if (inputTypes.some(t => type.toLowerCase().startsWith(t))) {
    if (!label) {
      issues.push(`Row ${rowNum}: Field "${name}" (type: ${type}) has NO LABEL`);
    }
  }

  // Check for geopoint specifically (the reported error)
  if (type.toLowerCase() === 'geopoint' || type.toLowerCase().includes('gps')) {
    console.log(`  📍 GPS Field found at row ${rowNum}:`);
    console.log(`     name: "${name}"`);
    console.log(`     type: "${type}"`);
    console.log(`     label: "${label || '⚠️ MISSING'}"`);
    console.log(`     hint: "${hint || '(none)'}"`);
    if (!label) {
      issues.push(`Row ${rowNum}: GPS field "${name}" is MISSING A LABEL - this will cause ODK error!`);
    }
  }

  // Check for name issues
  if (name && /\s/.test(name)) {
    issues.push(`Row ${rowNum}: Field name "${name}" contains spaces (use underscores)`);
  }

  if (name && /^[0-9]/.test(name)) {
    issues.push(`Row ${rowNum}: Field name "${name}" starts with a number (invalid)`);
  }
});

// Parse choices sheet
const choicesSheet = workbook.Sheets['choices'];
if (choicesSheet) {
  const choicesData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(choicesSheet);
  console.log(`\n📋 Choices Sheet: ${choicesData.length} rows\n`);

  // Check for missing labels in choices
  choicesData.forEach((row, index) => {
    const rowNum = index + 2;
    const listName = String(row['list_name'] || row['list name'] || '').trim();
    const name = String(row['name'] || '').trim();
    const label = row['label'] || row['label::English'] || row['label::english'] || '';

    if (listName && name && !label) {
      warnings.push(`Choices row ${rowNum}: Choice "${name}" in list "${listName}" has no label`);
    }
  });
}

// Parse settings sheet
const settingsSheet = workbook.Sheets['settings'];
if (settingsSheet) {
  const settingsData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(settingsSheet);
  console.log(`\n⚙️ Settings Sheet:\n`);
  if (settingsData.length > 0) {
    const settings = settingsData[0];
    console.log(`  form_title: "${settings['form_title'] || '(not set)'}"`);
    console.log(`  form_id: "${settings['form_id'] || '(not set)'}"`);
    console.log(`  version: "${settings['version'] || '(not set)'}"`);

    if (!settings['form_id']) {
      warnings.push('Settings: form_id is not set (ODK will generate one)');
    }
  }
} else {
  warnings.push('No "settings" sheet found (optional but recommended)');
}

// Print summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 Validation Summary\n');

if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ No issues found! The form should be valid.\n');
} else {
  if (issues.length > 0) {
    console.log(`❌ ERRORS (${issues.length}) - These WILL cause ODK to reject the form:\n`);
    issues.forEach(issue => console.log(`   • ${issue}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️ WARNINGS (${warnings.length}) - These might cause issues:\n`);
    warnings.forEach(warning => console.log(`   • ${warning}`));
    console.log('');
  }
}

// Print all fields for reference
console.log('\n📝 All Survey Fields:\n');
console.log('-'.repeat(60));
console.log('Row | Type                  | Name                  | Has Label');
console.log('-'.repeat(60));

surveyData.forEach((row, index) => {
  const rowNum = String(index + 2).padStart(3);
  const type = String(row['type'] || '').trim().substring(0, 20).padEnd(21);
  const name = String(row['name'] || '').trim().substring(0, 20).padEnd(21);
  const label = row['label'] || row['label::English'] || row['label::english'] || '';
  const hasLabel = label ? '✅' : '❌';

  if (row['type'] || row['name']) {
    console.log(`${rowNum} | ${type} | ${name} | ${hasLabel}`);
  }
});

console.log('\n');

if (issues.length > 0) {
  process.exit(1);
}
