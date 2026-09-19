'use client';

/**
 * The library: a rail of cards, one per NAME, and a detail panel showing every
 * entry under that name.
 *
 * Grouped by name because one name is not one component. Every "Add component"
 * mints a fresh canonical, so a name is a label many separate identities share
 * — before the prod wipe there were 19 canonicals called "Rib Fabric". A flat
 * list of those is unreadable, which is what the table it replaces produced.
 *
 * The only alarm here is OUT OF STEP: one entry whose own linked styles hold
 * different statuses. Entries sharing a name differ from each other all the
 * time — different POs, different seasons, approved months apart — and
 * flagging that would be noise. One entry is one add and one decision, so its
 * styles should move together; when one lags, someone missed it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Library, AlertTriangle, Check, Paperclip, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { FactoryComponentModal } from '@/components/orders/FactoryComponentModal';
import { ComponentEditModal } from '@/components/orders/ComponentEditModal';
import { cn } from '@/lib/utils';
import { componentsApi, ordersApi, type CanonicalComponent, type ComponentFamily, type FamilyEntry, type FamilyInstance } from '@/lib/api';
import { StatusTile, TogglePill, StatusBar } from '@/components/orders/v2-list-primitives';
import { sampleTypeLabel, sampleTypeChipBg, sampleTypeFullLabel, statusPillStyle } from './component-shared';
import type { ComponentSampleType, Order, OrderComponent } from '@/types';

type TypeFilter = 'all' | ComponentSampleType;
type Tile = 'all' | 'out_of_step' | 'in_use' | 'unused' | 'no_spec';

const TILES: { key: Tile; label: string; tone: 'primary' | 'danger' }[] = [
  { key: 'all', label: 'Names', tone: 'primary' },
  { key: 'out_of_step', label: 'Styles out of step', tone: 'danger' },
  { key: 'in_use', label: 'On a style', tone: 'primary' },
  { key: 'unused', label: 'Unused', tone: 'primary' },
  { key: 'no_spec', label: 'No spec', tone: 'primary' },
];

/** A name, plus every canonical that shares it. */
type NameGroup = {
  key: string;
  name: string;
  sampleType: ComponentSampleType;
  entries: CanonicalComponent[];
  stylesCount: number;
  customersCount: number;
  outOfStep: number;
  hasSpec: boolean;
  poNumbers: string[];
};

