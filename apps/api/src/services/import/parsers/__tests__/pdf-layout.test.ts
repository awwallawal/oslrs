import { describe, it, expect } from 'vitest';
import {
  clusterItemsToRows,
  buildColumns,
  rowToRecord,
  tableFromItems,
  findHeaderRowIndex,
  type PdfTextItem,
} from '../pdf-layout.js';

/**
 * Pure layout heuristics — the fragile part of the PDF parser, tested with
 * synthetic positioned items (no PDF fixture). PDF y increases UPWARD, so
 * higher y = higher on the page.
 */

// A 3-column, 2-data-row table. y descends down the page.
const HEADER_Y = 700;
const ROW1_Y = 680;
const ROW2_Y = 660;
const X = { name: 50, trade: 200, lga: 350 };

function item(str: string, x: number, y: number, page = 1): PdfTextItem {
  return { str, x, y, page };
}

const TABLE_ITEMS: PdfTextItem[] = [
  item('Name', X.name, HEADER_Y),
  item('Trade', X.trade, HEADER_Y),
  item('LGA', X.lga, HEADER_Y),
  item('Ada Obi', X.name, ROW1_Y),
  item('Tiler', X.trade, ROW1_Y),
  item('Ona Ara', X.lga, ROW1_Y),
  item('Bola Ade', X.name, ROW2_Y),
  item('Welder', X.trade, ROW2_Y),
  item('Egbeda', X.lga, ROW2_Y),
];

describe('clusterItemsToRows', () => {
  it('groups items with the same baseline into one row, ordered top-to-bottom', () => {
    const rows = clusterItemsToRows(TABLE_ITEMS);
    expect(rows).toHaveLength(3);
    expect(rows[0].map((i) => i.str)).toEqual(['Name', 'Trade', 'LGA']);
    expect(rows[1].map((i) => i.str)).toEqual(['Ada Obi', 'Tiler', 'Ona Ara']);
    expect(rows[2].map((i) => i.str)).toEqual(['Bola Ade', 'Welder', 'Egbeda']);
  });

  it('tolerates small y jitter within a row', () => {
    const jittered = [item('A', 50, 700), item('B', 200, 702), item('C', 350, 699)];
    const rows = clusterItemsToRows(jittered, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((i) => i.str)).toEqual(['A', 'B', 'C']);
  });

  it('keeps items on different pages in separate rows even at the same y', () => {
    const rows = clusterItemsToRows([item('P1', 50, 700, 1), item('P2', 50, 700, 2)]);
    expect(rows).toHaveLength(2);
  });

  it('returns [] for no items', () => {
    expect(clusterItemsToRows([])).toEqual([]);
  });
});

describe('rowToRecord', () => {
  it('assigns items to the nearest column centre', () => {
    const columns = buildColumns([item('Name', X.name, HEADER_Y), item('Trade', X.trade, HEADER_Y), item('LGA', X.lga, HEADER_Y)]);
    const rec = rowToRecord([item('Ada Obi', 52, ROW1_Y), item('Tiler', 205, ROW1_Y), item('Ona Ara', 349, ROW1_Y)], columns);
    expect(rec).toEqual({ Name: 'Ada Obi', Trade: 'Tiler', LGA: 'Ona Ara' });
  });

  it('space-joins multiple items landing in the same column', () => {
    const columns = buildColumns([item('Name', 50, HEADER_Y)]);
    const rec = rowToRecord([item('Ada', 50, ROW1_Y), item('Obi', 60, ROW1_Y)], columns);
    expect(rec).toEqual({ Name: 'Ada Obi' });
  });
});

describe('tableFromItems', () => {
  it('reconstructs headers + records from a full table', () => {
    const table = tableFromItems(TABLE_ITEMS);
    expect(table.headers).toEqual(['Name', 'Trade', 'LGA']);
    expect(table.records).toEqual([
      { Name: 'Ada Obi', Trade: 'Tiler', LGA: 'Ona Ara' },
      { Name: 'Bola Ade', Trade: 'Welder', LGA: 'Egbeda' },
    ]);
  });

  it('detects the header row below title/preamble rows (real ITF-SUPA shape)', () => {
    // Two 1-item title rows precede the 3-column header (the exact shape of the
    // ITF-SUPA "Oyo_shortlisted_artisans.pdf": "INDUSTRIAL TRAINING FUND" +
    // "OYO STATE SUPA REGISTERED ARTISAN" above the real column header).
    const items: PdfTextItem[] = [
      item('INDUSTRIAL TRAINING FUND', 339, 760),
      item('OYO STATE SUPA REGISTERED ARTISAN', 306, 740),
      ...TABLE_ITEMS.map((i) => item(i.str, i.x, i.y - 40)), // header + data below the titles
    ];
    const rows = clusterItemsToRows(items);
    expect(findHeaderRowIndex(rows)).toBe(2); // 3rd visual row is the widest

    const table = tableFromItems(items);
    expect(table.headers).toEqual(['Name', 'Trade', 'LGA']);
    expect(table.records).toHaveLength(2);
    expect(table.records[0]).toMatchObject({ Name: 'Ada Obi', Trade: 'Tiler', LGA: 'Ona Ara' });
  });

  it('drops a repeated per-page header row', () => {
    const withRepeatedHeader = [
      ...TABLE_ITEMS,
      // simulate a repeated header on page 2
      item('Name', X.name, 700, 2),
      item('Trade', X.trade, 700, 2),
      item('LGA', X.lga, 700, 2),
      item('Chidi Eze', X.name, 680, 2),
      item('Painter', X.trade, 680, 2),
      item('Akinyele', X.lga, 680, 2),
    ];
    const table = tableFromItems(withRepeatedHeader);
    expect(table.records).toHaveLength(3); // 2 from page 1 + 1 from page 2 (repeated header dropped)
    expect(table.records.some((r) => r.Name === 'Name')).toBe(false);
    expect(table.records.at(-1)).toEqual({ Name: 'Chidi Eze', Trade: 'Painter', LGA: 'Akinyele' });
  });
});
