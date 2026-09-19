'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ship, Plus, Search, Loader2, Truck, X, ArrowRight, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { shipmentDraftsApi, factoriesApi, type ShipmentDraftSummary, type ShipmentDraftStatus } from '@/lib/api';
import { getShipmentReadiness, type ShipmentReadinessState } from '@/lib/shipmentReadiness';
import { cn } from '@/lib/utils';

export default function FactoryShippingPage() {
  return (
    <AuthProvider>
      <DraftsListPage />
    </AuthProvider>
  );
}

// The bands the list is grouped into, in the order you'd work through them.
// Confirmed sits last because it's a record rather than a task.
type BandKey = 'ready' | 'incomplete' | 'empty' | 'confirmed';

const BANDS: Array<{
  key: BandKey;
  title: string;
  hint: string;
  tone: 'green' | 'amber' | 'gray' | 'blue';
}> = [
  { key: 'ready', title: 'Ready to confirm', hint: 'everything filled in', tone: 'green' },
  { key: 'incomplete', title: 'Needs details', hint: 'styles added, something missing', tone: 'amber' },
  { key: 'empty', title: 'Nothing added yet', hint: 'started, no styles on them', tone: 'gray' },
  { key: 'confirmed', title: 'Confirmed', hint: 'pushed to every style', tone: 'blue' },
];

