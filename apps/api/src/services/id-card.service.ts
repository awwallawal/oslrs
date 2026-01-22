import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { AppError } from '@oslsr/utils';

interface IDCardData {
  fullName: string;
  role: string;
  lga: string;
  photoBuffer: Buffer;
  verificationUrl: string;
}

export class IDCardService {
  constructor() {}

  async generateIDCard(data: IDCardData): Promise<Buffer> {
    // Generate QR code first (async operation)
    const qrCodeBuffer = await QRCode.toBuffer(data.verificationUrl, {
      width: 100,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    // Now create PDF synchronously
    return new Promise((resolve, reject) => {
      try {
        // CR80 size: 3.375" x 2.125"
        // PDFKit uses points (1/72 inch)
        // Width: 3.375 * 72 = 243
        // Height: 2.125 * 72 = 153
        const cardWidth = 243;
        const cardHeight = 153;

        const doc = new PDFDocument({
            size: [cardWidth, cardHeight],
            margin: 0,
            autoFirstPage: true
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });

        doc.on('error', (err) => {
            reject(new AppError('PDF_GENERATION_ERROR', 'Failed to generate ID card PDF', 500, { error: err.message }));
        });

        // --- FRONT SIDE ---

        // Background
        doc.rect(0, 0, cardWidth, cardHeight).fill('#ffffff');

        // Branding Header (Oyo Green)
        doc.save();
        doc.rect(0, 0, cardWidth, 25).fill('#006400');
        doc.fillColor('#ffffff').fontSize(10).text('OYO STATE GOVERNMENT', 0, 8, { align: 'center', width: cardWidth });
        doc.restore();

        // Photo (Left side)
        // Position: x=10, y=35
        // Size: 60x80 pt (approx 0.8" x 1.1")
        doc.image(data.photoBuffer, 10, 35, { width: 60, height: 80, fit: [60, 80] });

        // Details (Right side)
        doc.fillColor('#000000');
        const textX = 80;
        let textY = 40;

        doc.fontSize(10).font('Helvetica-Bold').text(data.fullName, textX, textY, { width: 150 });
        textY += 15;
        doc.fontSize(8).font('Helvetica').text(data.role.toUpperCase(), textX, textY);
        textY += 12;
        doc.text(data.lga, textX, textY);
        textY += 20;

        doc.fontSize(6).font('Helvetica-Oblique').text('LABOUR & SKILLS REGISTRY', textX, textY);

        // --- BACK SIDE ---
        doc.addPage();

        doc.rect(0, 0, cardWidth, cardHeight).fill('#ffffff');

        doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text('SCAN TO VERIFY', 0, 20, { align: 'center', width: cardWidth });

        // Center QR Code
        const qrSize = 80;
        doc.image(qrCodeBuffer, (cardWidth - qrSize) / 2, 35, { width: qrSize, height: qrSize });

        // Disclaimer
        doc.fontSize(6).font('Helvetica').text('This card remains the property of Oyo State Government.', 10, 120, { align: 'center', width: cardWidth - 20 });
        doc.text('If found, please return to the nearest Local Government office.', 10, 130, { align: 'center', width: cardWidth - 20 });

        doc.end();
      } catch (err: unknown) {
        reject(new AppError('PDF_GENERATION_ERROR', 'Failed to generate ID card PDF', 500, { error: err instanceof Error ? err.message : 'Unknown error' }));
      }
    });
  }
}
