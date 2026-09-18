'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, Check, RotateCcw, Inbox, ExternalLink, Clock, User as UserIcon, Search, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupDecisions, type Decision } from './ReworkDecisions';
import type { StuckRow, RejectionHistoryRow, SampleType } from '@/lib/api';

/**
 * Open rework as a queue you work down, with the whole story on the right.
 *
 * The cards this replaces gave every decision the same weight and the same
 * ~180px, so two items filled a screen and 57 days looked exactly like 2. They
 * also rendered in the same visual language as the rejection history below
 * them, which meant the two halves of the page — what to chase now, and what
 * already happened — were indistinguishable at a glance.
 *
 * A queue fixes the density and the ranking: worst first, age as the loudest
 * thing on the row, and the list stays readable at twenty items. Putting the
 * detail beside it rather than inside each card is what lets the reason be
 * shown in full — the single most useful field, and the one the old layout
 * truncated on every row.
 */

const SAMPLE_LABEL: Record<SampleType, string> = {
  fit: 'Fit Sample', strike: 'Strike Off', lab: 'Lab Dip', pps: 'PPS', label: 'Label',
};

const SAMPLE_TAG: Record<SampleType, { short: string; cls: string }> = {
  strike: { short: 'SO', cls: 'bg-amber-100 text-amber-800' },
  lab: { short: 'LD', cls: 'bg-cyan-100 text-cyan-800' },
  label: { short: 'LB', cls: 'bg-fuchsia-100 text-fuchsia-800' },
  fit: { short: 'FIT', cls: 'bg-indigo-100 text-indigo-800' },
  pps: { short: 'PPS', cls: 'bg-violet-100 text-violet-800' },
};

