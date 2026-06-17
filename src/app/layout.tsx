import type { Metadata } from 'next';
import { AccountMenu } from '@/components/AccountMenu';
import { currentUser } from '@/lib/auth/admin';
import './globals.css';

export const metadata: Metadata = {
  title: 'KYC Agent',
  description: 'Corporate KYC Agent demo for onboarding workflow',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        {user ? (
          <div className="app-shell">
            <aside className="sidebar">
              <div className="brand-block">
                <strong>KYC Agent</strong>
                <span>Corporate onboarding automation</span>
              </div>
              <nav className="side-nav">
                <a href="/">Cases</a>
                {user.role !== 'client' && <a href="/cases/new">New Case</a>}
                <a href="/policy">Policy Review</a>
              </nav>
              <div className="sidebar-footer">
                <AccountMenu email={user.email} role={user.role} />
              </div>
            </aside>
            <div className="workspace">
              <header className="topbar">
                <div>
                  <strong>Operations Console</strong>
                  <span>Role: {user.role}</span>
                </div>
              </header>
              <main>{children}</main>
            </div>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
