'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X, ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { businessDaysBetween, businessDaysUntil, isSampleDone, relativeTimeShort } from '@/lib/sampleStatus';
import { AttemptBadge } from '@/components/samples/AttemptBadge';
import { BulkEditModal, type BulkEditInstance } from '@/components/orders/BulkEditModal';
import type { Order, OrderComponent, ComponentSampleType } from '@/types';

const STALE_BIZ_DAYS = 14;
const EX_FAC_URGENT_BIZ_DAYS = 7;
const HARD_ATTENTION_STATUSES = new Set(['REJECTED', 'LATE', 'P23 ADVISE UPDATE']);

const SHIPPED_STATUSES = new Set([
  'Shipped', 'In Transit',
  'Delivered', 'Delivered to UK', 'Delivered to Customer',
  'Complete', 'Completed',
]);

type Instance = { order: Order; component: OrderComponent };
type TypeFilter = 'all' | ComponentSampleType;

function activeSampleFor(component: OrderComponent) {
  const t = component.sample_type;
  const status = (t === 'strike_off' ? component.strike_off_status
                : t === 'lab_dip'   ? component.lab_dip_status
                : component.label_status) || '';
  const approved = t === 'strike_off' ? component.strike_off_approved
                 : t === 'lab_dip'   ? component.lab_dip_approved
                 : component.label_approved;
  return { status: status.trim().toUpperCase(), approved };
}

function isNeedsAttention(inst: Instance): boolean {
  const { order, component } = inst;
  const { status } = activeSampleFor(component);
  if (HARD_ATTENTION_STATUSES.has(status)) return true;
  const updatedDays = component.updated_at ? businessDaysBetween(component.updated_at, new Date()) : 0;
  if (status === 'OUTSTANDING' && updatedDays >= STALE_BIZ_DAYS) return true;
  const exFac = order.revised_po_ex_factory || order.original_po_ex_factory;
  const daysToExFac = businessDaysUntil(exFac);
  if (daysToExFac !== null && daysToExFac <= EX_FAC_URGENT_BIZ_DAYS) return true;
  return false;
}

function shouldShow(inst: Instance, hideShipped: boolean): boolean {
  const { status, approved } = activeSampleFor(inst.component);
  if (status === 'NOT REQUIRED') return false;
  if (isSampleDone(status, approved)) return false;
  if (hideShipped && SHIPPED_STATUSES.has(inst.order.status || '')) return false;
  return true;
}

