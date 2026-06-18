import type { Metadata } from 'next';
import { AccountMenu } from '@/components/AccountMenu';
import { SidebarNav } from '@/components/SidebarNav';
import { currentUser } from '@/lib/auth/admin';
import './globals.css';

export const metadata: Metadata = {
  title: 'KYC Agent',
  description: 'Corporate KYC Agent demo for onboarding workflow',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="zh-CN">
      <body>
        {user ? (
          <>
            <header className="topbar">
              <div>
                <strong>KYC Agent</strong>
                <span>Corporate onboarding automation</span>
              </div>
              <AccountMenu email={user.email} role={user.role} />
            </header>
            <div className="app-shell">
              <SidebarNav role={user.role} />
              <div className="app-main">{children}</div>
            </div>
          </>
        ) : (
          <main className="app-main login-main">{children}</main>
        )}
      </body>
    </html>
  );
}
