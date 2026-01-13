import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@oslsr/utils';
import { uuidv7 } from 'uuidv7';

export class PhotoProcessingService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const config: S3ClientConfig = { region };

    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.forcePathStyle = true; // Required for MinIO
    }

    this.s3Client = new S3Client(config);
    this.bucketName = process.env.S3_BUCKET_NAME || 'oslsr-media';
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
    } catch (err) {
      throw new AppError('VALIDATION_ERROR', 'Invalid image format', 400);
    }

    if (!metadata.width || !metadata.height) {
      throw new AppError('VALIDATION_ERROR', 'Unable to determine image dimensions', 400);
    }

    // Check resolution (Minimum 640x480)
    if (metadata.width < 640 || metadata.height < 480) {
      throw new AppError('VALIDATION_ERROR', 'Image resolution too low. Minimum 640x480 required.', 400);
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
    // Note: In a real app, you'd store the KEY, not the signed URL (which expires).
    // For this return, we generate a short-lived URL.
    const originalUrl = await this.getSignedUrl(originalKey);

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
    const idCardUrl = await this.getSignedUrl(idCardKey);

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
      } catch (err: any) {
         if (err instanceof AppError) throw err;
         throw new AppError('IMAGE_FETCH_ERROR', 'Failed to fetch image from storage', 500, { error: err.message });
      }
  }

  // Helper to generate signed URLs (used when reading, not writing usually, but useful for immediate display)
  async getSignedUrl(key: string): Promise<string> {
      const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
      });
      // URL expires in 1 hour
      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }
}