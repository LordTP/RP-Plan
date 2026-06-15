'use client';

/**
 * Compact bar that surfaces the Excel-style column-filter state above the
 * orders table. The header funnel icons by themselves are easy to miss —
 * this bar makes it obvious that hidden filters are in effect and gives
 * the user a one-click route to clear them.
 *
 * Each active column shows up as a pill with its label and the count of
 * selected values; clicking the pill clears just that column. "Clear all
 * filters" wipes the lot in one go.
 */

import { Filter, X } from 'lucide-react';
import { COLUMNS } from '@/types';

interface Props {
  columnFilters: Record<string, string[]>;
  onClear: (column: string) => void;
  onClearAll: () => void;
}

export function ActiveColumnFiltersBar({ columnFilters, onClear, onClearAll }: Props) {
  const activeKeys = Object.keys(columnFilters).filter((k) => columnFilters[k]?.length > 0);
  if (activeKeys.length === 0) return null;

  const labelFor = (key: string): string => {
    const col = COLUMNS.find((c) => c.key === key);
    return col?.label || key;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-blue-50/70 border border-blue-100 rounded-md text-[11px]">
      <Filter className="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" strokeWidth={0} />
      <span className="font-semibold text-blue-900 flex-shrink-0">Column filters:</span>

      <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
        {activeKeys.map((key) => {
          const values = columnFilters[key];
          const label = labelFor(key);
          return (
            <button
              key={key}
              onClick={() => onClear(key)}
              title={`${label}: ${values.join(', ')}\nClick to remove`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white border border-blue-200 rounded text-blue-800 hover:bg-blue-100 hover:border-blue-300 transition-colors"
            >
              <span className="font-medium truncate max-w-[140px]">{label}</span>
              <span className="text-blue-500 font-mono">({values.length})</span>
              <X className="w-2.5 h-2.5 text-blue-400" />
            </button>
          );
        })}
      </div>

      <button
        onClick={onClearAll}
        className="px-2 py-0.5 text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded font-medium flex-shrink-0 transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}
