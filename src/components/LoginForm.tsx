'use client';

import { signInWithEmailAndPassword, signOut, type Auth, type User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { browserAuth } from '@/lib/auth/firebase-client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function firebaseErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
  }

  async function createServerSession(user: User, auth: Auth) {
    const idToken = await user.getIdToken(true);
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    await signOut(auth).catch(() => undefined);
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (response.status === 403) {
        if (body?.error === 'Account email is not verified.') {
          throw new Error('此账号的邮箱尚未通过管理员验证。');
        }
        if (body?.error === 'Account is not allowlisted.') {
          throw new Error('此账号未获授权。');
        }
        throw new Error('浏览器安全校验未通过，请刷新页面后重试。');
      }
      throw new Error('无法建立安全登录会话，请稍后重试。');
    }
    setPassword('');
    router.push('/');
    router.refresh();
  }

  function readableSignInError(signInError: unknown): string {
    const code = firebaseErrorCode(signInError);
    if (code === 'auth/invalid-credential' || code === 'auth/invalid-email') {
      return '邮箱或密码不正确。';
    }
    if (code === 'auth/user-disabled') return '此账号已被停用，请联系管理员。';
    if (code === 'auth/too-many-requests') return '登录尝试过多，请稍后重试。';
    if (code === 'auth/operation-not-allowed') return '密码登录尚未在认证平台启用。';
    if (code === 'auth/network-request-failed') return '无法连接登录服务，请检查网络后重试。';
    if (signInError instanceof Error && (
      signInError.message.startsWith('此账号')
      || signInError.message.startsWith('浏览器')
      || signInError.message.startsWith('无法建立')
    )) {
      return signInError.message;
    }
    return '登录失败，请稍后重试。';
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('请输入邮箱和密码。');
      return;
    }

    setLoading(true);
    try {
      const auth = await browserAuth();
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await createServerSession(credential.user, auth);
    } catch (signInError) {
      setError(readableSignInError(signInError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="card login-card">
        <h1>KYC Agent</h1>
        <p className="small">请使用管理员分配的授权邮箱和强密码登录。</p>
        <form className="login-form" onSubmit={submitLogin}>
          <label className="field">
            <span>邮箱</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              required
            />
          </label>
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? '正在安全登录…' : '登录'}
          </button>
        </form>
        <p className="small login-security-note">仅允许预先批准的账号；登录后创建 8 小时的 HttpOnly 安全会话。</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
