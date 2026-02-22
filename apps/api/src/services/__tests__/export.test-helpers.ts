import type { ExportColumn } from '../export.service.js';

export const sampleColumns: ExportColumn[] = [
  { key: 'name', header: 'Full Name', width: 150 },
  { key: 'nin', header: 'NIN', width: 100 },
  { key: 'phone', header: 'Phone', width: 100 },
  { key: 'lga', header: 'LGA', width: 100 },
];

export const benchmarkColumns: ExportColumn[] = [
  ...sampleColumns,
  { key: 'status', header: 'Status', width: 65 },
];

export function generateRows(count: number): Record<string, string>[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Respondent Person ${i + 1}`,
    nin: `${String(i + 1).padStart(11, '0')}`,
    phone: `+234801234${String(i % 10000).padStart(4, '0')}`,
    lga: `LGA-${(i % 33) + 1}`,
    status: i % 3 === 0 ? 'verified' : i % 3 === 1 ? 'pending' : 'flagged',
  }));
}
