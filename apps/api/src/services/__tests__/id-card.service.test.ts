import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDCardService } from '../id-card.service.js';

// Hoisted mocks for PDFKit
const mocks = vi.hoisted(() => {
  return {
    text: vi.fn().mockReturnThis(),
    image: vi.fn().mockReturnThis(),
    addPage: vi.fn().mockReturnThis(),
    fontSize: vi.fn().mockReturnThis(),
    font: vi.fn().mockReturnThis(),
    fillColor: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    pipe: vi.fn().mockReturnThis(),
    save: vi.fn().mockReturnThis(),
    restore: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    translate: vi.fn().mockReturnThis(),
    opacity: vi.fn().mockReturnThis(),
    lineWidth: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    roundedRect: vi.fn().mockReturnThis(),
    clip: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-qr-code')),
  };
});

vi.mock('qrcode', () => {
  return {
    default: {
      toBuffer: mocks.toBuffer
    }
  };
});

vi.mock('pdfkit', () => {
  return {
    default: class PDFDocument {
      _dataCallback: ((chunk: Buffer) => void) | null = null;
      _endCallback: (() => void) | null = null;

      constructor(_options: unknown) {}
      text(...args: unknown[]) { mocks.text(...args); return this; }
      image(...args: unknown[]) { mocks.image(...args); return this; }
      addPage(...args: unknown[]) { mocks.addPage(...args); return this; }
      fontSize(...args: unknown[]) { mocks.fontSize(...args); return this; }
      font(...args: unknown[]) { mocks.font(...args); return this; }
      fillColor(...args: unknown[]) { mocks.fillColor(...args); return this; }
      rect(...args: unknown[]) { mocks.rect(...args); return this; }
      fill(...args: unknown[]) { mocks.fill(...args); return this; }
      stroke(...args: unknown[]) { mocks.stroke(...args); return this; }
      save(...args: unknown[]) { mocks.save(...args); return this; }
      restore(...args: unknown[]) { mocks.restore(...args); return this; }
      rotate(...args: unknown[]) { mocks.rotate(...args); return this; }
      translate(...args: unknown[]) { mocks.translate(...args); return this; }
      opacity(...args: unknown[]) { mocks.opacity(...args); return this; }
      lineWidth(...args: unknown[]) { mocks.lineWidth(...args); return this; }
      moveTo(...args: unknown[]) { mocks.moveTo(...args); return this; }
      lineTo(...args: unknown[]) { mocks.lineTo(...args); return this; }
      roundedRect(...args: unknown[]) { mocks.roundedRect(...args); return this; }
      clip(...args: unknown[]) { mocks.clip(...args); return this; }
      pipe(...args: unknown[]) { mocks.pipe(...args); return this; }

      on(event: string, callback: (...args: unknown[]) => void) {
          mocks.on(event, callback);
          if (event === 'data') {
             this._dataCallback = callback;
          }
          if (event === 'end') {
             this._endCallback = callback;
          }
          return this;
      }

      end() {
          mocks.end();
          if (this._dataCallback) this._dataCallback(Buffer.from('%PDF-MOCK'));
          if (this._endCallback) this._endCallback();
      }
    }
  };
});

