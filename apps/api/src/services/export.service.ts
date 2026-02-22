/**
 * Export Service — PDF and CSV report generation
 *
 * Provides PoC export capabilities for Story 5.4 (PII-Rich Exports).
 * PDF: A4 tabular reports with Oyo State branding, pagination, row striping.
 * CSV: UTF-8 BOM for Excel compatibility, proper escaping.
 *
 * Created in prep-3 (Export Infrastructure Spike).
 */

import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'export-service' });

// Logo loaded at module level — resolve from both src/ and dist/ for Docker compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOGO_CANDIDATES = [
  join(__dirname, '../../assets/oyo-coat-of-arms.png'),  // from src/services/
  join(__dirname, '../../../assets/oyo-coat-of-arms.png'), // from dist/services/
];
let logoBuffer: Buffer = Buffer.alloc(0);
for (const candidate of LOGO_CANDIDATES) {
  try {
    logoBuffer = readFileSync(candidate);
    break;
  } catch {
    // Try next candidate
  }
}
if (logoBuffer.length === 0) {
  logger.warn({ event: 'export.logo_not_found', candidates: LOGO_CANDIDATES }, 'Oyo State logo not found — PDF exports will render without branding');
}

// Brand colors (from project-context.md)
const BRAND_MAROON = '#9C1E23';
const HEADER_BG = '#f8f9fa';
const STRIPE_BG = '#f2f2f2';
const BODY_TEXT = '#1a1a1a';
const LABEL_TEXT = '#666666';

// A4 page dimensions in points (72 dpi)
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Layout constants
const HEADER_HEIGHT = 70;
const COLUMN_HEADER_HEIGHT = 20;
const ROW_HEIGHT = 18;
const FOOTER_HEIGHT = 30;
const TABLE_TOP_OFFSET = MARGIN + HEADER_HEIGHT + 15;

export interface ExportColumn {
  key: string;
  header: string;
  width: number;
}

export interface PdfReportOptions {
  title: string;
}

export class ExportService {
  /**
   * Generate a PDF tabular report with Oyo State branding.
   * Returns a Buffer containing the complete PDF document.
   */
  static async generatePdfReport(
    data: Record<string, unknown>[],
    inputColumns: ExportColumn[],
    options: PdfReportOptions,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MARGIN,
          autoFirstPage: true,
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => {
          reject(new AppError('PDF_GENERATION_ERROR', 'Failed to generate PDF report', 500, { error: (err as Error).message }));
        });

        const totalPages = ExportService.calculateTotalPages(data.length);

        // Draw first page header
        ExportService.drawPageHeader(doc, options);

        if (data.length === 0) {
          doc.fontSize(12).fillColor(LABEL_TEXT);
          doc.text('No records found', MARGIN, TABLE_TOP_OFFSET + COLUMN_HEADER_HEIGHT + 20, {
            width: CONTENT_WIDTH,
            align: 'center',
          });
          ExportService.drawPageFooter(doc, 0, 1, totalPages);
          doc.end();
          return;
        }

        // Validate column widths fit content area
        let columns = [...inputColumns];
        const totalColWidth = columns.reduce((sum, col) => sum + col.width, 0);
        if (totalColWidth > CONTENT_WIDTH) {
          const scale = CONTENT_WIDTH / totalColWidth;
          columns = columns.map((col) => ({ ...col, width: Math.floor(col.width * scale) }));
        }

        // Draw column headers
        let y = TABLE_TOP_OFFSET;
        ExportService.drawColumnHeaders(doc, columns, y);
        y += COLUMN_HEADER_HEIGHT;

        let currentPage = 1;
        const rowsPerPage = ExportService.getRowsPerPage();

        for (let i = 0; i < data.length; i++) {
          // Check if we need a new page
          if (i > 0 && i % rowsPerPage === 0) {
            ExportService.drawPageFooter(doc, data.length, currentPage, totalPages);
            doc.addPage();
            currentPage++;
            ExportService.drawPageHeader(doc, options);
            y = TABLE_TOP_OFFSET;
            ExportService.drawColumnHeaders(doc, columns, y);
            y += COLUMN_HEADER_HEIGHT;
          }

          // Row striping for alternating rows
          if (i % 2 === 1) {
            doc.save();
            doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(STRIPE_BG);
            doc.restore();
          }

          // Draw row data
          let x = MARGIN;
          doc.fontSize(8).fillColor(BODY_TEXT).font('Helvetica');
          for (const col of columns) {
            const value = String(data[i][col.key] ?? '');
            doc.text(value, x + 4, y + 4, {
              width: col.width - 8,
              height: ROW_HEIGHT - 4,
              ellipsis: true,
            });
            x += col.width;
          }

          y += ROW_HEIGHT;
        }

