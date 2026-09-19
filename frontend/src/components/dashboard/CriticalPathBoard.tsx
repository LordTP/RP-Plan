'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashboardBoardApi, type BoardResponse, type BoardGate, type BoardGateState, type BoardStyle } from '@/lib/api';

/**
 * Critical-path board — one row per live style, one column per gate.
 *
 * Built to be read as a pattern rather than a list: a vertical run of amber
 * down a column says the whole book is jammed on that gate, which is a thing
 * you previously only learned by opening eleven POs. The column totals in the
 * header say it in numbers, and the strip underneath names it in words.
 *
 * Days shown are business days waiting, from the same thresholds the warnings
 * centre uses (Settings → Warning thresholds), so the two agree by
 * construction — see smoke_dashboard_board.py.
 */

const CELL: Record<BoardGateState, string> = {
  done:   'bg-teal-50 text-teal-700',
  flight: 'bg-blue-50 text-blue-700',
  late:   'bg-amber-50 text-amber-700',
  crit:   'bg-rose-50 text-rose-700',
  idle:   'text-gray-300',
  na:     'text-gray-300',
};

function Cell({ gate, onClick }: { gate: BoardGate; onClick?: () => void }) {
  const label =
    gate.state === 'done' ? '✓'
    : gate.state === 'na' ? '–'
    : gate.days != null ? String(gate.days)
    : '·';
  const title =
    gate.state === 'done' ? 'Approved'
    : gate.state === 'na' ? 'Not required'
    : gate.state === 'flight' ? `With us — ${gate.days ?? 0} business days`
    : gate.state === 'idle' ? 'Not started'
    : `${gate.days} business days waiting`;

  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'inline-grid place-items-center w-[27px] h-[27px] rounded-full font-mono',
        'text-[10px] font-semibold leading-none transition-transform',
        onClick && 'hover:scale-110 cursor-pointer',
        CELL[gate.state],
      )}
    >
      {label}
    </button>
  );
}


/** A PO's worth of one gate, in one cell.
 *
 *  Uniform is the normal case -- tech packs, specs and fit never differ inside
 *  a PO -- so the cell looks exactly like the per-style one. When the styles
 *  disagree it leads with the worst wait and says how many are behind, because
 *  "3 of 14 are late at 71 days" is the thing you act on; which three is what
 *  expanding is for.
 */
function RollupCell({ styles, gateKey, onClick }: {
  styles: BoardStyle[]; gateKey: string; onClick: () => void;
}) {
  const gates = styles.map(s => s.gates[gateKey]).filter(Boolean);
  if (!gates.length) return <span className="text-gray-300">·</span>;

  const states = new Set(gates.map(g => g.state));
  if (states.size === 1) {
    const days = gates.map(g => g.days).filter((d): d is number => d != null);
    return (
      <Cell
        gate={{ ...gates[0], days: days.length ? Math.max(...days) : gates[0].days }}
        onClick={onClick}
      />
    );
  }

  const behind = gates.filter(g => g.state === 'late' || g.state === 'crit');
  const worst = Math.max(...behind.map(g => g.days ?? 0), 0);
  return (
    <button
      onClick={onClick}
      title={`${behind.length} of ${gates.length} behind · worst ${worst} business days`}
      className="inline-flex items-center gap-0.5 px-1.5 h-[27px] rounded-full font-mono
                 text-[10px] font-semibold bg-rose-50 text-rose-700 hover:scale-105 transition-transform"
    >
      {worst}d<span className="text-rose-400">×{behind.length}</span>
    </button>
  );
}

function ExFactory({ s }: { s: BoardStyle }) {
  return (
    <span className="font-mono text-[11.5px] font-medium text-gray-900 whitespace-nowrap">
      {s.ex_factory
        ? new Date(s.ex_factory).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
        : '—'}
      <span className="block text-[9.5px] font-medium text-gray-400 mt-0.5">
        {s.days_to_ex_factory != null
          ? s.days_to_ex_factory >= 0 ? `${s.days_to_ex_factory} days` : `${Math.abs(s.days_to_ex_factory)} days ago`
          : 'no date'}
      </span>
    </span>
  );
}

interface Props {
  onStyleClick: (po: string, style?: string) => void;
}

