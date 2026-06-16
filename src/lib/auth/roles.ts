export type AppRole = 'client' | 'kyc' | 'admin';

export type AppUser = {
  uid: string;
  email: string;
  role: AppRole;
};

const ROLE_BY_EMAIL: Record<string, AppRole> = {
  'liuyueanan@icloud.com': 'client',
  'liubetty007@gmail.com': 'kyc',
  'liuy00066@gmail.com': 'admin',
  'alenw0620@gmail.com': 'admin',
};

export function roleForEmail(email?: string | null): AppRole | undefined {
  return email ? ROLE_BY_EMAIL[email.toLowerCase()] : undefined;
}

export function canAccessCase(user: AppUser, contactEmail?: string): boolean {
  return user.role !== 'client' || contactEmail?.toLowerCase() === user.email;
}

export function canManageCases(user: AppUser): boolean {
  return user.role === 'kyc' || user.role === 'admin';
}
