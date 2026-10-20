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
  title?: string;
  company?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  bio?: string;
  avatarUrl?: string;
}
