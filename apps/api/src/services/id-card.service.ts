import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { AppError } from '@oslsr/utils';

interface IDCardData {
  fullName: string;
  role: string;
  lga: string;
  phone: string;
  staffId: string;
  photoBuffer: Buffer;
  logoBuffer: Buffer;
  verificationUrl: string;
}

// Brand colors
const BRAND_MAROON = '#9C1E23';
const BRAND_MAROON_DARK = '#7A171B';
const WHITE = '#FFFFFF';
const BODY_TEXT = '#1a1a1a';
const LABEL_TEXT = '#6b6b6b';
const SEPARATOR_COLOR = '#e0e0e0';
const DISCLAIMER_TEXT = '#666666';
const WATERMARK_COLOR = '#9C1E23';
const SHADOW_COLOR = '#cccccc';

export class IDCardService {
  constructor() {}

  async generateIDCard(data: IDCardData): Promise<Buffer> {
    const qrCodeBuffer = await QRCode.toBuffer(data.verificationUrl, {
      width: 120,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return new Promise((resolve, reject) => {
      try {
        // CR80 standard card: 3.375" x 2.125"
        // PDFKit points (1/72 inch)
        const cardWidth = 243;
        const cardHeight = 153;
        const borderWidth = 1.5;

        const doc = new PDFDocument({
          size: [cardWidth, cardHeight],
          margin: 0,
          autoFirstPage: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => {
          reject(new AppError('PDF_GENERATION_ERROR', 'Failed to generate ID card PDF', 500, { error: err.message }));
        });

        // Format staff ID: OSLSR-XXXXXXXX
        const shortId = data.staffId.substring(0, 8).toUpperCase();
        const staffIdFormatted = `OSLSR-${shortId}`;

        // Format issue date: DD/MM/YYYY
        const now = new Date();
        const issueDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

        // ==========================================
        // FRONT SIDE
        // ==========================================

        // White background
        doc.rect(0, 0, cardWidth, cardHeight).fill(WHITE);

        // Maroon border around card edge
        doc.lineWidth(borderWidth)
          .rect(borderWidth / 2, borderWidth / 2, cardWidth - borderWidth, cardHeight - borderWidth)
          .stroke(BRAND_MAROON);

        // Subtle diagonal watermark across body
        doc.save();
        doc.opacity(0.04);
        doc.fontSize(14).font('Helvetica-Bold').fillColor(WATERMARK_COLOR);
        for (let y = 20; y < cardHeight + 40; y += 28) {
          for (let x = -40; x < cardWidth + 40; x += 70) {
            doc.save();
            doc.translate(x, y);
            doc.rotate(-30, { origin: [0, 0] });
            doc.text('OSLRS', 0, 0, { width: 70 });
            doc.restore();
          }
        }
        doc.restore();

        // --- Header bar with gradient effect ---
        const headerHeight = 22;
        const gradientStripH = 3;
        // Main header fill
        doc.rect(borderWidth, borderWidth, cardWidth - borderWidth * 2, headerHeight).fill(BRAND_MAROON);
        // Darker strip at bottom for subtle gradient feel
        doc.rect(borderWidth, borderWidth + headerHeight - gradientStripH, cardWidth - borderWidth * 2, gradientStripH).fill(BRAND_MAROON_DARK);

        // Logo in header (left side)
        const logoSize = 16;
        const logoX = 7;
        const logoY = borderWidth + (headerHeight - logoSize) / 2;
        doc.image(data.logoBuffer, logoX, logoY, { width: logoSize, height: logoSize });

        // Title: single line, centered in remaining header space
        const titleStartX = logoX + logoSize + 2;
        const titleWidth = cardWidth - titleStartX - borderWidth;
        doc.fillColor(WHITE).fontSize(6.5).font('Helvetica-Bold');
        doc.text('Oyo State Labour & Skills Registry', titleStartX, borderWidth + 7, {
          width: titleWidth,
          align: 'center',
        });

        // --- Body: photo + labeled fields, vertically centered ---
        const bodyTop = headerHeight + borderWidth;
        const bottomBarHeight = 13;
        const bodyBottom = cardHeight - bottomBarHeight - borderWidth;
        const bodyHeight = bodyBottom - bodyTop;

        // Content block dimensions
        const photoW = 50;
        const photoH = 62;
        const fieldLineHeight = 9.5;
        const fieldCount = 5; // Name, Role, Location, ID No, Date Issued
        const fieldsHeight = fieldCount * fieldLineHeight;
        const contentHeight = Math.max(photoH, fieldsHeight);

        // Vertical center offset
        const contentY = bodyTop + (bodyHeight - contentHeight) / 2;

        // Photo (left side, vertically centered)
        const photoX = 10;
        const photoY = contentY + (contentHeight - photoH) / 2;

        // Photo drop shadow (offset slightly down-right)
        doc.save();
        doc.opacity(0.15);
        doc.roundedRect(photoX + 1.5, photoY + 1.5, photoW, photoH, 3).fill(SHADOW_COLOR);
        doc.restore();

        // Photo with rounded corners (clip path)
        doc.save();
        doc.roundedRect(photoX, photoY, photoW, photoH, 3).clip();
        doc.image(data.photoBuffer, photoX, photoY, { width: photoW, height: photoH, fit: [photoW, photoH] });
        doc.restore();

        // --- Labeled fields (right of photo, vertically centered) ---
        const textX = photoX + photoW + 8;
        const textWidth = cardWidth - textX - 8;
        const labelWidth = 42;
        const valueX = textX + labelWidth;
        const valueWidth = textWidth - labelWidth;

        // Vertically center the fields block
        let fieldY = contentY + (contentHeight - fieldsHeight) / 2;

        // Helper to draw a label: value row with hairline separator
        let fieldIndex = 0;
        const drawField = (label: string, value: string) => {
          doc.fillColor(LABEL_TEXT).fontSize(6).font('Helvetica');
          doc.text(label, textX, fieldY, { width: labelWidth });
          doc.fillColor(BODY_TEXT).fontSize(6.5).font('Helvetica-Bold');
          doc.text(value, valueX, fieldY - 0.5, { width: valueWidth });
          fieldY += fieldLineHeight;
          fieldIndex++;
          // Thin hairline separator between rows (not after last field)
          if (fieldIndex < fieldCount) {
            doc.save();
            doc.opacity(0.3);
            doc.lineWidth(0.3)
              .moveTo(textX, fieldY - 2)
              .lineTo(textX + textWidth, fieldY - 2)
              .stroke(SEPARATOR_COLOR);
            doc.restore();
          }
        };

        // Sentence case helper: "enumerator" → "Enumerator", "super_admin" → "Super Admin"
        const toSentenceCase = (str: string) =>
          str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        drawField('Name:', data.fullName);
        drawField('Role:', toSentenceCase(data.role));
        drawField('Location:', data.lga);
        drawField('ID No:', staffIdFormatted);
        drawField('Date Issued:', issueDate);

        // --- Bottom accent bar ---
        const bottomY = cardHeight - bottomBarHeight;
        doc.lineWidth(0.6)
          .moveTo(borderWidth, bottomY)
          .lineTo(cardWidth - borderWidth, bottomY)
          .stroke(BRAND_MAROON);

        doc.fillColor(LABEL_TEXT).fontSize(4.5).font('Helvetica');
        doc.text('PROPERTY OF OYO STATE GOVERNMENT', 0, bottomY + 3, {
          align: 'center',
          width: cardWidth,
          characterSpacing: 0.5,
        });

        // ==========================================
        // BACK SIDE
        // ==========================================
        doc.addPage();

        // White background
        doc.rect(0, 0, cardWidth, cardHeight).fill(WHITE);

        // Maroon border
        doc.lineWidth(borderWidth)
          .rect(borderWidth / 2, borderWidth / 2, cardWidth - borderWidth, cardHeight - borderWidth)
          .stroke(BRAND_MAROON);

        // Header bar with gradient effect
        doc.rect(borderWidth, borderWidth, cardWidth - borderWidth * 2, headerHeight).fill(BRAND_MAROON);
        doc.rect(borderWidth, borderWidth + headerHeight - gradientStripH, cardWidth - borderWidth * 2, gradientStripH).fill(BRAND_MAROON_DARK);
        doc.fillColor(WHITE).fontSize(6.5).font('Helvetica-Bold');
        doc.text('Oyo State Government', 0, borderWidth + 7, { align: 'center', width: cardWidth });

        // Back body area
        const backBodyTop = headerHeight + borderWidth;
        const backBodyHeight = cardHeight - backBodyTop - borderWidth;

        // Content on back: "SCAN TO VERIFY" + QR + return text
        const qrSize = 52;
        const scanLabelH = 10;
        const returnTextH = 24;
        const spacing = 4;
        const backContentHeight = scanLabelH + qrSize + spacing + returnTextH;
        const backContentY = backBodyTop + (backBodyHeight - backContentHeight) / 2;

        // "SCAN TO VERIFY"
        doc.fillColor(BODY_TEXT).fontSize(7).font('Helvetica-Bold');
        doc.text('SCAN TO VERIFY', 0, backContentY, { align: 'center', width: cardWidth });

        // QR Code (centered)
        const qrX = (cardWidth - qrSize) / 2;
        const qrY = backContentY + scanLabelH;
        doc.image(qrCodeBuffer, qrX, qrY, { width: qrSize, height: qrSize });

        // Return instructions
        const returnY = qrY + qrSize + spacing;
        doc.fillColor(DISCLAIMER_TEXT).fontSize(4.5).font('Helvetica-Oblique');
        doc.text(
          'If found, please return to: Office of the Commissioner,',
          10, returnY,
          { align: 'center', width: cardWidth - 20 }
        );
        doc.text(
          'Ministry of Trade, Industry & Cooperatives,',
          10, returnY + 7,
          { align: 'center', width: cardWidth - 20 }
        );
        doc.text(
          'Secretariat Ibadan, Oyo State.',
          10, returnY + 14,
          { align: 'center', width: cardWidth - 20 }
        );

        doc.end();
      } catch (err: unknown) {
        reject(new AppError('PDF_GENERATION_ERROR', 'Failed to generate ID card PDF', 500, { error: err instanceof Error ? err.message : 'Unknown error' }));
      }
    });
  }
}
