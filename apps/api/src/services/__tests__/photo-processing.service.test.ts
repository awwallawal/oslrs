import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PhotoProcessingService } from '../photo-processing.service.js';
import { AppError } from '@oslsr/utils';

// Mock S3 client using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    send: vi.fn(),
    s3Constructor: vi.fn(),
    getSignedUrl: vi.fn(),
  };
});

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class {
      constructor(config: any) {
        mocks.s3Constructor(config);
      }
      send = mocks.send;
    },
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: mocks.getSignedUrl,
  };
});

// Mock sharp
vi.mock('sharp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sharp')>();
  const mockSharpInstance = {
    metadata: vi.fn(),
    stats: vi.fn(),
    extract: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(),
  };
  
  return {
    default: vi.fn(() => mockSharpInstance),
  };
});

describe('PhotoProcessingService', () => {
  let service: PhotoProcessingService;
  const mockImageBuffer = Buffer.from('fake-image-data');
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv }; // Reset env vars
    service = new PhotoProcessingService();
    mocks.getSignedUrl.mockResolvedValue('https://mock-signed-url.com/image.jpg');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should configure S3Client with endpoint if provided (MinIO support)', () => {
      process.env.S3_ENDPOINT = 'https://minio.local';
      process.env.AWS_REGION = 'us-east-1';
      
      new PhotoProcessingService();
      
      expect(mocks.s3Constructor).toHaveBeenCalledWith(expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'https://minio.local',
        forcePathStyle: true
      }));
    });
  });

  describe('processLiveSelfie', () => {
    it('should throw error if image format is invalid', async () => {
      // Setup sharp mock to return empty metadata (simulating invalid image)
      const sharp = await import('sharp');
      const mockSharp = sharp.default(mockImageBuffer);
      (mockSharp.metadata as any).mockResolvedValue({});
      (mockSharp.stats as any).mockResolvedValue({ channels: [{ stdev: 0 }] });

      await expect(service.processLiveSelfie(mockImageBuffer))
        .rejects
        .toThrow(AppError);
    });

    it('should process valid image and return keys (not URLs directly as they are signed)', async () => {
      // Setup sharp mock for valid metadata
      const sharp = await import('sharp');
      const mockSharp = sharp.default(mockImageBuffer);
      (mockSharp.metadata as any).mockResolvedValue({ width: 1280, height: 720, format: 'jpeg' });
      (mockSharp.stats as any).mockResolvedValue({ channels: [{ stdev: 50 }] }); // Valid sharpness
      
      // Setup sharp mock for processing
      (mockSharp.toBuffer as any).mockResolvedValue(Buffer.from('processed-image'));

      // Setup S3 mock
      mocks.send.mockResolvedValue({});

      const result = await service.processLiveSelfie(mockImageBuffer);

      expect(result).toHaveProperty('originalUrl');
      expect(result).toHaveProperty('idCardUrl');
      expect(mocks.send).toHaveBeenCalledTimes(2); // Original + Cropped
      expect(mocks.getSignedUrl).toHaveBeenCalledTimes(2); // Signed URL generation
    });

    it('should throw error if image resolution is too low', async () => {
      const sharp = await import('sharp');
      const mockSharp = sharp.default(mockImageBuffer);
      (mockSharp.metadata as any).mockResolvedValue({ width: 200, height: 200, format: 'jpeg' });
      (mockSharp.stats as any).mockResolvedValue({ channels: [{ stdev: 50 }] });

      await expect(service.processLiveSelfie(mockImageBuffer))
        .rejects
        .toThrow('Image resolution too low');
    });

    it('should throw error if image size exceeds limit', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
      const sharp = await import('sharp');
      const mockSharp = sharp.default(largeBuffer);
      (mockSharp.metadata as any).mockResolvedValue({ width: 1280, height: 720, format: 'jpeg' });
      (mockSharp.stats as any).mockResolvedValue({ channels: [{ stdev: 50 }] });

      await expect(service.processLiveSelfie(largeBuffer))
        .rejects
        .toThrow('Image size exceeds 5MB limit');
    });

    it('should throw error if image is too blurry', async () => {
        const sharp = await import('sharp');
        const mockSharp = sharp.default(mockImageBuffer);
        (mockSharp.metadata as any).mockResolvedValue({ width: 1280, height: 720, format: 'jpeg' });
        (mockSharp.stats as any).mockResolvedValue({ channels: [{ stdev: 10 }] }); // Low sharpness
  
        await expect(service.processLiveSelfie(mockImageBuffer))
          .rejects
          .toThrow('Image is too blurry');
      });
  });
});