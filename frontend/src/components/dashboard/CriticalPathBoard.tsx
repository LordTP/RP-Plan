'use client';

import { useEffect, useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashboardBoardApi, type BoardResponse, type BoardGate, type BoardGateState } from '@/lib/api';

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

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center py-14">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }
  if (!data || data.styles.length === 0) return null;

  const shown = expanded ? data.styles : data.styles.slice(0, 8);
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
            {shown.map(s => (
              <tr key={s.order_id} className="group hover:bg-gray-50/70">
                <td className="pl-3.5 border-b border-gray-100 h-[42px]">
                  <button
                    onClick={() => onStyleClick(s.po_number, s.style_code || undefined)}
                    className="text-left block max-w-[250px]"
                  >
                    <span className="block text-[12.5px] font-semibold text-gray-900 leading-tight">
                      <span className="font-mono text-[10.5px] font-medium text-primary-600 mr-1.5">
                        {s.po_number}
                      </span>
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
                <td className="text-right pr-3.5 border-b border-gray-100">
                  <span className="font-mono text-[11.5px] font-medium text-gray-900 whitespace-nowrap">
                    {s.ex_factory
                      ? new Date(s.ex_factory).toLocaleDateString('en-GB',
                          { day: '2-digit', month: 'short', year: '2-digit' })
                      : '—'}
                    <span className="block text-[9.5px] font-medium text-gray-400 mt-0.5">
                      {s.days_to_ex_factory != null
                        ? s.days_to_ex_factory >= 0
                          ? `${s.days_to_ex_factory} days`
                          : `${Math.abs(s.days_to_ex_factory)} days ago`
                        : 'no date'}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
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
          {data.total_styles > 8 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-auto inline-flex items-center gap-1 font-semibold text-gray-900 hover:text-primary-700"
            >
              {expanded ? 'Show fewer' : `Show all ${data.total_styles} styles`}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
