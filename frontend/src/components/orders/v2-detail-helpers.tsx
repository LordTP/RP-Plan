'use client';

import { cn } from '@/lib/utils';

/**
 * Shared layout primitives for the V2 detail modal — used by both the
 * orders-v2 page (Sourcelab/internal view) and FactoryV2View (factory views).
 * Pure presentational, no state — each page owns its own data + section
 * composition, these just keep the look consistent.
 */

export function HeroTile({ label, value, sub, tone }: {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className={cn('rounded-lg border px-3.5 py-3 min-w-0', tone || 'border-gray-200 bg-white')}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-none mb-1.5 truncate">{label}</div>
      <div className="text-base font-bold text-gray-900 leading-tight break-words">{value ?? '—'}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-1 leading-tight">{sub}</div>}
    </div>
  );
}

export function SectionPill({
  active, label, badge, badgeTone, onClick,
}: {
  active: boolean;
  label: string;
  badge?: string;
  badgeTone?: 'amber' | 'red' | 'blue';
  onClick: () => void;
}) {
  const badgeClass =
    badgeTone === 'red'  ? 'bg-red-100 text-red-700' :
    badgeTone === 'blue' ? 'bg-blue-100 text-blue-700' :
                           'bg-amber-100 text-amber-700';
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5',
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {label}
      {badge && (
        <span className={cn(
          'px-1 py-0 rounded text-[9px] font-bold',
          active ? 'bg-white/25 text-white' : badgeClass
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function SectionHeader({
  accent, label, badge, badgeTone,
}: {
  accent: 'blue' | 'amber' | 'teal' | 'violet';
  label: string;
  badge?: string;
  badgeTone?: 'amber' | 'red' | 'blue';
}) {
  const accentClass =
    accent === 'amber'  ? 'bg-amber-500' :
    accent === 'teal'   ? 'bg-teal-500' :
    accent === 'violet' ? 'bg-violet-500' :
                          'bg-blue-500';
  const badgeClass =
    badgeTone === 'red' ? 'bg-red-100 text-red-700' :
    badgeTone === 'blue' ? 'bg-blue-100 text-blue-700' :
                           'bg-amber-100 text-amber-700';
  return (
    <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className={cn('w-1 h-4 rounded-full', accentClass)} />
      {label}
      {badge && <span className={cn('text-[10px] px-1.5 py-0 rounded font-semibold', badgeClass)}>{badge}</span>}
    </h4>
  );
}

export function SectionDivider() {
  return <div className="px-6"><div className="border-t border-gray-200" /></div>;
}

export function SampleCard({ label, highlight, children }: {
  label: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      'rounded-lg border overflow-hidden',
      highlight ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-white'
    )}>
      <div className={cn(
        'px-3 py-1.5 border-b text-[10px] uppercase tracking-wider font-semibold',
        highlight ? 'bg-amber-50/60 border-amber-100 text-amber-800' : 'bg-gray-50/60 border-gray-100 text-gray-600'
      )}>
        {label}
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}
