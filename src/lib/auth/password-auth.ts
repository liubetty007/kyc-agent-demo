import { roleForEmail } from './roles';

type PasswordEntry = {
  email: string;
  password: string;
};

function parsePasswordEntries(): PasswordEntry[] {
  const raw = process.env.KYC_AUTH_PASSWORDS || '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':');
      if (separator <= 0) return null;
      const email = entry.slice(0, separator).trim().toLowerCase();
      const password = entry.slice(separator + 1);
      if (!email || !password) return null;
      return { email, password };
    })
    .filter((entry): entry is PasswordEntry => Boolean(entry));
}

export function verifyPasswordLogin(email: string, password: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!roleForEmail(normalized)) return false;
  const entry = parsePasswordEntries().find((item) => item.email === normalized);
  if (!entry) return false;
  return entry.password === password;
}

export function listPasswordAuthEmails(): string[] {
  return parsePasswordEntries()
    .map((entry) => entry.email)
    .filter((email) => roleForEmail(email));
}
