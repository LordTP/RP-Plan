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

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Package, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { relativeTimeShort } from '@/lib/sampleStatus';
import { AttemptBadge } from '@/components/samples/AttemptBadge';
import { BulkEditModal, type BulkEditInstance } from '@/components/orders/BulkEditModal';
import { StatusTile, TogglePill, Segmented, SortableTh, BulkBar, bulkActionPrimary } from '@/components/orders/v2-list-primitives';
import {
  type Instance, type TypeFilter,
  activeSampleFor, attemptFor, isNeedsAttention, isInFlight, isStale, isExFacUrgent, ageDays,
  statusPillStyle, sampleTypeLabel, sampleTypeChipBg, sampleTypeFullLabel, SHIPPED_STATUSES,
} from './component-shared';
import { NoComponentsPanel } from '@/features/NoComponentsPanel';
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
  /** Open the add-component modal with a PO's styles already ticked. */
  onAddForOrders?: (orderIds: number[], poNumber: string) => void;
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
  /** Highest attempt across the group's styles. >1 means somebody has been
   *  rejected and is on a remake, which the card has to say out loud. */
  maxAttempt: number;
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
        maxAttempt: 1,
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
      g.maxAttempt = Math.max(g.maxAttempt, attemptFor(inst.component).attemptNo);
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

/**
 * Whether bulk selection is offered at all.
 *
 * Factories cannot edit a sample's status, received or approved date -- that is
 * Source Lab's -- so every checkbox and the floating bar they feed led to a
 * disabled button. Advertising an action somebody can never take is worse than
 * not showing it, and the tick boxes were the most prominent thing on the row.
 *
 * A context rather than a prop because the checkboxes live in four different
 * components, and the table's header cell and body cells have to appear and
 * disappear together or the columns misalign.
 */
type Audience = { selectable: boolean; factory: boolean };
const AudienceContext = createContext<Audience>({ selectable: true, factory: false });
const useAudience = () => useContext(AudienceContext);

