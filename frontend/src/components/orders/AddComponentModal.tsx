'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { componentsApi } from '@/lib/api';
import type { Order, ComponentSampleType } from '@/types';

/**
 * Cross-PO bulk component-add modal — opened from /design-components.
 *
 * Split-panel layout:
 *   Left rail  — sample type + component name + popular names.
 *   Right col  — search input + filter chips + PO-grouped style list.
 *   Bottom     — sticky selection tray + submit footer.
 *
 * Submits via componentsApi.crossPoAdd, which skips duplicates per-style.
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

// Which filter dropdown (if any) is currently open. Simple UI state — the
// three chips share a single popover slot so only one is visible at once.
type OpenFilter = null | 'customer' | 'season' | 'style';

export function AddComponentModal({ open, onClose, orders, onCreated }: Props) {
  const [sampleType, setSampleType] = useState<ComponentSampleType | null>(null);

  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [collapsedPOs, setCollapsedPOs] = useState<Set<string>>(new Set());
  const [knownNames, setKnownNames] = useState<{ name: string; count: number }[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filter chips — each holds the set of picked values. Empty set = no
  // filter on that dimension. Multi-select: click each option in the
  // popover to toggle it.
  const [customerFilter, setCustomerFilter] = useState<Set<string>>(new Set());
  const [seasonFilter, setSeasonFilter] = useState<Set<string>>(new Set());
  const [styleFilter, setStyleFilter] = useState<Set<string>>(new Set());
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);

  // Reset state every time the modal opens
  useEffect(() => {
    if (!open) return;
    setSampleType(null);
    setName('');
    setSearch('');
    setSelectedIds(new Set());
    setCollapsedPOs(new Set());
    setShowNameSuggestions(false);
    setCustomerFilter(new Set());
    setSeasonFilter(new Set());
    setStyleFilter(new Set());
    setOpenFilter(null);
    componentsApi.getComponentNames()
      .then((res) => setKnownNames(res.names))
      .catch(() => { /* silent */ });
  }, [open]);

  // Esc to close (unless a filter popover is open — that takes priority).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || submitting) return;
      if (openFilter) {
        setOpenFilter(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose, openFilter]);

  // Drop styles that are past the point where adding a component makes
  // sense — shipped orders (tracking ref set) and PP-approved lines.
  const isPPDone = (o: Order) => {
    const s = (o.pps_status || '').trim().toUpperCase();
    return s === 'APPROVED' || s === 'NOT REQUIRED' || !!o.pps_approved;
  };
  const isShipped = (o: Order) => {
    const tr = (o.tracking_reference || '').trim();
    return tr.length > 0;
  };

  const eligibleOrders = useMemo(
    () => orders.filter((o) => o.po_number && !isShipped(o) && !isPPDone(o)),
    [orders],
  );

  // Distinct-value lists for the filter chips. Sorted for stable UI.
  const customerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of eligibleOrders) if (o.customer) set.add(o.customer);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [eligibleOrders]);

  const seasonOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of eligibleOrders) if (o.season) set.add(o.season);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [eligibleOrders]);

  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of eligibleOrders) {
      // style_base is auto-derived on the backend (everything before the
      // first dash). Fall back to style_code if base isn't set.
      const s = o.style_base || o.style_code;
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [eligibleOrders]);

  // Apply filter chips first, THEN search — this way the search is scoped
  // to the currently-visible chip filters (search inside e.g. "Chelsea").
  // Each dimension is OR within itself (customer in {Chelsea, Stoke})
  // and AND across dimensions (customer OR-set  AND  season OR-set).
  const filteredOrders = useMemo(() => {
    return eligibleOrders.filter((o) => {
      if (customerFilter.size > 0 && !customerFilter.has(o.customer || '')) return false;
      if (seasonFilter.size > 0 && !seasonFilter.has(o.season || '')) return false;
      if (styleFilter.size > 0) {
        const base = o.style_base || o.style_code || '';
        if (!styleFilter.has(base)) return false;
      }
      return true;
    });
  }, [eligibleOrders, customerFilter, seasonFilter, styleFilter]);

  // Group filtered orders by PO
  const poGroups = useMemo<POGroup[]>(() => {
    const map = new Map<string, POGroup>();
    for (const o of filteredOrders) {
      const v = map.get(o.po_number!);
      if (v) {
        v.styles.push(o);
      } else {
        map.set(o.po_number!, {
          po_number: o.po_number!,
          customer: o.customer || '',
          factory: o.factory || '',
          styles: [o],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.po_number.localeCompare(b.po_number));
  }, [filteredOrders]);

  // Apply search filter on top of chip filters.
  const visibleGroups = useMemo<POGroup[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return poGroups;
    return poGroups
      .map((g) => {
        const poMatches = g.po_number.toLowerCase().includes(q) ||
                          g.customer.toLowerCase().includes(q) ||
                          g.factory.toLowerCase().includes(q) ||
                          g.styles.some((s) =>
                            (s.customer_po_number || '').toLowerCase().includes(q) ||
                            (s.china_orderbook_ref || '').toLowerCase().includes(q)
                          );
        if (poMatches) return g;
        const styles = g.styles.filter((s) =>
          (s.style_code || '').toLowerCase().includes(q) ||
          (s.customer_style_code || '').toLowerCase().includes(q) ||
          (s.customer_po_number || '').toLowerCase().includes(q) ||
          (s.china_orderbook_ref || '').toLowerCase().includes(q) ||
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

  // Ordered list of selected orders, used by the sticky tray. Same order
  // as they appear in the list (PO number → style code) so the tray
  // matches user mental model of what they picked.
  const selectedOrders = useMemo(() => {
    const list = eligibleOrders.filter((o) => selectedIds.has(o.id));
    list.sort((a, b) => {
      const p = (a.po_number || '').localeCompare(b.po_number || '');
      if (p !== 0) return p;
      return (a.style_code || '').localeCompare(b.style_code || '');
    });
    return list;
  }, [eligibleOrders, selectedIds]);

  const handleSubmit = async () => {
    if (!sampleType) { toast.error('Pick a sample type first'); return; }
    if (!name.trim()) { toast.error('Component name is required'); return; }
    if (selectedIds.size === 0) { toast.error('Pick at least one style'); return; }
    setSubmitting(true);
    try {
      const res = await componentsApi.crossPoAdd(name.trim(), Array.from(selectedIds), sampleType);
      const created = res.components_created;
      const skipped = res.skipped_existing;
      const typeLabel = sampleType === 'strike_off' ? 'Strike Off'
                      : sampleType === 'lab_dip'    ? 'Lab Dip'
                      : 'Label';
      const parts = [`Added "${name.trim()}" (${typeLabel}) to ${created} style${created === 1 ? '' : 's'}`];
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
        className="w-full max-w-6xl bg-white rounded-xl shadow-2xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ─── Header ─── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Add component</h3>
              <p className="text-xs text-gray-500">Pick a type + name, then choose the styles to apply it to.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Body: left rail + right column ─── */}
        <div className="flex flex-1 min-h-0">

          {/* Left rail — type + name + popular names */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 bg-gray-50/40 flex flex-col overflow-y-auto">
            <div className="px-5 pt-5 pb-4">
              <div className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Sample type
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSampleType('strike_off')}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-colors',
                    sampleType === 'strike_off'
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-gray-200 bg-white hover:border-violet-300 text-gray-700'
                  )}
                >
                  <div className="text-sm font-bold">Strike Off</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Fabric / print</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSampleType('lab_dip')}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-colors',
                    sampleType === 'lab_dip'
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-gray-200 bg-white hover:border-violet-300 text-gray-700'
                  )}
                >
                  <div className="text-sm font-bold">Lab Dip</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Colour match</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSampleType('label')}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-colors',
                    sampleType === 'label'
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-gray-200 bg-white hover:border-violet-300 text-gray-700'
                  )}
                >
                  <div className="text-sm font-bold">Label</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Woven / care</div>
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                Each component tracks one type — can&apos;t be changed later.
              </p>
            </div>

            <div className="px-5 pt-1 pb-4">
              <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2 block">
                Component name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setShowNameSuggestions(true); }}
                  onFocus={() => setShowNameSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                  placeholder="e.g. Main Fabric, Lining"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                />
                {showNameSuggestions && nameSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {nameSuggestions.map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setName(s.name); setShowNameSuggestions(false); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-violet-50 flex items-center justify-between"
                      >
                        <span className="text-gray-800">{s.name}</span>
                        <span className="text-gray-400 text-[10px]">{s.count}×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {existingExact && (
                <div className="mt-2 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                  <div className="mb-1">Looks like <strong>&quot;{existingExact.name}&quot;</strong> already exists.</div>
                  <button
                    type="button"
                    onClick={() => setName(existingExact.name)}
                    className="font-semibold text-amber-700 hover:text-amber-900"
                  >
                    Use existing name →
                  </button>
                </div>
              )}
            </div>

            {knownNames.length > 0 && (
              <div className="px-5 pt-1 pb-5 border-t border-gray-100 mt-2">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Popular names
                </div>
                <div className="flex flex-col gap-1">
                  {knownNames.slice(0, 8).map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setName(s.name)}
                      className={cn(
                        'text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors',
                        name === s.name
                          ? 'bg-violet-100 text-violet-900 font-semibold'
                          : 'text-gray-700 hover:bg-white'
                      )}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="text-gray-400 text-[10px] flex-shrink-0 ml-2">{s.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — search, filter chips, list */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* Search */}
            <div className="px-6 pt-5 pb-3 flex-shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search PO, style, customer, refs, description…"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                />
              </div>

              {/* Filter chips */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-1">Filter</span>

                <FilterChip
                  label="Customer"
                  values={customerFilter}
                  options={customerOptions}
                  open={openFilter === 'customer'}
                  onToggle={() => setOpenFilter(openFilter === 'customer' ? null : 'customer')}
                  onPick={(v) => setCustomerFilter(toggleInSet(customerFilter, v))}
                  onClear={() => setCustomerFilter(new Set())}
                />
                <FilterChip
                  label="Season"
                  values={seasonFilter}
                  options={seasonOptions}
                  open={openFilter === 'season'}
                  onToggle={() => setOpenFilter(openFilter === 'season' ? null : 'season')}
                  onPick={(v) => setSeasonFilter(toggleInSet(seasonFilter, v))}
                  onClear={() => setSeasonFilter(new Set())}
                />
                <FilterChip
                  label="Style"
                  values={styleFilter}
                  options={styleOptions}
                  open={openFilter === 'style'}
                  onToggle={() => setOpenFilter(openFilter === 'style' ? null : 'style')}
                  onPick={(v) => setStyleFilter(toggleInSet(styleFilter, v))}
                  onClear={() => setStyleFilter(new Set())}
                />

                {(customerFilter.size > 0 || seasonFilter.size > 0 || styleFilter.size > 0) && (
                  <button
                    type="button"
                    onClick={() => { setCustomerFilter(new Set()); setSeasonFilter(new Set()); setStyleFilter(new Set()); }}
                    className="text-[11px] text-gray-500 hover:text-red-600 font-medium ml-1"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Select-all bar */}
            {visibleGroups.length > 0 && (
              <div className="px-6 pb-2 flex-shrink-0">
                <div className="flex items-center gap-3 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-violet-600"
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
              </div>
            )}

            {/* List */}
            <div className="px-6 pb-3 flex-1 min-h-0 flex flex-col">
              {visibleGroups.length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400 italic">
                  {search || customerFilter.size > 0 || seasonFilter.size > 0 || styleFilter.size > 0
                    ? 'No matches'
                    : 'No styles available'}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                  {visibleGroups.map((g) => {
                    const collapsed = collapsedPOs.has(g.po_number);
                    const groupIds = g.styles.map((s) => s.id);
                    const allChosen = groupIds.every((id) => selectedIds.has(id));
                    const someChosen = !allChosen && groupIds.some((id) => selectedIds.has(id));
                    return (
                      <div key={g.po_number}>
                        {/* PO header row */}
                        <div className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50/70 sticky top-0 z-[1]">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 accent-violet-600"
                            checked={allChosen}
                            ref={(el) => { if (el) el.indeterminate = someChosen; }}
                            onChange={() => togglePOAll(g)}
                          />
                          <button onClick={() => togglePO(g.po_number)} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <span className="font-mono text-sm font-semibold text-gray-900">{g.po_number}</span>
                          <span className="text-sm text-gray-500 truncate">{g.customer}</span>
                          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
                            {g.styles.length} style{g.styles.length === 1 ? '' : 's'} · {g.factory}
                          </span>
                        </div>
                        {/* Styles list */}
                        {!collapsed && g.styles.map((s) => {
                          const ref = s.customer_po_number || s.china_orderbook_ref;
                          const existingComponents = s.components || [];
                          return (
                            <div
                              key={s.id}
                              className={cn(
                                'cursor-pointer hover:bg-gray-50',
                                selectedIds.has(s.id) && 'bg-violet-50/50',
                              )}
                            >
                              <label
                                className="grid items-center gap-3 pl-12 pr-3.5 py-2.5 text-xs cursor-pointer"
                                style={{ gridTemplateColumns: 'auto 130px 1fr 140px 100px' }}
                              >
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-gray-300 accent-violet-600"
                                  checked={selectedIds.has(s.id)}
                                  onChange={() => toggleStyle(s.id)}
                                />
                                <span className="font-mono text-gray-800 truncate" title={s.style_code || `#${s.id}`}>
                                  {s.style_code || `#${s.id}`}
                                </span>
                                <span className="text-gray-600 truncate" title={s.description || ''}>
                                  {s.description}
                                </span>
                                <span className="text-gray-500 truncate text-[11px]" title={ref || ''}>
                                  {ref ? <><span className="text-gray-400">ref </span>{ref}</> : ''}
                                </span>
                                <span className="text-gray-500 truncate text-right" title={s.colour || ''}>
                                  {s.colour}
                                </span>
                              </label>
                              {/* Subtle line: existing components on this
                                  style. Helps users spot duplicates before
                                  they add — click still handled by the
                                  parent's cursor / bg. */}
                              {existingComponents.length > 0 && (
                                <div className="pl-12 pr-3.5 pb-2 -mt-1 flex items-center gap-1.5 flex-wrap text-[10px]">
                                  <span className="uppercase tracking-wide text-gray-300 font-semibold">Already on:</span>
                                  {existingComponents.map((c) => {
                                    const tag = c.sample_type === 'strike_off' ? 'SO'
                                              : c.sample_type === 'lab_dip' ? 'LD'
                                              : 'LB';
                                    const tagColor = c.sample_type === 'strike_off' ? 'text-amber-600'
                                                    : c.sample_type === 'lab_dip' ? 'text-cyan-600'
                                                    : 'text-fuchsia-600';
                                    return (
                                      <span key={c.id} className="inline-flex items-center gap-1 text-gray-500">
                                        <span className="truncate max-w-[120px]" title={c.name}>{c.name}</span>
                                        <span className={cn('font-bold', tagColor)}>{tag}</span>
                                      </span>
                                    );
                                  }).reduce<React.ReactNode[]>((acc, node, i) => {
                                    if (i > 0) acc.push(<span key={`sep-${i}`} className="text-gray-300">·</span>);
                                    acc.push(node);
                                    return acc;
                                  }, [])}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky selection tray — only shown when at least one style is
            picked. Chips scroll horizontally when many are selected. */}
        {selectedIds.size > 0 && (
          <div className="px-6 py-3 border-t border-violet-100 bg-violet-50/40 flex-shrink-0 flex items-center gap-3">
            <div className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide flex-shrink-0">
              Selected {selectedIds.size}
            </div>
            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {selectedOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleStyle(o.id)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 bg-white border border-violet-200 rounded-full text-[11px] text-gray-700 hover:border-violet-400 hover:bg-violet-50 transition-colors"
                  title={`${o.po_number} · ${o.style_code} — click to remove`}
                >
                  <span className="font-mono font-semibold text-gray-900">{o.po_number}</span>
                  <span className="text-gray-400">·</span>
                  <span className="font-mono text-gray-600 truncate max-w-[110px]">{o.style_code}</span>
                  <span className="ml-0.5 p-0.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50">
                    <X className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="flex-shrink-0 text-[11px] font-medium text-gray-500 hover:text-red-600"
            >
              Clear all
            </button>
          </div>
        )}

        {/* ─── Footer ─── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !sampleType || !name.trim() || selectedIds.size === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-md hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Add {name.trim() ? `"${name.trim()}"` : 'component'} to {selectedIds.size} {selectedIds.size === 1 ? 'style' : 'styles'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Small pure helper: return a NEW Set with `v` toggled. Keeps state
// updates immutable so React sees a change reliably.
function toggleInSet(set: Set<string>, v: string): Set<string> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

// ─── Filter chip with inline popover ─────────────────────────────────
// Multi-select dropdown chip. Options list stays open on click so the
// user can tick several; each tick emits an onPick which the parent
// converts to a toggle. Chip label shows the first selection with a
// "+N more" tail when more than one is picked.

function FilterChip({
  label,
  values,
  options,
  open,
  onToggle,
  onPick,
  onClear,
}: {
  label: string;
  values: Set<string>;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onPick: (v: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState('');
  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const active = values.size > 0;
  const primary = active ? Array.from(values)[0] : null;
  const extra = active ? values.size - 1 : 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
          active
            ? 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
        )}
      >
        <span className={cn(active ? 'text-violet-700' : 'text-gray-500')}>
          {label}{active ? ':' : ''}
        </span>
        {active && primary && (
          <>
            <span className="text-violet-900 font-semibold truncate max-w-[120px]" title={primary}>
              {primary}
            </span>
            {extra > 0 && (
              <span className="text-violet-600 font-semibold text-[10px] bg-white/70 border border-violet-200 rounded-full px-1.5 py-0" title={Array.from(values).join(', ')}>
                +{extra}
              </span>
            )}
          </>
        )}
        {active ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 text-violet-500 hover:text-red-600"
            title="Clear filter"
          >
            <X className="w-3 h-3" />
          </span>
        ) : (
          <ChevronDown className="w-3 h-3 text-gray-400" />
        )}
      </button>

      {open && (
        <div
          className="absolute z-30 left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-xl overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 pt-2 pb-1.5 border-b border-gray-100 flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            {active && (
              <button
                type="button"
                onClick={onClear}
                className="text-[10px] font-medium text-gray-500 hover:text-red-600 whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="text-center py-3 text-[11px] text-gray-400 italic">No matches</div>
            ) : filtered.map((o) => {
              const checked = values.has(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onPick(o)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-violet-50',
                    checked && 'bg-violet-50 font-semibold text-violet-900',
                  )}
                >
                  <span
                    className={cn(
                      'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                      checked ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-300',
                    )}
                  >
                    {checked && <span className="text-white text-[9px] leading-none">✓</span>}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              );
            })}
          </div>
          {active && (
            <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-violet-700 font-semibold bg-violet-50/40">
              {values.size} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
