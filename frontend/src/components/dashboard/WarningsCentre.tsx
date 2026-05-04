'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Warnings Centre — designer-friendly multi-category view of dashboard
 * warnings (urgent / needs-attention / reminder). Left rail groups
 * categories by severity, right pane lists the items in the selected
 * category with a fuzzy search across PO / style / customer / factory /
 * component.
 *
 * Pulled out of dashboard/page.tsx so /dashboard and /dashboard-v2 can
 * both render it.
 */

const WARNING_SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  red:   { bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200',   dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  blue:  { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200',  dot: 'bg-blue-500' },
};

export function WarningsCentre({ warnings }: { warnings: any[] }) {
  const [selected, setSelected] = useState<string>(warnings[0]?.key || '');
  const [search, setSearch] = useState('');

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
  const redWarnings = filteredWarnings.filter(w => w.severity === 'red');
  const amberWarnings = filteredWarnings.filter(w => w.severity === 'amber');
  const blueWarnings = filteredWarnings.filter(w => w.severity === 'blue');

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
        <AlertTriangle className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? style.text : 'text-gray-400')} />
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
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
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

      <div className="grid grid-cols-[320px_1fr] h-[440px]">
        {/* Left: tabs grouped by severity */}
        <div className="border-r border-gray-100 bg-gray-50/60 p-3 space-y-4 overflow-y-auto">
          {redWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1.5 px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Urgent
              </p>
              <div className="space-y-0.5">{redWarnings.map(renderTab)}</div>
            </div>
          )}
          {amberWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1.5 px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Needs Attention
              </p>
              <div className="space-y-0.5">{amberWarnings.map(renderTab)}</div>
            </div>
          )}
          {blueWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5 px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Reminder
              </p>
              <div className="space-y-0.5">{blueWarnings.map(renderTab)}</div>
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div className="p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div>
              <h4 className="text-sm font-bold text-gray-900">{selectedWarning.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">{selectedWarning.description}</p>
            </div>
            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ml-4', selStyle.bg, selStyle.text)}>
              {selectedWarning.count} flagged
            </span>
          </div>
          <div className="space-y-1">
            {selectedWarning.items.map((item: any, i: number) => (
              <Link
                key={i}
                href={
                  item.order_id
                    ? `/design?openStyle=${item.order_id}`
                    : `/design?expandPO=${encodeURIComponent(item.po_number)}`
                }
                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', selStyle.dot)} />
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">{item.po_number}</span>
                  {item.style_code && <span className="text-xs text-gray-500 flex-shrink-0">{item.style_code}</span>}
                  {item.component && <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">{item.component}</span>}
                  <span className="text-xs text-gray-400 truncate">{item.customer} · {item.factory}</span>
                  {item.style_count > 1 && !item.style_code && <span className="text-[10px] text-gray-400 flex-shrink-0">{item.style_count} styles</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.days_since != null && (
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      item.days_since >= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {item.days_since}d
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
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
