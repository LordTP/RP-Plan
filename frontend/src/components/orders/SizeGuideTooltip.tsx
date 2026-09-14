'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ruler, X, Search, Check } from 'lucide-react';
import { useSizeGuide, findSizeGuide } from '@/lib/useSizeGuide';
import type { SizeGuideRow } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * The size guide, opened from the ruler icon beside a Gender field.
 *
 * One component, used by both the Source Lab drawer and the factory drawer.
 * It was previously copy-pasted into orders-v2/page.tsx and FactoryV2View.tsx
 * byte for byte, so any fix had to be made twice or the two would drift.
 *
 * Ranges vary from 2 entries (KIDS DRY ROBE) to 15 (KIDS 3-15), and the old
 * version rendered every row as a 15-cell table row padded with empty <td>s.
 * Short ranges trailed off into a wall of blank columns under a header that
 * only said "Size Range" — no column actually labelled what it held, because
 * a size in position 3 means something different on every row. Sizes are a
 * variable-length list, not a grid, so they're chips that wrap.
 *
 * The question someone opens this to answer is "what sizes does THIS style
 * run?", so when the order carries a gender code that row is lifted out to
 * the top and the list below becomes reference. Without a code there's no
 * answer to lift, and the list is all there is.
 */
export function SizeGuideTooltip({ gender }: { gender?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="p-0.5 text-gray-300 hover:text-primary-500 focus:text-primary-500 transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded"
        title="Size guide"
        aria-label="Open the size guide"
      >
        <Ruler className="w-3 h-3" />
      </button>
      {open && <SizeGuideModal gender={gender} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SizeGuideModal({ gender, onClose }: { gender?: string | null; onClose: () => void }) {
  const { rows, isLoading } = useSizeGuide();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const active = useMemo(() => rows.filter(r => r.is_active), [rows]);
  const match = useMemo(() => findSizeGuide(active, gender), [active, gender]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(r =>
      r.code.toLowerCase().includes(q) ||
      r.label.toLowerCase().includes(q) ||
      r.sizes.some(s => s.toLowerCase().includes(q)));
  }, [active, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Typing is the fastest way through 18+ ranges, so start in the box.
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-gray-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Size guide"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-scale-in
                   w-full max-w-[680px] flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — light, like every other panel in the app. The old one was
            a dark navy gradient that belonged to a different product. */}
        <div className="px-5 pt-4 pb-3 flex items-start gap-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
            <Ruler className="w-4 h-4 text-primary-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">Size guide</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {match
                ? <>This style runs <b className="text-gray-700">{match.code}-{match.label}</b></>
                : gender
                  ? <>No range matches <b className="text-gray-700">{gender}</b> — the full list is below</>
                  : <>No gender code on this style — the full list is below</>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 -mt-0.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100
                       rounded-lg transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-primary-300"
            aria-label="Close the size guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The answer, when there is one. Lifted out so it needs no scrolling
            and no hunting for a highlighted row. */}
        {match && (
          <div className="px-5 py-3.5 bg-primary-50/50 border-b border-primary-100">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-3.5 h-3.5 text-primary-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
                This style
              </span>
              <span className="text-[11px] text-primary-600/70 font-mono">{match.code}</span>
            </div>
            <SizeChips sizes={match.sizes} tone="primary" />
          </div>
        )}

        <div className="px-5 py-2.5 border-b border-gray-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a range or a size…"
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {isLoading ? (
            <p className="px-5 py-8 text-center text-[13px] text-gray-400">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-gray-400">
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {shown.map(row => (
                <SizeRow key={row.code} row={row} isMatch={!!match && row.code === match.code} />
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-2.5 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {shown.length} of {active.length} {active.length === 1 ? 'range' : 'ranges'}
          </span>
          <span className="text-[11px] text-gray-400">Ranges are managed in Settings</span>
        </div>
      </div>
    </div>
  );
}

function SizeRow({ row, isMatch }: { row: SizeGuideRow; isMatch: boolean }) {
  return (
    <li className={cn('px-5 py-3', isMatch ? 'bg-primary-50/30' : 'hover:bg-gray-50/60 transition-colors')}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className={cn('text-[11px] font-mono font-bold tabular-nums',
          isMatch ? 'text-primary-600' : 'text-gray-400')}>{row.code}</span>
        <span className={cn('text-[12.5px] font-semibold',
          isMatch ? 'text-primary-900' : 'text-gray-800')}>{row.label}</span>
        <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
          {row.sizes.length} {row.sizes.length === 1 ? 'size' : 'sizes'}
        </span>
      </div>
      <SizeChips sizes={row.sizes} tone={isMatch ? 'primary' : 'gray'} />
    </li>
  );
}

/** Sizes wrap as chips. A range can hold 2 entries or 15, and nothing lines up
    column-to-column between rows, so a fixed grid only ever produced blanks. */
function SizeChips({ sizes, tone }: { sizes: string[]; tone: 'primary' | 'gray' }) {
  if (!sizes.length) {
    return <span className="text-[11px] text-gray-400 italic">No sizes set</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {sizes.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap tabular-nums',
            tone === 'primary'
              ? 'bg-white text-primary-700 ring-1 ring-primary-200'
              : 'bg-gray-100 text-gray-600',
          )}
        >
          {s}
        </span>
      ))}
    </div>
  );
}
