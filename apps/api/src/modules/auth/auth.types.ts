export type Role = 'alumno' | 'docente' | 'admin';

export const ROLES: readonly Role[] = ['alumno', 'docente', 'admin'];

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
