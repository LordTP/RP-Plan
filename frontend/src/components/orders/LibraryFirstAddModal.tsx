'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, X, FileText, Info, ChevronDown, ChevronRight, Plus, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import api, { componentsApi, CANONICAL_POSITIONS, type CanonicalComponent, type CanonicalDetail, type CanonicalPosition } from '@/lib/api';
import type { Order } from '@/types';

type SampleType = 'strike_off' | 'lab_dip' | 'label';
type ModalTab = 'library' | 'create';

interface Props {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  isSupplier: boolean;
  onDone: (canonicalName: string, createdCount: number) => void;
}

const SAMPLE_TAGS: Record<SampleType, { label: string; className: string }> = {
  strike_off: { label: 'SO', className: 'bg-amber-100 text-amber-700' },
  lab_dip: { label: 'LD', className: 'bg-cyan-100 text-cyan-700' },
  label: { label: 'LB', className: 'bg-fuchsia-100 text-fuchsia-700' },
};

export function LibraryFirstAddModal({ open, onClose, orders, isSupplier, onDone }: Props) {
  const [tab, setTab] = useState<ModalTab>('library');
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('library');
      setSelectedCanonicalId(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40" onClick={onClose}>
      <div
        className="w-full max-w-6xl h-[85vh] bg-white rounded-xl shadow-2xl ring-1 ring-gray-100 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Add component</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Every add creates a fresh library entry. Pick from library to reuse an existing entry's identity as a template, or create new to fill from scratch.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented tabs */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="inline-flex p-1 bg-gray-100 rounded-lg text-xs font-semibold">
            <button
              onClick={() => { setTab('library'); }}
              className={cn(
                'px-4 py-1.5 rounded-md transition-colors',
                tab === 'library' ? 'bg-white shadow-sm text-violet-700' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              From library (as template)
            </button>
            <button
              onClick={() => { setTab('create'); setSelectedCanonicalId(null); }}
              className={cn(
                'px-4 py-1.5 rounded-md transition-colors',
                tab === 'create' ? 'bg-white shadow-sm text-violet-700' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              + Create new
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {tab === 'library' ? (
            <FromLibraryBody
              selectedCanonicalId={selectedCanonicalId}
              onSelect={setSelectedCanonicalId}
              orders={orders}
              submitting={submitting}
              onSubmit={(payload) => runCreateAndApply(payload, setSubmitting, onDone)}
            />
          ) : (
            <CreateNewBody
              orders={orders}
              isSupplier={isSupplier}
              submitting={submitting}
              onSubmit={async (payload) => runCreateAndApply(payload, setSubmitting, onDone)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Both tabs now converge on the same server flow: create a new canonical,
 *  then apply it to the picked order_ids at blank state. The From-library
 *  tab uses the picked entry's identity as a template; Create-new fills
 *  identity from scratch. Either way, a brand-new canonical is minted per
 *  add event — no linking to prior entries. */
async function runCreateAndApply(
  payload: {
    identity: { name: string; sample_type: SampleType; colour: string; description?: string; position?: string[]; spec_url?: string; supplier_notes?: string };
    order_ids: number[];
  },
  setSubmitting: (b: boolean) => void,
  onDone: (name: string, count: number) => void,
) {
  setSubmitting(true);
  try {
    const created = await api.post('/api/components/library', payload.identity);
    const canonicalId = created.data.id;
    const res = await api.post(`/api/components/library/${canonicalId}/apply`, {
      order_ids: payload.order_ids,
      starting_state: 'blank',
    });
    const createdCount = res.data?.created_count ?? 0;
    toast.success(`Added "${payload.identity.name}" to ${createdCount} style${createdCount === 1 ? '' : 's'}`);
    onDone(payload.identity.name, createdCount);
  } catch (err: any) {
    toast.error(err?.response?.data?.detail || 'Failed to add component');
  } finally {
    setSubmitting(false);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// From library body — left rail + right configure panel
// ─────────────────────────────────────────────────────────────────────────

function FromLibraryBody({
  selectedCanonicalId,
  onSelect,
  orders,
  submitting,
  onSubmit,
}: {
  selectedCanonicalId: number | null;
  onSelect: (id: number | null) => void;
  orders: Order[];
  submitting: boolean;
  onSubmit: (payload: {
    identity: { name: string; sample_type: SampleType; colour: string; description?: string; position?: string[]; spec_url?: string; supplier_notes?: string };
    order_ids: number[];
  }) => void;
}) {
  const [q, setQ] = useState('');
  const [sampleType, setSampleType] = useState<SampleType | null>(null);
  const [entries, setEntries] = useState<CanonicalComponent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        const data = await componentsApi.listLibrary({
          q: q.trim() || undefined,
          sample_type: sampleType || undefined,
          include_blank: true,
        });
        if (cancel) return;
        setEntries(data.components);
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load library');
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [q, sampleType]);

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left rail */}
      <div className="w-[300px] flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/40">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-2 flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, colour, PO, style code…"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg text-[10px] font-semibold">
            <button
              onClick={() => setSampleType(null)}
              className={cn('px-2.5 py-1 rounded-md transition', sampleType === null ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}
            >
              All
            </button>
            {(['strike_off', 'lab_dip', 'label'] as SampleType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSampleType(sampleType === t ? null : t)}
                className={cn('px-2.5 py-1 rounded-md transition', sampleType === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}
              >
                {SAMPLE_TAGS[t].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-10">No components match.</div>
          ) : (
            entries.map((c) => {
              const on = c.id === selectedCanonicalId;
              const tag = SAMPLE_TAGS[c.sample_type];
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-gray-100 transition',
                    on ? 'bg-violet-50 border-l-4 border-l-violet-500' : 'hover:bg-gray-50',
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', tag.className)}>
                      {tag.label}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-900 truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {c.colour && (
                      <span className="text-[10px] font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[100px]">{c.colour}</span>
                    )}
                    {c.position && c.position.length > 0 && c.position.map((p) => (
                      <span key={p} className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 truncate max-w-[130px]">
                        {p}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                    {c.styles_count} style{c.styles_count === 1 ? '' : 's'} · {c.customers_count} customer{c.customers_count === 1 ? '' : 's'}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right configure */}
      {selectedCanonicalId === null ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 px-8 text-center">
          <p>Pick a component from the library to reuse its identity as a template.</p>
          <p className="text-[11px] text-gray-400">
            A fresh library entry will be created for this add — no link to the picked one.
          </p>
        </div>
      ) : (
        <ConfigureFromLibrary
          key={selectedCanonicalId}
          canonicalId={selectedCanonicalId}
          orders={orders}
          submitting={submitting}
          onBack={() => onSelect(null)}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}

function ConfigureFromLibrary({
  canonicalId,
  orders,
  submitting,
  onBack,
  onSubmit,
}: {
  canonicalId: number;
  orders: Order[];
  submitting: boolean;
  onBack: () => void;
  onSubmit: (payload: {
    identity: { name: string; sample_type: SampleType; colour: string; description?: string; position?: string[]; spec_url?: string; supplier_notes?: string };
    order_ids: number[];
  }) => void;
}) {
  const [detail, setDetail] = useState<CanonicalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        const d = await componentsApi.getLibraryEntry(canonicalId);
        if (cancel) return;
        setDetail(d);
        setSelectedOrderIds(new Set());
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load component detail');
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [canonicalId]);

  if (loading || !detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const tag = SAMPLE_TAGS[detail.sample_type];
  const canSubmit = selectedOrderIds.size > 0 && !submitting;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Identity mini-header — read-only preview of what will be copied */}
      <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="p-1 text-gray-400 hover:text-gray-700 md:hidden">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', tag.className)}>
          {tag.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 truncate">{detail.name}</div>
          <div className="text-[11px] text-gray-500 truncate flex items-center gap-1.5 flex-wrap">
            {detail.colour && <span>{detail.colour}</span>}
            {detail.position && detail.position.length > 0 && detail.position.map((p) => (
              <span key={p} className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 rounded px-1 py-0.5">{p}</span>
            ))}
            {detail.spec_url && <span>· 📎 spec</span>}
            {detail.description && <span className="italic">· {detail.description}</span>}
          </div>
        </div>
      </div>

      {/* Notice: fresh canonical every time */}
      <div className="px-6 py-2 border-b border-gray-100 bg-violet-50/40 flex items-start gap-2 flex-shrink-0">
        <Info className="w-3.5 h-3.5 text-violet-600 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-violet-800 leading-relaxed">
          A new library entry will be created using the identity above. Instances start blank on the styles you pick — no link to the entry above, no state inheritance.
        </p>
      </div>

      {/* Scrollable target picker */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <TargetStylePicker
          orders={orders}
          excludedCount={0}
          selected={selectedOrderIds}
          onChange={setSelectedOrderIds}
        />
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-3 flex-shrink-0">
        <span className="text-[11px] text-gray-500 tabular-nums mr-auto">
          {selectedOrderIds.size} style{selectedOrderIds.size === 1 ? '' : 's'} selected
        </span>
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md"
        >
          Back
        </button>
        <button
          disabled={!canSubmit}
          onClick={() => onSubmit({
            identity: {
              name: detail.name,
              sample_type: detail.sample_type,
              colour: detail.colour || '',
              description: detail.description || undefined,
              position: detail.position && detail.position.length > 0 ? detail.position : undefined,
              spec_url: detail.spec_url || undefined,
              supplier_notes: detail.supplier_notes || undefined,
            },
            order_ids: Array.from(selectedOrderIds),
          })}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Add to {selectedOrderIds.size} style{selectedOrderIds.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Target style picker — grouped by PO, checkboxes, cross-PO selection
// ─────────────────────────────────────────────────────────────────────────

function TargetStylePicker({
  orders,
  excludedCount,
  selected,
  onChange,
}: {
  orders: Order[];
  excludedCount: number;
  selected: Set<number>;
  onChange: (ids: Set<number>) => void;
}) {
  const [q, setQ] = useState('');
  const [collapsedPos, setCollapsedPos] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter((o) => {
      const hay = `${o.po_number || ''} ${o.customer || ''} ${o.style_code || ''} ${o.description || ''} ${o.colour || ''} ${o.customer_po_number || ''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [orders, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of filtered) {
      const key = o.po_number || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function togglePo(po: string) {
    setCollapsedPos((prev) => {
      const next = new Set(prev);
      if (next.has(po)) next.delete(po);
      else next.add(po);
      return next;
    });
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function togglePoAll(styles: Order[]) {
    const next = new Set(selected);
    const allOn = styles.every((s) => next.has(s.id));
    if (allOn) styles.forEach((s) => next.delete(s.id));
    else styles.forEach((s) => next.add(s.id));
    onChange(next);
  }

  function collapseAll() {
    setCollapsedPos(new Set(grouped.map(([po]) => po)));
  }

  function expandAll() {
    setCollapsedPos(new Set());
  }

  const allCollapsed = grouped.length > 0 && grouped.every(([po]) => collapsedPos.has(po));

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 flex items-center justify-between gap-2">
        <span>Apply to styles</span>
        <div className="flex items-center gap-3">
          {excludedCount > 0 && (
            <span className="text-[10px] font-normal normal-case tracking-normal text-gray-400 italic">
              {excludedCount} style{excludedCount === 1 ? '' : 's'} already have this (hidden)
            </span>
          )}
          <button
            type="button"
            onClick={allCollapsed ? expandAll : collapseAll}
            className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 normal-case tracking-normal"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      </div>
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search PO, style, customer…"
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
      <div className="rounded-md border border-gray-200 max-h-72 overflow-y-auto divide-y divide-gray-100">
        {grouped.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-8">No matching styles.</div>
        ) : (
          grouped.map(([po, styles]) => {
            const collapsed = collapsedPos.has(po);
            const allOn = styles.every((s) => selected.has(s.id));
            const someOn = styles.some((s) => selected.has(s.id));
            const ref = styles[0];
            return (
              <div key={po}>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50 text-xs">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = !allOn && someOn; }}
                    onChange={() => togglePoAll(styles)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                  />
                  <button
                    onClick={() => togglePo(po)}
                    className="text-gray-400 hover:text-gray-600 flex items-center"
                  >
                    {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <span className="mono font-semibold tabular-nums text-gray-900">PO {po}</span>
                  {ref?.customer && <span className="text-gray-500 truncate">· {ref.customer}</span>}
                  {ref?.factory && <span className="text-gray-400 truncate">· {ref.factory}</span>}
                  <span className="ml-auto text-[10px] text-gray-400 tabular-nums">{styles.length} styles</span>
                </div>
                {!collapsed && styles.map((s) => {
                  const on = selected.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'grid gap-3 items-center px-3 py-1.5 pl-10 text-xs border-t border-gray-100 cursor-pointer',
                        on ? 'bg-violet-50/50' : 'hover:bg-gray-50',
                      )}
                      style={{ gridTemplateColumns: '20px 140px 1fr auto' }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleOne(s.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                      />
                      <span className="font-mono tabular-nums text-gray-700">{s.style_code || `#${s.id}`}</span>
                      <span className="truncate text-gray-600">{s.description || '—'}</span>
                      <span className="text-gray-500 tabular-nums">{s.colour || ''}</span>
                    </label>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Create new body — identity form + target picker
// ─────────────────────────────────────────────────────────────────────────

function CreateNewBody({
  orders,
  isSupplier,
  submitting,
  onSubmit,
}: {
  orders: Order[];
  isSupplier: boolean;
  submitting: boolean;
  onSubmit: (payload: {
    identity: { name: string; sample_type: SampleType; colour: string; description?: string; position?: string[]; spec_url?: string; supplier_notes?: string };
    order_ids: number[];
  }) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [sampleType, setSampleType] = useState<SampleType>('strike_off');
  const [description, setDescription] = useState('');
  const [colour, setColour] = useState('');
  const [positions, setPositions] = useState<CanonicalPosition[]>([]);
  const [specUrl, setSpecUrl] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());

  function togglePosition(p: CanonicalPosition) {
    setPositions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const colourRequired = sampleType === 'strike_off' || sampleType === 'lab_dip';
  const colourMissing = colourRequired && !colour.trim();
  const canSubmit = name.trim() && !colourMissing && selectedOrderIds.size > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Identity */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Identity</div>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder="CHEST PRINT — HOME KIT BLUE"
                className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 uppercase"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Sample type</label>
              <select
                value={sampleType}
                onChange={(e) => {
                  const st = e.target.value as SampleType;
                  setSampleType(st);
                  if (st !== 'strike_off') setPositions([]);
                }}
                className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="strike_off">Strike Off</option>
                <option value="lab_dip">Lab Dip</option>
                <option value="label">Label</option>
              </select>
            </div>
          </div>
          <div className="mt-2">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Description <span className="text-gray-400 normal-case tracking-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                Colour {colourRequired
                  ? <span className="text-red-500 normal-case tracking-normal">(required)</span>
                  : <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
                }
              </label>
              <input
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                placeholder={colourRequired ? 'e.g. Sky Captain' : undefined}
                className={cn(
                  'w-full px-3 py-1.5 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500',
                  colourMissing ? 'border-red-300' : 'border-gray-300',
                )}
              />
            </div>
            {sampleType === 'strike_off' ? (
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Positions <span className="text-gray-400 normal-case tracking-normal">(optional, tick multiple)</span>
                </label>
                <div className="border border-gray-300 rounded-md bg-white max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {CANONICAL_POSITIONS.map((p) => {
                    const on = positions.includes(p);
                    return (
                      <label
                        key={p}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 text-[12px] cursor-pointer',
                          on ? 'bg-violet-50 text-violet-900' : 'hover:bg-gray-50 text-gray-700',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePosition(p)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                        />
                        <span>{p}</span>
                      </label>
                    );
                  })}
                </div>
                {positions.length > 0 && (
                  <p className="text-[10px] text-gray-500 mt-1">{positions.length} selected</p>
                )}
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Spec URL <span className="text-gray-400 normal-case tracking-normal">(optional)</span></label>
                <input
                  value={specUrl}
                  onChange={(e) => setSpecUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}
          </div>
          {sampleType === 'strike_off' && (
            <div className="mt-2">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Spec URL <span className="text-gray-400 normal-case tracking-normal">(optional)</span></label>
              <input
                value={specUrl}
                onChange={(e) => setSpecUrl(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          )}
          <div className="mt-2">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Supplier notes <span className="text-gray-400 normal-case tracking-normal">(optional)</span></label>
            <textarea
              value={supplierNotes}
              onChange={(e) => setSupplierNotes(e.target.value)}
              rows={2}
              placeholder="Anything the supplier should know…"
              className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Target styles */}
        <TargetStylePicker
          orders={orders}
          excludedCount={0}
          selected={selectedOrderIds}
          onChange={setSelectedOrderIds}
        />
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-3 flex-shrink-0">
        <span className="text-[11px] text-gray-500 tabular-nums mr-auto">
          {selectedOrderIds.size} style{selectedOrderIds.size === 1 ? '' : 's'} selected
        </span>
        <button
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit({
            identity: {
              name: name.trim().toUpperCase(),
              sample_type: sampleType,
              colour: colour.trim(),
              description: description.trim() || undefined,
              position: sampleType === 'strike_off' && positions.length > 0 ? positions : undefined,
              spec_url: specUrl.trim() || undefined,
              supplier_notes: supplierNotes.trim() || undefined,
            },
            order_ids: Array.from(selectedOrderIds),
          })}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Create &amp; add to {selectedOrderIds.size} style{selectedOrderIds.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}
