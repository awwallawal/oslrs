/**
 * CSV Export Utility
 *
 * Story 8.2: Export chart data as CSV files.
 */

/**
 * Sanitize a cell value to prevent CSV formula injection
 * and properly escape special characters.
 */
function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Defuse CSV formula injection
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  // Escape commas, quotes, newlines
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function exportToCSV(data: object[], filename: string) {
  if (!data || data.length === 0) return;

  // Strip suppressed metadata field from exported data
  const cleanData = data.map(row => {
    const clean = { ...row } as Record<string, unknown>;
    delete clean['suppressed'];
    return clean;
  });

  const headers = Object.keys(cleanData[0]).map(h => sanitizeCell(h)).join(',');
  const rows = cleanData.map(row =>
    Object.values(row).map(v => sanitizeCell(v)).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // Sanitize filename: strip path traversal and special characters
  const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  link.download = `${safeFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
