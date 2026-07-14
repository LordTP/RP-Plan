'use client';

/**
 * Excel-style per-column filter dropdown — opens from a small funnel icon
 * on each column header in OrderTable. Multi-select tickbox list with
 * search, "Select All", and a "(Blanks)" option for null/empty rows.
 *
 * Lazy: the distinct-values request fires only the first time the user
 * opens this column. The list refreshes every time it re-opens so it
 * reflects the latest data and the other column filters in effect.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, X, Loader2, Check } from 'lucide-react';
import { ordersApi, type DistinctValuesResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  /** snake_case field name on the Order model. */
  column: string;
  /** Human-readable column label, shown in the popup header. */
  label: string;
  /** Currently selected values for THIS column. Empty array = no filter. */
  selected: string[];
  /** All active column filters across the table — needed so the distinct
   *  call narrows by other columns' selections (Excel behaviour). */
  allFilters: Record<string, string[]>;
  /** Which tab the parent /orders view is on. Passed through so the
   *  distinct-values call scopes to just the tab's rows (internal only —
   *  suppliers don't see the shipped/active distinction). */
  tab?: 'orders' | 'shipped';
  /** Called when the user clicks Apply. New array replaces the selection;
   *  pass empty to clear the filter on this column. */
  onApply: (values: string[]) => void;
}

const BLANK_SENTINEL = '__BLANK__';

export function ColumnFilterDropdown({
  column,
  label,
  selected,
  allFilters,
  tab,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DistinctValuesResponse | null>(null);
  const [search, setSearch] = useState('');
  // Working selection — committed on Apply, discarded on Cancel.
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const isFiltered = selected.length > 0;

  // Position the popup relative to the trigger when it opens
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPUP_W = 280;
    const POPUP_H = 380;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + POPUP_W > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - POPUP_W - 8);
    }
    if (top + POPUP_H > window.innerHeight - 8) {
      top = Math.max(8, rect.top - POPUP_H - 4);
    }
    setPopupPos({ top, left });
  }, [open]);

  // Fetch distinct values whenever the dropdown opens
  useEffect(() => {
    if (!open) return;
    setDraft(new Set(selected));
    setSearch('');
    setLoading(true);
    ordersApi.getDistinctValues(column, allFilters, tab)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, column, tab]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const filteredValues = useMemo(() => {
    if (!data) return [] as string[];
    const q = search.trim().toLowerCase();
    if (!q) return data.values;
    return data.values.filter((v) => v.toLowerCase().includes(q));
  }, [data, search]);

  const allVisibleSelected = useMemo(() => {
    if (!data || filteredValues.length === 0) return false;
    return filteredValues.every((v) => draft.has(v));
  }, [data, filteredValues, draft]);

  const toggleOne = (v: string) => {
    setDraft((prev) => {
      const n = new Set(prev);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });
  };

  const toggleAllVisible = () => {
    setDraft((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) {
        for (const v of filteredValues) n.delete(v);
      } else {
        for (const v of filteredValues) n.add(v);
      }
      return n;
    });
  };

  const handleApply = () => {
    onApply(Array.from(draft));
    setOpen(false);
  };

  const handleClear = () => {
    onApply([]);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={isFiltered ? `${selected.length} filter${selected.length === 1 ? '' : 's'} active` : 'Filter'}
        className={cn(
          'inline-flex items-center justify-center w-4 h-4 rounded transition-colors flex-shrink-0',
          isFiltered
            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
            : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'
        )}
      >
        <Filter className="w-3 h-3" fill={isFiltered ? 'currentColor' : 'none'} strokeWidth={isFiltered ? 0 : 2} />
      </button>

      {open && popupPos && typeof window !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[100] w-[280px] bg-white rounded-lg shadow-xl ring-1 ring-gray-200 flex flex-col overflow-hidden"
          style={{ top: popupPos.top, left: popupPos.left, maxHeight: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div className="text-xs font-semibold text-gray-900 truncate">{label}</div>
            <button onClick={() => setOpen(false)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <div className="relative">
              <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search values…"
                autoFocus
                className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-xs text-gray-400 gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </div>
            ) : !data ? (
              <div className="text-center py-8 text-xs text-gray-400 italic">Failed to load values</div>
            ) : data.values.length === 0 && !data.has_blanks ? (
              <div className="text-center py-8 text-xs text-gray-400 italic">No values to filter</div>
            ) : (
              <div className="py-1">
                {/* Select all (toggles only the visible/filtered list) */}
                <label className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-3 h-3 rounded border-gray-300"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                  <span>{allVisibleSelected ? 'Deselect all' : 'Select all'} ({filteredValues.length})</span>
                </label>
                <div className="border-t border-gray-50 my-1" />

                {/* (Blanks) option — only show when search is empty, since
                    "blank" never matches user-typed text. */}
                {data.has_blanks && !search.trim() && (
                  <label className="flex items-center gap-2 px-3 py-1 text-xs text-gray-600 italic hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded border-gray-300"
                      checked={draft.has(BLANK_SENTINEL)}
                      onChange={() => toggleOne(BLANK_SENTINEL)}
                    />
                    <span>(Blanks)</span>
                  </label>
                )}

                {filteredValues.map((v) => (
                  <label
                    key={v}
                    className="flex items-center gap-2 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded border-gray-300"
                      checked={draft.has(v)}
                      onChange={() => toggleOne(v)}
                    />
                    <span className="truncate">{formatValue(v, data.is_date)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-2 bg-gray-50/50 flex-shrink-0">
            <button
              onClick={handleClear}
              disabled={selected.length === 0}
              className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-200 rounded hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Apply
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Format dates as "12 May 2026" for display; values arrive as ISO yyyy-mm-dd.
function formatValue(v: string, isDate: boolean): string {
  if (!isDate) return v;
  try {
    const d = new Date(v + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return v;
  }
}
