import { UserRole } from '@oslsr/types';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: UserRole;
      lgaId?: string | null;
    }

    interface Request {
      user?: User;
    }
  }
}