describe('IDCardService', () => {
  let service: IDCardService;

  const mockData = {
    fullName: 'Adewale Johnson',
    role: 'enumerator',
    lga: 'Ibadan North',
    phone: '+2348012345678',
    staffId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    photoBuffer: Buffer.from('fake-image'),
    logoBuffer: Buffer.from('fake-logo'),
    verificationUrl: 'https://oslrs.oyostate.gov.ng/verify-staff/123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IDCardService();
    mocks.toBuffer.mockResolvedValue(Buffer.from('fake-qr-code'));
  });

  it('should generate a valid PDF buffer', async () => {
    const buffer = await service.generateIDCard(mockData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should render front side with photo, logo, labeled fields, and staff ID', async () => {
    await service.generateIDCard(mockData);

    // Photo embedded
    expect(mocks.image).toHaveBeenCalledWith(mockData.photoBuffer, expect.any(Number), expect.any(Number), expect.any(Object));

    // Logo embedded
    expect(mocks.image).toHaveBeenCalledWith(mockData.logoBuffer, expect.any(Number), expect.any(Number), expect.any(Object));

    // Header title (single line)
    expect(mocks.text).toHaveBeenCalledWith('Oyo State Labour & Skills Registry', expect.any(Number), expect.any(Number), expect.anything());

    // Labeled fields: labels
    expect(mocks.text).toHaveBeenCalledWith('Name:', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('Role:', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('Location:', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('ID No:', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('Date Issued:', expect.any(Number), expect.any(Number), expect.anything());

    // Labeled fields: values
    expect(mocks.text).toHaveBeenCalledWith('Adewale Johnson', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('Enumerator', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('Ibadan North', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith('OSLSR-A1B2C3D4', expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith(expect.stringMatching(/\d{2}\/\d{2}\/\d{4}/), expect.any(Number), expect.any(Number), expect.anything());

    // Property text
    expect(mocks.text).toHaveBeenCalledWith('PROPERTY OF OYO STATE GOVERNMENT', expect.anything(), expect.anything(), expect.anything());
  });

  it('should render back side with QR code and return instructions', async () => {
    await service.generateIDCard(mockData);

    // Back side page added
    expect(mocks.addPage).toHaveBeenCalled();

    // QR code generated with verification URL
    expect(mocks.toBuffer).toHaveBeenCalledWith(mockData.verificationUrl, expect.anything());
    expect(mocks.image).toHaveBeenCalledWith(Buffer.from('fake-qr-code'), expect.any(Number), expect.any(Number), expect.anything());

    // Return instructions
    expect(mocks.text).toHaveBeenCalledWith(expect.stringContaining('Office of the Commissioner'), expect.anything(), expect.anything(), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith(expect.stringContaining('Ministry of Trade'), expect.anything(), expect.anything(), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith(expect.stringContaining('Secretariat Ibadan'), expect.anything(), expect.anything(), expect.anything());
  });

  it('should use brand maroon color for headers and borders', async () => {
    await service.generateIDCard(mockData);

    // Brand maroon used for fill and stroke
    expect(mocks.fill).toHaveBeenCalledWith('#9C1E23');
    expect(mocks.stroke).toHaveBeenCalledWith('#9C1E23');

    // Gradient effect: darker maroon strip at bottom of header
    expect(mocks.fill).toHaveBeenCalledWith('#7A171B');
  });

  it('should render photo with drop shadow and rounded corners', async () => {
    await service.generateIDCard(mockData);

    // Rounded rect used for shadow and photo clip
    expect(mocks.roundedRect).toHaveBeenCalled();

    // Clip used to mask photo to rounded corners
    expect(mocks.clip).toHaveBeenCalled();

    // Shadow uses low opacity
    expect(mocks.opacity).toHaveBeenCalledWith(0.15);
  });

  it('should render hairline separators between field rows', async () => {
    await service.generateIDCard(mockData);

    // Separator opacity
    expect(mocks.opacity).toHaveBeenCalledWith(0.3);

    // Separator stroke color
    expect(mocks.stroke).toHaveBeenCalledWith('#e0e0e0');
  });

  it('should render watermark pattern on front side', async () => {
    await service.generateIDCard(mockData);

    // Watermark uses low opacity
    expect(mocks.opacity).toHaveBeenCalledWith(0.04);

    // Watermark text rendered
    expect(mocks.text).toHaveBeenCalledWith('OSLRS', expect.anything(), expect.anything(), expect.anything());
  });

  it('should handle missing phone gracefully', async () => {
    const dataNoPhone = { ...mockData, phone: '' };
    const buffer = await service.generateIDCard(dataNoPhone);
    expect(buffer).toBeInstanceOf(Buffer);
    // Should not throw
  });
});
