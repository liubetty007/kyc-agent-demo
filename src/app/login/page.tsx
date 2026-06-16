'use client';

import { browserAuth } from '@/lib/auth/firebase-client';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const credential = await signInWithEmailAndPassword(await browserAuth(), String(data.get('email')), String(data.get('password')));
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await credential.user.getIdToken() }),
      });
      if (!response.ok) throw new Error('This account is not authorized.');
      window.location.href = '/';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="form card login-card" onSubmit={submit}>
        <div><h1>Secure sign in</h1><p>Use the account assigned to your KYC workflow role.</p></div>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </div>
  );
}
