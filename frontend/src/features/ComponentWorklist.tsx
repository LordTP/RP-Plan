'use client';

/**
 * The component worklist — one row per ADD-EVENT, expandable to its styles.
 *
 * Adding "Rib Fabric" to six styles on a PO is one decision and one thing to
 * chase, so it's one row. The grouping key is `canonical_id`, not the name:
 * the library holds 19 separate "Rib Fabric" entries from the old seed, and
 * keying on the name would fuse unrelated components into a single line.
 *
 * Legacy instances predate canonicals and carry no id, so they fall back to
 * name+type and group only among themselves.
 *
 * The collapsed row still has to surface the worst status in the group —
 * otherwise grouping hides the one rejection you opened the page to find.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Package, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { relativeTimeShort } from '@/lib/sampleStatus';
import { AttemptBadge } from '@/components/samples/AttemptBadge';
import { BulkEditModal, type BulkEditInstance } from '@/components/orders/BulkEditModal';
import { StatusTile, TogglePill, SortableTh, StatusBar, BulkBar } from '@/components/orders/v2-list-primitives';
import {
  type Instance, type TypeFilter,
  activeSampleFor, attemptFor, isNeedsAttention, isInFlight, isStale, isExFacUrgent, ageDays,
  statusPillStyle, sampleTypeLabel, sampleTypeChipBg, sampleTypeFullLabel,
} from './component-shared';
import type { Order, OrderComponent, ComponentSampleType } from '@/types';

type SortKey = 'age' | 'component' | 'style' | 'po' | 'status' | 'exfac';
type Tile = 'all' | 'attention' | 'rejected' | 'stale' | 'outstanding' | 'received';

interface Props {
  orders: Order[];
  loading: boolean;
  isSupplier: boolean;
  onEditInstance: (order: Order, component: OrderComponent) => void;
  onOpenStyle: (orderId: number) => void;
  onBulkEditDone: () => void;
}

const TILES: { key: Tile; label: string; tone: 'primary' | 'danger' }[] = [
  { key: 'all', label: 'In flight', tone: 'primary' },
  { key: 'attention', label: 'Needs attention', tone: 'danger' },
  { key: 'rejected', label: 'Rejected', tone: 'danger' },
  { key: 'stale', label: 'Stale 14d+', tone: 'primary' },
  { key: 'outstanding', label: 'Outstanding', tone: 'primary' },
  { key: 'received', label: 'Received', tone: 'primary' },
];

type WorkGroup = {
  key: string;
  name: string;
  sampleType: ComponentSampleType;
  instances: Instance[];
  attention: number;
  worstIdle: number;
  earliestExFac: string | null;
  poNumbers: string[];
  customers: string[];
  /** Status -> count, worst first, for the rolled-up pills. */
  statusCounts: [string, number][];
};

function groupKeyFor(c: OrderComponent) {
  return c.canonical_id != null
    ? `c:${c.canonical_id}`
    : `legacy:${(c.name || '').trim().toLowerCase()}|${c.sample_type}`;
}

function exFacOf(inst: Instance) {
  return inst.order.revised_po_ex_factory || inst.order.original_po_ex_factory || null;
}

function statusRank(s: string) {
  return s === 'REJECTED' || s === 'LATE' ? 0
    : s === 'P23 ADVISE UPDATE' ? 1
    : s === 'OUTSTANDING' ? 2
    : s === 'RECEIVED' ? 3 : 4;
}

function buildGroups(instances: Instance[]): WorkGroup[] {
  const map = new Map<string, WorkGroup>();
  for (const inst of instances) {
    const key = groupKeyFor(inst.component);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: (inst.component.name || '').trim() || 'Unnamed',
        sampleType: inst.component.sample_type,
        instances: [],
        attention: 0,
        worstIdle: 0,
        earliestExFac: null,
        poNumbers: [],
        customers: [],
        statusCounts: [],
      };
      map.set(key, g);
    }
    g.instances.push(inst);
  }

  for (const g of Array.from(map.values())) {
    const pos = new Set<string>();
    const custs = new Set<string>();
    const statuses = new Map<string, number>();
    for (const inst of g.instances) {
      if (isNeedsAttention(inst)) g.attention++;
      g.worstIdle = Math.max(g.worstIdle, ageDays(inst));
      const ef = exFacOf(inst);
      if (ef && (!g.earliestExFac || String(ef) < String(g.earliestExFac))) g.earliestExFac = ef as string;
      if (inst.order.po_number) pos.add(inst.order.po_number);
      if (inst.order.customer) custs.add(inst.order.customer);
      const st = activeSampleFor(inst.component).status;
      statuses.set(st, (statuses.get(st) || 0) + 1);
    }
    g.poNumbers = Array.from(pos).sort();
    g.customers = Array.from(custs).sort();
    g.statusCounts = Array.from(statuses.entries()).sort((a, b) => statusRank(a[0]) - statusRank(b[0]));
    // Children worst-first too, so expanding lands you on the problem.
    g.instances.sort((a, b) => {
      const r = statusRank(activeSampleFor(a.component).status) - statusRank(activeSampleFor(b.component).status);
      if (r !== 0) return r;
      return (a.order.style_code || '').localeCompare(b.order.style_code || '');
    });
  }
  return Array.from(map.values());
}

