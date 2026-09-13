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
import { Loader2, Search, Library, AlertTriangle, Check, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { componentsApi, type CanonicalComponent, type ComponentFamily, type FamilyEntry, type FamilyInstance } from '@/lib/api';
import { StatusTile, TogglePill, StatusBar } from '@/components/orders/v2-list-primitives';
import { sampleTypeLabel, sampleTypeChipBg, sampleTypeFullLabel, statusPillStyle } from './component-shared';
import type { ComponentSampleType } from '@/types';

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
        stylesCount: 0, customersCount: 0, outOfStep: 0, hasSpec: false,
      };
      map.set(key, g);
    }
    g.entries.push(c);
    g.stylesCount += c.styles_count;
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

export function ComponentLibraryCards({ reloadKey, openCanonicalId, onOpenEntry }: Props) {
  const [all, setAll] = useState<CanonicalComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tile, setTile] = useState<Tile>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
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
            placeholder="Search name, colour, PO, style code…"
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
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[276px_1fr] gap-3">
        <div className="min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
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
            ? <FamilyPanel key={selected.key} group={selected} onOpenEntry={onOpenEntry} />
            : (
              <div className="h-full rounded-xl border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-400">
                Pick a component to see its entries.
              </div>
            )}
        </div>
      </div>

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
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-2.5 flex flex-col gap-1.5 transition-colors',
        active ? 'border-primary-400 bg-primary-50 shadow-[inset_3px_0_0_var(--tw-shadow-color)] shadow-primary-500'
          : alert ? 'border-amber-200 bg-white hover:bg-gray-50'
          : 'border-gray-200 bg-white hover:bg-gray-50',
      )}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', sampleTypeChipBg(group.sampleType))}>
          {sampleTypeLabel(group.sampleType)}
        </span>
        {alert ? (
          <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-white bg-amber-600 rounded-full px-2 py-0.5">
            <AlertTriangle className="w-2.5 h-2.5" />
            {group.outOfStep} out of step
          </span>
        ) : group.stylesCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
            <Check className="w-3 h-3" strokeWidth={3} /> in step
          </span>
        )}
        {group.hasSpec && <Paperclip className="w-3 h-3 text-gray-400 ml-auto" />}
      </div>
      <div className="text-[13.5px] font-bold text-gray-900 truncate">{group.name}</div>
      <div className="text-[11px] text-gray-500 tabular-nums">
        <b className="text-gray-700 font-semibold">{group.entries.length}</b> {group.entries.length === 1 ? 'entry' : 'entries'}
        {' · '}<b className="text-gray-700 font-semibold">{group.stylesCount}</b> {group.stylesCount === 1 ? 'style' : 'styles'}
      </div>
    </button>
  );
}

function FamilyPanel({ group, onOpenEntry }: { group: NameGroup; onOpenEntry: (id: number) => void }) {
  const [family, setFamily] = useState<ComponentFamily | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const d = await componentsApi.getLibraryFamily(group.name, group.sampleType);
        if (!cancel) setFamily(d);
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load entries');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [group.name, group.sampleType]);

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

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : !family || family.entries.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">No entries.</div>
        ) : family.entries.map((e, i) => (
          <EntryBlock key={e.id} entry={e} index={i + 1} onOpen={() => onOpenEntry(e.id)} />
        ))}
      </div>
    </div>
  );
}

function EntryBlock({ entry, index, onOpen }: { entry: FamilyEntry; index: number; onOpen: () => void }) {
  // Group this entry's styles by PO — one entry can span several.
  const byPo = useMemo(() => {
    const m = new Map<string, FamilyInstance[]>();
    for (const i of entry.instances) {
      const po = i.po_number || '—';
      if (!m.has(po)) m.set(po, []);
      m.get(po)!.push(i);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [entry.instances]);

  const uniform = useMemo(() => {
    const s = new Set(entry.instances.map((i) => (i.status || '').trim().toUpperCase()));
    return s.size === 1 ? Array.from(s)[0] : null;
  }, [entry.instances]);

  return (
    <div className={cn('rounded-lg border overflow-hidden', entry.out_of_step ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200')}>
      <div className={cn('px-3 py-2 flex items-center gap-2 flex-wrap', entry.out_of_step ? 'bg-amber-50' : 'bg-gray-50')}>
        <span className="font-mono text-[10.5px] font-bold text-gray-400">#{index}</span>
        {entry.colour && (
          <span className="text-[10.5px] font-semibold text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-0.5">
            {entry.colour}
          </span>
        )}
        <span className="text-[11px] text-gray-500 tabular-nums">
          <b className="text-gray-700">{entry.styles_count}</b> {entry.styles_count === 1 ? 'style' : 'styles'}
          {entry.po_numbers.length > 0 && <> · <b className="text-gray-700">{entry.po_numbers.length}</b> {entry.po_numbers.length === 1 ? 'PO' : 'POs'}</>}
        </span>
        {entry.out_of_step ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[9.5px] font-bold text-white bg-amber-600 rounded-full px-2 py-0.5">
            <AlertTriangle className="w-2.5 h-2.5" /> styles out of step
          </span>
        ) : uniform !== null && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
            <Check className="w-3 h-3" strokeWidth={3} />
            {uniform ? `all ${uniform.toLowerCase()}` : 'not started'}
          </span>
        )}
        <button
          onClick={onOpen}
          className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 whitespace-nowrap"
        >
          Open
        </button>
      </div>

      {/* Only an entry that disagrees with itself is worth expanding — the
          rest are a single reassuring line. */}
      {entry.out_of_step && byPo.map(([po, list]) => {
        const statuses = new Set(list.map((i) => (i.status || '').trim().toUpperCase()));
        const poMixed = statuses.size > 1;
        return (
          <div key={po} className="border-t border-gray-100">
            <div className={cn('px-3 py-1.5 flex items-center gap-2 text-[11px]', poMixed ? 'bg-amber-50/60' : 'bg-white')}>
              <span className="font-mono font-bold text-gray-700">PO {po}</span>
              <span className="text-gray-500 truncate">{list[0]?.customer || ''} · {list.length} {list.length === 1 ? 'style' : 'styles'}</span>
            </div>
            {list.map((i) => {
              const pill = statusPillStyle(i.status);
              return (
                <div key={i.instance_id} className="grid grid-cols-[150px_1fr_auto] gap-2 items-center px-3 py-1 pl-7 text-[11.5px] border-t border-gray-50">
                  <span className="font-mono tabular-nums text-gray-700 truncate">{i.style_code || `#${i.order_id}`}</span>
                  <span className="text-gray-500 truncate">{i.description || '—'}</span>
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap', pill.bg, pill.text)}>
                    {pill.label}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
