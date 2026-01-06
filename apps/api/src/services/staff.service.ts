import { parse } from 'csv-parse/sync';
import { staffImportRowSchema, createStaffSchema, type StaffImportRow, type CreateStaffDto } from '@oslsr/types';
import { AppError, generateInvitationToken } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users, auditLogs, roles, lgas } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

export class StaffService {
  /**
   * Validates and parses CSV content for staff import.
   * @param content Raw CSV string or buffer
   * @returns Array of validated StaffImportRow objects
   * @throws AppError if validation fails
   */
  static async validateCsv(content: string | Buffer): Promise<StaffImportRow[]> {
    let records: any[];
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true
      });
    } catch (err: any) {
      throw new AppError('CSV_PARSE_ERROR', `Failed to parse CSV: ${err.message}`, 400);
    }

    if (!records || records.length === 0) {
      throw new AppError('CSV_EMPTY', 'CSV file is empty or contains no records', 400);
    }

    const validatedRows: StaffImportRow[] = [];

    for (const [index, row] of records.entries()) {
      const lineNumber = index + 2; 

      const result = staffImportRowSchema.safeParse(row);
      if (!result.success) {
        const errorMsg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new AppError(
          'CSV_VALIDATION_ERROR', 
          `Row ${lineNumber} error: ${errorMsg}`, 
          400, 
          { row: lineNumber, errors: result.error.errors }
        );
      }
      validatedRows.push(result.data);
    }

    return validatedRows;
  }

  /**
   * Manually creates a new staff member.
   * @param data validated staff data
   * @param actorId ID of the admin performing the action
   */
  static async createManual(data: CreateStaffDto, actorId: string): Promise<any> {
    const validation = createStaffSchema.safeParse(data);
    if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid staff data', 400, { errors: validation.error.errors });
    }

    const { fullName, email, phone, roleId, lgaId } = data;

    // Fetch role to verify LGA requirement
    const roleRecord = await db.query.roles.findFirst({
        where: eq(roles.id, roleId)
    });
    
    if (!roleRecord) {
        throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);
    }
    
    // Check LGA locking logic
    const roleName = roleRecord.name.toUpperCase();
    if (['ENUMERATOR', 'SUPERVISOR'].includes(roleName) && !lgaId) {
        throw new AppError('LGA_REQUIRED', `LGA is required for ${roleRecord.name}`, 400);
    }

    const token = generateInvitationToken();

    try {
        return await db.transaction(async (tx) => {
            const [newUser] = await tx.insert(users).values({
                fullName,
                email,
                phone,
                roleId,
                lgaId: lgaId || null,
                status: 'invited',
                invitationToken: token,
                invitedAt: new Date(),
            }).returning();

            await tx.insert(auditLogs).values({
                actorId: actorId,
                action: 'user.create',
                targetResource: 'users',
                targetId: newUser.id,
                details: { roleName: roleRecord.name, lgaId },
                ipAddress: 'system', // TODO: Pass from context if available
                userAgent: 'system'
            });
            
            return newUser;
        });
    } catch (err: any) {
        // Handle unique constraint violations
        if (err.code === '23505') { // Postgres unique violation
            if (err.constraint_name === 'users_email_unique') {
                throw new AppError('EMAIL_EXISTS', 'Email already exists', 409);
            }
            if (err.constraint_name === 'users_phone_unique') {
                throw new AppError('PHONE_EXISTS', 'Phone number already exists', 409);
            }
        }
        throw err;
    }
  }

  /**
   * Processes a single import row (lookup IDs, create user)
   */
  static async processImportRow(row: StaffImportRow, actorId: string): Promise<any> {
      // Lookup Role
      // TODO: Cache roles for performance in bulk
      const roleRecord = await db.query.roles.findFirst({
          where: eq(roles.name, row.role_name)
      });
      if (!roleRecord) {
          throw new AppError('ROLE_NOT_FOUND', `Role '${row.role_name}' not found`, 404);
      }

      // Lookup LGA if provided
      let lgaId: string | undefined;
      if (row.lga_name) {
          const lgaRecord = await db.query.lgas.findFirst({
              where: eq(lgas.name, row.lga_name)
          });
          if (!lgaRecord) {
               throw new AppError('LGA_NOT_FOUND', `LGA '${row.lga_name}' not found`, 404);
          }
          lgaId = lgaRecord.id;
      }

      return this.createManual({
          fullName: row.full_name,
          email: row.email,
          phone: row.phone,
          roleId: roleRecord.id,
          lgaId: lgaId
      }, actorId);
  }
}