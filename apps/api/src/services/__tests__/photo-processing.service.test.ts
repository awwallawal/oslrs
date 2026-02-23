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

const sharpMocks = vi.hoisted(() => ({
  metadata: vi.fn(),
  stats: vi.fn(),
  extract: vi.fn(),
  resize: vi.fn(),
  jpeg: vi.fn(),
  toBuffer: vi.fn(),
}));

// Mock sharp
vi.mock('sharp', async () => {
  return {
    default: vi.fn(() => {
        const instance = {
            metadata: sharpMocks.metadata,
            stats: sharpMocks.stats,
            toBuffer: sharpMocks.toBuffer,
            
            // wrappers to support chaining
            extract: (...args: any[]) => { sharpMocks.extract(...args); return instance; },
            resize: (...args: any[]) => { sharpMocks.resize(...args); return instance; },
            jpeg: (...args: any[]) => { sharpMocks.jpeg(...args); return instance; },
        };
        return instance;
    }),
  };
});

describe('PhotoProcessingService', () => {
  let service: PhotoProcessingService;
  const mockImageBuffer = Buffer.from('fake-image-data');
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
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
      // Setup sharp mock
      sharpMocks.metadata.mockResolvedValue({});
      sharpMocks.stats.mockResolvedValue({ channels: [{ stdev: 0 }] });

      await expect(service.processLiveSelfie(mockImageBuffer))
        .rejects
        .toThrow(AppError);
    });

    it('should process valid image and return keys (not URLs directly as they are signed)', async () => {
      // Setup sharp mock for valid metadata
      sharpMocks.metadata.mockResolvedValue({ width: 1280, height: 720, format: 'jpeg' });
      sharpMocks.stats.mockResolvedValue({ channels: [{ stdev: 50 }] }); // Valid sharpness

      // Setup sharp mock for processing
      sharpMocks.toBuffer.mockResolvedValue(Buffer.from('processed-image'));

      // Setup S3 mock
      mocks.send.mockResolvedValue({});

      const result = await service.processLiveSelfie(mockImageBuffer);

      // Service returns S3 keys (not signed URLs) - keys are stored in DB
      // Signed URLs are generated on-demand when serving the image
      expect(result).toHaveProperty('originalUrl');
      expect(result).toHaveProperty('idCardUrl');
      expect(result.originalUrl).toMatch(/^staff-photos\/original\//);
      expect(result.idCardUrl).toMatch(/^staff-photos\/id-card\//);
      expect(mocks.send).toHaveBeenCalledTimes(2); // Original + Cropped uploads
    });

    it('should throw error if image resolution is too low', async () => {
      sharpMocks.metadata.mockResolvedValue({ width: 200, height: 200, format: 'jpeg' });
      sharpMocks.stats.mockResolvedValue({ channels: [{ stdev: 50 }] });

      await expect(service.processLiveSelfie(mockImageBuffer))
        .rejects
        .toThrow('Image resolution too low');
    });

    it('should throw error if image size exceeds limit', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
      sharpMocks.metadata.mockResolvedValue({ width: 1280, height: 720, format: 'jpeg' });
      sharpMocks.stats.mockResolvedValue({ channels: [{ stdev: 50 }] });

      await expect(service.processLiveSelfie(largeBuffer))
        .rejects
        .toThrow('Image size exceeds 5MB limit');
    });

    it('should throw error if image is too blurry', async () => {
        sharpMocks.metadata.mockResolvedValue({ width: 1280, height: 720, format: 'jpeg' });
        sharpMocks.stats.mockResolvedValue({ channels: [{ stdev: 10 }] }); // Low sharpness
  
        await expect(service.processLiveSelfie(mockImageBuffer))
          .rejects
          .toThrow('Image is too blurry');
      });
  });
});