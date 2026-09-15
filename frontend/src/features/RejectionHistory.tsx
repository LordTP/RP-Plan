'use client';

import { useMemo, useState } from 'react';
import {
  Search, X, ChevronRight, Check, RotateCcw, Clock, History,
  Calendar, User as UserIcon, Factory as FactoryIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RejectionHistoryRow, SampleType } from '@/lib/api';

/**
 * Every rejection that has been closed out, and what happened next.
 *
 * The page only ever showed open rework, so the moment something resolved it
 * vanished — there was no way to ask "what did we reject on this PO, did the
 * retry fix it, and how long did it take?". That is the question people ask
 * before rejecting the same component a third time, or when a factory argues
 * they were never told.
 *
 * Built to be searched rather than scrolled. Someone arrives here with a
 * specific question — a PO number, a component, "everything we bounced for
 * colour", "what is still open" — so the filters are the primary interface
 * and the list answers whatever is left.
 *
 * Rows are grouped by decision, exactly like the open rework above: a
 * rejection scoped to a PO writes one row per style, and listing twenty
 * identical rows is what made the original page unreadable.
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

type Outcome = 'approved' | 'rejected_again' | 'open' | 'unknown';

const OUTCOME: Record<Outcome, { label: string; cls: string; icon: typeof Check }> = {
  approved: { label: 'Fixed on retry', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: Check },
  rejected_again: { label: 'Rejected again', cls: 'bg-red-50 text-red-700 ring-red-200', icon: RotateCcw },
  open: { label: 'Still open', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: Clock },
  unknown: { label: 'No retry logged', cls: 'bg-gray-100 text-gray-600 ring-gray-200', icon: Clock },
};

type Group = {
  key: string;
  rows: RejectionHistoryRow[];
  componentName: string;
  sampleType: SampleType;
  reason: string | null;
  notes: string | null;
  poNumber: string;
  customer: string | null;
  factory: string | null;
  attemptNo: number;
  rejectedAt: string | null;
  rejectedBy: string | null;
  outcome: Outcome;
  approved: number;
  rejectedAgain: number;
  stillOpen: number;
  avgDays: number | null;
};

function group(rows: RejectionHistoryRow[]): Group[] {
  const map = new Map<string, RejectionHistoryRow[]>();
  for (const r of rows) {
    const key = [r.component_name || '—', r.sample_type, r.reason || '—',
                 r.po_number || '—', r.attempt_no].join('|');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([key, rs]) => {
    const days = rs.map(r => r.days_to_next).filter((d): d is number => d != null);
    const approved = rs.filter(r => r.next_state === 'approved').length;
    const rejectedAgain = rs.filter(r => r.next_state === 'rejected_again').length;
    const stillOpen = rs.filter(r => r.next_state === 'open').length;
    // The headline outcome is the worst thing that happened, because that is
    // what somebody scanning needs to notice.
    const outcome: Outcome = rejectedAgain ? 'rejected_again'
      : stillOpen ? 'open'
      : approved ? 'approved' : 'unknown';
    return {
      key, rows: rs,
      componentName: rs[0].component_name || '—',
      sampleType: rs[0].sample_type,
      reason: rs[0].reason,
      notes: rs[0].notes,
      poNumber: rs[0].po_number || '—',
      customer: rs[0].customer,
      factory: rs[0].factory,
      attemptNo: rs[0].attempt_no,
      rejectedAt: rs[0].rejected_at,
      rejectedBy: rs[0].rejected_by,
      outcome, approved, rejectedAgain, stillOpen,
      avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    };
  }).sort((a, b) => (b.rejectedAt || '').localeCompare(a.rejectedAt || ''));
}

const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

export function RejectionHistory({ rows, total }: { rows: RejectionHistoryRow[]; total?: number }) {
  const [q, setQ] = useState('');
  const [reason, setReason] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [outcome, setOutcome] = useState<string>('all');

  const groups = useMemo(() => group(rows), [rows]);

  // Only offer filters for values that actually occur — a dropdown listing
  // seven reasons when the data holds two is a list of dead ends.
  const reasons = useMemo(
    () => Array.from(new Set(groups.map(g => g.reason).filter(Boolean) as string[])).sort(), [groups]);
  const types = useMemo(
    () => Array.from(new Set(groups.map(g => g.sampleType))), [groups]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter(g => {
      if (reason !== 'all' && g.reason !== reason) return false;
      if (type !== 'all' && g.sampleType !== type) return false;
      if (outcome !== 'all' && g.outcome !== outcome) return false;
      if (!needle) return true;
      // Search everything a person might have in their head: the component,
      // the PO, the customer, the factory, the reason, the note they wrote,
      // who rejected it, and any style code inside the group.
      const hay = [
        g.componentName, g.poNumber, g.customer, g.factory, g.reason,
        REASON_LABEL[g.reason || ''], g.notes, g.rejectedBy,
        SAMPLE_LABEL[g.sampleType],
        ...g.rows.map(r => `${r.style_code} ${r.description} ${r.colour}`),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [groups, q, reason, type, outcome]);

  const filtered = q.trim() || reason !== 'all' || type !== 'all' || outcome !== 'all';
  const shownStyles = shown.reduce((n, g) => n + g.rows.length, 0);

  if (!rows.length) {
    return (
      <section>
        <SectionTitle count={0} />
        <div className="text-xs text-gray-500 px-3 py-4 border border-dashed border-gray-200 rounded-lg bg-gray-50/40">
          Nothing has been rejected yet.
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle count={total ?? rows.length} />

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        {/* Filters first: people arrive here with a question, not to browse. */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search PO, component, style, customer, reason, note or person…"
              className="w-full pl-9 pr-8 py-2 text-[13px] border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select value={outcome} onChange={setOutcome} label="Outcome" options={[
            ['all', 'Any outcome'],
            ['open', 'Still open'],
            ['rejected_again', 'Rejected again'],
            ['approved', 'Fixed on retry'],
          ]} />
          {reasons.length > 1 && (
            <Select value={reason} onChange={setReason} label="Reason" options={[
              ['all', 'Any reason'],
              ...reasons.map(r => [r, REASON_LABEL[r] || r] as [string, string]),
            ]} />
          )}
          {types.length > 1 && (
            <Select value={type} onChange={setType} label="Type" options={[
              ['all', 'Any type'],
              ...types.map(t => [t, SAMPLE_LABEL[t]] as [string, string]),
            ]} />
          )}
          {filtered && (
            <button
              onClick={() => { setQ(''); setReason('all'); setType('all'); setOutcome('all'); }}
              className="text-[11.5px] font-medium text-gray-500 hover:text-gray-900 px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-gray-400">
            Nothing matches those filters.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
            {shown.map(g => <HistoryRow key={g.key} g={g} />)}
          </ul>
        )}

        <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {shown.length} of {groups.length} {groups.length === 1 ? 'decision' : 'decisions'}
            {' · '}{shownStyles} {shownStyles === 1 ? 'style' : 'styles'}
          </span>
          <span className="text-[11px] text-gray-400">Newest first</span>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <History className="w-4 h-4 text-gray-400" />
      <h4 className="text-sm font-bold text-gray-900">Rejection history</h4>
      <span className="text-xs text-gray-400">
        {count} rejected {count === 1 ? 'sample' : 'samples'}, all time
      </span>
    </div>
  );
}