function statusPillStyle(status: string | null | undefined) {
  const s = (status || '').trim().toUpperCase();
  switch (s) {
    case 'APPROVED':          return { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved' };
    case 'NOT REQUIRED':      return { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Not required' };
    case 'OUTSTANDING':       return { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Outstanding' };
    case 'RECEIVED':          return { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Received' };
    case 'REJECTED':          return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected' };
    case 'LATE':              return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Late' };
    case 'P23 ADVISE UPDATE': return { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Advise update' };
    case '':                  return { bg: 'bg-gray-100',   text: 'text-gray-400',   label: 'Not started' };
    default:                  return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: status as string };
  }
}

function sampleTypeLabel(t: ComponentSampleType) {
  return t === 'strike_off' ? 'SO' : t === 'lab_dip' ? 'LD' : 'LB';
}

function sampleTypeChipBg(t: ComponentSampleType) {
  return t === 'strike_off' ? 'bg-amber-100 text-amber-700'
       : t === 'lab_dip'    ? 'bg-cyan-100 text-cyan-700'
       :                       'bg-fuchsia-100 text-fuchsia-700';
}

type ComponentGroup = {
  key: string;
  name: string;
  sampleType: ComponentSampleType;
  instances: Instance[];
  attentionCount: number;
  worstPendingDays: number;
};

function groupByComponent(instances: Instance[]): ComponentGroup[] {
  const map = new Map<string, ComponentGroup>();
  for (const inst of instances) {
    const name = (inst.component.name || '').trim() || 'Unnamed';
    const sampleType = inst.component.sample_type as ComponentSampleType;
    const key = `${name.toLowerCase()}|${sampleType}`;
    let group = map.get(key);
    if (!group) {
      group = { key, name, sampleType, instances: [], attentionCount: 0, worstPendingDays: 0 };
      map.set(key, group);
    }
    group.instances.push(inst);
    if (isNeedsAttention(inst)) group.attentionCount++;
    const d = inst.component.updated_at ? businessDaysBetween(inst.component.updated_at, new Date()) : 0;
    if (d > group.worstPendingDays) group.worstPendingDays = d;
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (b.attentionCount !== a.attentionCount) return b.attentionCount - a.attentionCount;
    if (b.worstPendingDays !== a.worstPendingDays) return b.worstPendingDays - a.worstPendingDays;
    return a.name.localeCompare(b.name);
  });
  return groups;
}

function groupInstancesByPo(insts: Instance[]): { po: string; insts: Instance[] }[] {
  const order: string[] = [];
  const byPo = new Map<string, Instance[]>();
  for (const inst of insts) {
    const po = inst.order.po_number || '—';
    if (!byPo.has(po)) { byPo.set(po, []); order.push(po); }
    byPo.get(po)!.push(inst);
  }
  byPo.forEach((list) => {
    list.sort((a: Instance, b: Instance) => {
      const aa = isNeedsAttention(a) ? 1 : 0;
      const bb = isNeedsAttention(b) ? 1 : 0;
      if (aa !== bb) return bb - aa;
      const ad = a.component.updated_at ? businessDaysBetween(a.component.updated_at, new Date()) : 0;
      const bd = b.component.updated_at ? businessDaysBetween(b.component.updated_at, new Date()) : 0;
      return bd - ad;
    });
  });
  return order.map((po) => ({ po, insts: byPo.get(po)! }));
}

interface Props {
  orders: Order[];
  loading: boolean;
  isSupplier: boolean;
  onEditInstance: (order: Order, component: OrderComponent) => void;
  onBulkEditDone: () => void;
}

export function InProgressTab({ orders, loading, isSupplier, onEditInstance, onBulkEditDone }: Props) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [hideShipped, setHideShipped] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    const search = q.trim().toLowerCase();
    const instances: Instance[] = [];
    for (const order of orders) {
      for (const c of order.components || []) {
        const inst: Instance = { order, component: c };
        if (typeFilter !== 'all' && c.sample_type !== typeFilter) continue;
        if (!shouldShow(inst, hideShipped)) continue;
        if (search) {
          const hay = `${c.name || ''} ${order.style_code || ''} ${order.customer || ''} ${order.po_number || ''} ${order.description || ''}`.toLowerCase();
          if (!hay.includes(search)) continue;
        }
        instances.push(inst);
      }
    }
    return groupByComponent(instances);
  }, [orders, q, typeFilter, hideShipped]);

  const selected = groups.find((g) => g.key === selectedKey) || groups[0] || null;

  return (
    <div className="grid grid-cols-[300px_1fr] gap-6 mt-2">
      {/* Left rail — components with in-progress work */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search components…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap text-[11px]">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mr-1">Type</span>
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {(['all', 'strike_off', 'lab_dip', 'label'] as TypeFilter[]).map((t) => {
              const on = typeFilter === t;
              const label = t === 'all' ? 'All' : sampleTypeLabel(t as ComponentSampleType);
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-semibold transition',
                    on ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideShipped}
            onChange={(e) => setHideShipped(e.target.checked)}
            className="w-3 h-3 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
          />
          Hide shipped
        </label>

        <div className="flex-1 rounded-md border border-gray-200 bg-white overflow-y-auto max-h-[calc(100vh-320px)]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-10">
              Nothing in progress. Everything's approved or shipped.
            </div>
          ) : (
            groups.map((g) => {
              const on = g.key === (selected?.key || '');
              const tag = sampleTypeChipBg(g.sampleType);
              return (
                <button
                  key={g.key}
                  onClick={() => setSelectedKey(g.key)}
                  className={cn(
                    'w-full text-left p-2.5 border-b border-gray-100 transition',
                    on ? 'bg-violet-50 border-l-4 border-l-violet-500' : 'hover:bg-gray-50',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', tag)}>
                      {sampleTypeLabel(g.sampleType)}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-900 truncate">{g.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 tabular-nums flex items-center gap-1.5">
                    <span>{g.instances.length} {g.instances.length === 1 ? 'style' : 'styles'}</span>
                    {g.attentionCount > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-red-600 font-semibold">{g.attentionCount} needs attention</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right — selected component detail */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !selected ? (
          <div className="flex flex-col items-center justify-center text-gray-400 h-64">
            <Package className="w-8 h-8 mb-2" />
            <p className="text-sm">Nothing in progress right now.</p>
          </div>
        ) : (
          <RightPanel
            key={selected.key}
            group={selected}
            isSupplier={isSupplier}
            onEditInstance={onEditInstance}
            onBulkEditDone={onBulkEditDone}
          />
        )}
      </div>
    </div>
  );
}

function RightPanel({
  group,
  isSupplier,
  onEditInstance,
  onBulkEditDone,
}: {
  group: ComponentGroup;
  isSupplier: boolean;
  onEditInstance: (order: Order, component: OrderComponent) => void;
  onBulkEditDone: () => void;
}) {
  const tag = sampleTypeChipBg(group.sampleType);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Reset selection when the group changes (parent uses key= to force remount,
  // but this is belt+braces if key handling ever changes).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [group.key]);

  const allIds = useMemo(() => group.instances.map((i) => i.component.id), [group]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePo(insts: Instance[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const ids = insts.map((i) => i.component.id);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(allIds));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  // Build the BulkEditInstance payload for the modal
  const bulkPayload: BulkEditInstance[] = useMemo(() => {
    const byId = new Map(group.instances.map((i) => [i.component.id, i]));
    return Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter((x): x is Instance => Boolean(x))
      .map((inst) => {
        const approved =
          inst.component.sample_type === 'strike_off' ? inst.component.strike_off_approved
          : inst.component.sample_type === 'lab_dip'   ? inst.component.lab_dip_approved
          : inst.component.label_approved;
        return {
          instance_id: inst.component.id,
          style_code: inst.order.style_code,
          po_number: inst.order.po_number,
          customer: inst.order.customer,
          approved,
        };
      });
  }, [selectedIds, group.instances]);

  return (
    <div className="flex flex-col gap-4">
      {/* Identity mini-header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', tag)}>
            {sampleTypeLabel(group.sampleType)}
          </span>
          <h2 className="text-lg font-bold text-gray-900 flex-1 truncate">{group.name}</h2>
          {group.attentionCount > 0 && (
            <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded">
              {group.attentionCount} needs attention
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <div>
            <span className="text-gray-400">Across</span>{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{group.instances.length}</span> styles
          </div>
          <span className="text-gray-300">·</span>
          <div>
            <span className="text-gray-400">Longest pending</span>{' '}
            <span className={cn('font-semibold tabular-nums', group.worstPendingDays >= STALE_BIZ_DAYS ? 'text-red-600' : group.worstPendingDays >= 7 ? 'text-amber-600' : 'text-gray-900')}>
              {group.worstPendingDays}d
            </span>
          </div>
          {!isSupplier && (
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={allSelected ? clearAll : selectAll}
                className="text-[11px] font-semibold text-gray-600 hover:text-gray-900"
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
              <button
                onClick={() => setBulkOpen(true)}
                disabled={!someSelected}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Bulk edit… ({selectedIds.size})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PO groups + cards */}
      <div className="space-y-4">
        {groupInstancesByPo(group.instances).map(({ po, insts }) => (
          <PoGroup
            key={po}
            po={po}
            insts={insts}
            selectedIds={selectedIds}
            isSupplier={isSupplier}
            onToggleOne={toggleOne}
            onTogglePo={togglePo}
            onEditInstance={onEditInstance}
          />
        ))}
      </div>

      {bulkOpen && (
        <BulkEditModal
          instances={bulkPayload}
          canonicalName={group.name}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelectedIds(new Set());
            onBulkEditDone();
          }}
        />
      )}

    </div>
  );
}

function PoGroup({
  po,
  insts,
  selectedIds,
  isSupplier,
  onToggleOne,
  onTogglePo,
  onEditInstance,
}: {
  po: string;
  insts: Instance[];
  selectedIds: Set<number>;
  isSupplier: boolean;
  onToggleOne: (id: number) => void;
  onTogglePo: (insts: Instance[]) => void;
  onEditInstance: (order: Order, component: OrderComponent) => void;
}) {
  const ref = insts[0].order;
  const refs = Array.from(new Set(insts.map((i) => i.order.china_orderbook_ref).filter(Boolean) as string[]));
  const ids = insts.map((i) => i.component.id);
  const allOn = ids.every((id) => selectedIds.has(id));
  const someOn = !allOn && ids.some((id) => selectedIds.has(id));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        {!isSupplier && (
          <input
            type="checkbox"
            checked={allOn}
            ref={(el) => { if (el) el.indeterminate = someOn; }}
            onChange={() => onTogglePo(insts)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
            aria-label={`Select all styles in PO ${po}`}
          />
        )}
        <span
          className="px-2.5 py-1 rounded-md bg-gray-900 text-white text-xs font-bold tracking-wide tabular-nums inline-flex items-center gap-1.5"
          title={refs.length > 0 ? refs.join(', ') : undefined}
        >
          <span>PO {po}</span>
          {refs.length > 0 && (
            <>
              <span className="text-gray-500 font-normal">·</span>
              <span className="text-gray-200 font-semibold truncate max-w-[180px]">
                {refs[0]}{refs.length > 1 && ` +${refs.length - 1}`}
              </span>
            </>
          )}
        </span>
        <span className="text-[11px] text-gray-700 font-semibold truncate">{ref.customer || '—'}</span>
        {ref.factory && (
          <span className="text-[11px] text-gray-500 truncate">· {ref.factory}</span>
        )}
        <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">
          · {insts.length} {insts.length === 1 ? 'style' : 'styles'}
        </span>
      </div>
      <div className="space-y-1.5">
        {insts.map((inst) => (
          <InstanceCard
            key={inst.component.id}
            inst={inst}
            selected={selectedIds.has(inst.component.id)}
            isSupplier={isSupplier}
            onToggle={() => onToggleOne(inst.component.id)}
            onClick={() => onEditInstance(inst.order, inst.component)}
          />
        ))}
      </div>
    </div>
  );
}

function InstanceCard({
  inst,
  selected,
  isSupplier,
  onToggle,
  onClick,
}: {
  inst: Instance;
  selected: boolean;
  isSupplier: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const { order, component } = inst;
  const attention = isNeedsAttention(inst);
  const exFac = order.revised_po_ex_factory || order.original_po_ex_factory;
  const daysToExFac = businessDaysUntil(exFac);
  const updatedDays = component.updated_at ? businessDaysBetween(component.updated_at, new Date()) : null;
  const status =
    component.sample_type === 'strike_off' ? component.strike_off_status
    : component.sample_type === 'lab_dip'   ? component.lab_dip_status
    : component.label_status;
  const attemptNo =
    component.sample_type === 'strike_off' ? component.strike_off_attempt_no
    : component.sample_type === 'lab_dip'   ? component.lab_dip_attempt_no
    : component.label_attempt_no;
  const rejectionCount =
    component.sample_type === 'strike_off' ? component.strike_off_rejection_count
    : component.sample_type === 'lab_dip'   ? component.lab_dip_rejection_count
    : component.label_rejection_count;
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl ring-1 hover:shadow-sm cursor-pointer flex items-stretch transition-all',
        selected ? 'ring-violet-300 bg-violet-50/40' : attention ? 'ring-red-100 hover:ring-red-200' : 'ring-amber-100',
      )}
    >
      {!isSupplier && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pl-3 pr-1 self-center flex items-center"
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
            aria-label={`Select ${order.style_code || 'instance'}`}
          />
        </div>
      )}
      <div className="py-2.5 pr-4 pl-4 flex items-center gap-2 min-w-[240px] border-r border-gray-100">
        <StatusPill status={status} />
        {!!attemptNo && attemptNo > 1 && (
          <AttemptBadge attemptNo={attemptNo} rejectionCount={rejectionCount} size="xs" />
        )}
        {attention && updatedDays !== null && (
          <span className={cn(
            'text-[11px] font-semibold tabular-nums ml-auto',
            updatedDays >= STALE_BIZ_DAYS ? 'text-red-600' : updatedDays >= 7 ? 'text-amber-600' : 'text-gray-500',
          )}>
            {updatedDays}d
          </span>
        )}
      </div>
      <div className="flex-1 py-2.5 px-3 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-bold text-gray-900 truncate">{order.style_code || `Style #${order.id}`}</span>
          {order.colour && <span className="text-[11px] text-gray-500 truncate">{order.colour}</span>}
        </div>
        {order.description && (
          <div className="text-[11px] text-gray-400 truncate">{order.description}</div>
        )}
      </div>
      <div className="py-2.5 pr-4 flex items-center gap-3 flex-shrink-0">
        <div className="text-right hidden md:block">
          <div className="text-[10px] text-gray-400 leading-tight">Ex-fac</div>
          <ExFacBadge days={daysToExFac} />
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[10px] text-gray-400 leading-tight">Updated</div>
          <div className="text-[11px] text-gray-700 tabular-nums">{relativeTimeShort(component.updated_at)}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const s = statusPillStyle(status);
  return (
    <span className={cn('px-2.5 py-1 rounded-md text-[11px] font-bold leading-none', s.bg, s.text)}>
      {s.label}
    </span>
  );
}

function ExFacBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-300">—</span>;
  const overdue = days < 0;
  const color =
    overdue ? 'bg-red-100 text-red-700'
      : days <= 7 ? 'bg-red-50 text-red-600'
      : days <= 14 ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-600';
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums', color)}>
      {overdue ? `${Math.abs(days)}d late` : `${days}d`}
    </span>
  );
}
