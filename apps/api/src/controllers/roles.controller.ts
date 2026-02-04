import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { roles } from '../db/schema/index.js';

export class RolesController {
  /**
   * GET /api/v1/roles
   *
   * List all available roles.
   * Story 2.5-3, AC5
   */
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const rolesList = await db.query.roles.findMany({
        columns: {
          id: true,
          name: true,
          description: true,
        },
      });

      res.json({
        status: 'success',
        data: rolesList,
      });
    } catch (err) {
      next(err);
    }
  }
}
