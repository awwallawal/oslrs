/**
 * Fix XLSForm Missing Labels Script
 *
 * Adds missing labels to XLSForm fields that require them.
 *
 * Usage: npx tsx apps/api/scripts/fix-xlsform-labels.ts <path-to-xlsx>
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const filePath = process.argv[2];

if (!filePath) {
  console.log('Usage: npx tsx apps/api/scripts/fix-xlsform-labels.ts <path-to-xlsx>');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
  console.log(`❌ File not found: ${absolutePath}`);
  process.exit(1);
}

console.log(`\n🔧 Fixing XLSForm: ${absolutePath}\n`);

// Read the workbook
const workbook = XLSX.readFile(absolutePath);
const surveySheet = workbook.Sheets['survey'];

if (!surveySheet) {
  console.log('❌ No survey sheet found');
  process.exit(1);
}

// Convert to JSON for easier manipulation
const data: Record<string, unknown>[] = XLSX.utils.sheet_to_json(surveySheet);

// Fields that need labels
const fieldsNeedingLabels: Record<string, string> = {
  'gps_location': 'GPS Location',
  'geopoint': 'Location',
};

// Track fixes
const fixes: string[] = [];

// Fix missing labels
data.forEach((row, index) => {
  const name = String(row['name'] || '').trim();
  const type = String(row['type'] || '').trim().toLowerCase();
  const hasLabel = row['label'] || row['label::English'] || row['label::english'];

  if (!hasLabel) {
    // Check if this field type needs a label
    if (type === 'geopoint' || type.includes('gps')) {
      const label = fieldsNeedingLabels[name] || 'GPS Location';
      row['label'] = label;
      fixes.push(`Row ${index + 2}: Added label "${label}" to field "${name}"`);
    }
  }
});

if (fixes.length === 0) {
  console.log('✅ No fixes needed - all fields have labels');
  process.exit(0);
}

// Convert back to sheet
const newSheet = XLSX.utils.json_to_sheet(data);

// Preserve original column order by getting headers from original
const originalHeaders = XLSX.utils.sheet_to_json(surveySheet, { header: 1 })[0] as string[];
const newData = XLSX.utils.sheet_to_json(surveySheet, { header: 1 }) as unknown[][];

// Update the specific cells that need labels
const headerRow = newData[0] as string[];
const labelColIndex = headerRow.findIndex(h => h === 'label' || h === 'label::English' || h === 'label::english');
const nameColIndex = headerRow.findIndex(h => h === 'name');

if (labelColIndex === -1) {
  // Need to add label column
  console.log('Adding label column...');
  headerRow.push('label');
  const newLabelColIndex = headerRow.length - 1;

  newData.forEach((row, index) => {
    if (index === 0) return; // Skip header
    const rowArray = row as unknown[];
    const name = rowArray[nameColIndex];
    if (name === 'gps_location') {
      rowArray[newLabelColIndex] = 'GPS Location';
      fixes.push(`Row ${index + 1}: Added label "GPS Location" to gps_location`);
    }
  });
} else {
  // Update existing label column
  newData.forEach((row, index) => {
    if (index === 0) return; // Skip header
    const rowArray = row as unknown[];
    const name = rowArray[nameColIndex];
    const label = rowArray[labelColIndex];

    if (name === 'gps_location' && !label) {
      rowArray[labelColIndex] = 'GPS Location';
    }
  });
}

// Write back
const fixedSheet = XLSX.utils.aoa_to_sheet(newData);
workbook.Sheets['survey'] = fixedSheet;

// Create backup
const backupPath = absolutePath.replace('.xlsx', '_backup.xlsx');
fs.copyFileSync(absolutePath, backupPath);
console.log(`📁 Backup created: ${backupPath}`);

// Save fixed file
XLSX.writeFile(workbook, absolutePath);

console.log('\n✅ Fixes applied:\n');
fixes.forEach(fix => console.log(`   • ${fix}`));
console.log('\n');
