'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared list-surface primitives for the V2 order views (/design,
 * /orders-v2, /factory-product-v2, /factory-shipping-v2).
 *
 * Design language borrowed from the product-tool PO History page: KPI
 * tiles that double as filters, chip-style filter dropdowns, a sortable
 * table header, and a monospace status bar. The accent stays on the RP
 * App's `primary` blue rather than product-tool's indigo so these views
 * don't read as foreign next to the dashboard and components pages —
 * what carries over is the structure and density, not the hue.
 *
 * Density conventions used throughout:
 *   - 10.5px uppercase tracking-wider for tile + column labels
 *   - 11px for secondary metrics and the status bar
 *   - tabular-nums anywhere digits sit in a column
 */

// ─── Status tile ──────────────────────────────────────────────────────
// Clickable KPI card that IS the filter. Replaces the old pattern of a
// separate stat row plus a separate pill-filter row — one surface, one
// click, and the number you're looking at is the number you're filtering
// to.

export function StatusTile({
  label,
  dotColor,
  count,
  secondary,
  active,
  tone = 'primary',
  onClick,
}: {
  label: string;
  /** Raw CSS colour for the leading dot — statuses come from the DB so
   *  the palette can't be a static Tailwind class map. */
  dotColor?: string;
  count: number;
  /** Small line under the number, e.g. "1,240 units · £48,900". */
  secondary?: string;
  active: boolean;
  /** 'danger' paints the number red — used for the Late tile. */
  tone?: 'primary' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left bg-white border rounded-xl px-3 py-2.5 flex flex-col gap-0.5 transition-colors min-w-0',
        active
          ? tone === 'danger'
            ? 'border-red-500 ring-2 ring-red-100'
            : 'border-primary-500 ring-2 ring-primary-100'
          : 'border-gray-200 hover:border-gray-300',
      )}
    >
      <span className="text-[10.5px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5 truncate">
        {dotColor && (
          <span
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: dotColor }}
          />
        )}
        {label}
      </span>
      <span
        className={cn(
          'text-[22px] font-semibold leading-tight tabular-nums',
          tone === 'danger' ? 'text-red-600' : 'text-gray-900',
        )}
      >
        {count}
      </span>
      {secondary && (
        <span className="text-[11px] text-gray-500 tabular-nums truncate">{secondary}</span>
      )}
    </button>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────
// Pill-shaped dropdown. Shows its own label when idle, swaps to the
// selected value plus an inline clear affordance when active, so the
// filter row reads as a sentence of what's currently applied.

export function Chip({
  label,
  valueText,
  active,
  onClear,
  children,
}: {
  label: string;
  valueText?: string | null;
  active: boolean;
  onClear: () => void;
  /** Render-prop so options can close the popover after picking. */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'px-2.5 py-1.5 rounded-full border text-xs flex items-center gap-1.5 transition-colors max-w-[240px]',
          active
            ? 'bg-primary-50 border-primary-400 text-primary-800 font-medium'
            : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400',
        )}
      >
        <span className="truncate">
          {active && valueText ? valueText : label}
        </span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClear();
                setOpen(false);
              }
            }}
            className="text-primary-500 hover:text-primary-800 leading-none"
            title={`Clear ${label.toLowerCase()} filter`}
          >
            ×
          </span>
        ) : (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-40 shrink-0">
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-w-[320px] max-h-72 overflow-y-auto">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ─── Chip option row ──────────────────────────────────────────────────

export function Opt({
  label,
  count,
  on,
  dot,
  onClick,
}: {
  label: string;
  count?: number;
  on: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors',
        on ? 'bg-primary-50 text-primary-800 font-semibold' : 'text-gray-700 hover:bg-gray-50',
      )}
    >
      {dot && <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: dot }} />}
      <span className="truncate flex-1">{label}</span>
      {count != null && <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{count}</span>}
    </button>
  );
}

// ─── Boolean toggle pill ──────────────────────────────────────────────
// Standalone on/off filter. `tone` tints the active state so semantic
// filters (late, missing data) read as warnings rather than selections.

export function TogglePill({
  on,
  label,
  title,
  tone = 'neutral',
  onClick,
}: {
  on: boolean;
  label: string;
  title?: string;
  tone?: 'neutral' | 'warn' | 'danger';
  onClick: () => void;
}) {
  const activeClass =
    tone === 'danger' ? 'bg-red-50 border-red-400 text-red-800'
    : tone === 'warn' ? 'bg-amber-50 border-amber-400 text-amber-800'
    : 'bg-primary-50 border-primary-400 text-primary-800';
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'px-2.5 py-1.5 rounded-full border text-xs transition-colors',
        on ? `${activeClass} font-medium` : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400',
      )}
    >
      {label}
    </button>
  );
}

// ─── Segmented switcher ───────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs transition-colors',
            value === o.value
              ? 'bg-primary-50 text-primary-800 font-medium'
              : 'text-gray-500 hover:text-gray-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Sortable column header ───────────────────────────────────────────

export function SortableTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
  align = 'left',
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={cn(
        'font-medium px-3 py-2.5 border-b border-gray-200 select-none',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-gray-800 transition-colors',
          isActive && 'text-gray-900 font-semibold',
        )}
      >
        {label}
        {isActive && (
          <span className="text-[9px] leading-none opacity-70">
            {currentDir === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    </th>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────
// Monospace footer strip pinned under the table card. Left side carries
// counts, right side carries the interaction affordance hint — the thing
// that tells a first-time user rows are clickable without a tooltip.

export function StatusBar({
  segments,
  hint,
}: {
  segments: (string | null | undefined)[];
  hint?: string;
}) {
  return (
    <footer className="h-8 bg-white border border-t-0 border-gray-200 rounded-b-xl text-gray-500 text-[11px] flex items-center px-4 gap-4 shrink-0 font-mono overflow-hidden">
      {segments.filter(Boolean).map((s, i) => (
        <span key={i} className="truncate">{s}</span>
      ))}
      {hint && <span className="ml-auto text-gray-400 font-sans truncate hidden md:block">{hint}</span>}
    </footer>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────────
// Deliberately NOT positioned — the caller owns placement and the
// show/hide transition, because action panels need to stack above the
// bar inside the same positioned container. An earlier version pinned
// itself with `fixed bottom-6`, which pulled it out of the caller's
// flow and made it render ON TOP of those panels instead of below them.

export function BulkBar({
  count,
  noun = 'style',
  onClear,
  children,
}: {
  count: number;
  noun?: string;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2 flex items-center gap-2 text-xs">
      <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">
        {count} {noun}{count === 1 ? '' : 's'} selected
      </span>
      <span className="w-px h-5 bg-gray-200" />
      {children}
      <span className="w-px h-5 bg-gray-200" />
      <button
        onClick={onClear}
        className="text-gray-500 hover:text-gray-900 px-1 whitespace-nowrap"
      >
        Clear
      </button>
    </div>
  );
}
