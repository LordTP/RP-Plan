'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, RotateCcw, Inbox, ExternalLink, Clock, User as UserIcon,
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
  const [selected, setSelected] = useState<string | null>(null);

  // Keep the selection valid across refreshes: approving the open item drops it
  // out of the list, and a dangling key would leave the panel blank.
  useEffect(() => {
    if (!decisions.length) { setSelected(null); return; }
    if (!selected || !decisions.some(d => d.key === selected)) setSelected(decisions[0].key);
  }, [decisions, selected]);

  const active = decisions.find(d => d.key === selected) || decisions[0];
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
      <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <h3 className="text-sm font-bold text-gray-900">Needs chasing</h3>
        <span className="ml-auto text-[11.5px] text-gray-400 tabular-nums">
          {decisions.length} {decisions.length === 1 ? 'decision' : 'decisions'} · {styles}{' '}
          {styles === 1 ? 'style' : 'styles'}
          {truncated && <span className="text-amber-600"> · showing {styles} of {total}</span>}
        </span>
      </header>

      {/* Fixed height, and each column scrolls inside it. Without this the
          panel is as tall as whatever is selected, so picking a decision with
          nine styles pushed the rejection history half a screen down and
          picking a one-style one snapped it back -- the page moved under you
          every time you clicked. A stable frame also gives the queue somewhere
          to scroll when there are thirty of them instead of three. */}
      <div className="grid lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:h-[480px]">
        {/* The queue */}
        <ul className="lg:border-r border-b lg:border-b-0 border-gray-100 divide-y divide-gray-50
                       lg:h-full min-h-0 overflow-y-auto overscroll-contain bg-gray-50/40">
          {decisions.map(d => {
            const on = active?.key === d.key;
            const tone = ageTone(age(d.worstDays));
            const tag = SAMPLE_TAG[d.sampleType];
            return (
              <li key={d.key}>
                <button
                  onClick={() => setSelected(d.key)}
                  aria-current={on}
                  className={cn('w-full text-left px-3 py-2.5 border-l-[3px] transition-colors',
                    on ? 'bg-white border-l-primary-500' : 'border-l-transparent hover:bg-white/70')}
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[12.5px] font-bold text-gray-900 truncate">
                      {d.componentName}
                    </span>
                    <span className={cn('text-[12.5px] font-extrabold tabular-nums flex-shrink-0', tone.text)}>
                      {age(d.worstDays)}d
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded', tag.cls)}>{tag.short}</span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded tabular-nums',
                      d.maxAttempt >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                      v{d.maxAttempt}
                    </span>
                    <span className="text-[10.5px] text-gray-500 tabular-nums truncate">
                      {d.poNumber} · {d.rows.length} {d.rows.length === 1 ? 'style' : 'styles'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {active && <DecisionDetail
          d={active} history={history}
          onOpenOrder={onOpenOrder} onMarkReceived={onMarkReceived}
          onApprove={onApprove} onRejectAgain={onRejectAgain}
        />}
      </div>
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
