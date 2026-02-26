/**
 * System Controller
 *
 * Handles health check and Prometheus metrics endpoints.
 * Super Admin only.
 *
 * Created in Story 6-2.
 */

import { Request, Response, NextFunction } from 'express';
import { MonitoringService } from '../services/monitoring.service.js';
import { metricsRegistry } from '../middleware/metrics.js';

export class SystemController {
  /**
   * GET /system/health — Full system health check (Super Admin only)
   */
  static async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const health = await MonitoringService.getSystemHealth();
      res.status(200).json({ data: health });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /system/metrics — Prometheus exposition format (Super Admin only)
   */
  static async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await metricsRegistry.metrics();
      res.set('Content-Type', metricsRegistry.contentType);
      res.status(200).send(metrics);
    } catch (err) {
      next(err);
    }
  }
}
