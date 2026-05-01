'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ship, Plus, Search, Loader2, Truck, X, ArrowRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { shipmentDraftsApi, type ShipmentDraftSummary, type ShipmentDraftStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function FactoryShippingPage() {
  return (
    <AuthProvider>
      <DraftsListPage />
    </AuthProvider>
  );
}

function DraftsListPage() {
  const { user } = useStore();
  const router = useRouter();
  const [drafts, setDrafts] = useState<ShipmentDraftSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ShipmentDraftStatus>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const isSupplier = user?.role === 'supplier';
  // For suppliers their factory is locked. Internal/admin can create on
  // behalf of any factory by entering the name on the next page (we ask
  // for confirmation when they hit "+ New draft" without a known factory).
  const factoryForCreate = isSupplier ? user?.factory_name || '' : '';

  const refresh = () => {
    setIsLoading(true);
    shipmentDraftsApi.list()
      .then((res) => setDrafts(res.drafts))
      .catch(() => toast.error('Failed to load shipment drafts'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drafts.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      const fields = [d.reference, d.name, d.factory, d.vessel_name, d.tracking_reference];
      return fields.some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [drafts, statusFilter, search]);

  const counts = useMemo(() => {
    let draft = 0, confirmed = 0, cancelled = 0;
    for (const d of drafts) {
      if (d.status === 'draft') draft++;
      else if (d.status === 'confirmed') confirmed++;
      else cancelled++;
    }
    return { draft, confirmed, cancelled, all: drafts.length };
  }, [drafts]);

  const handleCreate = async () => {
    let factory = factoryForCreate;
    if (!factory && !isSupplier) {
      const entered = prompt('Which factory is this draft for?');
      if (!entered) return;
      factory = entered.trim();
    }
    if (!factory) {
      toast.error('No factory associated with your account — contact admin');
      return;
    }
    setCreating(true);
    try {
      const draft = await shipmentDraftsApi.create({ factory });
      router.push(`/factory-shipping/${draft.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create draft');
      setCreating(false);
    }
  };

  const handleDelete = async (draft: ShipmentDraftSummary) => {
    if (!confirm(`Delete ${draft.reference}? This cannot be undone.`)) return;
    try {
      await shipmentDraftsApi.remove(draft.id);
      toast.success('Draft deleted');
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
                <h3 className="text-base font-bold text-gray-900">Shipment drafts</h3>
                <p className="text-xs text-gray-500 truncate">
                  {isLoading ? 'Loading…'
                    : isSupplier
                      ? `${user?.factory_name || '—'} · ${counts.draft} draft${counts.draft === 1 ? '' : 's'} · ${counts.confirmed} confirmed`
                      : `${counts.draft} draft${counts.draft === 1 ? '' : 's'} · ${counts.confirmed} confirmed across all factories`}
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
                  placeholder="Search reference, vessel, tracking…"
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
                New draft
              </button>
            </div>
          </div>

          {/* Filter pills */}
          <div className="px-6 py-2 border-b border-gray-100 bg-gray-50/40 flex items-center gap-2 text-xs flex-shrink-0">
            <span className="text-gray-500 mr-1">Show:</span>
            <FilterPill active={statusFilter === 'all'} label={`All · ${counts.all}`} onClick={() => setStatusFilter('all')} />
            <FilterPill active={statusFilter === 'draft'} label={`Drafts · ${counts.draft}`} onClick={() => setStatusFilter('draft')} />
            <FilterPill active={statusFilter === 'confirmed'} label={`Confirmed · ${counts.confirmed}`} onClick={() => setStatusFilter('confirmed')} />
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                hasAny={drafts.length > 0}
                onCreate={handleCreate}
                creating={creating}
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Reference</th>
                    <th className="text-left px-4 py-2 font-semibold">Status</th>
                    {!isSupplier && <th className="text-left px-4 py-2 font-semibold">Factory</th>}
                    <th className="text-left px-4 py-2 font-semibold">Vessel</th>
                    <th className="text-left px-4 py-2 font-semibold">ETD → ETA</th>
                    <th className="text-left px-4 py-2 font-semibold">Tracking</th>
                    <th className="text-center px-4 py-2 font-semibold">SKUs · Units</th>
                    <th className="text-left px-4 py-2 font-semibold">Last edited</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((d) => (
                    <DraftRow
                      key={d.id}
                      draft={d}
                      isSupplier={isSupplier}
                      onOpen={() => router.push(`/factory-shipping/${d.id}`)}
                      onDelete={() => handleDelete(d)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-0.5 rounded-full font-medium transition-colors',
        active
          ? 'bg-blue-100 text-blue-700 border border-blue-200'
          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
      )}
    >
      {label}
    </button>
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
        {hasAny ? 'No drafts match your filter' : 'No shipment drafts yet'}
      </h4>
      <p className="text-sm text-gray-500 max-w-sm mb-4">
        {hasAny
          ? 'Try a different filter or clear the search.'
          : 'Build a draft by selecting SKUs and entering vessel info. Confirm to push to all selected orders in one go.'}
      </p>
      {!hasAny && (
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create your first draft
        </button>
      )}
    </div>
  );
}

function DraftRow({
  draft,
  isSupplier,
  onOpen,
  onDelete,
}: {
  draft: ShipmentDraftSummary;
  isSupplier: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isConfirmed = draft.status === 'confirmed';
  const isDraft = draft.status === 'draft';
  const editor = draft.confirmed_by?.full_name || draft.confirmed_by?.username || draft.created_by?.full_name || draft.created_by?.username || '—';
  let lastEdited = '';
  try { lastEdited = formatDistanceToNow(parseISO(draft.updated_at), { addSuffix: true }); } catch {}
  let etdShort = '—', etaShort = '—';
  try { if (draft.vessel_etd) etdShort = format(parseISO(draft.vessel_etd), 'd MMM'); } catch {}
  try { if (draft.vessel_eta_to_port) etaShort = format(parseISO(draft.vessel_eta_to_port), 'd MMM'); } catch {}
  const fclLabel = draft.fcl_lcl || '—';

  return (
    <tr
      className={cn(
        'cursor-pointer transition-colors',
        isConfirmed ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-blue-50/30'
      )}
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-900 text-xs">{draft.reference}</div>
        {draft.name && <div className="text-[11px] text-gray-500 truncate max-w-[260px]">{draft.name}</div>}
      </td>
      <td className="px-4 py-3">
        <StatusPill status={draft.status} />
      </td>
      {!isSupplier && (
        <td className="px-4 py-3 text-xs text-gray-700 truncate max-w-[160px]">{draft.factory}</td>
      )}
      <td className="px-4 py-3 text-xs text-gray-700">
        {draft.vessel_name || <span className="text-gray-400 italic">—</span>}
        <span className="text-gray-400"> · {fclLabel}</span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
        {etdShort} → {etaShort}
      </td>
      <td className="px-4 py-3 font-mono text-[11px] text-gray-700">
        {draft.tracking_reference || <span className="text-gray-400 italic">—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="text-xs font-semibold text-gray-700">{draft.order_count}</div>
        <div className="text-[10px] text-gray-500">{draft.unit_count.toLocaleString()} units</div>
      </td>
      <td className="px-4 py-3 text-[11px] text-gray-500">
        {lastEdited} · {editor}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {isDraft && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors mr-1"
            title="Delete draft"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="text-blue-600 hover:text-blue-700 text-xs font-semibold inline-flex items-center gap-1">
          {isConfirmed ? 'View' : 'Open'}
          <ArrowRight className="w-3 h-3" />
        </span>
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: ShipmentDraftStatus }) {
  const cfg = status === 'draft'
    ? { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500', label: 'Draft' }
    : status === 'confirmed'
    ? { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Confirmed' }
    : { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', dot: 'bg-gray-400', label: 'Cancelled' };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', cfg.bg, cfg.text, cfg.border)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