function buildGroups(all: CanonicalComponent[]): NameGroup[] {
  const map = new Map<string, NameGroup>();
  for (const c of all) {
    // Type is part of the key: a "POCKET" strike-off and a "POCKET" label are
    // different components that happen to share a word.
    const key = `${(c.name || '').trim().toUpperCase()}|${c.sample_type}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key, name: c.name, sampleType: c.sample_type, entries: [],
        stylesCount: 0, customersCount: 0, outOfStep: 0, hasSpec: false, poNumbers: [],
      };
      map.set(key, g);
    }
    g.entries.push(c);
    g.stylesCount += c.styles_count;
    for (const po of c.po_numbers || []) if (!g.poNumbers.includes(po)) g.poNumbers.push(po);
    g.customersCount = Math.max(g.customersCount, c.customers_count);
    if (c.out_of_step) g.outOfStep++;
    if (c.has_spec) g.hasSpec = true;
  }
  return Array.from(map.values()).sort((a, b) => {
    // Anything needing attention first, then the biggest, then by name.
    if ((b.outOfStep > 0 ? 1 : 0) !== (a.outOfStep > 0 ? 1 : 0)) {
      return (b.outOfStep > 0 ? 1 : 0) - (a.outOfStep > 0 ? 1 : 0);
    }
    if (b.stylesCount !== a.stylesCount) return b.stylesCount - a.stylesCount;
    return a.name.localeCompare(b.name);
  });
}

interface Props {
  reloadKey: number;
  openCanonicalId: number | null;
  onOpenEntry: (canonicalId: number) => void;
}

const fmtShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

/** How many styles a card shows before collapsing behind a count. Lower than
 *  it was as a full-width row: a card is a third of the width, and a long list
 *  inside one is exactly what makes a grid of them ragged. */
const ROWS_PER_PO = 4;

/** Unfinished first. The point of expanding is to find what still needs
 *  chasing, so approved rows sinking to the bottom is the whole idea. */
const CHASE_RANK: Record<string, number> = {
  REJECTED: 0, LATE: 1, 'P23 ADVISE UPDATE': 2, OUTSTANDING: 3, '': 3, RECEIVED: 4,
  APPROVED: 9, 'NOT REQUIRED': 9,
};
function sortForChasing<T extends { status: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ra = CHASE_RANK[(a.status || '').trim().toUpperCase()] ?? 5;
    const rb = CHASE_RANK[(b.status || '').trim().toUpperCase()] ?? 5;
    return ra - rb;
  });
}

export function ComponentLibraryCards({ reloadKey, openCanonicalId, onOpenEntry }: Props) {
  const [all, setAll] = useState<CanonicalComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tile, setTile] = useState<Tile>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Clicking a style opens the same modal that style would open from the
  // worklist -- read-only for a factory, the editor for Source Lab. The library
  // list only carries ids, so the order and its components are fetched on the
  // click rather than held for all 61 entries up front.
  const { user } = useStore();
  const isSupplier = user?.role === 'supplier';
  const [instance, setInstance] = useState<{ order: Order; component: OrderComponent } | null>(null);
  const [opening, setOpening] = useState(false);

  const openInstance = async (orderId: number, instanceId: number) => {
    setOpening(true);
    try {
      const [order, comps] = await Promise.all([
        ordersApi.getOrder(orderId),
        componentsApi.getComponents(orderId),
      ]);
      const component = (comps || []).find((c: OrderComponent) => c.id === instanceId);
      if (!order || !component) { toast.error('Could not open that style.'); return; }
      setInstance({ order, component });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not open that style.');
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const data = await componentsApi.listLibrary({
          q: q.trim() || undefined,
          sample_type: typeFilter === 'all' ? undefined : typeFilter,
          include_blank: true,
        });
        if (!cancel) setAll(data.components);
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load components');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [q, typeFilter, reloadKey]);

  const groups = useMemo(() => buildGroups(all), [all]);

  const counts = useMemo(() => ({
    all: groups.length,
    out_of_step: groups.filter((g) => g.outOfStep > 0).length,
    in_use: groups.filter((g) => g.stylesCount > 0).length,
    unused: groups.filter((g) => g.stylesCount === 0).length,
    no_spec: groups.filter((g) => !g.hasSpec).length,
  }), [groups]);

  const rows = useMemo(() => groups.filter((g) => {
    if (tile === 'out_of_step' && g.outOfStep === 0) return false;
    if (tile === 'in_use' && g.stylesCount === 0) return false;
    if (tile === 'unused' && g.stylesCount > 0) return false;
    if (tile === 'no_spec' && g.hasSpec) return false;
    return true;
  }), [groups, tile]);

  // Landing on ?open=<id> after an add: select whichever name holds it.
  useEffect(() => {
    if (openCanonicalId == null) return;
    const owner = groups.find((g) => g.entries.some((e) => e.id === openCanonicalId));
    if (owner) setSelectedKey(owner.key);
  }, [openCanonicalId, groups]);

  const selected = rows.find((g) => g.key === selectedKey) || rows[0] || null;
  const totalOutOfStep = groups.reduce((n, g) => n + g.outOfStep, 0);

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* The five tiles are gone. Two of them could never move -- out_of_step
          and unused were 0 across the whole library -- and the other three
          restated what the rail already says. One search does the work. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search anything — name, colour, spec, PO, order ref, customer, factory, style, season or product…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[276px_1fr] gap-3">
        <div className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white">
          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10">
              <Library className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No components match.</p>
            </div>
          ) : rows.map((g) => (
            <NameCard
              key={g.key}
              group={g}
              active={selected?.key === g.key}
              onClick={() => setSelectedKey(g.key)}
            />
          ))}
        </div>

        <div className="min-h-0 overflow-hidden">
          {selected
            ? <FamilyPanel key={selected.key} group={selected} search={q} onOpenEntry={onOpenEntry}
                           onOpenInstance={openInstance} />
            : (
              <div className="h-full rounded-xl border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-400">
                Pick a component to see its entries.
              </div>
            )}
        </div>
      </div>

      {instance && (isSupplier ? (
        <FactoryComponentModal
          open
          order={instance.order}
          component={instance.component}
          onClose={() => setInstance(null)}
        />
      ) : (
        <ComponentEditModal
          open
          order={instance.order}
          component={instance.component}
          onClose={() => setInstance(null)}
          onUpdated={() => setInstance(null)}
        />
      ))}

      <div className="-mt-1">
        <StatusBar
          segments={[
            `${rows.length} of ${counts.all} names · ${all.length} entries`,
            totalOutOfStep > 0 ? `${totalOutOfStep} entries have styles out of step` : 'every entry in step',
          ]}
          hint="One card per name · an entry is one add"
        />
      </div>
    </div>
  );
}

function NameCard({ group, active, onClick }: { group: NameGroup; active: boolean; onClick: () => void }) {
  const alert = group.outOfStep > 0;
  return (
    /* A row, not a card. Sixty-one bordered boxes stacked down a 276px column
       read as sixty-one separate things; the rail is one list and should look
       like one. The selected row is marked by the rail itself rather than by
       giving that row its own border. */
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 border-l-[3px] border-b border-gray-100 transition-colors shrink-0',
        active ? 'bg-primary-50 border-l-primary-500' : 'border-l-transparent hover:bg-gray-50',
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0',
          sampleTypeChipBg(group.sampleType))}>
          {sampleTypeLabel(group.sampleType)}
        </span>
        <span className="text-[13px] font-bold text-gray-900 truncate">{group.name}</span>
        {/* Only when something is wrong. "In step" was on every row in the
            library, which makes it decoration rather than information. */}
        {alert && (
          <span className="ml-auto inline-flex items-center gap-1 text-[9.5px] font-bold text-white
                           bg-amber-600 rounded-full px-1.5 py-0.5 flex-shrink-0">
            <AlertTriangle className="w-2.5 h-2.5" />{group.outOfStep}
          </span>
        )}
      </div>
      <div className="text-[11px] text-gray-500 tabular-nums mt-0.5 truncate">
        {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
        {' · '}{group.stylesCount} {group.stylesCount === 1 ? 'style' : 'styles'}
        {/* The PO is what people scan a component list for. */}
        {group.poNumbers.length === 1
          ? <> · PO <b className="text-gray-700 font-semibold">{group.poNumbers[0]}</b></>
          : group.poNumbers.length > 1
            ? <> · <b className="text-gray-700 font-semibold">{group.poNumbers.length} POs</b></>
            : null}
      </div>
    </button>
  );
}

function FamilyPanel({ group, search, onOpenEntry, onOpenInstance }: {
  group: NameGroup; search: string; onOpenEntry: (id: number) => void;
  onOpenInstance: (orderId: number, instanceId: number) => void;
}) {
  const [family, setFamily] = useState<ComponentFamily | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const d = await componentsApi.getLibraryFamily(group.name, group.sampleType, search);
        if (!cancel) setFamily(d);
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load entries');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [group.name, group.sampleType, search]);

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2.5 flex-wrap flex-shrink-0">
        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', sampleTypeChipBg(group.sampleType))}>
          {sampleTypeLabel(group.sampleType)}
        </span>
        <h3 className="text-[16px] font-bold text-gray-900 truncate">{group.name}</h3>
        <span className="text-[11px] text-gray-500 tabular-nums">
          {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'} · {group.stylesCount} styles
        </span>
        {(family?.out_of_step_count ?? 0) > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-white bg-amber-600 rounded-full px-2 py-0.5">
            <AlertTriangle className="w-2.5 h-2.5" />
            {family!.out_of_step_count} out of step
          </span>
        )}
      </div>

      {/* Cards, not stacked rows. 53 of the 61 entries in the library carry a
          single style, so an entry is almost always one small self-contained
          thing -- and the job here is comparing the variants of a name against
          each other, which side-by-side does and a vertical stack does not.
          Entries with several styles keep their list inside the card. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 grid gap-2.5 content-start
                      grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : !family || family.entries.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">No entries.</div>
        ) : family.entries.map((e, i) => (
          <EntryBlock key={e.id} entry={e} index={i + 1} onOpen={() => onOpenEntry(e.id)}
                      onOpenInstance={onOpenInstance} />
        ))}
      </div>
    </div>
  );
}

function EntryBlock({ entry, index, onOpen, onOpenInstance }: {
  entry: FamilyEntry; index: number; onOpen: () => void;
  onOpenInstance: (orderId: number, instanceId: number) => void;
}) {
  const { user } = useStore();
  const isSupplier = user?.role === 'supplier';

  /** Where this entry's styles actually are, and when they last moved.
   *
   *  The row used to collapse this to "all <status>" behind a green tick,
   *  which read as success whatever the status was — "all outstanding" got the
   *  same approving check as "all approved", when it means the exact opposite:
   *  nothing has come back. It also carried no dates at all, so a sample
   *  waiting three weeks looked identical to one requested this morning.
   */
  // One toggle for the whole entry now, rather than one per PO -- there is no
  // longer a PO band to hang it off.
  const [expandedAll, setExpandedAll] = useState(false);

  /** Styles under one entry usually move as one: a single submission covering
   *  all of them, so the same received and approved dates repeat down every
   *  row. When that holds, say it once above the list instead. When it stops
   *  holding -- which is what out_of_step flags -- the per-row dates come back. */
  const lockstep = useMemo(() => {
    if (entry.instances.length < 2) return null;
    const recs = new Set(entry.instances.map((i) => i.received || ''));
    const apps = new Set(entry.instances.map((i) => i.approved || ''));
    if (recs.size > 1 || apps.size > 1) return null;
    const received = entry.instances[0].received;
    const approved = entry.instances[0].approved;
    return (received || approved) ? { received, approved } : null;
  }, [entry.instances]);

  const roll = useMemo(() => {
    let approved = 0, received = 0, outstanding = 0, other = 0;
    let lastApproved: string | null = null;
    let oldestOpen: string | null = null;
    for (const i of entry.instances) {
      const st = (i.status || '').trim().toUpperCase();
      if (st === 'APPROVED') {
        approved++;
        if (i.approved && (!lastApproved || i.approved > lastApproved)) lastApproved = i.approved;
      } else if (st === 'RECEIVED') {
        received++;
        if (i.received && (!oldestOpen || i.received < oldestOpen)) oldestOpen = i.received;
      } else if (st === 'OUTSTANDING' || !st) {
        outstanding++;
      } else {
        other++;
      }
    }
    const total = entry.instances.length || 1;
    return {
      approved, received, outstanding, other, total, lastApproved, oldestOpen,
      pct: (n: number) => `${Math.round((n / total) * 100)}%`,
      done: approved === total,
      noneBack: outstanding === total,
    };
  }, [entry.instances]);

  const cardAction = () => {
    // Source Lab get the identity drawer -- renaming and specs live there.
    if (!isSupplier) { onOpen(); return; }
    // A factory gets the component modal, every time. It used to drop the
    // style list open instead when there was more than one, which made the
    // card behave differently depending on data the reader cannot see.
    // The modal lists the styles itself, so one click is always enough.
    const target = sortForChasing(entry.instances)[0] || entry.instances[0];
    if (target) onOpenInstance(target.order_id, target.instance_id);
  };

  return (
    /* Same card as the worklist's card view: type chip and badges, the name big,
       one line of context under it, status pills, then a footer strip. The old
       block was its own language -- a #index, a colour chip, PO chips and a
       right-aligned roll-up -- which meant learning two layouts for one idea. */
    <div
      onClick={cardAction}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cardAction(); } }}
      className={cn('rounded-xl border bg-white flex flex-col overflow-hidden self-start text-left',
        'cursor-pointer transition-colors hover:border-primary-300 hover:shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary-400',
        entry.out_of_step ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200')}>

      {/* Opens the identity drawer -- renaming and specs are Source Lab's job,
          so for a supplier this is not a control at all. Their way in is a
          style row below, which gives them the worklist modal. */}
      {/* One card, one click target. The header used to be a button and every
          style row another, so a single card carried up to five separate things
          to hit -- it read as a list wearing a card's clothes. */}
      <div className="px-3 py-2.5 flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
              sampleTypeChipBg(entry.sample_type))}>
              {sampleTypeLabel(entry.sample_type)}
            </span>
            {entry.spec_url && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-gray-100 text-gray-600">
                {entry.spec_url}
              </span>
            )}
            {entry.out_of_step && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-amber-600 inline-flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> out of step
              </span>
            )}
          </div>

          {/* The colour is the title here: the name is already the rail item you
              clicked, so what distinguishes one entry from the next is colour. */}
          <div className="text-[14px] font-bold text-gray-900 truncate mt-1">
            {entry.colour || <span className="font-semibold text-gray-400">No colour</span>}
          </div>
          <div className="text-[11px] text-gray-500 tabular-nums mt-0.5 truncate">
            <b className="text-gray-700">{entry.styles_count}</b> {entry.styles_count === 1 ? 'style' : 'styles'}
          </div>
        </div>

        {/* Order identity, stacked top-right: PO first and big enough to read
            across a desk, then who it is for, then the orderbook ref — which
            is what the team actually calls an order out loud. */}
        <div className="flex-shrink-0 text-right max-w-[44%] min-w-0">
          {entry.po_numbers.length === 1 ? (
            <div className="font-mono text-[15px] font-bold text-gray-900 leading-tight tabular-nums">
              {entry.po_numbers[0]}
            </div>
          ) : entry.po_numbers.length > 1 ? (
            <div
              className="font-mono text-[15px] font-bold text-gray-900 leading-tight tabular-nums truncate"
              title={entry.po_numbers.join(', ')}
            >
              {entry.po_numbers.length} POs
            </div>
          ) : (
            <div className="text-[13px] font-semibold text-gray-300 leading-tight">No PO</div>
          )}
          {entry.instances[0]?.customer && (
            <div className="text-[11.5px] font-semibold text-gray-600 truncate mt-0.5">
              {entry.instances[0].customer}
            </div>
          )}
          {entry.instances[0]?.china_orderbook_ref && (
            <div className="text-[11px] text-gray-400 truncate" title={entry.instances[0].china_orderbook_ref}>
              {entry.instances[0].china_orderbook_ref}
            </div>
          )}
        </div>
      </div>

      {/* Status as pills, counted — the same shape the worklist card uses. */}
      <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
        {([['APPROVED', roll.approved], ['RECEIVED', roll.received], ['OUTSTANDING', roll.outstanding]] as const)
          .filter(([, c]) => c > 0)
          .map(([st, c]) => {
            const pill = statusPillStyle(st, { factory: isSupplier });
            return (
              <span key={st} className={cn('px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
                {c > 1 && <span className="tabular-nums">{c} </span>}{pill.label}
              </span>
            );
          })}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3 text-[11px] tabular-nums mt-auto">
        {roll.done && roll.lastApproved ? (
          <span className="text-emerald-700 font-semibold">signed off {fmtShort(roll.lastApproved)}</span>
        ) : roll.oldestOpen ? (
          <span className="text-gray-500">in since {fmtShort(roll.oldestOpen)}</span>
        ) : (
          <span className="text-gray-400">nothing back yet</span>
        )}
        {!roll.done && (
          <span className="ml-auto text-gray-500">{roll.approved} of {roll.total} approved</span>
        )}
      </div>


      {/* Every style on one flat list. It used to wrap each PO in a band of
          its own, which for a single-PO entry -- which is all 61 of them today
          -- meant a band, a customer line and a count wrapped around rows that
          already sat under a header naming that PO. Three levels for one.
          The PO only earns a column when the entry actually spans more than
          one, and then it is on every row rather than a heading. */}
      {/* No style list on the card any more. It was up to five more things to
          click inside something that is itself one click target, and the modal
          shows the same list with the detail attached. */}
    </div>
  );
}
