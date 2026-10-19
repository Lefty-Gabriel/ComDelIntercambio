export type Role = 'admin' | 'mentor' | 'estudiante' | 'soporte';

export const ROLES: readonly Role[] = [
  'admin',
  'mentor',
  'estudiante',
  'soporte',
];

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
