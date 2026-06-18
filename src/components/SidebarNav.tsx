'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole } from '@/lib/auth/roles';

const BASE_NAV_ITEMS = [
  { href: '/', label: '首页', hint: '搜索与概览', match: (path: string) => path === '/' },
  { href: '/cases', label: '所有 Cases', hint: '全部案件', match: (path: string) => path === '/cases' },
  {
    href: '/cases/in-progress',
    label: '流程中的 Cases',
    hint: '进行中',
    match: (path: string) => path === '/cases/in-progress',
  },
  {
    href: '/cases/completed',
    label: '已完成的 Cases',
    hint: '已结案',
    match: (path: string) => path === '/cases/completed',
  },
  {
    href: '/cases/compliance-submitted',
    label: '已送合规',
    hint: '抓取回复',
    match: (path: string) => path === '/cases/compliance-submitted' || path === '/compliance',
  },
  { href: '/policy', label: 'Policies', hint: '合规政策', match: (path: string) => path === '/policy' },
];

type SidebarNavProps = {
  role: AppRole;
};

export function SidebarNav({ role }: SidebarNavProps) {
  const pathname = usePathname();
  const navItems =
    role === 'kyc' || role === 'admin'
      ? BASE_NAV_ITEMS
      : BASE_NAV_ITEMS.filter((item) => item.href !== '/cases/compliance-submitted');

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="sidebar-brand-mark">K</span>
        <span>
          <strong>KYC Agent</strong>
          <small>Onboarding</small>
        </span>
      </Link>
      <p className="sidebar-label">目录</p>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link${item.match(pathname) ? ' active' : ''}`}
          >
            <span className="sidebar-link-text">{item.label}</span>
            <span className="sidebar-link-hint">{item.hint}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
