'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyticsApi } from '@/lib/api';
import { FloatingCentre } from '@/components/layout/FloatingCentre';

/**
 * Warnings Centre — designer-friendly multi-category view of dashboard
 * warnings (urgent / needs-attention / reminder). Left rail groups
 * categories by severity, right pane lists the items in the selected
 * category with a fuzzy search across PO / style / customer / factory /
 * component.
 *
 * Pulled out of dashboard/page.tsx so /dashboard and /dashboard-v2 can
 * both render it.
 *
 * FloatingWarningsCentre is the same thing on a list page: a summary strip that
 * drops the rail and pane over the table instead of above it, because those
 * pages are a fixed-height column and anything in the flow above the table
 * steals its height rather than pushing it down. It fetches for itself so a
 * page only has to mount it.
 */

const WARNING_SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  red:   { bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200',   dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  blue:  { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200',  dot: 'bg-blue-500' },
};


/**
 * Which side owes the work. Severity grouped almost nothing in practice —
 * nearly every warning is amber — whereas this is the split people actually
 * act on, and it is the same one the Warning thresholds settings page uses.
 */
const WAITING_ON_SOURCE_LAB = new Set([
  'tech_packs_needed',
  'specs_needed',
  'lab_dip_approval',
  'strike_off_approval',
  'pps_approval',
]);

export function WarningsCentre({
  warnings, embedded = false, search: searchProp, onSearchChange,
}: {
  warnings: any[];
  embedded?: boolean;
  /** Lift the search out when the box belongs in a host header rather than
   *  inside the panel — see FloatingWarningsCentre. */
  search?: string;
  onSearchChange?: (v: string) => void;
}) {
  const [selected, setSelected] = useState<string>(warnings[0]?.key || '');
  const [ownSearch, setOwnSearch] = useState('');
  const search = searchProp ?? ownSearch;
  const setSearch = onSearchChange ?? setOwnSearch;

  const filteredWarnings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warnings;
    return warnings.map(w => {
      const items = w.items.filter((item: any) =>
        (item.po_number || '').toLowerCase().includes(q) ||
        (item.style_code || '').toLowerCase().includes(q) ||
        (item.customer || '').toLowerCase().includes(q) ||
        (item.factory || '').toLowerCase().includes(q) ||
        (item.component || '').toLowerCase().includes(q)
      );
      return { ...w, items, count: items.length };
    }).filter(w => w.count > 0);
  }, [warnings, search]);

  const selectedWarning = filteredWarnings.find(w => w.key === selected) || filteredWarnings[0];

  useEffect(() => {
    if (filteredWarnings.length > 0 && !filteredWarnings.find(w => w.key === selected)) {
      setSelected(filteredWarnings[0].key);
    }
  }, [filteredWarnings, selected]);

  const totalCount = filteredWarnings.reduce((s, w) => s + w.count, 0);
  const ourCourt = filteredWarnings.filter(w => WAITING_ON_SOURCE_LAB.has(w.key));
  const theirCourt = filteredWarnings.filter(w => !WAITING_ON_SOURCE_LAB.has(w.key));

  const renderTab = (w: any) => {
    const style = WARNING_SEVERITY_STYLES[w.severity] || WARNING_SEVERITY_STYLES.amber;
    const isActive = selected === w.key;
    return (
      <button
        key={w.key}
        onClick={() => setSelected(w.key)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors rounded-lg',
          isActive ? `${style.bg} ${style.text}` : 'text-gray-700 hover:bg-gray-100/80'
        )}
      >
        <span className={cn('w-[7px] h-[7px] rounded-full flex-shrink-0', style.dot)} />
        <span className="flex-1 text-xs font-medium truncate">{w.title}</span>
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[20px] text-center',
          isActive ? 'bg-white/60' : `${style.bg} ${style.text}`
        )}>
          {w.count}
        </span>
      </button>
    );
  };

  if (!selectedWarning) {
    if (search) {
      return (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Warnings Centre</h3>
                <p className="text-xs text-gray-500">No matches for &quot;{search}&quot;</p>
              </div>
            </div>
            <SearchInput value={search} onChange={setSearch} />
          </div>
          <div className="py-16 text-center text-sm text-gray-400">
            <Search className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            No warnings match your search
          </div>
        </div>
      );
    }
    return null;
  }
  const selStyle = WARNING_SEVERITY_STYLES[selectedWarning.severity] || WARNING_SEVERITY_STYLES.amber;

  return (
    <div className={cn(embedded ? 'h-full' :
      'bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden')}>
      {/* Embedded in a FloatingCentre the card chrome and title are already
          supplied, so only the search comes with the body. */}
      {/* Embedded, the host header carries both the title and the search, so
          nothing goes here — a search row of its own left a band of empty space
          across the top of the panel. */}
      {embedded ? null : (
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900">Warnings Centre</h3>
              <p className="text-xs text-gray-500 truncate">
                {search
                  ? `${totalCount} match${totalCount !== 1 ? 'es' : ''} for "${search}"`
                  : `${totalCount} items across ${filteredWarnings.length} categories need attention`}
              </p>
            </div>
          </div>
          <SearchInput value={search} onChange={setSearch} />
        </div>
      )}

      {/* The panel is a definite height, but h-full is only a percentage of
          something definite -- and embedded, the wrapper above carried no
          classes, so this grid sized to its content instead. That is why the
          left rail's grey stopped where its rows stopped and left white below
          it, and why 109 fit samples overflowed a panel that clips. Carrying
          the height down and letting the columns shrink (min-h-0) gives the
          rail the full depth and hands the scroll to the detail pane. */}
      <div className={cn('grid grid-cols-[320px_1fr] min-h-0', embedded ? 'h-full' : 'h-[440px]')}>
        {/* Left: categories grouped by who owes the work */}
        <div className="border-r border-gray-100 bg-gray-50/60 p-3 space-y-4 min-h-0 overflow-y-auto">
          {theirCourt.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
                Waiting on the factory
              </p>
              <div className="space-y-0.5">{theirCourt.map(renderTab)}</div>
            </div>
          )}
          {ourCourt.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
                Waiting on Source Lab
              </p>
              <div className="space-y-0.5">{ourCourt.map(renderTab)}</div>
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div className="p-5 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div>
              <h4 className="text-sm font-bold text-gray-900">{selectedWarning.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">{selectedWarning.description}</p>
            </div>
            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ml-4', selStyle.bg, selStyle.text)}>
              {selectedWarning.count} flagged
            </span>
          </div>
          <PoGroupedItems items={selectedWarning.items} dotClass={selStyle.dot} />
        </div>
      </div>
    </div>
  );
}