export function ComponentWorklist({
  orders, loading, isSupplier, onEditInstance, onOpenStyle, onBulkEditDone, onAddForOrders,
}: Props) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [hideShipped, setHideShipped] = useState(true);
  const [grouped, setGrouped] = useState(true);
  // Cards by default for Source Lab: the worklist is scanned for what needs
  // chasing, and a card gives the status rollup and the idle clock room to be
  // read at a glance; the table stays for when you want to sort a column.
  //
  // Factories start on the table. They are not triaging a book of other
  // people's POs, they are looking up where their own samples stand, which is
  // a lookup rather than a scan -- and the table puts four times as many on
  // screen. Both toggles stay; only the starting point differs.
  const [layout, setLayout] = useState<'cards' | 'table'>(isSupplier ? 'table' : 'cards');
  const [tile, setTile] = useState<Tile>('all');
  const [sortKey, setSortKey] = useState<SortKey>('age');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showAllBlank, setShowAllBlank] = useState(false);
  // Component, Type, Styles, Status, Ex-fac, Idle, open-icon — plus the
  // checkbox for internal users. The PO bands span the lot, so this has to
  // track the header or the bands come up short.
  const colCount = isSupplier ? 7 : 8;
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

  // Orders nobody has added components to. They own no samples, so nothing
  // above can show them — but they are the reason the list looks finished
  // when it is not.
  const notStartedCount = useMemo(
    () => orders.filter((o) => !(o.components || []).length).length,
    [orders],
  );

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

  /**
   * The table is organised by PO rather than carrying PO as a column.
   *
   * The PO is the unit everything else in the app already works in -- the add
   * modal's style picker groups by it, so did the old Not started panel -- and
   * repeating "5254 · STICHD" on every row to say so was the widest pair of
   * columns on the table. As a heading it is stated once.
   *
   * It also collapses the two lists this page used to stack. A PO either has
   * components or it hasn't; "nothing added yet" is the same list further down
   * rather than a separate slab pinned to the bottom of the frame.
   */
  const poSections = useMemo(() => {
    const byPO = new Map<string, { po: string; customer: string; ref: string; groups: WorkGroup[];
                                   styles: number; attention: number; exFac: string | null }>();
    for (const g of groups) {
      // A group spanning POs (possible via cross-PO add, though it does not
      // happen in practice) is listed under each one it touches.
      for (const po of (g.poNumbers.length ? g.poNumbers : ['—'])) {
        const first = g.instances.find((i) => i.order.po_number === po) || g.instances[0];
        const e = byPO.get(po) || {
          po, customer: first.order.customer || '', ref: first.order.china_orderbook_ref || '',
          groups: [], styles: 0, attention: 0, exFac: null,
        };
        e.groups.push(g);
        e.styles += g.instances.filter((i) => i.order.po_number === po).length || g.instances.length;
        e.attention += g.attention;
        if (g.earliestExFac && (!e.exFac || g.earliestExFac < e.exFac)) e.exFac = g.earliestExFac;
        byPO.set(po, e);
      }
    }
    // Worst first: the PO with something stuck is the one to open.
    return Array.from(byPO.values()).sort((a, b) =>
      b.attention - a.attention || (a.exFac || '9999').localeCompare(b.exFac || '9999'));
  }, [groups]);

  /** POs where nothing has been added at all. */
  const blankPOs = useMemo(() => {
    const byPO = new Map<string, { po: string; customer: string; ref: string; styles: Order[] }>();
    for (const o of orders) {
      if ((o.components || []).length) continue;
      if (hideShipped && SHIPPED_STATUSES.has(o.status || '')) continue;
      const key = o.po_number || '—';
      const e = byPO.get(key) || { po: key, customer: o.customer || '', ref: o.china_orderbook_ref || '', styles: [] };
      e.styles.push(o);
      byPO.set(key, e);
    }
    // Biggest first -- the PO with 34 styles is where an hour goes.
    return Array.from(byPO.values()).sort((a, b) => b.styles.length - a.styles.length);
  }, [orders, hideShipped]);


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
    received: activeSampleFor(i.component).received as string | null | undefined,
    status: activeSampleFor(i.component).status,
  }));

  return (
    <AudienceContext.Provider value={{ selectable: !isSupplier, factory: isSupplier }}>
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
        <Segmented<'cards' | 'table'>
          options={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }]}
          value={layout}
          onChange={setLayout}
        />
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

      {layout === 'cards' ? (
        <WorkCardGrid
          loading={loading}
          groups={grouped ? groups : flatRows.map((i) => buildGroups([i])[0])}
          totalInFlight={counts.all}
          notStartedCount={notStartedCount}
          selected={selected}
          onToggleMany={setMany}
          onEditInstance={onEditInstance}
          onOpenStyle={onOpenStyle}
        />
      ) : (
      <div className="flex-1 min-h-0 rounded-t-xl border border-b-0 border-gray-200 bg-white overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-[2] bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              {!isSupplier && (
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = !allOn && selected.size > 0; }}
                    onChange={() => setSelected(allOn ? new Set() : new Set(allIds))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                  />
                </th>
              )}
              <SortableTh label="Component" sortKey="component" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <th className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px]">Type</th>
              <SortableTh label={grouped ? 'Styles' : 'Style'} sortKey="style" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Ex-fac" sortKey="exfac" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Idle" sortKey="age" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && matching.length === 0 ? (
              <tr><td colSpan={colCount} className="py-14 text-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin inline" />
              </td></tr>
            ) : matching.length === 0 ? (
              <tr><td colSpan={colCount} className="py-14 text-center">
                <Package className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">
                  {counts.all === 0
                    ? (notStartedCount > 0
                        ? `No samples in flight — ${notStartedCount} ${notStartedCount === 1 ? 'style has' : 'styles have'} no components yet. See "Not started" below.`
                        : 'Nothing in flight. Every sample is approved, not required or shipped.')
                    : 'No samples match these filters.'}
                </p>
              </td></tr>
            ) : (
              poSections.map((sec) => (
                <Fragment key={sec.po}>
                  <POBand
                    po={sec.po} customer={sec.customer} ref_={sec.ref}
                    styles={sec.styles} attention={sec.attention} exFac={sec.exFac}
                    colSpan={colCount}
                  />
                  {grouped
                    ? sec.groups.map((g) => {
                        const ids = g.instances.map((i) => i.component.id);
                        const on = ids.every((id) => selected.has(id));
                        return (
                          <GroupRows
                            key={`${sec.po}:${g.key}`}
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
                    : sec.groups.flatMap((g) => g.instances)
                        .filter((inst) => inst.order.po_number === sec.po)
                        .map((inst) => (
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
                        ))}
                </Fragment>
              ))
            )}

            {/* The POs with nothing on them, in the same list rather than a
                separate panel below it. They are the biggest number on this
                page and the least urgent -- nothing is waiting on anyone
                until somebody adds a component -- so they sit at the bottom,
                biggest first, each one click from the add modal. */}
            {blankPOs.length > 0 && (
              <>
                <tr>
                  <td colSpan={colCount} className="px-3 pt-5 pb-1.5 bg-white">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Nothing added yet
                      </span>
                      <span className="flex-1 h-px bg-gray-200" />
                      <span className="text-[11px] text-gray-400 tabular-nums">
                        {blankPOs.length} {blankPOs.length === 1 ? 'PO' : 'POs'} ·{' '}
                        {blankPOs.reduce((n, b) => n + b.styles.length, 0)} styles
                      </span>
                    </div>
                  </td>
                </tr>
                {(showAllBlank ? blankPOs : blankPOs.slice(0, 8)).map((b) => (
                  <tr key={`blank:${b.po}`} className="hover:bg-gray-50 transition-colors">
                    <td colSpan={colCount} className="px-3 py-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-bold tabular-nums text-gray-900">{b.po}</span>
                        {b.customer && <span className="text-gray-500">{b.customer}</span>}
                        {b.ref && <span className="text-[11.5px] text-gray-400 truncate">{b.ref}</span>}
                        <span className="ml-auto text-[11.5px] text-gray-400 tabular-nums whitespace-nowrap">
                          {b.styles.length} {b.styles.length === 1 ? 'style' : 'styles'}
                        </span>
                        {onAddForOrders && (
                          <button
                            onClick={() => onAddForOrders(b.styles.map((x) => x.id), b.po)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold
                                       text-primary-700 bg-primary-50 ring-1 ring-primary-200 hover:bg-primary-100
                                       transition-colors flex-shrink-0"
                          >
                            + Add components
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {blankPOs.length > 8 && !showAllBlank && (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-2 text-center">
                      <button
                        onClick={() => setShowAllBlank(true)}
                        className="text-[11.5px] font-semibold text-gray-500 hover:text-gray-900"
                      >
                        Show {blankPOs.length - 8} more {blankPOs.length - 8 === 1 ? 'PO' : 'POs'}
                      </button>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      )}


      {/* Table view folds the empty POs into the list itself, so the separate
          panel would be the same information twice -- and it was the thing
          squeezing the table into the top half of the frame. Cards still use
          it until that view gets the same treatment. */}
      {layout === 'cards' && !isSupplier && onAddForOrders && (
        <NoComponentsPanel
          orders={orders}
          onAddForOrders={onAddForOrders}
          onOpenStyle={onOpenStyle}
        />
      )}

      {!isSupplier && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <BulkBar count={selected.size} noun="sample" onClear={() => setSelected(new Set())}>
            {mixedTypes ? (
              <span className="text-[11px] text-amber-300 px-1">
                Mixed sample types — select one type to bulk edit
              </span>
            ) : (
              <button
                onClick={() => setBulkOpen(true)}
                disabled={isSupplier}
                title={isSupplier ? 'Source Lab marks samples received and approved' : undefined}
                className={bulkActionPrimary}
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
    </AudienceContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────

/** The PO heading the rows hang off. Says the things that used to repeat on
 *  every row -- PO, customer, orderbook reference -- once, plus the two facts
 *  that decide whether you open it: how much needs attention, and when it
 *  ships. */
function POBand({ po, customer, ref_, styles, attention, exFac, colSpan }: {
  po: string; customer: string; ref_: string;
  styles: number; attention: number; exFac: string | null; colSpan: number;
}) {
  return (
    <tr className={cn('border-y', attention > 0 ? 'bg-red-50/60 border-red-100' : 'bg-gray-50 border-gray-200')}>
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-mono font-extrabold tabular-nums text-[14px] text-gray-900">{po}</span>
          {customer && <span className="text-[12.5px] text-gray-600">{customer}</span>}
          {ref_ && <span className="text-[11.5px] text-gray-400 truncate max-w-[220px]">{ref_}</span>}
          {attention > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white whitespace-nowrap">
              {attention} need{attention === 1 ? 's' : ''} attention
            </span>
          )}
          <span className="ml-auto text-[11.5px] text-gray-500 tabular-nums whitespace-nowrap">
            {styles} {styles === 1 ? 'style' : 'styles'}
            {exFac && <> · ex-fac {relativeTimeShort(exFac)}</>}
          </span>
        </div>
      </td>
    </tr>
  );
}

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
  const { selectable, factory } = useAudience();
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
        {selectable && (
          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={checked}
              ref={(el) => { if (el) el.indeterminate = indeterminate; }}
              onChange={onToggleCheck}
              className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
            />
          </td>
        )}
        <td className="px-3 py-2 max-w-[260px]">
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
        <td className="px-3 py-2">
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', sampleTypeChipBg(group.sampleType))}>
            {sampleTypeLabel(group.sampleType)}
          </span>
        </td>
        <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">
          {n} styles
          {/* Only worth saying when it is true, which in practice it never is. */}
          {group.poNumbers.length > 1 && (
            <span className="ml-1.5 text-[10.5px] text-amber-700">· {group.poNumbers.length} POs</span>
          )}
        </td>
        <td className="px-3 py-2">
          {/* Rolled up, worst first — a single rejection has to read from the
              collapsed row, or grouping hides the thing you came here for. */}
          <div className="flex items-center gap-1 flex-wrap">
            {group.statusCounts.slice(0, 3).map(([st, c]) => {
              const pill = statusPillStyle(st, { factory });
              return (
                <span key={st} className={cn('px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
                  {c > 1 && <span className="tabular-nums">{c} </span>}{pill.label}
                </span>
              );
            })}
            {group.statusCounts.length > 3 && (
              <span className="text-[10px] text-gray-400">+{group.statusCounts.length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 tabular-nums whitespace-nowrap text-gray-500">
          {group.earliestExFac ? relativeTimeShort(group.earliestExFac) : '—'}
        </td>
        <td className={cn('px-3 py-2 tabular-nums whitespace-nowrap', group.worstIdle >= 14 ? 'text-amber-700 font-semibold' : 'text-gray-500')}>
          {group.worstIdle}d
        </td>
        <td className="px-2 py-2" />
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
  const { selectable, factory } = useAudience();
  const { order, component } = inst;
  const { status } = activeSampleFor(component);
  const pill = statusPillStyle(status, { factory });
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
      {selectable && (
        <td className={cn('py-2', indent ? 'pl-8 pr-3' : 'px-3')} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
          />
        </td>
      )}
      <td className={cn('py-2 max-w-[260px]', indent ? 'pl-6 pr-3' : 'px-3')}>
        <div className="flex items-center gap-1.5 min-w-0">
          {attention && <span className="w-1 h-4 rounded-full bg-red-500 flex-shrink-0" />}
          {showComponent ? (
            <span className="font-semibold text-gray-900 truncate">{component.name || 'Unnamed'}</span>
          ) : (
            /* Inside a group the name sits on the parent row, so this slot
               carries the style's description instead of repeating it. */
            <span className="text-[12px] text-gray-400 truncate">{order.description || '—'}</span>
          )}
          <AttemptBadge attemptNo={attempt.attemptNo} rejectionCount={attempt.rejectionCount} />
        </div>
      </td>
      <td className="px-3 py-2">
        {showComponent && (
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', sampleTypeChipBg(component.sample_type))}>
            {sampleTypeLabel(component.sample_type)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono tabular-nums text-gray-700 max-w-[190px] truncate">
        {order.style_code || `#${order.id}`}
      </td>
      <td className="px-3 py-2">
        <span className={cn('px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
          {pill.label}
        </span>
      </td>
      <td className={cn('px-3 py-2 tabular-nums whitespace-nowrap', urgent ? 'text-red-600 font-semibold' : 'text-gray-500')}>
        {exFac ? relativeTimeShort(exFac) : '—'}
      </td>
      <td className={cn('px-3 py-2 tabular-nums whitespace-nowrap', age >= 14 ? 'text-amber-700 font-semibold' : 'text-gray-500')}>
        {age}d
      </td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
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

// ─────────────────────────────────────────────────────────────────────────
// Card layout
//
// Same groups the table renders, laid out as cards. A card can give the
// status rollup and the idle clock room to be read at a glance, which is what
// this page is actually for — the table is better when you want to sort a
// column, so both stay.
// ─────────────────────────────────────────────────────────────────────────

function WorkCardGrid({
  loading, groups, totalInFlight, notStartedCount, selected, onToggleMany, onEditInstance, onOpenStyle,
}: {
  loading: boolean;
  groups: WorkGroup[];
  totalInFlight: number;
  /** Styles with no components — they own no samples, so they cannot appear
   *  above, and saying "every sample is approved" while they exist is false. */
  notStartedCount: number;
  selected: Set<number>;
  onToggleMany: (ids: number[], on: boolean) => void;
  onEditInstance: (order: Order, component: OrderComponent) => void;
  onOpenStyle: (orderId: number) => void;
}) {
  if (loading && groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }
  if (groups.length === 0) {
    // With nothing in flight AND work waiting below, this block should state
    // the fact and get out of the way — centring it in a flex-1 container
    // pushed "Not started" off the bottom of the screen, which is exactly
    // backwards on a freshly imported book where everything is not started.
    const compact = totalInFlight === 0 && notStartedCount > 0;
    return (
      <div className={cn('flex flex-col items-center justify-center text-center',
        compact ? 'py-10' : 'flex-1')}>
        <Package className="w-6 h-6 text-gray-300 mb-2" />
        <p className="text-xs text-gray-400">
          {totalInFlight === 0
            ? (notStartedCount > 0
                ? `No samples in flight — ${notStartedCount} ${notStartedCount === 1 ? 'style has' : 'styles have'} no components yet. See "Not started" below.`
                : 'Nothing in flight. Every sample is approved, not required or shipped.')
            : 'No samples match these filters.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-2">
        {groups.map((g) => (
          <WorkCard
            key={g.key}
            group={g}
            selected={selected}
            onToggleMany={onToggleMany}
            onEditInstance={onEditInstance}
            onOpenStyle={onOpenStyle}
          />
        ))}
      </div>
    </div>
  );
}

function WorkCard({
  group, selected, onToggleMany, onEditInstance, onOpenStyle,
}: {
  group: WorkGroup;
  selected: Set<number>;
  onToggleMany: (ids: number[], on: boolean) => void;
  onEditInstance: (order: Order, component: OrderComponent) => void;
  onOpenStyle: (orderId: number) => void;
}) {
  const { selectable, factory } = useAudience();
  const [open, setOpen] = useState(false);
  const ids = group.instances.map((i) => i.component.id);
  const allOn = ids.every((id) => selected.has(id));
  const someOn = !allOn && ids.some((id) => selected.has(id));
  const n = group.instances.length;
  const attention = group.attention > 0;

  return (
    <div
      className={cn(
        'rounded-xl border bg-white flex flex-col overflow-hidden transition-colors',
        allOn || someOn ? 'border-primary-400 ring-2 ring-primary-100'
          : attention ? 'border-red-200' : 'border-gray-200',
      )}
    >
      <div className="px-3 py-2.5 flex items-start gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={allOn}
            ref={(el) => { if (el) el.indeterminate = someOn; }}
            onChange={() => onToggleMany(ids, !allOn)}
            className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', sampleTypeChipBg(group.sampleType))}>
              {sampleTypeLabel(group.sampleType)}
            </span>
            {group.maxAttempt > 1 && (
              <span
                className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold tabular-nums',
                  group.maxAttempt >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}
                title={`On attempt ${group.maxAttempt} — this has been rejected ${group.maxAttempt - 1} time${group.maxAttempt > 2 ? 's' : ''}`}
              >
                v{group.maxAttempt}
              </span>
            )}
            {attention && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-red-500">
                {group.attention} need{group.attention === 1 ? 's' : ''} attention
              </span>
            )}
          </div>
          <div className="text-[14px] font-bold text-gray-900 truncate mt-1">{group.name}</div>
          <div className="text-[11px] text-gray-500 tabular-nums mt-0.5 truncate">
            <b className="text-gray-700">{n}</b> {n === 1 ? 'style' : 'styles'}
            {' · '}
            {group.poNumbers.length === 1 ? `PO ${group.poNumbers[0]}` : `${group.poNumbers.length} POs`}
            {group.customers.length === 1 && <> · {group.customers[0]}</>}
          </div>
        </div>
      </div>

      <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
        {group.statusCounts.slice(0, 3).map(([st, c]) => {
          const pill = statusPillStyle(st, { factory });
          return (
            <span key={st} className={cn('px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
              {c > 1 && <span className="tabular-nums">{c} </span>}{pill.label}
            </span>
          );
        })}
        {group.statusCounts.length > 3 && (
          <span className="text-[10px] text-gray-400">+{group.statusCounts.length - 3}</span>
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3 text-[11px] tabular-nums mt-auto">
        <span className={cn(group.worstIdle >= 14 ? 'text-amber-700 font-semibold' : 'text-gray-500')}>
          idle {group.worstIdle}d
        </span>
        <span className="text-gray-500 truncate">
          ex-fac {group.earliestExFac ? relativeTimeShort(group.earliestExFac) : '—'}
        </span>
        {n > 1 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary-600 hover:text-primary-700"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {open ? 'Hide' : 'Styles'}
          </button>
        )}
        {n === 1 && (
          <button
            onClick={() => onEditInstance(group.instances[0].order, group.instances[0].component)}
            className="ml-auto text-[10px] font-semibold text-primary-600 hover:text-primary-700"
          >
            Open
          </button>
        )}
      </div>

      {open && n > 1 && (
        <div className="border-t border-gray-100 max-h-52 overflow-y-auto">
          {group.instances.map((inst) => {
            const pill = statusPillStyle(activeSampleFor(inst.component).status, { factory });
            const checked = selected.has(inst.component.id);
            return (
              <div
                key={inst.component.id}
                onClick={() => onEditInstance(inst.order, inst.component)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-[11.5px] border-t border-gray-50 cursor-pointer',
                  checked ? 'bg-primary-50/60' : 'hover:bg-gray-50',
                )}
              >
                {selectable && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleMany([inst.component.id], !checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 flex-shrink-0"
                  />
                )}
                <span className="font-mono tabular-nums text-gray-700 truncate flex-shrink-0 max-w-[130px]">
                  {inst.order.style_code || `#${inst.order.id}`}
                </span>
                <span className="text-gray-500 truncate flex-1">{inst.order.description || '—'}</span>
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap flex-shrink-0', pill.bg, pill.text)}>
                  {pill.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenStyle(inst.order.id); }}
                  title="Open the full style"
                  className="p-0.5 rounded text-gray-300 hover:text-primary-600 flex-shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
