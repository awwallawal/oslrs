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
    on: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    pipe: vi.fn().mockReturnThis(),
    save: vi.fn().mockReturnThis(),
    restore: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    translate: vi.fn().mockReturnThis(),
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
      _dataCallback: Function | null = null;
      _endCallback: Function | null = null;

      constructor(options: any) {
        // Can assert options here if needed
      }
      text(...args: any[]) { mocks.text(...args); return this; }
      image(...args: any[]) { mocks.image(...args); return this; }
      addPage(...args: any[]) { mocks.addPage(...args); return this; }
      fontSize(...args: any[]) { mocks.fontSize(...args); return this; }
      font(...args: any[]) { mocks.font(...args); return this; }
      fillColor(...args: any[]) { mocks.fillColor(...args); return this; }
      rect(...args: any[]) { mocks.rect(...args); return this; }
      fill(...args: any[]) { mocks.fill(...args); return this; }
      save(...args: any[]) { mocks.save(...args); return this; }
      restore(...args: any[]) { mocks.restore(...args); return this; }
      rotate(...args: any[]) { mocks.rotate(...args); return this; }
      translate(...args: any[]) { mocks.translate(...args); return this; }
      pipe(...args: any[]) { mocks.pipe(...args); return this; }
      
      on(event: string, callback: Function) {
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
          mocks.end(); // Call spy
          // Trigger events
          if (this._dataCallback) this._dataCallback(Buffer.from('%PDF-MOCK'));
          if (this._endCallback) this._endCallback();
      }
    }
  };
});

describe('IDCardService', () => {
  let service: IDCardService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    service = new IDCardService();
    // Re-setup default mock behaviors cleared by mockReset: true
    mocks.toBuffer.mockResolvedValue(Buffer.from('fake-qr-code'));
  });

  it('should generate front and back of ID card with correct details', async () => {
    const mockData = {
        fullName: 'Adewale Johnson',
        role: 'Enumerator',
        lga: 'Ibadan North',
        photoBuffer: Buffer.from('fake-image'),
        verificationUrl: 'https://oslrs.oyostate.gov.ng/verify-staff/123'
    };

    const buffer = await service.generateIDCard(mockData);

    expect(buffer).toBeInstanceOf(Buffer);

    // Verify Front Side Elements
    // 1. Photo
    expect(mocks.image).toHaveBeenCalledWith(mockData.photoBuffer, expect.any(Number), expect.any(Number), expect.any(Object));
    
    // 2. Text Details
    expect(mocks.text).toHaveBeenCalledWith(expect.stringContaining('Adewale Johnson'), expect.any(Number), expect.any(Number), expect.anything());
    expect(mocks.text).toHaveBeenCalledWith(expect.stringContaining('ENUMERATOR'), expect.any(Number), expect.any(Number));
    expect(mocks.text).toHaveBeenCalledWith(expect.stringContaining('Ibadan North'), expect.any(Number), expect.any(Number));

    // Verify Back Side
    expect(mocks.addPage).toHaveBeenCalled();

    // Verify QR Code
    expect(mocks.toBuffer).toHaveBeenCalledWith(mockData.verificationUrl, expect.anything());
    // Expect image to be called with QR buffer
    expect(mocks.image).toHaveBeenCalledWith(Buffer.from('fake-qr-code'), expect.any(Number), expect.any(Number), expect.anything());
  });
});