/**
 * The detail pane, grouped by PO.
 *
 * Flat, one fit-sample warning was 109 rows -- 34 of them on PO 5279 alone,
 * every one identical apart from the style code: same customer, same factory,
 * same 37 days. That is 34 rows carrying one fact. Grouped it is 15 rows, and
 * the styles are a click away for when you want them.
 *
 * A PO holding a single item is drawn as that item, not as a band wrapping
 * one row -- a heading, a count and a chevron around one line is three levels
 * of furniture for nothing.
 */
function PoGroupedItems({ items, dotClass }: { items: any[]; dotClass: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const it of items) {
      const key = it.po_number || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries())
      .map(([po, rows]) => ({
        po,
        rows,
        first: rows[0],
        worst: Math.max(...rows.map(r => r.days_since ?? 0)),
        // Styles on one PO usually share a trigger date, so a spread is worth
        // saying out loud rather than hiding behind the maximum.
        spread: new Set(rows.map(r => r.days_since ?? 0)).size > 1,
      }))
      // Longest-waiting first — the reason anyone opens this panel.
      .sort((a, b) => b.worst - a.worst || b.rows.length - a.rows.length);
  }, [items]);

  const toggle = (po: string) => {
    const next = new Set(open);
    if (next.has(po)) next.delete(po); else next.add(po);
    setOpen(next);
  };

  return (
    <div className="space-y-1">
      {groups.map(g => {
        // One item on this PO: draw the item itself, no band.
        if (g.rows.length === 1) {
          return <ItemRow key={g.po} item={g.first} dotClass={dotClass} />;
        }
        const isOpen = open.has(g.po);
        return (
          <div key={g.po} className={cn('rounded-lg', isOpen && 'bg-gray-50/70 ring-1 ring-gray-100')}>
            <button
              onClick={() => toggle(g.po)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors group"
            >
              <span className="flex items-center gap-2.5 min-w-0 flex-1">
                <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform',
                  isOpen && 'rotate-90')} />
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
                <span className="text-sm font-bold text-gray-900 flex-shrink-0">{g.po}</span>
                <span className="text-xs text-gray-400 truncate">
                  {g.first.customer} · {g.first.factory}
                </span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
                  {g.rows.length} styles
                </span>
                <DaysPill days={g.worst} suffix={g.spread ? '+' : ''} />
              </span>
            </button>

            {isOpen && (
              <div className="pb-1">
                {g.rows.map((item: any, i: number) => (
                  <ItemRow key={item.order_id ?? i} item={item} dotClass={dotClass} indented />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DaysPill({ days, suffix = '' }: { days: number | null | undefined; suffix?: string }) {
  if (days == null) return null;
  return (
    <span className={cn(
      'text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums',
      days >= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
    )}>
      {days}d{suffix}
    </span>
  );
}

function ItemRow({ item, dotClass, indented }: { item: any; dotClass: string; indented?: boolean }) {
  return (
    <Link
      href={
        item.order_id
          ? `/design?openStyle=${item.order_id}`
          : `/design?expandPO=${encodeURIComponent(item.po_number)}`
      }
      className={cn(
        'flex items-center justify-between px-3 py-2 hover:bg-gray-100/70 rounded-lg transition-colors group',
        indented && 'pl-9',
      )}
    >
      <span className="flex items-center gap-2.5 min-w-0 flex-1">
        {!indented && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />}
        {indented ? (
          <span className="text-xs font-mono text-gray-700 flex-shrink-0">{item.style_code}</span>
        ) : (
          <>
            <span className="text-sm font-bold text-gray-900 flex-shrink-0">{item.po_number}</span>
            {item.style_code && <span className="text-xs text-gray-500 flex-shrink-0">{item.style_code}</span>}
          </>
        )}
        {item.component && (
          <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
            {item.component}
          </span>
        )}
        {!indented && (
          <span className="text-xs text-gray-400 truncate">{item.customer} · {item.factory}</span>
        )}
        {item.style_count > 1 && !item.style_code && (
          <span className="text-[10px] text-gray-400 flex-shrink-0">{item.style_count} styles</span>
        )}
      </span>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        <DaysPill days={item.days_since} />
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </span>
    </Link>
  );
}

/**
 * The Warnings Centre on a list page, collapsed to a strip.
 *
 * It lived only on the dashboard, which meant seeing what needed attention and
 * doing something about it were two different pages -- and the doing happens
 * here, on the order list, where every warning deep-links to anyway. Closed by
 * default so the list keeps its height; the strip carries the count, which is
 * the part you need without opening anything.
 */
export function FloatingWarningsCentre() {
  const [warnings, setWarnings] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    analyticsApi.getDashboardWarnings()
      .then((r: any) => { if (!cancelled) setWarnings(r?.warnings || []); })
      .catch(() => { /* silent — the strip just doesn't appear */ });
    return () => { cancelled = true; };
  }, []);

  const total = warnings.reduce((s, w) => s + (w.count || 0), 0);
  if (!warnings.length || total === 0) return null;

  const ourCount = warnings.filter(w => WAITING_ON_SOURCE_LAB.has(w.key))
    .reduce((s, w) => s + (w.count || 0), 0);
  const theirCount = total - ourCount;

  // Light up only when the work is ours. Everything here is "a warning", so
  // reacting to all of it would mean reacting permanently and saying nothing
  // — 130 of the 135 are sitting with the factories. Our own court is what
  // the team can clear today.
  const onUs = ourCount > 0;

  // Name the actual work rather than just counting it. "3 lab dips, 2 PPS"
  // tells you what to open; "5 warnings" tells you to go and look.
  const ourBreakdown = warnings
    .filter(w => WAITING_ON_SOURCE_LAB.has(w.key) && w.count > 0)
    .sort((a, b) => b.count - a.count);
  // Count trails the title — the titles are already sentences ("Strike off
  // needs approval"), so putting a number in front of one reads as broken
  // English.
  const breakdownText = ourBreakdown
    .slice(0, 3)
    .map(w => `${w.title} \u00d7${w.count}`)
    .join('  ·  ')
    + (ourBreakdown.length > 3 ? ` · +${ourBreakdown.length - 3} more` : '');

  return (
    <FloatingCentre
      icon={<AlertTriangle className={cn('w-5 h-5', onUs ? 'text-white' : 'text-amber-600')} />}
      tone={onUs ? 'urgent' : 'alert'}
      badge={onUs ? (
        <span className="flex items-baseline gap-1 flex-shrink-0">
          <span className="text-[30px] font-extrabold text-red-600 leading-none tabular-nums">
            {ourCount}
          </span>
        </span>
      ) : undefined}
      title={onUs ? 'Waiting on Source Lab' : 'Warnings Centre'}
      subtitle={
        search
          ? `Filtering on "${search}"`
          : onUs
            ? <>
                <span className="font-semibold">{breakdownText}</span>
                {theirCount > 0 && (
                  <span className="text-red-400"> · {theirCount} sitting with the factories</span>
                )}
              </>
            : `${total} ${total === 1 ? 'item needs' : 'items need'} attention`
              + (theirCount ? ` · ${theirCount} on the factories` : '')
      }
      actions={<SearchInput value={search} onChange={setSearch} />}
      panelClassName="h-[min(520px,calc(100vh-240px))]"
    >
      {/* The dashboard version already is a rail and a pane; reuse it whole
          rather than keeping two copies of the grouping and search logic. */}
      <WarningsCentre warnings={warnings} embedded search={search} onSearchChange={setSearch} />
    </FloatingCentre>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-shrink-0">
      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search PO, style, factory..."
        className="pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all w-64"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