        // Final page footer
        ExportService.drawPageFooter(doc, data.length, currentPage, totalPages);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate a CSV export with UTF-8 BOM for Excel compatibility.
   * Uses csv-stringify for RFC 4180 compliance and streaming capability.
   * Returns a Buffer containing the complete CSV data.
   */
  static async generateCsvExport(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
  ): Promise<Buffer> {
    const BOM = '\uFEFF';

    // Build records array for csv-stringify
    const records = data.map((row) =>
      columns.map((col) => String(row[col.key] ?? '')),
    );

    const csvContent = stringify(records, {
      header: true,
      columns: columns.map((col) => col.header),
      bom: false, // We prepend BOM manually for cross-platform consistency
    });

    return Buffer.from(BOM + csvContent, 'utf-8');
  }

  // ===== Private Helpers =====

  private static drawPageHeader(
    doc: PDFKit.PDFDocument,
    options: PdfReportOptions,
  ): void {
    // Header background
    doc.save();
    doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, HEADER_HEIGHT).fill(HEADER_BG);
    doc.restore();

    // Logo (if available)
    if (logoBuffer.length > 0) {
      doc.image(logoBuffer, MARGIN + 8, MARGIN + 8, {
        height: HEADER_HEIGHT - 16,
        width: HEADER_HEIGHT - 16,
      });
    }

    const textX = MARGIN + HEADER_HEIGHT + 4;

    // Organization name
    doc.fontSize(12).fillColor(BRAND_MAROON).font('Helvetica-Bold');
    doc.text('Oyo State Labour & Skills Registry', textX, MARGIN + 10, {
      width: CONTENT_WIDTH - HEADER_HEIGHT - 8,
    });

    // Report title
    doc.fontSize(10).fillColor(BODY_TEXT).font('Helvetica-Bold');
    doc.text(options.title, textX, MARGIN + 28, {
      width: CONTENT_WIDTH - HEADER_HEIGHT - 8,
    });

    // Date
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    doc.fontSize(8).fillColor(LABEL_TEXT).font('Helvetica');
    doc.text(`Generated: ${dateStr}`, textX, MARGIN + 44, {
      width: CONTENT_WIDTH - HEADER_HEIGHT - 8,
    });
  }

  private static drawColumnHeaders(
    doc: PDFKit.PDFDocument,
    columns: ExportColumn[],
    y: number,
  ): void {
    // Header row background
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, COLUMN_HEADER_HEIGHT).fill(BRAND_MAROON);
    doc.restore();

    let x = MARGIN;
    doc.fontSize(8).fillColor('#FFFFFF').font('Helvetica-Bold');
    for (const col of columns) {
      doc.text(col.header, x + 4, y + 5, {
        width: col.width - 8,
        height: COLUMN_HEADER_HEIGHT - 6,
      });
      x += col.width;
    }
  }

  private static drawPageFooter(
    doc: PDFKit.PDFDocument,
    totalRecords: number,
    currentPage: number,
    totalPages: number,
  ): void {
    const footerY = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

    // Separator line
    doc.save();
    doc.lineWidth(0.5).opacity(0.3);
    doc.moveTo(MARGIN, footerY).lineTo(PAGE_WIDTH - MARGIN, footerY).stroke();
    doc.restore();

    // Record count (left)
    doc.fontSize(7).fillColor(LABEL_TEXT).font('Helvetica');
    doc.text(`${totalRecords} records`, MARGIN, footerY + 8, {
      width: CONTENT_WIDTH / 2,
      align: 'left',
    });

    // Page number (right)
    doc.text(`Page ${currentPage} of ${totalPages}`, MARGIN + CONTENT_WIDTH / 2, footerY + 8, {
      width: CONTENT_WIDTH / 2,
      align: 'right',
    });
  }

  private static calculateTotalPages(rowCount: number): number {
    if (rowCount === 0) return 1;
    const rowsPerPage = ExportService.getRowsPerPage();
    return Math.ceil(rowCount / rowsPerPage);
  }

  private static getRowsPerPage(): number {
    const availableHeight = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT - TABLE_TOP_OFFSET - COLUMN_HEADER_HEIGHT;
    return Math.floor(availableHeight / ROW_HEIGHT);
  }

}
