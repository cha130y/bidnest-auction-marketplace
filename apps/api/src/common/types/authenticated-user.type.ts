import type { UserRole, UserStatus } from '../../../generated/prisma/enums';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};
