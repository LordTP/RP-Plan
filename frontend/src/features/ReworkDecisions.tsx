'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Check, RotateCcw, ExternalLink, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StuckRow, SampleType } from '@/lib/api';

/**
 * Open rework, grouped by the decision that caused it.
 *
 * A rejection scoped to a PO writes one submission row per style, and the page
 * used to render one table row per submission. On a 20-style PO that is twenty
 * rows repeating the same component, the same area, the same attempt number,
 * the same age and the same reason — measured across a real list, six of the
 * seven columns held at most four distinct values between them. The only
 * column that varied was the style code.
 *
 * Worse, the reason was the truncated one. The single thing a factory needs —
 * what is wrong and what to change — was the field clipped to fit, on every
 * row, and readable on none of them.
 *
 * So the unit here is the decision, not the row: one card per
 * component x area x reason x PO, which is exactly the shape a rejection is
 * made in. The reason gets room to be read, the styles it hit collapse behind
 * a count, and there is one set of actions instead of sixty.
 */

const SAMPLE_LABEL: Record<SampleType, string> = {
  fit: 'Fit Sample', strike: 'Strike Off', lab: 'Lab Dip', pps: 'PPS', label: 'Label',
};

const REASON_LABEL: Record<string, string> = {
  COLOUR: 'Colour / shade off', PLACEMENT: 'Placement wrong', STITCH: 'Stitch / construction',
  MATERIAL: 'Material / hand feel', SPEC: 'Spec mismatch', PRINT: 'Print quality', OTHER: 'Other',
};

export type Decision = {
  key: string;
  rows: StuckRow[];
  componentName: string;
  sampleType: SampleType;
  reason: string | null;
  notes: string | null;
  poNumber: string;
  factory: string | null;
  worstDays: number;
  maxAttempt: number;
};

export function groupDecisions(stuck: StuckRow[]): Decision[] {
  const map = new Map<string, StuckRow[]>();
  for (const r of stuck) {
    // PO is part of the key because a rejection is scoped within one: the same
    // component failing on two POs is two conversations with two factories,
    // even when the reason reads the same.
    //
    // Attempt number too. A component where three styles have failed twice and
    // five have failed once is not one situation — the v3 group is the one
    // somebody needs to pick the phone up about, and folding it in with the
    // v2s hides it behind a max().
    const key = [r.component_name || '—', r.sample_type, r.last_reason || '—',
                 r.po_number || '—', r.attempt_no].join('|');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries())
    .map(([key, rows]) => ({
      key,
      rows,
      componentName: rows[0].component_name || '—',
      sampleType: rows[0].sample_type,
      reason: rows[0].last_reason,
      notes: rows[0].last_reason_notes,
      poNumber: rows[0].po_number || '—',
      factory: rows[0].factory,
      worstDays: Math.max(...rows.map(r => r.days_open)),
      maxAttempt: Math.max(...rows.map(r => r.attempt_no)),
    }))
    // Oldest first — the thing that has been waiting longest is the thing to
    // deal with, regardless of which PO it sits on.
    .sort((a, b) => b.worstDays - a.worstDays || b.rows.length - a.rows.length);
}

