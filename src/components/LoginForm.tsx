'use client';

import { browserAuth } from '@/lib/auth/firebase-client';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError('');
    setLoading(true);
    try {
      const auth = await browserAuth();
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await result.user.getIdToken();
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Sign in failed.');
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="card login-card">
        <h1>KYC Agent</h1>
        <p className="small">使用已授权的 Google 账号登录。</p>
        <button className="button primary" type="button" onClick={signIn} disabled={loading}>
          {loading ? '登录中…' : '使用 Google 登录'}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </div>
  );
}
