import { z } from 'zod';

export const staffImportRowSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(1, "Phone number is required"),
  role_name: z.string().min(1, "Role name is required"),
  lga_name: z.string().optional(),
});

export type StaffImportRow = z.infer<typeof staffImportRowSchema>;

export const createStaffSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(1, "Phone number is required"),
  roleId: z.string().uuid("Invalid Role ID"),
  lgaId: z.string().uuid("Invalid LGA ID").optional(), // Optional for state-wide
});

export type CreateStaffDto = z.infer<typeof createStaffSchema>;

export interface ImportJobSummary {
  jobId: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
    data?: any;
  }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
}