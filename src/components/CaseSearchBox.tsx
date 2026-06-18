'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type CaseSearchOption = {
  id: string;
  companyName: string;
  contactEmail?: string;
};

type CaseSearchBoxProps = {
  cases: CaseSearchOption[];
  variant?: 'default' | 'hero';
};

export function CaseSearchBox({ cases, variant = 'default' }: CaseSearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const isHero = variant === 'hero';

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return cases
      .filter((caseData) => {
        const name = caseData.companyName.toLowerCase();
        const email = (caseData.contactEmail || '').toLowerCase();
        return name.includes(normalized) || email.includes(normalized);
      })
      .slice(0, 10);
  }, [cases, query]);

  function openCase(caseId: string) {
    setQuery('');
    router.push(`/cases/${caseId}`);
  }

  return (
    <div className={`case-search${isHero ? ' case-search-hero' : ''}`}>
      {!isHero && (
        <label className="case-search-label" htmlFor="case-search-input">
          搜索客户
        </label>
      )}
      <div className="case-search-field">
        <span className="case-search-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          id="case-search-input"
          type="search"
          className="case-search-input"
          placeholder={isHero ? '搜索客户名称或邮箱，快速进入案件…' : '输入客户名称或邮箱，回车进入案件…'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              openCase(matches[0].id);
            }
          }}
        />
      </div>
      {query.trim() && (
        <ul className="case-search-results">
          {matches.length ? (
            matches.map((caseData) => (
              <li key={caseData.id}>
                <button type="button" className="case-search-result" onClick={() => openCase(caseData.id)}>
                  <strong>{caseData.companyName}</strong>
                  {caseData.contactEmail ? <span className="small">{caseData.contactEmail}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="case-search-empty">没有匹配的案件</li>
          )}
        </ul>
      )}
    </div>
  );
}
