'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Loader2, FileText, Info, Save, X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { LibraryFirstAddModal } from '@/components/orders/LibraryFirstAddModal';
import { ComponentEditModal } from '@/components/orders/ComponentEditModal';
import { BulkEditModal } from '@/components/orders/BulkEditModal';
import { componentsApi, ordersApi, CANONICAL_POSITIONS, type CanonicalComponent, type CanonicalDetail, type CanonicalInstance, type CanonicalPosition } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { InProgressTab } from '@/features/InProgressTab';
import type { Order, OrderComponent } from '@/types';

type SampleType = 'strike_off' | 'lab_dip' | 'label';
type TabKey = 'library' | 'in-progress';

const SAMPLE_TAGS: Record<SampleType, { label: string; className: string }> = {
  strike_off: { label: 'SO', className: 'bg-amber-100 text-amber-800' },
  lab_dip: { label: 'LD', className: 'bg-cyan-100 text-cyan-800' },
  label: { label: 'LB', className: 'bg-fuchsia-100 text-fuchsia-800' },
};

export default function ComponentsPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="p-10 text-slate-500">Loading…</div>}>
        <ComponentsContent />
      </Suspense>
    </AuthProvider>
  );
}

function ComponentsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const openParam = params.get('open');
  const openCanonicalId = openParam ? Number(openParam) : null;
  const activeTab: TabKey = tabParam === 'in-progress' ? 'in-progress' : 'library';

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<{ order: Order; component: OrderComponent } | null>(null);
  const [libraryReloadKey, setLibraryReloadKey] = useState(0);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const data = await ordersApi.getOrders(1, 5000);
      setOrders(data.orders || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function setTab(t: TabKey) {
    router.replace(t === 'library' ? '/components' : `/components?tab=${t}`);
  }

  function openStyle(orderId: number) {
    router.push(`/design?openStyle=${orderId}`);
  }

  function openInstance(order: Order, component: OrderComponent) {
    setEditing({ order, component });
  }

  return (
    <AppShell title="Components">
      <div className="w-full px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-4 min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900">Components</h1>
            <span className="text-sm text-slate-500 truncate">
              Canonical library + samples in flight
            </span>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-md shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add component
          </button>
        </div>

        <div className="border-b border-slate-200 flex gap-6">
          <button
            onClick={() => setTab('library')}
            className={cn(
              'pb-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              activeTab === 'library'
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            Library
          </button>
          <button
            onClick={() => setTab('in-progress')}
            className={cn(
              'pb-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              activeTab === 'in-progress'
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            In Progress
          </button>
        </div>

        {activeTab === 'library' ? (
          <LibraryTab reloadKey={libraryReloadKey} openCanonicalId={openCanonicalId} />
        ) : (
          <InProgressTab
            orders={orders}
            loading={ordersLoading}
            isSupplier={String(useStore.getState().user?.role || '').toLowerCase() === 'supplier'}
            onEditInstance={openInstance}
            onBulkEditDone={() => { loadOrders(); setLibraryReloadKey((k) => k + 1); }}
          />
        )}

        <LibraryFirstAddModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          orders={orders}
          isSupplier={String(useStore.getState().user?.role || '').toLowerCase() === 'supplier'}
          onDone={(_name, _count, canonicalId) => {
            setAddOpen(false);
            loadOrders();
            setLibraryReloadKey((k) => k + 1);
            // Land on the fresh entry in the Library tab so the user sees what they created.
            router.replace(`/components?open=${canonicalId}`);
          }}
        />

        {editing && (
          <ComponentEditModal
            open={true}
            order={editing.order}
            component={editing.component}
            onClose={() => setEditing(null)}
            onUpdated={() => {
              loadOrders();
              setLibraryReloadKey((k) => k + 1);
            }}
            onOpenFullOrder={(id) => {
              setEditing(null);
              router.push(`/design?openStyle=${id}`);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

function LibraryTab({ reloadKey, openCanonicalId }: { reloadKey: number; openCanonicalId: number | null }) {
  const { user } = useStore();
  const isSupplier = String(user?.role || '').toLowerCase() === 'supplier';
  const [components, setComponents] = useState<CanonicalComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sampleType, setSampleType] = useState<SampleType | null>(null);
  const [includeBlank, setIncludeBlank] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await componentsApi.listLibrary({
        q: q.trim() || undefined,
        sample_type: sampleType || undefined,
        include_blank: includeBlank,
      });
      setComponents(data.components);
      // Priority: URL ?open=<id> (from post-add redirect) > current selection > first row.
      // A stale openCanonicalId that isn't in the list falls back to the current or first.
      if (openCanonicalId && data.components.some((c) => c.id === openCanonicalId)) {
        setSelectedId(openCanonicalId);
      } else if (!selectedId && data.components.length > 0) {
        setSelectedId(data.components[0].id);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to load components');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sampleType, includeBlank, reloadKey, openCanonicalId]);

  const filtered = components;

  return (
    <div className="grid grid-cols-[300px_1fr] gap-6 mt-2">
      {/* Left rail: search + list */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, colour, PO, style code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mr-1">Type</span>
          {(['strike_off', 'lab_dip', 'label'] as SampleType[]).map((st) => {
            const on = sampleType === st;
            const tag = SAMPLE_TAGS[st];
            return (
              <button
                key={st}
                onClick={() => setSampleType(on ? null : st)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition',
                  tag.className,
                  on ? 'ring-2 ring-offset-1 ring-primary-500' : 'opacity-70 hover:opacity-100',
                )}
              >
                {tag.label}
              </button>
            );
          })}
          <span className="text-slate-300 mx-1">·</span>
          <button
            onClick={() => setIncludeBlank((v) => !v)}
            className={cn(
              'px-2 py-0.5 rounded border text-[10px] font-semibold',
              includeBlank
                ? 'border-slate-300 text-slate-700 bg-white'
                : 'border-slate-200 text-slate-400 bg-slate-50',
            )}
          >
            Blank {includeBlank ? '✓' : ''}
          </button>
        </div>

        <div className="flex-1 rounded-md border border-slate-200 bg-white overflow-y-auto max-h-[calc(100vh-260px)]">
          {loading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-10">No components match.</div>
          )}
          {filtered.map((c) => {
            const on = c.id === selectedId;
            const tag = SAMPLE_TAGS[c.sample_type];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left p-2.5 border-b border-slate-100 transition',
                  on ? 'bg-primary-50 border-l-4 border-l-primary-500' : 'hover:bg-slate-50',
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', tag.className)}>
                    {tag.label}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-900 truncate">{c.name}</span>
                  {c.colour && (
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 truncate max-w-[100px]">
                      {c.colour}
                    </span>
                  )}
                  {c.position && c.position.length > 0 && c.position.map((p) => (
                    <span
                      key={p}
                      title={p}
                      className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 truncate max-w-[140px]"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 tabular-nums flex items-center gap-1.5">
                  <span>{c.styles_count} styles</span>
                  <span className="text-slate-300">·</span>
                  <span>{c.customers_count} customer{c.customers_count === 1 ? '' : 's'}</span>
                  {c.has_spec && <span className="text-slate-300">·</span>}
                  {c.has_spec && <span>📎 spec</span>}
                  {c.is_blank && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-primary-600 font-semibold">seeded</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div>
        {selectedId ? (
          <CanonicalDetailPanel
            canonicalId={selectedId}
            isSupplier={isSupplier}
            onSaved={() => load()}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            Pick a component to see its details.
          </div>
        )}
      </div>
    </div>
  );
}

function CanonicalDetailPanel({
  canonicalId,
  isSupplier,
  onSaved,
}: {
  canonicalId: number;
  isSupplier: boolean;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<CanonicalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    colour: string;
    position: CanonicalPosition[];
    spec_url: string;
    supplier_notes: string;
  } | null>(null);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      setEditing(false);
      try {
        const data = await componentsApi.getLibraryEntry(canonicalId);
        if (cancel) return;
        setDetail(data);
        setForm({
          name: data.name,
          description: data.description || '',
          colour: data.colour || '',
          position: (data.position || []) as CanonicalPosition[],
          spec_url: data.spec_url || '',
          supplier_notes: data.supplier_notes || '',
        });
        setSelectedInstanceIds(new Set());
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load component');
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, [canonicalId]);

  async function saveIdentity() {
    if (!form) return;
    setSaving(true);
    try {
      const payload: any = {};
      if (detail) {
        if (form.name !== detail.name) payload.name = form.name.trim().toUpperCase();
        if ((form.description || null) !== detail.description) payload.description = form.description || null;
        if ((form.colour || null) !== detail.colour) payload.colour = form.colour || null;
        const detailPositions = (detail.position || []).slice().sort();
        const formPositions = (form.position || []).slice().sort();
        if (JSON.stringify(detailPositions) !== JSON.stringify(formPositions)) {
          payload.position = form.position;
        }
        if ((form.spec_url || null) !== detail.spec_url) payload.spec_url = form.spec_url || null;
        if ((form.supplier_notes || null) !== detail.supplier_notes) payload.supplier_notes = form.supplier_notes || null;
      }
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      await componentsApi.patchLibraryEntry(canonicalId, payload);
      toast.success('Saved. Propagated to all instances.');
      const fresh = await componentsApi.getLibraryEntry(canonicalId);
      setDetail(fresh);
      setForm({
        name: fresh.name,
        description: fresh.description || '',
        colour: fresh.colour || '',
        position: (fresh.position || []) as CanonicalPosition[],
        spec_url: fresh.spec_url || '',
        supplier_notes: fresh.supplier_notes || '',
      });
      setEditing(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    if (!detail) return { used: 0, approved: 0, received: 0, outstanding: 0 };
    const used = detail.instances.length;
    let approved = 0, received = 0, outstanding = 0;
    for (const i of detail.instances) {
      const s = (i.status || '').toUpperCase();
      if (s === 'APPROVED') approved++;
      else if (s === 'RECEIVED') received++;
      else if (s === 'OUTSTANDING') outstanding++;
    }
    return { used, approved, received, outstanding };
  }, [detail]);

  function toggleInstance(id: number) {
    setSelectedInstanceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (!detail) return;
    setSelectedInstanceIds(checked ? new Set(detail.instances.map((i) => i.instance_id)) : new Set());
  }

  if (loading || !detail || !form) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const tag = SAMPLE_TAGS[detail.sample_type];
  const allSelected = detail.instances.length > 0 && selectedInstanceIds.size === detail.instances.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', tag.className)}>
            {tag.label}
          </span>
          {editing ? (
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => f ? { ...f, name: e.target.value.toUpperCase() } : f)}
              className="flex-1 text-lg font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1"
            />
          ) : (
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">{detail.name}</h2>
              {detail.colour && (
                <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded px-2 py-0.5">
                  {detail.colour}
                </span>
              )}
              {detail.position && detail.position.length > 0 && detail.position.map((p) => (
                <span
                  key={p}
                  title={p}
                  className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-0.5 truncate max-w-[280px]"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              Edit identity
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditing(false); setForm({ name: detail.name, description: detail.description || '', colour: detail.colour || '', position: (detail.position || []) as CanonicalPosition[], spec_url: detail.spec_url || '', supplier_notes: detail.supplier_notes || '' }); }}
                className="text-xs font-medium text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={saveIdentity}
                disabled={saving}
                className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1 rounded disabled:opacity-50 flex items-center gap-1"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Description</div>
            {editing ? (
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => f ? { ...f, description: e.target.value } : f)}
                rows={2}
                className="w-full px-2 py-1 text-sm bg-white border border-slate-300 rounded"
              />
            ) : (
              <div className="text-slate-700">{detail.description || <span className="text-slate-400 italic">—</span>}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Colour</div>
            {editing ? (
              <input
                type="text"
                value={form.colour}
                onChange={(e) => setForm((f) => f ? { ...f, colour: e.target.value } : f)}
                className="w-full px-2 py-1 text-sm bg-white border border-slate-300 rounded"
              />
            ) : (
              <div className="text-slate-700">{detail.colour || <span className="text-slate-400 italic">—</span>}</div>
            )}
          </div>
          {detail.sample_type === 'strike_off' && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Positions</div>
              {editing ? (
                <div className="border border-slate-300 rounded bg-white max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {CANONICAL_POSITIONS.map((p) => {
                    const on = form.position.includes(p);
                    return (
                      <label
                        key={p}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1 text-[12px] cursor-pointer',
                          on ? 'bg-primary-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setForm((f) => {
                            if (!f) return f;
                            const next = on ? f.position.filter((x) => x !== p) : [...f.position, p];
                            return { ...f, position: next };
                          })}
                          className="w-3.5 h-3.5"
                        />
                        <span>{p}</span>
                      </label>
                    );
                  })}
                </div>
              ) : detail.position && detail.position.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {detail.position.map((p) => (
                    <span key={p} className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                      {p}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400 italic">—</span>
              )}
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Spec URL</div>
            {editing ? (
              <input
                type="text"
                value={form.spec_url}
                onChange={(e) => setForm((f) => f ? { ...f, spec_url: e.target.value } : f)}
                placeholder="https://…"
                className="w-full px-2 py-1 text-sm bg-white border border-slate-300 rounded"
              />
            ) : detail.spec_url ? (
              <a href={detail.spec_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline text-sm flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> {detail.spec_url}
              </a>
            ) : (
              <span className="text-slate-400 italic text-sm">—</span>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Supplier notes</div>
            {editing ? (
              <textarea
                value={form.supplier_notes}
                onChange={(e) => setForm((f) => f ? { ...f, supplier_notes: e.target.value } : f)}
                rows={2}
                className="w-full px-2 py-1 text-sm bg-white border border-slate-300 rounded"
              />
            ) : (
              <div className="text-slate-700">{detail.supplier_notes || <span className="text-slate-400 italic">—</span>}</div>
            )}
          </div>
        </div>

        {editing && (
          <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200 flex items-start gap-2 text-[11px] text-amber-800">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              Editing identity here <strong>renames on all {detail.instances.length} instance{detail.instances.length === 1 ? '' : 's'}</strong>. If you want a different name for just one style, use Detach on that instance (coming in Phase 3).
            </div>
          </div>
        )}
      </div>

      {/* Rollup counts */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Used" value={stats.used} tone="slate" />
        <StatBox label="Approved" value={stats.approved} tone="emerald" />
        <StatBox label="Received" value={stats.received} tone="blue" />
        <StatBox label="Outstanding" value={stats.outstanding} tone="amber" />
      </div>

      {/* Instances */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">All styles using this</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Select all
            </label>
            {!isSupplier && (
              <button
                onClick={() => setBulkOpen(true)}
                disabled={selectedInstanceIds.size === 0}
                className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 disabled:text-slate-300 disabled:cursor-not-allowed"
              >
                Bulk edit… ({selectedInstanceIds.size})
              </button>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-100 text-[12px] max-h-[calc(100vh-460px)] overflow-y-auto">
          {detail.instances.length === 0 && (
            <div className="text-center text-slate-400 py-8 text-xs">Nothing using this yet. It'll show up here once added to a style.</div>
          )}
          {detail.instances.map((i) => (
            <InstanceRow
              key={i.instance_id}
              instance={i}
              checked={selectedInstanceIds.has(i.instance_id)}
              onToggle={() => toggleInstance(i.instance_id)}
              hideCheckbox={isSupplier}
            />
          ))}
        </div>
      </div>

      {bulkOpen && (
        <BulkEditModal
          instances={detail.instances.filter((i) => selectedInstanceIds.has(i.instance_id))}
          canonicalName={detail.name}
          onClose={() => setBulkOpen(false)}
          onDone={async () => {
            setBulkOpen(false);
            const fresh = await componentsApi.getLibraryEntry(canonicalId);
            setDetail(fresh);
            setSelectedInstanceIds(new Set());
            onSaved();
          }}
        />
      )}

    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'blue' | 'amber' }) {
  const toneClass = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  }[tone];
  return (
    <div className={cn('rounded border p-2 text-center', toneClass)}>
      <div className="text-[9px] uppercase font-bold">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function InstanceRow({
  instance,
  checked,
  onToggle,
  hideCheckbox,
}: {
  instance: CanonicalInstance;
  checked: boolean;
  onToggle: () => void;
  hideCheckbox: boolean;
}) {
  const status = (instance.status || '').toUpperCase();
  const pill =
    status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800'
    : status === 'RECEIVED' ? 'bg-blue-100 text-blue-800'
    : status === 'OUTSTANDING' ? 'bg-amber-100 text-amber-800'
    : 'bg-slate-100 text-slate-500';
  const dateLabel =
    instance.approved ? `Approved ${fmt(instance.approved)}`
    : instance.received ? `Received ${fmt(instance.received)}`
    : status || 'Not started';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-slate-50">
      {!hideCheckbox && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 flex-shrink-0"
        />
      )}
      <span className="font-mono text-slate-700 flex-shrink-0">{instance.style_code || instance.customer_style_code || '—'}</span>
      <span className="flex-1 truncate text-slate-500">
        {instance.customer} · PO {instance.po_number} · {instance.description}
      </span>
      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', pill)}>
        {dateLabel}
      </span>
    </div>
  );
}


function fmt(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