const REASON_LABEL: Record<string, string> = {
  COLOUR: 'Colour / shade off', PLACEMENT: 'Placement wrong', STITCH: 'Stitch / construction',
  MATERIAL: 'Material / hand feel', SPEC: 'Spec mismatch', PRINT: 'Print quality', OTHER: 'Other',
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/** Never render a negative age. days_open is a server-side subtraction from
 *  today, so a rejection backdated to tomorrow by a fat-fingered import comes
 *  back as -1 and the queue reads "-1d", which looks broken rather than wrong. */
const age = (d: number) => Math.max(0, d);

/** Red from six weeks, amber from two. Matches STALE_BIZ_DAYS on the worklist. */
function ageTone(days: number) {
  if (days >= 30) return { text: 'text-red-600', rail: 'bg-red-500', soft: 'bg-red-50 text-red-700 ring-red-200' };
  if (days >= 14) return { text: 'text-amber-600', rail: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700 ring-amber-200' };
  return { text: 'text-gray-700', rail: 'bg-gray-300', soft: 'bg-gray-50 text-gray-600 ring-gray-200' };
}

export function ReworkQueue({
  stuck, history, total, onOpenOrder, onMarkReceived, onApprove, onRejectAgain,
}: {
  stuck: StuckRow[];
  history: RejectionHistoryRow[];
  total?: number;
  onOpenOrder: (orderId: number) => void;
  onMarkReceived: (row: StuckRow) => void;
  onApprove: (row: StuckRow) => void;
  onRejectAgain: (row: StuckRow) => void;
}) {
  const decisions = useMemo(() => groupDecisions(stuck), [stuck]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return decisions;
    return decisions.filter(d => {
      const hay = [
        d.componentName, d.poNumber, d.factory, d.reason, d.notes,
        ...d.rows.map(r => `${r.style_code} ${r.description} ${r.colour} ${r.china_orderbook_ref}`),
      ].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [decisions, q]);

  // Banded by PO, the way the components table is. Age used to be the grouping
  // and it read well while everything was old, but a PO is the thing people
  // chase as a unit -- one call to Prime covers every decision under one band.
  const bands = useMemo(() => {
    const m = new Map<string, Decision[]>();
    for (const d of filtered) {
      if (!m.has(d.poNumber)) m.set(d.poNumber, []);
      m.get(d.poNumber)!.push(d);
    }
    return Array.from(m.entries())
      .map(([po, ds]: [string, Decision[]]) => ({
        po,
        ds: [...ds].sort((x, y) => age(y.worstDays) - age(x.worstDays)),
        worst: Math.max(...ds.map(d => age(d.worstDays))),
        styles: ds.reduce((n, d) => n + d.rows.length, 0),
        ref: ds[0].rows[0]?.china_orderbook_ref || '',
        factory: ds[0].factory || '',
      }))
      // Worst PO first: the band you should be ringing about is at the top.
      .sort((x, y) => y.worst - x.worst);
  }, [filtered]);

  const active = decisions.find(d => d.key === open) || null;
  const styles = stuck.length;
  const truncated = typeof total === 'number' && total > styles;

  if (!decisions.length) {
    return (
      <section className="rounded-xl bg-white ring-1 ring-gray-200 px-4 py-8 text-center">
        <p className="text-sm text-gray-500">Nothing in rework. Every sample is on its first attempt.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <h3 className="text-sm font-bold text-gray-900">Needs chasing</h3>
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search component, PO, style, colour…"
            className="w-[260px] max-w-full pl-8 pr-7 py-1.5 text-[12px] bg-white border border-gray-200
                       rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-[11.5px] text-gray-400 tabular-nums whitespace-nowrap">
          {filtered.length} {filtered.length === 1 ? 'decision' : 'decisions'} · {styles}{' '}
          {styles === 1 ? 'style' : 'styles'}
          {truncated && <span className="text-amber-600"> · showing {styles} of {total}</span>}
        </span>
      </header>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          Nothing matches &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <div>
          {bands.map(band => {
            const tone = ageTone(band.worst);
            return (
              <div key={band.po}>
                {/* Same band as the components table: heavy ground, colour rail,
                    PO number at a size nothing else competes with. */}
                <div className={cn('flex items-center gap-3 flex-wrap px-4 py-2.5 border-y-2 border-l-4',
                  band.worst >= 30 ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-300')}
                  style={{ borderLeftColor: band.worst >= 30 ? '#dc2626' : '#9ca3af' }}>
                  <span className="font-mono font-extrabold tabular-nums text-[18px] leading-none text-gray-900">
                    {band.po}
                  </span>
                  {band.ref && <span className="text-[13px] font-semibold text-gray-700 truncate max-w-[280px]">{band.ref}</span>}
                  {band.factory && <span className="text-[12px] text-gray-500">{band.factory}</span>}
                  <span className="ml-auto text-[12px] font-semibold text-gray-600 tabular-nums whitespace-nowrap">
                    {band.ds.length} {band.ds.length === 1 ? 'decision' : 'decisions'} · {band.styles}{' '}
                    {band.styles === 1 ? 'style' : 'styles'} ·{' '}
                    <span className={tone.text}>worst {band.worst}d</span>
                  </span>
                </div>

                {band.ds.map(d => {
                  const t = ageTone(age(d.worstDays));
                  const tag = SAMPLE_TAG[d.sampleType];
                  return (
                    <button
                      key={d.key}
                      onClick={() => setOpen(d.key)}
                      className="w-full text-left px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50
                                 transition-colors grid grid-cols-[minmax(0,1.4fr)_54px_minmax(0,1.5fr)_auto]
                                 gap-3 items-center"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0', tag.cls)}>{tag.short}</span>
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded tabular-nums flex-shrink-0',
                          d.maxAttempt >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                          v{d.maxAttempt}
                        </span>
                        <span className="text-[13px] font-bold text-gray-900 truncate">{d.componentName}</span>
                      </span>
                      <span className={cn('text-[13px] font-extrabold tabular-nums', t.text)}>
                        {age(d.worstDays)}d
                      </span>
                      <span className="text-[11.5px] text-gray-500 truncate">
                        {d.rows.length === 1
                          ? `${d.rows[0].style_code} · ${d.rows[0].colour || ''}`
                          : `${d.rows.length} styles · ${d.rows.map(r => r.colour).filter(Boolean).join(', ')}`}
                      </span>
                      {/* The reason only earns a place when it says something.
                          Every backfilled row is OTHER, which is noise. */}
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {d.reason && d.reason !== 'OTHER' ? (REASON_LABEL[d.reason] || d.reason) : 'Open'}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* The detail that used to occupy half the panel now opens over it, so
          the queue keeps the full width and nothing is hidden behind a click
          until you actually want it. X closes it, not a click outside. */}
      {active && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 my-auto overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-widest text-primary-600 font-bold">In rework</div>
                <h3 className="text-[17px] font-extrabold text-gray-900 leading-tight mt-0.5">
                  {active.componentName}
                </h3>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  {SAMPLE_LABEL[active.sampleType]} · attempt {active.maxAttempt} · PO{' '}
                  <span className="font-mono">{active.poNumber}</span>
                  {active.factory && <> · {active.factory}</>}
                </p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close"
                      className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <DecisionDetail
                d={active} history={history}
                onOpenOrder={onOpenOrder} onMarkReceived={onMarkReceived}
                onApprove={onApprove} onRejectAgain={onRejectAgain}
              />
            </div>
          </div>
        </div>, document.body)}
    </section>
  );
}


function DecisionDetail({
  d, history, onOpenOrder, onMarkReceived, onApprove, onRejectAgain,
}: {
  d: Decision;
  history: RejectionHistoryRow[];
  onOpenOrder: (orderId: number) => void;
  onMarkReceived: (row: StuckRow) => void;
  onApprove: (row: StuckRow) => void;
  onRejectAgain: (row: StuckRow) => void;
}) {
  const first = d.rows[0];
  const tone = ageTone(age(d.worstDays));

  // The rejection that opened this attempt. StuckRow carries the reason but not
  // when it was given or by whom, so it comes from the history rows for the
  // same component on the same PO one attempt back.
  const source = useMemo(() => history.find(h =>
    h.po_number === d.poNumber
    && h.component_name === d.componentName
    && h.sample_type === d.sampleType
    && h.attempt_no === d.maxAttempt - 1), [history, d]);

  return (
    <div className="p-4 sm:p-5 min-w-0 lg:h-full lg:overflow-y-auto overscroll-contain">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h4 className="text-[16px] font-extrabold text-gray-900 leading-tight">{d.componentName}</h4>
          <p className="text-[11.5px] text-gray-500 mt-1">
            {SAMPLE_LABEL[d.sampleType]} · attempt {d.maxAttempt} · PO{' '}
            <b className="text-gray-700 font-mono">{d.poNumber}</b>
            {d.factory && <> · {d.factory}</>}
          </p>
        </div>
        <div className={cn('text-right px-2.5 py-1 rounded-lg ring-1 flex-shrink-0', tone.soft)}>
          <div className="text-[17px] font-extrabold tabular-nums leading-none">{age(d.worstDays)}d</div>
          <div className="text-[9px] uppercase tracking-wider mt-0.5 opacity-80">waiting</div>
        </div>
      </div>

      {/* The reason, in full — the point of the page, and what the old card clipped. */}
      {d.reason && (
        <div className="mt-3 rounded-lg bg-red-50/70 ring-1 ring-red-100 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">
            {REASON_LABEL[d.reason] || d.reason}
            {source?.rejected_at && (
              <span className="font-semibold normal-case tracking-normal text-red-600/80">
                {' · rejected '}{fmtDate(source.rejected_at)}
              </span>
            )}
          </p>
          {d.notes && <p className="text-[12.5px] text-gray-700 mt-1.5 leading-relaxed">{d.notes}</p>}
          {source?.rejected_by && (
            <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
              <UserIcon className="w-3 h-3" /> {source.rejected_by}
            </p>
          )}
        </div>
      )}

      {/* Where it has got to. */}
      <ol className="mt-3.5 ml-1 border-l-2 border-gray-100 pl-4 space-y-2">
        {source?.rejected_at && (
          <li className="relative text-[12px] text-gray-600">
            <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
            <b className="text-gray-800">v{d.maxAttempt - 1} rejected</b> · {fmtDate(source.rejected_at)}
          </li>
        )}
        <li className="relative text-[12px] text-gray-600">
          <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
          <b className="text-gray-800">v{d.maxAttempt} outstanding</b> · waiting {age(d.worstDays)} days for the remake
        </li>
      </ol>

      {/* Every style the decision hit. */}
      <div className="mt-4 rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold
                        uppercase tracking-wider text-gray-500">
          {d.rows.length} {d.rows.length === 1 ? 'style' : 'styles'} affected
        </div>
        <ul className="divide-y divide-gray-50">
          {d.rows.map(r => (
            <li key={r.submission_id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50/70">
              <button onClick={() => onOpenOrder(r.order_id)}
                      className="min-w-0 flex-1 flex items-center gap-2 text-left group">
                <span className="font-mono text-[11.5px] text-gray-800 tabular-nums flex-shrink-0">
                  {r.style_code || '—'}
                </span>
                <span className="text-[11.5px] text-gray-500 truncate">{r.description || '—'}</span>
                {r.colour && <span className="text-[10.5px] text-gray-400 flex-shrink-0">· {r.colour}</span>}
                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
              </button>
              <span className="text-[10.5px] text-gray-400 tabular-nums w-8 text-right flex-shrink-0">
                {age(r.days_open)}d
              </span>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => onMarkReceived(r)} title="Mark this style received"
                        className="p-1 rounded text-gray-500 hover:bg-gray-100"><Inbox className="w-3 h-3" /></button>
                <button onClick={() => onApprove(r)} title="Approve this style"
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-50"><Check className="w-3 h-3" /></button>
                <button onClick={() => onRejectAgain(r)} title="Reject this style again"
                        className="p-1 rounded text-red-500 hover:bg-red-50"><RotateCcw className="w-3 h-3" /></button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Whole-decision actions. Per-style ones stay above for the odd case
          where one style comes back right and the rest do not. */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onMarkReceived(first)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold
                     text-gray-700 bg-white ring-1 ring-gray-200 hover:bg-gray-50 transition-colors"
        >
          <Inbox className="w-3.5 h-3.5" /> Mark received
        </button>
        <button
          onClick={() => onApprove(first)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold
                     text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 hover:bg-emerald-100 transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Approve
        </button>
        <button
          onClick={() => onRejectAgain(first)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold
                     text-red-700 bg-red-50 ring-1 ring-red-200 hover:bg-red-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reject again
        </button>
        {d.maxAttempt >= 3 && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-red-700">
            <Clock className="w-3.5 h-3.5" /> Third attempt — worth a phone call
          </span>
        )}
      </div>
    </div>
  );
}
