export type AppRole = 'client' | 'kyc' | 'admin' | 'compliance';

export type AppUser = {
  uid: string;
  email: string;
  role: AppRole;
};

const ROLE_BY_EMAIL: Record<string, AppRole> = {
  'liuyueanan@icloud.com': 'client',
  'liubetty007@gmail.com': 'admin',
  'liuy00066@gmail.com': 'admin',
  'alenw0620@gmail.com': 'admin',
  'aaron.pang@antalpha.com': 'admin',
  'kexin.li@antalpha.com': 'admin',
};

export function roleForEmail(email?: string | null): AppRole | undefined {
  return email ? ROLE_BY_EMAIL[email.toLowerCase()] : undefined;
}

export function canAccessCase(user: AppUser, contactEmail?: string): boolean {
  if (user.role === 'client') {
    return Boolean(
      contactEmail
        ?.split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .includes(user.email),
    );
  }
  return user.role === 'kyc' || user.role === 'admin' || user.role === 'compliance';
}

export function canManageCases(user: AppUser): boolean {
  return user.role === 'kyc' || user.role === 'admin';
}

export function canPerformKycOperations(user: AppUser): boolean {
  return user.role === 'kyc' || user.role === 'admin';
}

export function canAccessComplianceWorkspace(user: AppUser): boolean {
  return user.role === 'compliance' || user.role === 'admin';
}

export function canSubmitComplianceDecision(user: AppUser): boolean {
  return user.role === 'compliance' || user.role === 'admin';
}
