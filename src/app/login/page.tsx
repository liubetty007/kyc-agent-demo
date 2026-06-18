import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { isDevAuthBypass } from '@/lib/auth/admin';

export default function LoginPage() {
  if (isDevAuthBypass()) redirect('/');
  return <LoginForm />;
}
