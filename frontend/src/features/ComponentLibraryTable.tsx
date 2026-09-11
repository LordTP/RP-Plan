'use client';

/**
 * The library as a table — one row per canonical entry.
 *
 * The library is where a component's IDENTITY lives: its name, colour, spec
 * and positions, and the only place a rename is allowed to happen. That's why
 * it stayed a first-class surface when the page moved to a flat worklist
 * rather than collapsing into a filter on it.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Paperclip, Library } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { componentsApi, type CanonicalComponent } from '@/lib/api';
import { StatusTile, TogglePill, SortableTh, StatusBar } from '@/components/orders/v2-list-primitives';
import { sampleTypeLabel, sampleTypeChipBg, sampleTypeFullLabel } from './component-shared';
import type { ComponentSampleType } from '@/types';

type SortKey = 'name' | 'type' | 'colour' | 'styles' | 'customers' | 'outstanding';
type Tile = 'all' | 'in_use' | 'unused' | 'outstanding' | 'no_spec';
type TypeFilter = 'all' | ComponentSampleType;

const TILES: { key: Tile; label: string; tone: 'primary' | 'danger' }[] = [
  { key: 'all', label: 'Entries', tone: 'primary' },
  { key: 'in_use', label: 'On a style', tone: 'primary' },
  { key: 'unused', label: 'Unused', tone: 'primary' },
  { key: 'outstanding', label: 'With work open', tone: 'danger' },
  { key: 'no_spec', label: 'No spec', tone: 'primary' },
];

interface Props {
  reloadKey: number;
  openCanonicalId: number | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Handed the current row order so the drawer can page through it. */
  onRowsChange: (ids: number[]) => void;
}

export function ComponentLibraryTable({
  reloadKey, openCanonicalId, selectedId, onSelect, onRowsChange,
}: Props) {
  const [all, setAll] = useState<CanonicalComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tile, setTile] = useState<Tile>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        // Search stays server-side — it reaches into PO and style code, which
        // the list payload doesn't carry.
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

  const counts = useMemo(() => ({
    all: all.length,
    in_use: all.filter((c) => c.styles_count > 0).length,
    unused: all.filter((c) => c.styles_count === 0).length,
    outstanding: all.filter((c) => c.outstanding_count > 0).length,
    no_spec: all.filter((c) => !c.has_spec).length,
  }), [all]);

  const rows = useMemo(() => {
    let list = all.filter((c) => {
      if (tile === 'in_use' && c.styles_count === 0) return false;
      if (tile === 'unused' && c.styles_count > 0) return false;
      if (tile === 'outstanding' && c.outstanding_count === 0) return false;
      if (tile === 'no_spec' && c.has_spec) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let r = 0;
      switch (sortKey) {
        case 'name': r = (a.name || '').localeCompare(b.name || ''); break;
        case 'type': r = a.sample_type.localeCompare(b.sample_type); break;
        case 'colour': r = (a.colour || '').localeCompare(b.colour || ''); break;
        case 'styles': r = a.styles_count - b.styles_count; break;
        case 'customers': r = a.customers_count - b.customers_count; break;
        case 'outstanding': r = a.outstanding_count - b.outstanding_count; break;
      }
      if (r !== 0) return r * dir;
      return a.id - b.id;
    });
    return list;
  }, [all, tile, sortKey, sortDir]);

  useEffect(() => { onRowsChange(rows.map((r) => r.id)); }, [rows, onRowsChange]);

  // Post-add redirect lands on ?open=<id>; fall through to nothing rather
  // than auto-opening an arbitrary first row, which made the drawer appear
  // unbidden every time the page loaded.
  useEffect(() => {
    if (openCanonicalId && all.some((c) => c.id === openCanonicalId)) onSelect(openCanonicalId);
  }, [openCanonicalId, all, onSelect]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'styles' || k === 'customers' || k === 'outstanding' ? 'desc' : 'asc'); }
  }

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

      <div className="flex-1 min-h-0 rounded-t-xl border border-b-0 border-gray-200 bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-[1] bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              <SortableTh label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Type" sortKey="type" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <SortableTh label="Colour" sortKey="colour" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} />
              <th className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px]">Positions</th>
              <SortableTh label="Styles" sortKey="styles" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} align="right" />
              <SortableTh label="Customers" sortKey="customers" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} align="right" />
              <SortableTh label="Open" sortKey="outstanding" currentSort={sortKey} currentDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} align="right" />
              <th className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px] text-center">Spec</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={8} className="py-14 text-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin inline" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="py-14 text-center">
                <Library className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No components match.</p>
              </td></tr>
            ) : rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  'cursor-pointer transition-colors',
                  c.id === selectedId ? 'bg-primary-50/70' : 'hover:bg-gray-50',
                )}
              >
                <td className="px-3 py-1.5 max-w-[260px]">
                  <span className="font-semibold text-gray-900 truncate block">{c.name}</span>
                  {c.description && (
                    <span className="text-[10px] text-gray-400 truncate block">{c.description}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', sampleTypeChipBg(c.sample_type))}>
                    {sampleTypeLabel(c.sample_type)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-600 max-w-[140px] truncate">{c.colour || '—'}</td>
                <td className="px-3 py-1.5">
                  {c.position && c.position.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {c.position.slice(0, 3).map((p) => (
                        <span key={p} className="text-[9px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1 py-0.5">
                          {p}
                        </span>
                      ))}
                      {c.position.length > 3 && (
                        <span className="text-[9px] text-gray-400">+{c.position.length - 3}</span>
                      )}
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{c.styles_count}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{c.customers_count}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {c.outstanding_count > 0
                    ? <span className="text-amber-700 font-semibold">{c.outstanding_count}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {c.has_spec
                    ? <Paperclip className="w-3 h-3 text-gray-500 inline" />
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="-mt-3">
        <StatusBar
          segments={[
            `${rows.length} of ${counts.all} entries`,
            counts.unused > 0 ? `${counts.unused} unused` : null,
          ]}
          hint="Click a row to edit its identity"
        />
      </div>
    </div>
  );
}