export function CriticalPathBoard({ onStyleClick }: Props) {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    dashboardBoardApi.get(200)
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);


  // One row per PO, not per style. Three of the six gates -- tech packs, specs
  // and fit -- are identical across every style in every PO, so 110 rows were
  // saying what 16 say. The three that do vary are the component-driven ones,
  // and those cells report the split instead of a single value.
  const pos = useMemo(() => {
    const m = new Map<string, BoardStyle[]>();
    for (const s of data?.styles || []) {
      const po = s.po_number || '—';
      if (!m.has(po)) m.set(po, []);
      m.get(po)!.push(s);
    }
    return Array.from(m.entries())
      .map(([po, styles]) => ({
        po, styles,
        first: styles[0],
        runway: styles[0].days_to_ex_factory,
      }))
      // Soonest to ship first: the PO to act on is the one with least room,
      // not the one that has been waiting longest.
      .sort((a, b) => (a.runway ?? 9e9) - (b.runway ?? 9e9));
  }, [data?.styles]);

  const [openPOs, setOpenPOs] = useState<Set<string>>(new Set());
  const togglePO = (po: string) => setOpenPOs(prev => {
    const next = new Set(prev);
    next.has(po) ? next.delete(po) : next.add(po);
    return next;
  });

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center py-14">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }
  if (!data || data.styles.length === 0) return null;

  const stuckCount = Object.values(data.totals).reduce((n, t) => n + t.late, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-gray-100">
        <h3 className="text-[12.5px] font-bold text-gray-900">Where everything is stuck</h3>
        {stuckCount > 0 && (
          <span className="font-mono text-[10.5px] font-semibold text-white bg-amber-700 rounded-full px-2 py-0.5">
            {stuckCount}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[11px] text-gray-400">Business days waiting · sorted by risk</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[880px]">
          <thead>
            <tr>
              <th className="text-left pl-3.5 pb-2 pt-2.5 w-[268px] border-b border-gray-200
                             font-mono text-[9.5px] font-medium uppercase tracking-[0.06em]
                             text-gray-400 align-bottom">
                Style
              </th>
              {data.gates.map(g => {
                const t = data.totals[g.key];
                return (
                  <th key={g.key} className="pb-2 pt-2.5 px-1 border-b border-gray-200 align-bottom
                                             font-mono text-[9.5px] font-medium uppercase
                                             tracking-[0.06em] text-gray-400 whitespace-nowrap">
                    {g.label}
                    {/* Label the number. Showing a bare count coloured by
                        meaning made "4 done" and "4 late" look identical. */}
                    <span className={cn(
                      'block mt-0.5 text-[12.5px] font-bold font-sans normal-case tracking-normal',
                      t.late > 0 ? 'text-amber-700' : 'text-gray-400 font-semibold',
                    )}>
                      {t.late > 0 ? t.late : t.done}
                      <span className="ml-1 text-[9px] font-medium uppercase tracking-[0.06em]">
                        {t.late > 0 ? 'late' : 'done'}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th className="text-right pr-3.5 pb-2 pt-2.5 w-[118px] border-b border-gray-200
                             font-mono text-[9.5px] font-medium uppercase tracking-[0.06em]
                             text-gray-400 align-bottom">
                Ex-factory
              </th>
            </tr>
          </thead>
          <tbody>
            {pos.map(({ po, styles, first }) => {
              const open = openPOs.has(po);
              return (
                <Fragment key={po}>
                  <tr
                    onClick={() => togglePO(po)}
                    className={cn('group cursor-pointer', open ? 'bg-primary-50/40' : 'hover:bg-gray-50/70')}
                  >
                    <td className="pl-3.5 border-b border-gray-100 h-[42px]">
                      <span className="flex items-center gap-1.5 max-w-[250px]">
                        <ChevronRight className={cn('w-3 h-3 text-gray-400 flex-shrink-0 transition-transform',
                          open && 'rotate-90')} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold text-gray-900 leading-tight">
                            <span className="font-mono text-primary-600 mr-1.5">{po}</span>
                            {first.customer}
                          </span>
                          <span className="block text-[10.5px] text-gray-400 truncate">
                            {styles.length} {styles.length === 1 ? 'style' : 'styles'}
                            {first.factory && <> · {first.factory}</>}
                          </span>
                        </span>
                      </span>
                    </td>
                    {data.gates.map(g => (
                      <td key={g.key} className="text-center px-1 border-b border-gray-100">
                        <RollupCell styles={styles} gateKey={g.key} onClick={() => togglePO(po)} />
                      </td>
                    ))}
                    <td className="text-right pr-3.5 border-b border-gray-100">
                      <ExFactory s={first} />
                    </td>
                  </tr>

                  {open && styles.map(s => (
                    <tr key={s.order_id} className="bg-gray-50/60 hover:bg-gray-100/70">
                      <td className="pl-3.5 border-b border-gray-100 h-[38px]">
                        <button
                          onClick={(e) => { e.stopPropagation(); onStyleClick(s.po_number, s.style_code || undefined); }}
                          className="text-left block max-w-[250px] pl-[18px]"
                        >
                          <span className="block text-[12px] font-mono text-gray-800 leading-tight">
                            {s.style_code}
                          </span>
                          <span className="block text-[10.5px] text-gray-400 truncate">
                            {[s.description, s.colour].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </td>
                      {data.gates.map(g => (
                        <td key={g.key} className="text-center px-1 border-b border-gray-100">
                          <Cell
                            gate={s.gates[g.key]}
                            onClick={() => onStyleClick(s.po_number, s.style_code || undefined)}
                          />
                        </td>
                      ))}
                      <td className="text-right pr-3.5 border-b border-gray-100" />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {(data.bottleneck || data.total_styles > 8) && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-gray-100
                        bg-amber-50/40 text-[12px] text-gray-600 flex-wrap">
          {data.bottleneck && (
            <>
              <b className="text-gray-900 font-semibold">Bottleneck</b>
              <span className="font-mono text-[10px] font-semibold rounded-full px-2 py-0.5
                               bg-amber-100 text-amber-800 whitespace-nowrap">
                {data.bottleneck.label} · {data.bottleneck.count} overdue
              </span>
              <span>
                — {data.bottleneck.factories.length === 1
                    ? `all with ${data.bottleneck.factories[0]}`
                    : `across ${data.bottleneck.factories.length} factories`}
                , longest waiting {data.bottleneck.worst_days} business days.
              </span>
            </>
          )}
          <span className="ml-auto text-[11px] text-gray-400">
            {pos.length} POs · {data.total_styles} styles · click a PO for its styles
          </span>
        </div>
      )}
    </div>
  );
}
