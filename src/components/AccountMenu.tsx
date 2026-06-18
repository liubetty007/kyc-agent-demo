'use client';

export function AccountMenu({ email, role }: { email: string; role: string }) {
  async function logout() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.href = '/';
  }
  return <div className="account-menu"><span>{email} · {role}</span><button className="button" onClick={logout}>Sign out</button></div>;
}