function DraftsListPage() {
  const { user } = useStore();
  const router = useRouter();
  const [drafts, setDrafts] = useState<ShipmentDraftSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bandFilter, setBandFilter] = useState<'all' | BandKey>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [factoryPicker, setFactoryPicker] = useState<{ factories: string[]; loading: boolean } | null>(null);

  const isSupplier = user?.role === 'supplier';
  // For suppliers their factory is locked. Internal/admin can create on
  // behalf of any factory by entering the name on the next page (we ask
  // for confirmation when they hit "+ New shipment" without a known factory).
  const factoryForCreate = isSupplier ? user?.factory_name || '' : '';

  const refresh = () => {
    setIsLoading(true);
    shipmentDraftsApi.list()
      .then((res) => setDrafts(res.drafts))
      .catch(() => toast.error('Failed to load shipments'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each draft carries its band and its readiness so the row, the count and
  // the filter all agree without recomputing.
  const scored = useMemo(() => {
    return drafts.map((d) => {
      const readiness = getShipmentReadiness(d);
      const band: BandKey = d.status === 'confirmed'
        ? 'confirmed'
        : d.status === 'cancelled'
        ? 'empty'
        : (readiness.state as ShipmentReadinessState as BandKey);
      return { draft: d, readiness, band };
    });
  }, [drafts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scored.filter(({ draft: d, band }) => {
      if (bandFilter !== 'all' && band !== bandFilter) return false;
      if (!q) return true;
      const fields = [
        d.reference, d.name, d.factory, d.vessel_name, d.tracking_reference,
        ...(d.po_numbers || []),
      ];
      return fields.some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [scored, bandFilter, search]);

  const counts = useMemo(() => {
    const c: Record<BandKey, number> = { ready: 0, incomplete: 0, empty: 0, confirmed: 0 };
    const units: Record<BandKey, number> = { ready: 0, incomplete: 0, empty: 0, confirmed: 0 };
    for (const { draft, band } of scored) {
      c[band]++;
      units[band] += draft.unit_count || 0;
    }
    return { c, units, all: scored.length };
  }, [scored]);

  const grouped = useMemo(() => {
    return BANDS.map((b) => ({
      ...b,
      rows: filtered.filter((r) => r.band === b.key),
    })).filter((b) => b.rows.length > 0);
  }, [filtered]);

  // Opens the editor on an unsaved shipment. Nothing is written until the
  // user presses Save — pressing "New shipment" used to create the record
  // there and then, which is how ten empty ones ended up on the list.
  const createForFactory = (factory: string) => {
    if (!factory) return;
    setCreating(true);
    router.push(`/factory-shipping/new?factory=${encodeURIComponent(factory)}`);
  };

  const handleCreate = async () => {
    if (isSupplier) {
      if (!factoryForCreate) {
        toast.error('No factory associated with your account — contact admin');
        return;
      }
      createForFactory(factoryForCreate);
      return;
    }
    // Internal/admin — pick factory from a list of every factory we have orders for.
    setFactoryPicker({ factories: [], loading: true });
    try {
      const res = await factoriesApi.getFactories();
      setFactoryPicker({ factories: res.factories, loading: false });
    } catch {
      toast.error('Failed to load factory list');
      setFactoryPicker(null);
    }
  };

  const handleDelete = async (draft: ShipmentDraftSummary) => {
    if (!confirm(`Delete ${draft.reference}? This cannot be undone.`)) return;
    try {
      await shipmentDraftsApi.remove(draft.id);
      toast.success('Shipment deleted');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete');
    }
  };

  return (
    <AppShell title="Factory Shipping">
      <div className="p-6">
        <div
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden flex flex-col"
          style={{ height: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Ship className="w-5 h-5 text-teal-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900">Shipments</h3>
                <p className="text-xs text-gray-500 truncate">
                  {isLoading ? 'Loading…'
                    : isSupplier
                      ? user?.factory_name || '—'
                      : 'All factories'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search P-number, PO, vessel…"
                  className="pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                New shipment
              </button>
            </div>
          </div>

          {/* Summary tiles — double as the band filter. */}
          <div className="grid grid-cols-4 border-b border-gray-100 flex-shrink-0">
            {BANDS.map((b) => (
              <SummaryTile
                key={b.key}
                band={b}
                count={counts.c[b.key]}
                units={counts.units[b.key]}
                active={bandFilter === b.key}
                onClick={() => setBandFilter(bandFilter === b.key ? 'all' : b.key)}
              />
            ))}
          </div>

          {bandFilter !== 'all' && (
            <div className="px-6 py-1.5 bg-blue-50/50 border-b border-blue-100 flex items-center gap-2 text-[11px] text-blue-800 flex-shrink-0">
              Showing <strong>{BANDS.find((b) => b.key === bandFilter)?.title.toLowerCase()}</strong> only
              <button onClick={() => setBandFilter('all')} className="ml-auto font-semibold hover:underline">
                Show everything
              </button>
            </div>
          )}

          {/* Banded list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : grouped.length === 0 ? (
              <EmptyState
                hasAny={drafts.length > 0}
                onCreate={handleCreate}
                creating={creating}
              />
            ) : (
              grouped.map((band) => (
                <div key={band.key}>
                  <BandHeader band={band} count={band.rows.length} />
                  <div className="divide-y divide-gray-100">
                    {band.rows.map(({ draft: d, readiness }) => (
                      <DraftRow
                        key={d.id}
                        draft={d}
                        readiness={readiness}
                        band={band.key}
                        isSupplier={isSupplier}
                        onOpen={() => router.push(`/factory-shipping/${d.id}`)}
                        onDelete={() => handleDelete(d)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {factoryPicker && (
        <FactoryPickerModal
          factories={factoryPicker.factories}
          loading={factoryPicker.loading}
          onClose={() => setFactoryPicker(null)}
          onPick={(f) => { setFactoryPicker(null); createForFactory(f); }}
        />
      )}
    </AppShell>
  );
}

const TONE = {
  green: { tile: 'text-emerald-700', band: 'bg-emerald-50/60 border-emerald-100 text-emerald-800' },
  amber: { tile: 'text-amber-700', band: 'bg-amber-50/60 border-amber-100 text-amber-800' },
  gray: { tile: 'text-gray-500', band: 'bg-gray-50 border-gray-100 text-gray-600' },
  blue: { tile: 'text-blue-700', band: 'bg-blue-50/50 border-blue-100 text-blue-800' },
} as const;

function SummaryTile({
  band, count, units, active, onClick,
}: {
  band: (typeof BANDS)[number];
  count: number;
  units: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-left border-r border-gray-100 last:border-r-0 transition-colors',
        active ? 'bg-blue-50/70' : 'hover:bg-gray-50/70',
        count === 0 && 'opacity-55'
      )}
    >
      <div className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{band.title}</div>
      <div className={cn('text-xl font-bold tabular-nums leading-tight', count === 0 ? 'text-gray-400' : TONE[band.tone].tile)}>
        {count}
      </div>
      <div className="text-[10px] text-gray-500 truncate">
        {count === 0 ? '—' : units > 0 ? `${units.toLocaleString()} units` : band.hint}
      </div>
    </button>
  );
}

function BandHeader({ band, count }: { band: (typeof BANDS)[number]; count: number }) {
  return (
    <div className={cn(
      'px-6 py-1.5 border-y text-[10px] font-bold uppercase tracking-wide flex items-baseline gap-2 sticky top-0 z-10',
      TONE[band.tone].band
    )}>
      {band.title}
      <span className="font-medium normal-case tracking-normal text-[11px] opacity-70">
        {count} · {band.hint}
      </span>
    </div>
  );
}

function FactoryPickerModal({
  factories,
  loading,
  onClose,
  onPick,
}: {
  factories: string[];
  loading: boolean;
  onClose: () => void;
  onPick: (factory: string) => void;
}) {
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return factories;
    return factories.filter((f) => f.toLowerCase().includes(q));
  }, [factories, filter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-0.5">New shipment</div>
              <h3 className="text-base font-bold text-gray-900">Choose a factory</h3>
              <p className="text-[11px] text-gray-500">A shipment covers one factory. Pick which one this is for.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/40 flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter factories…"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-gray-500">
              {factories.length === 0 ? 'No factories found in the system' : 'No matches'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((f) => (
                <button
                  key={f}
                  onClick={() => onPick(f)}
                  className="w-full text-left px-3 py-2 rounded-md text-xs font-medium text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center justify-between group"
                >
                  <span>{f}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  hasAny,
  onCreate,
  creating,
}: {
  hasAny: boolean;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
        <Truck className="w-8 h-8 text-teal-600" />
      </div>
      <h4 className="text-base font-bold text-gray-900 mb-1">
        {hasAny ? 'Nothing matches your search' : 'No shipments yet'}
      </h4>
      <p className="text-sm text-gray-500 max-w-sm mb-4">
        {hasAny
          ? 'Try a different search, or clear it to see everything.'
          : 'Build a shipment by picking the styles going on it and entering the vessel details. Confirm to push those details onto every style in one go.'}
      </p>
      {!hasAny && (
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create your first shipment
        </button>
      )}
    </div>
  );
}

function DraftRow({
  draft,
  readiness,
  band,
  isSupplier,
  onOpen,
  onDelete,
}: {
  draft: ShipmentDraftSummary;
  readiness: ReturnType<typeof getShipmentReadiness>;
  band: BandKey;
  isSupplier: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isConfirmed = draft.status === 'confirmed';
  const isDraft = draft.status === 'draft';
  const editor = draft.confirmed_by?.full_name || draft.confirmed_by?.username || draft.created_by?.full_name || draft.created_by?.username || '—';
  let lastEdited = '';
  try { lastEdited = formatDistanceToNow(parseISO(draft.updated_at), { addSuffix: true }); } catch {}
  let etdShort = '', etaShort = '';
  try { if (draft.vessel_etd) etdShort = format(parseISO(draft.vessel_etd), 'd MMM'); } catch {}
  try { if (draft.vessel_eta_to_port) etaShort = format(parseISO(draft.vessel_eta_to_port), 'd MMM'); } catch {}

  const pos = draft.po_numbers || [];
  // Subtitle carries the POs — what they actually look a shipment up by —
  // falling back to whatever name was typed.
  const subtitle = pos.length > 0
    ? `PO ${pos.slice(0, 3).join(', ')}${pos.length > 3 ? ` +${pos.length - 3}` : ''}${draft.name ? ` · ${draft.name}` : ''}`
    : draft.name || '';

  // The middle column is the one that used to be four columns of em-dashes.
  // It now either describes the sailing or says what is stopping it.
  const sailing = [draft.vessel_name, draft.fcl_lcl, etdShort && etaShort ? `${etdShort} → ${etaShort}` : '']
    .filter(Boolean).join(' · ');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={cn(
        'grid items-center gap-4 px-6 py-2.5 cursor-pointer transition-colors text-xs',
        isSupplier
          ? 'grid-cols-[minmax(0,1.1fr)_130px_minmax(0,1fr)_120px_86px]'
          : 'grid-cols-[minmax(0,1.1fr)_130px_minmax(0,1fr)_120px_130px_86px]',
        isConfirmed ? 'hover:bg-blue-50/30' : 'hover:bg-gray-50'
      )}
    >
      <div className="min-w-0">
        <div className="font-mono font-bold text-gray-900 text-[12.5px] truncate">{draft.reference}</div>
        {subtitle && <div className="text-[11px] text-gray-500 truncate">{subtitle}</div>}
      </div>

      <div>
        <ReadinessPill band={band} readiness={readiness} />
      </div>

      <div className="min-w-0">
        {band === 'confirmed' ? (
          <span className="text-gray-600 truncate block">
            {sailing || <span className="text-gray-400 italic">no vessel recorded</span>}
          </span>
        ) : band === 'empty' ? (
          <span className="text-gray-400">Started {lastEdited}, no styles on it</span>
        ) : readiness.datesImpossible ? (
          <span className="text-red-600 font-medium inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            ETA is before the ETD
          </span>
        ) : readiness.missing.length > 0 ? (
          <span className="text-amber-700">
            {capitalise(readiness.missing.join(', '))} not set
          </span>
        ) : (
          <span className="text-gray-600 truncate block">{sailing}</span>
        )}
      </div>

      <div className="text-gray-700 tabular-nums">
        {draft.order_count > 0 ? (
          <>
            <span className="font-semibold">{draft.order_count}</span>
            <span className="text-gray-500"> style{draft.order_count === 1 ? '' : 's'}</span>
            <div className="text-[10px] text-gray-500">{draft.unit_count.toLocaleString()} units</div>
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {!isSupplier && (
        <div className="text-[11px] text-gray-600 truncate">{draft.factory}</div>
      )}

      <div className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        {isDraft && draft.order_count === 0 && (
          <button
            onClick={onDelete}
            className="px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors inline-flex items-center gap-1"
            title="Delete this empty shipment"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}
        {(!isDraft || draft.order_count > 0) && (
          <button
            onClick={onOpen}
            className="text-blue-600 hover:text-blue-700 text-[11px] font-semibold inline-flex items-center gap-1"
          >
            {isConfirmed ? 'View' : 'Open'}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ReadinessPill({
  band, readiness,
}: {
  band: BandKey;
  readiness: ReturnType<typeof getShipmentReadiness>;
}) {
  const cfg = band === 'confirmed'
    ? { cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'Confirmed' }
    : band === 'empty'
    ? { cls: 'bg-gray-50 text-gray-500 border-gray-200', dot: 'bg-gray-300', label: 'Empty' }
    : readiness.datesImpossible
    ? { cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Check dates' }
    : band === 'ready'
    ? { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', label: 'Ready' }
    : { cls: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', label: readiness.label };

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap', cfg.cls)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
