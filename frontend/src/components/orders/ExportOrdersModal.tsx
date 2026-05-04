'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { excelApi, ordersApi } from '@/lib/api';

/**
 * Export-orders modal — works the same on /orders, /orders-v2,
 * /factory-product, /factory-product-v2.
 *
 * Two modes:
 *   - "All"  → exports everything the user can see (server-side
 *              supplier-filter applies automatically)
 *   - "Some" → fetches a lightweight list of distinct POs and lets
 *              the user tick which ones to include
 */

interface POOption {
  po_number: string;
  customer: string | null;
  factory: string | null;
  style_count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional pre-supplied PO list (e.g. derived from already-loaded orders).
   *  If omitted, the modal fetches via /api/orders/list/distinct-pos. */
  poList?: POOption[];
  /** Used in the download filename so /factory-* exports don't collide
   *  with /orders exports in the user's downloads folder. */
  filenamePrefix?: string;
}

export function ExportOrdersModal({ open, onClose, poList: providedPOList, filenamePrefix = 'orders' }: Props) {
  const [mode, setMode] = useState<'all' | 'some'>('all');
  const [pos, setPos] = useState<POOption[]>(providedPOList || []);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  // Reset state every time the modal opens fresh
  useEffect(() => {
    if (!open) return;
    setMode('all');
    setSelected(new Set());
    setSearch('');
    if (providedPOList) {
      setPos(providedPOList);
    } else {
      setLoadingList(true);
      ordersApi.getPOList()
        .then(res => setPos(res.pos))
        .catch(() => toast.error('Failed to load PO list'))
        .finally(() => setLoadingList(false));
    }
  }, [open, providedPOList]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !exporting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, exporting, onClose]);

  const filteredPOs = useMemo(() => {
    if (!search.trim()) return pos;
    const q = search.trim().toLowerCase();
    return pos.filter(p =>
      p.po_number.toLowerCase().includes(q) ||
      (p.customer || '').toLowerCase().includes(q) ||
      (p.factory || '').toLowerCase().includes(q)
    );
  }, [pos, search]);

  const allFilteredSelected = filteredPOs.length > 0 && filteredPOs.every(p => selected.has(p.po_number));

  const toggleOne = (po: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(po)) n.delete(po); else n.add(po);
      return n;
    });
  };

  const toggleVisible = () => {
    setSelected(prev => {
      const n = new Set(prev);
      if (allFilteredSelected) {
        for (const p of filteredPOs) n.delete(p.po_number);
      } else {
        for (const p of filteredPOs) n.add(p.po_number);
      }
      return n;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const filters = mode === 'some'
        ? { po_numbers: Array.from(selected) }
        : undefined;
      const blob = await excelApi.exportExcel(filters);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      const suffix = mode === 'some' ? `_${selected.size}-pos` : '';
      link.download = `${filenamePrefix}_export${suffix}_${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(mode === 'some'
        ? `Exported ${selected.size} PO${selected.size > 1 ? 's' : ''}`
        : 'Exported all orders');
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const canExport = mode === 'all' || (mode === 'some' && selected.size > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={exporting ? undefined : onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Download className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Export to Excel</h3>
              <p className="text-[11px] text-gray-500">
                {mode === 'all'
                  ? 'Every order you have access to'
                  : selected.size > 0
                    ? `${selected.size} PO${selected.size > 1 ? 's' : ''} selected`
                    : 'Pick which POs to include'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={exporting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <ModeOption
              active={mode === 'all'}
              title="Export all"
              subtitle={loadingList ? 'Loading…' : `${pos.length} PO${pos.length === 1 ? '' : 's'}`}
              onClick={() => setMode('all')}
            />
            <ModeOption
              active={mode === 'some'}
              title="Choose POs"
              subtitle="Pick from the list"
              onClick={() => setMode('some')}
            />
          </div>
        </div>

        {/* Picker (only shown in 'some' mode) */}
        {mode === 'some' && (
          <div className="px-5 pt-2 pb-4 flex flex-col flex-1 min-h-0">
            {/* Search bar */}
            <div className="relative mb-2 flex-shrink-0">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO, customer, factory…"
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center py-10 text-xs text-gray-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading PO list…
              </div>
            ) : pos.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-400 italic">No POs to export.</div>
            ) : (
              <>
                {/* Master select-all of visible */}
                <div className="px-2 py-1.5 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md mb-1.5 text-[10px] text-gray-600 flex-shrink-0">
                  <input
                    type="checkbox"
                    className="w-3 h-3 rounded border-gray-300"
                    checked={allFilteredSelected}
                    onChange={toggleVisible}
                  />
                  <button onClick={toggleVisible} className="font-semibold hover:text-gray-900">
                    {allFilteredSelected ? 'Deselect' : 'Select'} all visible ({filteredPOs.length})
                  </button>
                  {selected.size > 0 && (
                    <span className="ml-auto text-blue-700 font-semibold">{selected.size} chosen</span>
                  )}
                </div>

                {/* PO list */}
                <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                  {filteredPOs.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 italic">No matches</div>
                  ) : filteredPOs.map(p => (
                    <label
                      key={p.po_number}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-gray-50',
                        selected.has(p.po_number) && 'bg-blue-50/60'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-gray-300"
                        checked={selected.has(p.po_number)}
                        onChange={() => toggleOne(p.po_number)}
                      />
                      <span className="font-mono font-semibold text-gray-900 w-[70px] flex-shrink-0">{p.po_number}</span>
                      <span className="text-gray-700 truncate flex-1">{p.customer || '—'}</span>
                      {p.factory && <span className="text-gray-400 truncate max-w-[120px]">{p.factory}</span>}
                      <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{p.style_count} styles</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !canExport}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {mode === 'some'
              ? selected.size === 0 ? 'Export' : `Export ${selected.size} PO${selected.size > 1 ? 's' : ''}`
              : 'Export all'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeOption({ active, title, subtitle, onClick }: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      )}
    >
      <div className={cn('text-xs font-semibold', active ? 'text-blue-800' : 'text-gray-800')}>{title}</div>
      <div className={cn('text-[11px] mt-0.5', active ? 'text-blue-700' : 'text-gray-500')}>{subtitle}</div>
    </button>
  );
}