function HistoryRow({ g }: { g: Group }) {
  const [open, setOpen] = useState(false);
  const tag = SAMPLE_TAG[g.sampleType];
  const out = OUTCOME[g.outcome];
  const OutIcon = out.icon;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0', tag.cls)}>
          {tag.short}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-gray-900">{g.componentName}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              v{g.attemptNo} rejected
            </span>
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1', out.cls)}>
              <OutIcon className="w-2.5 h-2.5" />
              {out.label}
              {g.outcome === 'approved' && g.avgDays != null && <> · {g.avgDays}d</>}
            </span>
          </div>

          {/* Where and who — the context that makes a note make sense. */}
          <div className="flex items-center gap-2.5 mt-1 flex-wrap text-[11px] text-gray-500">
            <span className="font-mono font-semibold text-gray-700">{g.poNumber}</span>
            {g.customer && <span className="truncate max-w-[180px]">{g.customer}</span>}
            {g.factory && (
              <span className="inline-flex items-center gap-1">
                <FactoryIcon className="w-3 h-3 text-gray-400" />{g.factory}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3 text-gray-400" />{fmtDate(g.rejectedAt)}
            </span>
            {g.rejectedBy && (
              <span className="inline-flex items-center gap-1">
                <UserIcon className="w-3 h-3 text-gray-400" />{g.rejectedBy}
              </span>
            )}
          </div>

          {/* The reason, in full — the thing the old table truncated. */}
          {g.reason && (
            <div className="mt-2 rounded-lg bg-red-50/50 ring-1 ring-red-100 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                {REASON_LABEL[g.reason] || g.reason}
              </span>
              {g.notes && <p className="text-[12px] text-gray-700 mt-1 leading-relaxed">{g.notes}</p>}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={() => setOpen(v => !v)}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-gray-600 hover:text-gray-900"
              aria-expanded={open}
            >
              <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} />
              {g.rows.length} {g.rows.length === 1 ? 'style' : 'styles'}
            </button>
            {/* The split, when a decision did not land the same way everywhere. */}
            {[
              [g.approved, 'fixed', 'text-emerald-700'],
              [g.rejectedAgain, 'rejected again', 'text-red-700'],
              [g.stillOpen, 'still open', 'text-amber-700'],
            ].filter(([n]) => (n as number) > 0).map(([n, label, cls]) => (
              <span key={label as string} className={cn('text-[10.5px] font-medium', cls as string)}>
                {n as number} {label as string}
              </span>
            ))}
          </div>

          {open && (
            <ul className="mt-2 rounded-lg bg-gray-50/60 ring-1 ring-gray-100 divide-y divide-gray-100
                           max-h-[220px] overflow-y-auto">
              {g.rows.map(r => (
                <li key={r.submission_id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-mono text-[11px] text-gray-800 tabular-nums flex-shrink-0">
                    {r.style_code || '—'}
                  </span>
                  <span className="text-[11px] text-gray-500 truncate">{r.description || '—'}</span>
                  {r.colour && <span className="text-[10.5px] text-gray-400 flex-shrink-0">· {r.colour}</span>}
                  <span className={cn('ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0',
                    OUTCOME[r.next_state].cls)}>
                    {OUTCOME[r.next_state].label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function Select({ value, onChange, label, options }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn('text-[12px] border rounded-lg px-2 py-2 bg-white cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-primary-200',
          value === 'all' ? 'border-gray-200 text-gray-600' : 'border-primary-300 text-primary-700 font-medium')}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