export function ReworkDecisions({
  stuck, total, onOpenOrder, onMarkReceived, onApprove, onRejectAgain,
}: {
  stuck: StuckRow[];
  total?: number;
  onOpenOrder: (orderId: number) => void;
  onMarkReceived: (row: StuckRow) => void;
  onApprove: (row: StuckRow) => void;
  onRejectAgain: (row: StuckRow) => void;
}) {
  const decisions = useMemo(() => groupDecisions(stuck), [stuck]);
  const styles = stuck.length;
  const truncated = typeof total === 'number' && total > styles;

  if (!decisions.length) {
    return (
      <div className="text-xs text-gray-500 px-3 py-4 border border-dashed border-gray-200 rounded-lg bg-gray-50/40">
        No open rework right now.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h4 className="text-sm font-bold text-gray-900">Open rework</h4>
        </div>
        <span className="text-xs text-gray-400">
          {decisions.length} {decisions.length === 1 ? 'decision' : 'decisions'} ·{' '}
          {styles} {styles === 1 ? 'style' : 'styles'}
          {truncated && <span className="text-amber-600"> · showing {styles} of {total}</span>}
        </span>
      </div>
      <div className="space-y-3">
        {decisions.map(d => <DecisionCard key={d.key} d={d} onOpenOrder={onOpenOrder}
          onMarkReceived={onMarkReceived} onApprove={onApprove} onRejectAgain={onRejectAgain} />)}
      </div>
    </>
  );
}

function DecisionCard({
  d, onOpenOrder, onMarkReceived, onApprove, onRejectAgain,
}: {
  d: Decision;
  onOpenOrder: (orderId: number) => void;
  onMarkReceived: (row: StuckRow) => void;
  onApprove: (row: StuckRow) => void;
  onRejectAgain: (row: StuckRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const stuckHard = d.maxAttempt >= 3;
  const first = d.rows[0];

  return (
    <div className={cn('rounded-xl bg-white ring-1 overflow-hidden',
      stuckHard ? 'ring-red-200' : 'ring-gray-200')}>
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-gray-900">{d.componentName}</span>
              <span className="text-[11px] text-gray-500">{SAMPLE_LABEL[d.sampleType]}</span>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums',
                stuckHard ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                v{d.maxAttempt}
              </span>
              {stuckHard && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
                  STUCK
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-gray-500 mt-1">
              <b className="text-gray-700 font-mono">{d.poNumber}</b>
              {d.factory && <> · {d.factory}</>}
              {' · '}
              <b className="text-gray-700">{d.rows.length}</b>{' '}
              {d.rows.length === 1 ? 'style' : 'styles'}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={cn('text-[15px] font-bold tabular-nums leading-none',
              d.worstDays >= 14 ? 'text-red-600' : d.worstDays >= 7 ? 'text-amber-600' : 'text-gray-700')}>
              {d.worstDays}d
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">waiting</div>
          </div>
        </div>

        {/* The reason, in full. This is the point of the page. */}
        {d.reason && (
          <div className="mt-2.5 rounded-lg bg-red-50/60 ring-1 ring-red-100 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
              {REASON_LABEL[d.reason] || d.reason}
            </span>
            {d.notes && (
              <p className="text-[12px] text-gray-700 mt-1 leading-relaxed">{d.notes}</p>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 flex items-center gap-2">
        <button
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-gray-600 hover:text-gray-900"
          aria-expanded={open}
        >
          <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} />
          {open ? 'Hide' : 'Show'} {d.rows.length} {d.rows.length === 1 ? 'style' : 'styles'}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => onMarkReceived(first)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold
                       text-gray-600 bg-white ring-1 ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Inbox className="w-3 h-3" /> Mark received
          </button>
          <button
            onClick={() => onApprove(first)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold
                       text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            <Check className="w-3 h-3" /> Approve
          </button>
          <button
            onClick={() => onRejectAgain(first)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold
                       text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reject again
          </button>
        </div>
      </div>

      {open && (
        <ul className="divide-y divide-gray-50 border-t border-gray-100 max-h-[280px] overflow-y-auto">
          {d.rows.map(r => (
            <li key={r.submission_id}
                className="flex items-center gap-3 px-4 py-1.5 hover:bg-gray-50/60 transition-colors">
              <button onClick={() => onOpenOrder(r.order_id)}
                      className="min-w-0 flex-1 flex items-center gap-2 text-left group">
                <span className="font-mono text-[11.5px] text-gray-800 tabular-nums flex-shrink-0">
                  {r.style_code || '—'}
                </span>
                <span className="text-[11.5px] text-gray-500 truncate">{r.description || '—'}</span>
                {r.colour && (
                  <span className="text-[10.5px] text-gray-400 flex-shrink-0">· {r.colour}</span>
                )}
                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
              </button>
              {/* Per-style actions stay available: a decision is usually
                  actioned as a whole, but occasionally one style comes back
                  right and the rest do not. */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10.5px] text-gray-400 tabular-nums w-8 text-right">
                  {r.days_open}d
                </span>
                <button onClick={() => onMarkReceived(r)} title="Mark this style received"
                        className="p-1 rounded text-gray-500 hover:bg-gray-100">
                  <Inbox className="w-3 h-3" />
                </button>
                <button onClick={() => onApprove(r)} title="Approve this style"
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-50">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => onRejectAgain(r)} title="Reject this style again"
                        className="p-1 rounded text-red-500 hover:bg-red-50">
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
