import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@oslsr/utils';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';

const logger = pino({ name: 'photo-processing-service' });

export class PhotoProcessingService {
  private s3Client: S3Client;
  private bucketName: string;
  private cdnEndpoint: string | null;

  constructor() {
    // Support DigitalOcean Spaces and other S3-compatible providers
    const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
    const config: S3ClientConfig = { region };

    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.forcePathStyle = true; // Required for DO Spaces, MinIO, etc.
    }

    // DigitalOcean Spaces requires explicit credentials
    if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
      config.credentials = {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      };
    }

    this.s3Client = new S3Client(config);
    this.bucketName = process.env.S3_BUCKET_NAME || 'oslsr-media';
    this.cdnEndpoint = process.env.S3_CDN_ENDPOINT || null;

    logger.info({
      event: 'photo_service.initialized',
      bucket: this.bucketName,
      endpoint: process.env.S3_ENDPOINT || 'aws-default',
      cdnEnabled: !!this.cdnEndpoint,
    });
  }

  /**
   * Get CDN URL for a public asset (faster loading via edge cache)
   * Falls back to signed URL if CDN not configured
   */
  getCdnUrl(key: string): string | null {
    if (!this.cdnEndpoint) return null;
    return `${this.cdnEndpoint}/${key}`;
  }

  /**
   * Check if the S3 connection is working
   */
  async healthCheck(): Promise<{ healthy: boolean; bucket: string; error?: string }> {
    try {
      // Try to get bucket info by listing with max 1 item
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: '.health-check', // Non-existent key is fine, we just check auth
      });

      await this.s3Client.send(command).catch((err) => {
        // NoSuchKey is expected and means auth worked
        if (err.name !== 'NoSuchKey') throw err;
      });

      return { healthy: true, bucket: this.bucketName };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ event: 'photo_service.health_check_failed', error: errorMessage });
      return { healthy: false, bucket: this.bucketName, error: errorMessage };
    }
  }

  async processLiveSelfie(imageBuffer: Buffer): Promise<{ originalUrl: string; idCardUrl: string; livenessScore: number }> {
    // 1. Basic validation (size)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (imageBuffer.length > MAX_SIZE) {
      throw new AppError('VALIDATION_ERROR', 'Image size exceeds 5MB limit', 400);
    }

    // 2. Validate image format, resolution, and sharpness
    let metadata;
    let stats;
    try {
      const image = sharp(imageBuffer);
      metadata = await image.metadata();
      stats = await image.stats(); // Used for basic sharpness heuristic
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Invalid image format', 400);
    }

    if (!metadata.width || !metadata.height) {
      throw new AppError('VALIDATION_ERROR', 'Unable to determine image dimensions', 400);
    }

    // Check resolution — ID card output is 400x533, so minimum input is 320x240
    const minDim = Math.min(metadata.width, metadata.height);
    const maxDim = Math.max(metadata.width, metadata.height);
    if (minDim < 240 || maxDim < 320) {
      throw new AppError('VALIDATION_ERROR', 'Image resolution too low. Please use a higher resolution camera.', 400);
    }

    // Simple sharpness check (Standard Deviation of brightness channel)
    // A blurry image has low standard deviation.
    // This is a basic heuristic. Production systems should use Laplacian variance or ML.
    const sharpness = stats.channels[0].stdev; 
    if (sharpness < 20) { // Threshold determined empirically
         throw new AppError('VALIDATION_ERROR', 'Image is too blurry. Please retake.', 400);
    }

    // 3. Upload original to S3 (Private)
    const originalKey = `staff-photos/original/${uuidv7()}.jpg`;
    await this.uploadToS3(imageBuffer, originalKey);

    // 4. Auto-crop for ID card (3:4 aspect ratio)
    // Note: In a real implementation with face detection, we'd use bounding box coordinates here.
    // For now, we'll center crop to 3:4 ratio as a fallback/MVP.
    const idCardBuffer = await sharp(imageBuffer)
      .resize(400, 533, { 
        fit: 'cover', 
        position: 'center' 
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    const idCardKey = `staff-photos/id-card/${uuidv7()}.jpg`;
    await this.uploadToS3(idCardBuffer, idCardKey);

    // 5. Return URLs and calculated score
    // In production, livenessScore comes from Rekognition. 
    // Here we use sharpness/quality as a proxy score normalized 0-1.
    const livenessScore = Math.min(sharpness / 100, 0.99);

    return {
      originalUrl: originalKey, // Store KEY in DB, not signed URL
      idCardUrl: idCardKey,     // Store KEY in DB, not signed URL
      livenessScore: livenessScore 
    };
  }

  private async uploadToS3(buffer: Buffer, key: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
      // ACL: 'private', // Default is private, explicit removal of public-read
    });

    await this.s3Client.send(command);
  }

  // Helper to get buffer from S3 (used for PDF generation)
  async getPhotoBuffer(key: string): Promise<Buffer> {
      try {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        const response = await this.s3Client.send(command);
        
        if (!response.Body) {
             throw new AppError('IMAGE_NOT_FOUND', 'Image not found in storage', 404);
        }
        
        return Buffer.from(await response.Body.transformToByteArray());
      } catch (err: unknown) {
         if (err instanceof AppError) throw err;
         throw new AppError('IMAGE_FETCH_ERROR', 'Failed to fetch image from storage', 500, { error: err instanceof Error ? err.message : 'Unknown error' });
      }
  }

  // Helper to generate signed URLs (used when reading, not writing usually, but useful for immediate display)
  async getSignedUrl(key: string): Promise<string> {
      const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
      });
      // URL expires in 1 hour
      // @ts-expect-error - S3Client type mismatch with @aws-sdk/s3-request-presigner
      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }
}