export function ComponentWorklist({
  orders, loading, isSupplier, onEditInstance, onOpenStyle, onBulkEditDone,
}: Props) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [hideShipped, setHideShipped] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [tile, setTile] = useState<Tile>('all');
  const [sortKey, setSortKey] = useState<SortKey>('age');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Everything in flight, before tile/chip narrowing — the tiles count
  // against this so their numbers don't move as you filter by them.
  const inFlight = useMemo(() => {
    const out: Instance[] = [];
    for (const order of orders) {
      for (const c of order.components || []) {
        const inst: Instance = { order, component: c };
        if (!isInFlight(inst, hideShipped)) continue;
        out.push(inst);
      }
    }
    return out;
  }, [orders, hideShipped]);

  const counts = useMemo(() => ({
    all: inFlight.length,
    attention: inFlight.filter(isNeedsAttention).length,
    rejected: inFlight.filter((i) => activeSampleFor(i.component).status === 'REJECTED').length,
    stale: inFlight.filter(isStale).length,
    outstanding: inFlight.filter((i) => activeSampleFor(i.component).status === 'OUTSTANDING').length,
    received: inFlight.filter((i) => activeSampleFor(i.component).status === 'RECEIVED').length,
  }), [inFlight]);

  const matching = useMemo(() => {
    const search = q.trim().toLowerCase();
    return inFlight.filter((inst) => {
      const { component: c, order } = inst;
      if (typeFilter !== 'all' && c.sample_type !== typeFilter) return false;
      const st = activeSampleFor(c).status;
      if (tile === 'attention' && !isNeedsAttention(inst)) return false;
      if (tile === 'rejected' && st !== 'REJECTED') return false;
      if (tile === 'stale' && !isStale(inst)) return false;
      if (tile === 'outstanding' && st !== 'OUTSTANDING') return false;
      if (tile === 'received' && st !== 'RECEIVED') return false;
      if (search) {
        const hay = `${c.name || ''} ${order.style_code || ''} ${order.customer || ''} ${order.po_number || ''} ${order.description || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [inFlight, q, typeFilter, tile]);

  const dir = sortDir === 'asc' ? 1 : -1;

  const groups = useMemo(() => {
    const gs = buildGroups(matching);
    gs.sort((a, b) => {
      let r = 0;
      switch (sortKey) {
        case 'age': r = a.worstIdle - b.worstIdle; break;
        case 'component': r = a.name.localeCompare(b.name); break;
        case 'style': r = a.instances.length - b.instances.length; break;
        case 'po': r = (a.poNumbers[0] || '').localeCompare(b.poNumbers[0] || ''); break;
        case 'status': r = statusRank(a.statusCounts[0]?.[0] || '') - statusRank(b.statusCounts[0]?.[0] || ''); break;
        case 'exfac': r = String(a.earliestExFac || '').localeCompare(String(b.earliestExFac || '')); break;
      }
      if (r !== 0) return r * dir;
      if (a.attention !== b.attention) return b.attention - a.attention;
      return a.key.localeCompare(b.key);
    });
    return gs;
  }, [matching, sortKey, dir]);

  const flatRows = useMemo(() => {
    const list = [...matching];
    list.sort((a, b) => {
      let r = 0;
      switch (sortKey) {
        case 'age': r = ageDays(a) - ageDays(b); break;
        case 'component': r = (a.component.name || '').localeCompare(b.component.name || ''); break;
        case 'style': r = (a.order.style_code || '').localeCompare(b.order.style_code || ''); break;
        case 'po': r = (a.order.po_number || '').localeCompare(b.order.po_number || ''); break;
        case 'status': r = statusRank(activeSampleFor(a.component).status) - statusRank(activeSampleFor(b.component).status); break;
        case 'exfac': r = String(exFacOf(a) || '').localeCompare(String(exFacOf(b) || '')); break;
      }
      if (r !== 0) return r * dir;
      return a.component.id - b.component.id;
    });
    return list;
  }, [matching, sortKey, dir]);

  // Drop selections that have fallen out of the current filter — bulk editing
  // something you can no longer see is how surprise edits happen.
  const visibleIds = useMemo(() => new Set(matching.map((i) => i.component.id)), [matching]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'age' ? 'desc' : 'asc'); }
  }

  const setMany = useCallback((ids: number[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const allIds = useMemo(() => matching.map((i) => i.component.id), [matching]);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const selectedInstances = useMemo(
    () => matching.filter((i) => selected.has(i.component.id)),
    [matching, selected],
  );

  // The bulk editor writes one sample type's fields, so a mixed selection has
  // no single set to write. Say so rather than half-applying.
  const mixedTypes = new Set(selectedInstances.map((i) => i.component.sample_type)).size > 1;

  const bulkPayload: BulkEditInstance[] = selectedInstances.map((i) => ({
    instance_id: i.component.id,
    style_code: i.order.style_code,
    po_number: i.order.po_number,
    customer: i.order.customer,
    approved: activeSampleFor(i.component).approved as string | null | undefined,
  }));

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {TILES.map((t) => (
          <StatusTile
            key={t.key}
            label={t.label}
            count={counts[t.key]}
            tone={t.tone}
            active={tile === t.key}
            onClick={() => setTile(tile === t.key && t.key !== 'all' ? 'all' : t.key)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search component, style, PO, customer…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mr-0.5">Type</span>
          {(['all', 'strike_off', 'lab_dip', 'label'] as TypeFilter[]).map((t) => (
            <TogglePill
              key={t}
              on={typeFilter === t}
              label={t === 'all' ? 'All' : sampleTypeFullLabel(t as ComponentSampleType)}
              onClick={() => setTypeFilter(t)}
            />
          ))}
        </div>
        <TogglePill
          on={grouped}
          label="Group by add"
          title="One row per add — the styles a component went onto together"
          onClick={() => setGrouped((v) => !v)}
        />
        <TogglePill
          on={hideShipped}
          label="Hide shipped"
          title="Hide samples on orders that have already shipped"
          onClick={() => setHideShipped((v) => !v)}
        />
      </div>

      <div className="flex-1 min-h-0 rounded-t-xl border border-b-0 border-gray-200 bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-[2] bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = !allOn && selected.size > 0; }}
                  onChange={() => setSelected(allOn ? new Set() : new Set(allIds))}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                />
              </th>
              <SortableTh label="Component" sortKey="component" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <th className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px]">Type</th>
              <SortableTh label={grouped ? 'Styles' : 'Style'} sortKey="style" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="PO" sortKey="po" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <th className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px]">Customer</th>
              <SortableTh label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Ex-fac" sortKey="exfac" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Idle" sortKey="age" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && matching.length === 0 ? (
              <tr><td colSpan={10} className="py-14 text-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin inline" />
              </td></tr>
            ) : matching.length === 0 ? (
              <tr><td colSpan={10} className="py-14 text-center">
                <Package className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">
                  {counts.all === 0
                    ? 'Nothing in flight. Every sample is approved, not required or shipped.'
                    : 'No samples match these filters.'}
                </p>
              </td></tr>
            ) : grouped ? (
              groups.map((g) => {
                const ids = g.instances.map((i) => i.component.id);
                const on = ids.every((id) => selected.has(id));
                return (
                  <GroupRows
                    key={g.key}
                    group={g}
                    open={expanded.has(g.key)}
                    checked={on}
                    indeterminate={!on && ids.some((id) => selected.has(id))}
                    onToggleOpen={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                      return next;
                    })}
                    onToggleCheck={() => setMany(ids, !on)}
                    selected={selected}
                    onToggleRow={(id) => setMany([id], !selected.has(id))}
                    onEditInstance={onEditInstance}
                    onOpenStyle={onOpenStyle}
                  />
                );
              })
            ) : (
              flatRows.map((inst) => (
                <StyleRow
                  key={inst.component.id}
                  inst={inst}
                  indent={false}
                  checked={selected.has(inst.component.id)}
                  onToggle={() => setMany([inst.component.id], !selected.has(inst.component.id))}
                  onOpen={() => onEditInstance(inst.order, inst.component)}
                  onOpenStyle={() => onOpenStyle(inst.order.id)}
                  showComponent
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="-mt-3">
        <StatusBar
          segments={[
            grouped
              ? `${groups.length} component${groups.length === 1 ? '' : 's'} · ${matching.length} sample${matching.length === 1 ? '' : 's'}`
              : `${matching.length} of ${counts.all} in flight`,
            counts.attention > 0 ? `${counts.attention} need attention` : null,
            selected.size > 0 ? `${selected.size} selected` : null,
          ]}
          hint={grouped ? 'Click a row to expand · click a style to edit' : 'Click a row to edit'}
        />
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <BulkBar count={selected.size} noun="sample" onClear={() => setSelected(new Set())}>
            {mixedTypes ? (
              <span className="text-[11px] text-amber-700 px-1">
                Mixed sample types — select one type to bulk edit
              </span>
            ) : (
              <button
                onClick={() => setBulkOpen(true)}
                disabled={isSupplier}
                title={isSupplier ? 'Source Lab marks samples received and approved' : undefined}
                className="px-2.5 py-1 rounded-md bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Edit samples
              </button>
            )}
          </BulkBar>
        </div>
      )}

      {bulkOpen && selectedInstances.length > 0 && (
        <BulkEditModal
          instances={bulkPayload}
          canonicalName={
            new Set(selectedInstances.map((i) => i.component.name)).size === 1
              ? selectedInstances[0].component.name || 'component'
              : `${selectedInstances.length} samples`
          }
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
            onBulkEditDone();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function GroupRows({
  group, open, checked, indeterminate,
  onToggleOpen, onToggleCheck, selected, onToggleRow, onEditInstance, onOpenStyle,
}: {
  group: WorkGroup;
  open: boolean;
  checked: boolean;
  indeterminate: boolean;
  onToggleOpen: () => void;
  onToggleCheck: () => void;
  selected: Set<number>;
  onToggleRow: (id: number) => void;
  onEditInstance: (order: Order, component: OrderComponent) => void;
  onOpenStyle: (orderId: number) => void;
}) {
  // A group of one IS the sample — no value in a disclosure triangle hiding a
  // single row behind an extra click.
  if (group.instances.length === 1) {
    const only = group.instances[0];
    return (
      <StyleRow
        inst={only}
        indent={false}
        checked={selected.has(only.component.id)}
        onToggle={() => onToggleRow(only.component.id)}
        onOpen={() => onEditInstance(only.order, only.component)}
        onOpenStyle={() => onOpenStyle(only.order.id)}
        showComponent
      />
    );
  }

  const n = group.instances.length;

  return (
    <>
      <tr
        onClick={onToggleOpen}
        className={cn(
          'cursor-pointer transition-colors',
          checked ? 'bg-primary-50/60' : open ? 'bg-gray-50/80' : 'hover:bg-gray-50',
        )}
      >
        <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            ref={(el) => { if (el) el.indeterminate = indeterminate; }}
            onChange={onToggleCheck}
            className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
          />
        </td>
        <td className="px-3 py-1.5 max-w-[260px]">
          <div className="flex items-center gap-1.5 min-w-0">
            {group.attention > 0 && <span className="w-1 h-4 rounded-full bg-red-500 flex-shrink-0" />}
            {open
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            <span className="font-semibold text-gray-900 truncate">{group.name}</span>
            <span className="text-[10px] font-bold text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-1.5 py-0.5 tabular-nums flex-shrink-0">
              {n}
            </span>
          </div>
        </td>
        <td className="px-3 py-1.5">
          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', sampleTypeChipBg(group.sampleType))}>
            {sampleTypeLabel(group.sampleType)}
          </span>
        </td>
        <td className="px-3 py-1.5 text-gray-600 tabular-nums whitespace-nowrap">{n} styles</td>
        <td className="px-3 py-1.5 font-mono tabular-nums text-gray-700 whitespace-nowrap">
          {group.poNumbers.length === 1 ? group.poNumbers[0] : `${group.poNumbers.length} POs`}
        </td>
        <td className="px-3 py-1.5 text-gray-600 max-w-[140px] truncate">
          {group.customers.length === 0 ? '—'
            : group.customers.length === 1 ? group.customers[0]
            : `${group.customers.length} customers`}
        </td>
        <td className="px-3 py-1.5">
          {/* Rolled up, worst first — a single rejection has to read from the
              collapsed row, or grouping hides the thing you came here for. */}
          <div className="flex items-center gap-1 flex-wrap">
            {group.statusCounts.slice(0, 3).map(([st, c]) => {
              const pill = statusPillStyle(st);
              return (
                <span key={st} className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
                  {c > 1 && <span className="tabular-nums">{c} </span>}{pill.label}
                </span>
              );
            })}
            {group.statusCounts.length > 3 && (
              <span className="text-[10px] text-gray-400">+{group.statusCounts.length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-gray-500">
          {group.earliestExFac ? relativeTimeShort(group.earliestExFac) : '—'}
        </td>
        <td className={cn('px-3 py-1.5 tabular-nums whitespace-nowrap', group.worstIdle >= 14 ? 'text-amber-700 font-semibold' : 'text-gray-500')}>
          {group.worstIdle}d
        </td>
        <td className="px-2 py-1.5" />
      </tr>

      {open && group.instances.map((inst) => (
        <StyleRow
          key={inst.component.id}
          inst={inst}
          indent
          checked={selected.has(inst.component.id)}
          onToggle={() => onToggleRow(inst.component.id)}
          onOpen={() => onEditInstance(inst.order, inst.component)}
          onOpenStyle={() => onOpenStyle(inst.order.id)}
          showComponent={false}
        />
      ))}
    </>
  );
}

function StyleRow({
  inst, indent, checked, onToggle, onOpen, onOpenStyle, showComponent,
}: {
  inst: Instance;
  indent: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenStyle: () => void;
  showComponent: boolean;
}) {
  const { order, component } = inst;
  const { status } = activeSampleFor(component);
  const pill = statusPillStyle(status);
  const attention = isNeedsAttention(inst);
  const attempt = attemptFor(component);
  const age = ageDays(inst);
  const urgent = isExFacUrgent(inst);
  const exFac = exFacOf(inst);

  return (
    <tr
      onClick={onOpen}
      className={cn(
        'cursor-pointer transition-colors',
        checked ? 'bg-primary-50/60' : 'hover:bg-gray-50',
      )}
    >
      <td className={cn('py-1.5', indent ? 'pl-8 pr-3' : 'px-3')} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
        />
      </td>
      <td className={cn('py-1.5 max-w-[260px]', indent ? 'pl-6 pr-3' : 'px-3')}>
        <div className="flex items-center gap-1.5 min-w-0">
          {attention && <span className="w-1 h-4 rounded-full bg-red-500 flex-shrink-0" />}
          {showComponent ? (
            <span className="font-semibold text-gray-900 truncate">{component.name || 'Unnamed'}</span>
          ) : (
            /* Inside a group the name sits on the parent row, so this slot
               carries the style's description instead of repeating it. */
            <span className="text-[11px] text-gray-400 truncate">{order.description || '—'}</span>
          )}
          <AttemptBadge attemptNo={attempt.attemptNo} rejectionCount={attempt.rejectionCount} />
        </div>
      </td>
      <td className="px-3 py-1.5">
        {showComponent && (
          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', sampleTypeChipBg(component.sample_type))}>
            {sampleTypeLabel(component.sample_type)}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 font-mono tabular-nums text-gray-700 max-w-[160px] truncate">
        {order.style_code || `#${order.id}`}
      </td>
      <td className="px-3 py-1.5 font-mono tabular-nums text-gray-700">{order.po_number || '—'}</td>
      <td className="px-3 py-1.5 text-gray-600 max-w-[140px] truncate">{order.customer || '—'}</td>
      <td className="px-3 py-1.5">
        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
          {pill.label}
        </span>
      </td>
      <td className={cn('px-3 py-1.5 tabular-nums whitespace-nowrap', urgent ? 'text-red-600 font-semibold' : 'text-gray-500')}>
        {exFac ? relativeTimeShort(exFac) : '—'}
      </td>
      <td className={cn('px-3 py-1.5 tabular-nums whitespace-nowrap', age >= 14 ? 'text-amber-700 font-semibold' : 'text-gray-500')}>
        {age}d
      </td>
      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onOpenStyle}
          title="Open the full style"
          className="p-1 rounded text-gray-300 hover:text-primary-600 hover:bg-primary-50"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
