import { describe, expect, beforeAll, vi } from 'vitest';
import supertest from 'supertest';
import { goldenPath } from '@oslsr/testing/decorators';

// Mock PhotoProcessingService to return a real buffer without hitting S3
vi.mock('../services/photo-processing.service.js', () => {
  return {
    PhotoProcessingService: class {
      async getPhotoBuffer() {
        // Return a simple valid image buffer (1x1 PNG) to allow sharp/pdfkit to work
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      }
    }
  }
});

import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, lgas } from '../db/schema/index.js';
import { modulus11Generate } from '@oslsr/utils/src/validation';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';

const request = supertest(app);

describe('Performance: ID Card Generation', () => {
  let authToken: string;

  beforeAll(async () => {
    // Setup Role and LGA
    const [role] = await db.insert(roles).values({ name: 'PERF_USER', description: 'Perf' }).onConflictDoNothing().returning();
    const roleId = role?.id || (await db.query.roles.findFirst({ where: eq(roles.name, 'PERF_USER') }))!.id;

    const [lga] = await db.insert(lgas).values({ name: 'Perf LGA', code: 'perf_lga' }).onConflictDoNothing().returning();
    const lgaId = lga?.id || (await db.query.lgas.findFirst({ where: eq(lgas.name, 'Perf LGA') }))!.id;

    const email = `perf-${Date.now()}@example.com`;
    const seed = Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
    const nin = modulus11Generate(seed);

    const [user] = await db.insert(users).values({
      email,
      fullName: 'Performance Test',
      roleId: roleId,
      lgaId: lgaId,
      status: 'active',
      nin,
      staffId: 'OS/2026/PERF',
      liveSelfieIdCardUrl: 'mock/path.jpg', // Required for ID card generation
    }).returning();

    authToken = jwt.sign(
      { userId: user.id, email: user.email, role: 'PERF_USER' },
      process.env.JWT_SECRET || 'test-secret'
    );

    // Warmup call: Pre-initialize PDF/image processing libraries
    // This ensures cold-start overhead doesn't affect the timed test
    await request
      .get('/api/v1/users/id-card')
      .set('Authorization', `Bearer ${authToken}`);
  });

  goldenPath('should generate ID card quickly', async () => {
    const res = await request
      .get('/api/v1/users/id-card')
      .set('Authorization', `Bearer ${authToken}`);

    if (res.status !== 200) {
        console.error('Performance Test Failed:', res.status, res.body);
    }

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe('application/pdf');
  }, 2.0); // 2s SLA (after warmup)
});
