import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@oslsr/utils';
import { PHOTO_SOURCE, type PhotoSource } from '@oslsr/types';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';

const logger = pino({ name: 'photo-processing-service' });

/**
 * Blur floor for a LIVE webcam capture. Unchanged since Story 1-5 —
 * "threshold determined empirically" against webcam frames.
 */
const LIVE_SHARPNESS_MIN = 20;

/**
 * Blur floor for an UPLOADED image (Story 13-60 AC6 / Task 6).
 *
 * ⚖️ THE DECISION, STATED — the story required one of "route around the check,
 * tune it separately, or accept it", chosen deliberately and named. **We tuned
 * it separately.** The other two options both fail:
 *
 *   - INHERIT 20: the upload path exists to rescue people who cannot complete a
 *     live capture, and a phone photograph OF A PRINTED PASSPORT PICTURE is
 *     precisely the image a blur floor rejects (halftone print, reflection, and
 *     a rescale all flatten brightness stdev). The fallback would fail the exact
 *     users it was built for, and produce the SAME outcome as the bug it fixes:
 *     no photo, no ID card. Only the reason would differ.
 *   - REMOVE IT: a blank, black or hopelessly smeared frame would sail through
 *     and print an unusable ID card — the story's own failure mode wearing a
 *     different hat. The person still ends up at a household door with nothing
 *     that identifies them.
 *
 * 8 sits above "no image content at all" (a uniform frame scores ~0) and below
 * the range a legible print photograph lands in.
 *
 * ⚠️ HONESTLY LABELLED: 8 is a reasoned choice, NOT an empirical one. No corpus
 * of real uploaded passport photographs exists yet to tune against, and saying
 * "determined empirically" about a number nobody measured is how the column one
 * file over ended up called `liveness_score`. REOPEN TRIGGER: if operators
 * report uploads being rejected as blurry, or ID cards printing unreadable
 * photos, measure the real distribution and set this from data.
 */
const UPLOAD_SHARPNESS_MIN = 8;

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
      logger.error({ event: 'photo_service.health_check_failed', error: err }, 'S3 health check failed');
      return { healthy: false, bucket: this.bucketName, error: 'Storage connection failed' };
    }
  }

  /**
   * Process a staff photo for the ID card.
   *
   * @param imageBuffer Raw image bytes.
   * @param opts.source WHICH path produced this image. Governs the blur floor
   *   only — see {@link UPLOAD_SHARPNESS_MIN}. Defaults to `live_capture`,
   *   which is what every caller was doing before Story 13-60.
   */
  async processLiveSelfie(
    imageBuffer: Buffer,
    opts?: { source?: PhotoSource },
  ): Promise<{ originalUrl: string; idCardUrl: string; sharpnessScore: number }> {
    const source: PhotoSource = opts?.source ?? PHOTO_SOURCE.LIVE_CAPTURE;

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
    const floor = source === PHOTO_SOURCE.UPLOAD ? UPLOAD_SHARPNESS_MIN : LIVE_SHARPNESS_MIN;
    if (sharpness < floor) {
      throw new AppError(
        'VALIDATION_ERROR',
        source === PHOTO_SOURCE.UPLOAD
          ? 'That image is too blurry to print on an ID card. Try a sharper photo, or take a live selfie instead.'
          : 'Image is too blurry. Please retake.',
        400,
      );
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

    // 5. Return URLs and the calculated score.
    //
    // ⚠️ RENAMED FROM `livenessScore` (Story 13-60 AC6.4). This is a SHARPNESS
    // ratio and nothing else. The comment that used to sit here said "In
    // production, livenessScore comes from Rekognition" — Rekognition is not
    // wired, has never been wired, and nothing in the API gates on this value.
    // The name asserted an anti-fraud property the number does not have, which
    // is why the story could permit an upload fallback without forfeiting
    // anything: the only real check on this path is client-side "one face in
    // frame", and a printed photograph satisfies that too.
    const sharpnessScore = Math.min(sharpness / 100, 0.99);

    return {
      originalUrl: originalKey, // Store KEY in DB, not signed URL
      idCardUrl: idCardKey,     // Store KEY in DB, not signed URL
      sharpnessScore,
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
         logger.error({ event: 'photo_service.fetch_error', error: err }, 'Failed to fetch image from S3 storage');
         throw new AppError('IMAGE_FETCH_ERROR', 'Failed to fetch image from storage', 500);
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