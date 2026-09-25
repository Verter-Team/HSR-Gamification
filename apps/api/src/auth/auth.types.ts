import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}
