'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { componentsApi } from '@/lib/api';
import type { Order } from '@/types';

/**
 * Cross-PO bulk component-add modal — opened from /design-components.
 * Pick a component name (autocomplete from existing names) + tick which
 * styles to apply it to across any POs. Submits to the cross-po-add
 * backend endpoint which skips dupes per-style.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pool of orders to pick from (already loaded by the parent page). */
  orders: Order[];
  /** Called after a successful submit so the parent can refresh + scroll to the new component. */
  onCreated: (componentName: string, createdCount: number) => void;
}

interface POGroup {
  po_number: string;
  customer: string;
  factory: string;
  styles: Order[];
}

export function AddComponentModal({ open, onClose, orders, onCreated }: Props) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [collapsedPOs, setCollapsedPOs] = useState<Set<string>>(new Set());
  const [knownNames, setKnownNames] = useState<{ name: string; count: number }[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset state every time the modal opens
  useEffect(() => {
    if (!open) return;
    setName('');
    setSearch('');
    setSelectedIds(new Set());
    setCollapsedPOs(new Set());
    setShowNameSuggestions(false);
    componentsApi.getComponentNames()
      .then((res) => setKnownNames(res.names))
      .catch(() => { /* silent */ });
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  // Group orders by PO
  const poGroups = useMemo<POGroup[]>(() => {
    const map = new Map<string, POGroup>();
    for (const o of orders) {
      if (!o.po_number) continue;
      const v = map.get(o.po_number);
      if (v) {
        v.styles.push(o);
      } else {
        map.set(o.po_number, {
          po_number: o.po_number,
          customer: o.customer || '',
          factory: o.factory || '',
          styles: [o],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.po_number.localeCompare(b.po_number));
  }, [orders]);

  // Apply search filter — match on PO number, customer, factory, or any style code/desc/colour.
  const visibleGroups = useMemo<POGroup[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return poGroups;
    return poGroups
      .map((g) => {
        const poMatches = g.po_number.toLowerCase().includes(q) ||
                          g.customer.toLowerCase().includes(q) ||
                          g.factory.toLowerCase().includes(q);
        if (poMatches) return g;
        const styles = g.styles.filter((s) =>
          (s.style_code || '').toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          (s.colour || '').toLowerCase().includes(q)
        );
        return styles.length > 0 ? { ...g, styles } : null;
      })
      .filter((g): g is POGroup => g !== null);
  }, [poGroups, search]);

  // Autocomplete suggestions for the name field
  const nameSuggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return knownNames.slice(0, 8);
    return knownNames.filter((n) =>
      n.name.toLowerCase().includes(q) && n.name.toLowerCase() !== q
    ).slice(0, 8);
  }, [name, knownNames]);

  const existingExact = useMemo(() => {
    const norm = name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!norm) return null;
    return knownNames.find((n) =>
      n.name.trim().toLowerCase().replace(/\s+/g, ' ') === norm && n.name.trim() !== name.trim()
    ) || null;
  }, [name, knownNames]);

  const togglePO = (po: string) => {
    setCollapsedPOs((prev) => {
      const next = new Set(prev);
      if (next.has(po)) next.delete(po); else next.add(po);
      return next;
    });
  };

  const toggleStyle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePOAll = (group: POGroup) => {
    const ids = group.styles.map((s) => s.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const visibleStyleIds = visibleGroups.flatMap((g) => g.styles.map((s) => s.id));
  const visibleSelectedCount = visibleStyleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleStyleIds.length > 0 && visibleSelectedCount === visibleStyleIds.length;

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleStyleIds) next.delete(id);
      } else {
        for (const id of visibleStyleIds) next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Component name is required');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Pick at least one style');
      return;
    }
    setSubmitting(true);
    try {
      const res = await componentsApi.crossPoAdd(name.trim(), Array.from(selectedIds));
      const created = res.components_created;
      const skipped = res.skipped_existing;
      const parts = [`Added "${name.trim()}" to ${created} style${created === 1 ? '' : 's'}`];
      if (skipped > 0) parts.push(`${skipped} already had it (skipped)`);
      toast.success(parts.join(' · '));
      onCreated(name.trim(), created);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to add component');
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Add component</h3>
              <p className="text-[11px] text-gray-500">
                {selectedIds.size === 0
                  ? 'Pick a name + which styles to apply it to'
                  : `${selectedIds.size} style${selectedIds.size === 1 ? '' : 's'} selected`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Name input */}
          <div className="px-5 pt-4 pb-2 flex-shrink-0">
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Component name
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setShowNameSuggestions(true); }}
                onFocus={() => setShowNameSuggestions(true)}
                onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                placeholder="e.g. Outer Shell, Lining, Trim, Zipper"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
              />
              {showNameSuggestions && nameSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto">
                  {nameSuggestions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setName(s.name); setShowNameSuggestions(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 flex items-center justify-between"
                    >
                      <span className="text-gray-800">{s.name}</span>
                      <span className="text-gray-400 text-[10px]">used on {s.count} {s.count === 1 ? 'style' : 'styles'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {existingExact && (
              <div className="mt-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-center justify-between gap-2">
                <span>Looks like <strong>"{existingExact.name}"</strong> already exists — pick it to avoid duplicates.</span>
                <button
                  type="button"
                  onClick={() => setName(existingExact.name)}
                  className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap"
                >
                  Use it →
                </button>
              </div>
            )}
          </div>

          {/* Search + select-all-visible */}
          <div className="px-5 pt-3 pb-2 flex-shrink-0">
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Apply to
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO, style, customer, factory…"
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* SKU picker — list */}
          <div className="px-5 pb-2 flex-1 min-h-0 flex flex-col">
            {visibleGroups.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-400 italic">
                {search ? 'No matches' : 'No styles available'}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-t-md text-[10px] text-gray-600 flex-shrink-0">
                  <input
                    type="checkbox"
                    className="w-3 h-3 rounded border-gray-300"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                  <button onClick={toggleAllVisible} className="font-semibold hover:text-gray-900">
                    {allVisibleSelected ? 'Deselect' : 'Select'} all visible ({visibleStyleIds.length})
                  </button>
                  {selectedIds.size > 0 && (
                    <span className="ml-auto text-violet-700 font-semibold">{selectedIds.size} chosen</span>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto border border-t-0 border-gray-200 rounded-b-md divide-y divide-gray-100">
                  {visibleGroups.map((g) => {
                    const collapsed = collapsedPOs.has(g.po_number);
                    const groupIds = g.styles.map((s) => s.id);
                    const allChosen = groupIds.every((id) => selectedIds.has(id));
                    const someChosen = !allChosen && groupIds.some((id) => selectedIds.has(id));
                    return (
                      <div key={g.po_number}>
                        {/* PO header row */}
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50/70">
                          <input
                            type="checkbox"
                            className="w-3 h-3 rounded border-gray-300"
                            checked={allChosen}
                            ref={(el) => { if (el) el.indeterminate = someChosen; }}
                            onChange={() => togglePOAll(g)}
                          />
                          <button onClick={() => togglePO(g.po_number)} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          <span className="font-mono text-xs font-semibold text-gray-900">{g.po_number}</span>
                          <span className="text-[11px] text-gray-500 truncate">{g.customer}</span>
                          <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
                            {g.styles.length} style{g.styles.length === 1 ? '' : 's'} · {g.factory}
                          </span>
                        </div>
                        {/* Styles list */}
                        {!collapsed && g.styles.map((s) => (
                          <label
                            key={s.id}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1.5 pl-9 text-[11px] cursor-pointer hover:bg-gray-50',
                              selectedIds.has(s.id) && 'bg-violet-50/40'
                            )}
                          >
                            <input
                              type="checkbox"
                              className="w-3 h-3 rounded border-gray-300"
                              checked={selectedIds.has(s.id)}
                              onChange={() => toggleStyle(s.id)}
                            />
                            <span className="font-mono text-gray-700">{s.style_code || `#${s.id}`}</span>
                            <span className="text-gray-500 truncate flex-1">{s.description}</span>
                            <span className="text-gray-400 truncate max-w-[100px]">{s.colour}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || selectedIds.size === 0}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 rounded-md hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add to {selectedIds.size} {selectedIds.size === 1 ? 'style' : 'styles'}
          </button>
        </div>
      </div>
    </div>
  );
}
