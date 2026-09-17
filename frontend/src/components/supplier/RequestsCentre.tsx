'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Search, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, formatDistanceToNowStrict } from 'date-fns';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { approvalsApi, type MyPendingChange, type MyApprovedChange, type RejectedChange } from '@/lib/api';

/**
 * A factory's date-change requests, in the shape of the Warnings Centre:
 * buckets down the left, the items in a wide pane on the right, one search
 * across the lot.
 *
 * The three fixed columns this replaces were a status split -- pending /
 * approved / declined -- and status is not what anyone acts on. The Warnings
 * Centre already learned this: its own comment records that grouping by
 * severity "grouped almost nothing in practice", and that who-owes-the-work is
 * the split people use. Here that is waiting-on-Source-Lab versus answered.
 *
 * The columns were also unreadable for a structural reason rather than a
 * styling one. Three 300px columns cannot fit "30 Oct 2026 -> 20 Nov 2026" on
 * one line, let alone the reason underneath, so everything wrapped or was
 * truncated -- and the reason, the single field that explains why a request is
 * sitting there, was never shown at all. A rail plus one wide pane gives each
 * request a full line for the move and a full line for the reason.
 *
 * Rows are requests, not styles. One submit writes a PendingDateChange per
 * style, so a four-style PO appeared as four near-identical entries; grouping
 * by (PO, new value, reason) puts them back together as the one decision they
 * came from.
 */

type Row = {
  id: number;
  po_number: string;
  style_code: string | null;
  current_value: string | null;
  proposed_value: string | null;
  reason: string | null;
  submitted_at: string | null;
  state: 'pending' | 'approved' | 'declined';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  declineReason?: string | null;
};

type Request = {
  key: string;
  po: string;
  reason: string | null;
  current: string | null;
  proposed: string | null;
  submittedAt: string | null;
  rows: Row[];
  pending: number;
  approved: number;
  declined: number;
  /** The bucket the request itself belongs in: anything still open is open. */
  bucket: 'waiting' | 'approved' | 'declined';
  ageDays: number;
  declineReason: string | null;
  reviewedBy: string | null;
};

const fmt = (d: string | null | undefined) => {
  if (!d) return null;
  try { return format(parseISO(String(d).split('T')[0]), 'd MMM yyyy'); } catch { return null; }
};

const ago = (d: string | null | undefined) => {
  if (!d) return null;
  try { return formatDistanceToNowStrict(parseISO(d), { addSuffix: false }); } catch { return null; }
};

/** "5 weeks later", "2 weeks earlier" — the size of the ask, in words. */
function deltaWords(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  try {
    const d = differenceInCalendarDays(parseISO(to.split('T')[0]), parseISO(from.split('T')[0]));
    if (d === 0) return 'same date';
    const abs = Math.abs(d);
    const unit = abs >= 14 ? `${Math.round(abs / 7)} weeks` : abs === 1 ? '1 day' : `${abs} days`;
    return d > 0 ? `${unit} later` : `${unit} earlier`;
  } catch { return null; }
}

type BucketKey = 'waiting' | 'stale' | 'approved' | 'declined' | 'all';

export function RequestsCentre({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState<BucketKey>('waiting');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState<number | null>(null);
  // null = never touched, so the default can depend on data that hasn't loaded
  // yet. A factory with nothing outstanding gets one header line instead of a
  // 400px card above the order list they actually came for.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, r] = await Promise.all([
        approvalsApi.getMyPendingChanges(),
        approvalsApi.getMyApprovedChanges(),
        approvalsApi.getRejectedChanges(),
      ]);
      const mk = (
        list: (MyPendingChange | MyApprovedChange | RejectedChange)[],
        state: Row['state'],
      ): Row[] => list.map((x: any) => ({
        id: x.id,
        po_number: x.po_number || '—',
        style_code: x.style_code ?? null,
        current_value: x.current_value ?? null,
        proposed_value: x.proposed_value ?? null,
        reason: x.reason ?? null,
        submitted_at: x.submitted_at ?? null,
        state,
        reviewed_by: x.approved_by ?? x.rejected_by ?? null,
        reviewed_at: x.approved_at ?? x.rejected_at ?? null,
        declineReason: x.rejection_reason ?? null,
      }));
      setRows([
        ...mk(p.pending_changes || [], 'pending'),
        ...mk(a.approved_changes || [], 'approved'),
        ...mk(r.rejected_changes || [], 'declined'),
      ]);
    } catch {
      // Silent — the card just stays empty rather than breaking the page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  /** One request = one submit = (PO, new value, reason). */
  const requests = useMemo<Request[]>(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = [r.po_number, r.proposed_value || '—', r.reason || '—'].join('|');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).map(([key, rs]) => {
      const pending = rs.filter(x => x.state === 'pending').length;
      const approved = rs.filter(x => x.state === 'approved').length;
      const declined = rs.filter(x => x.state === 'declined').length;
      const submittedAt = rs.map(x => x.submitted_at).filter(Boolean).sort()[0] || null;
      let age = 0;
      try { if (submittedAt) age = differenceInCalendarDays(new Date(), parseISO(submittedAt)); } catch { /* keep 0 */ }
      return {
        key,
        po: rs[0].po_number,
        reason: rs[0].reason,
        current: rs[0].current_value,
        proposed: rs[0].proposed_value,
        submittedAt,
        rows: rs,
        pending, approved, declined,
        // Membership is by presence, not exclusivity. Bucketing a request
        // solely by "any row still pending" meant the Approved and Declined
        // buckets only filled once a request was 100% resolved -- and since a
        // four-style request usually comes back in pieces, both history buckets
        // sat empty and vanished from the rail. A request that was partly
        // approved now appears under Approved as well as under waiting, which
        // is also what somebody searching the history expects.
        bucket: pending > 0 ? 'waiting' : declined > 0 && approved === 0 ? 'declined' : 'approved',
        ageDays: age,
        declineReason: rs.find(x => x.declineReason)?.declineReason ?? null,
        reviewedBy: rs.find(x => x.reviewed_by)?.reviewed_by ?? null,
      } as Request;
    }).sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  }, [rows]);

  const matching = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return requests;
    return requests.filter(r =>
      r.po.toLowerCase().includes(needle)
      || (r.reason || '').toLowerCase().includes(needle)
      || (r.declineReason || '').toLowerCase().includes(needle)
      || r.rows.some(x => (x.style_code || '').toLowerCase().includes(needle)));
  }, [requests, q]);

  const buckets = useMemo(() => ({
    waiting: matching.filter(r => r.pending > 0),
    stale: matching.filter(r => r.pending > 0 && r.ageDays >= 7),
    approved: matching.filter(r => r.approved > 0),
    declined: matching.filter(r => r.declined > 0),
    all: matching,
  }), [matching]);

  // Never sit on an empty bucket after a search or a cancel.
  useEffect(() => {
    if (buckets[bucket].length === 0) {
      const next = (['waiting', 'stale', 'approved', 'declined', 'all'] as BucketKey[])
        .find(k => buckets[k].length > 0);
      if (next && next !== bucket) setBucket(next);
    }
  }, [buckets, bucket]);

  const cancel = async (id: number) => {
    setCancelling(id);
    try {
      await approvalsApi.cancelPendingChange(id);
      toast.success('Request cancelled');
      load();
    } catch {
      toast.error('Could not cancel that request');
    } finally {
      setCancelling(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 px-6 py-5 mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your requests…
        </div>
      </div>
    );
  }

  // Nothing ever asked — say nothing at all.
  if (requests.length === 0) return null;

  const waitingCount = requests.filter(r => r.pending > 0).length;
  // Styles, not requests. Counting fully-answered requests read as "0 answered"
  // while five styles had been approved, because every request still had
  // something open -- true at request level, wrong to anybody reading it.
  const answeredStyles = requests.reduce((n, r) => n + r.approved + r.declined, 0);

  // Collapsed by default when nothing is outstanding: a clean book costs one
  // line, not a quarter of the screen above the order list.
  // Closed by default, always. This sits on top of the order list, and at 360px
  // it left about five order rows visible -- the page's actual content reduced
  // to a strip by a summary of it. The header line carries the count, in amber
  // when something is waiting, which is the whole signal; the detail is a click
  // away rather than permanently in the way.
  const isCollapsed = collapsed ?? true;

  const TABS: { key: BucketKey; label: string; tone: 'amber' | 'green' | 'red' | 'gray'; group: string }[] = [
    { key: 'waiting', label: 'Sent, not answered', tone: 'amber', group: 'Waiting on Source Lab' },
    { key: 'stale', label: 'Over a week old', tone: 'red', group: 'Waiting on Source Lab' },
    { key: 'approved', label: 'Approved — date moved', tone: 'green', group: 'Answered' },
    { key: 'declined', label: 'Declined — date held', tone: 'red', group: 'Answered' },
    { key: 'all', label: 'Full history', tone: 'gray', group: 'Everything' },
  ];
  const groups = ['Waiting on Source Lab', 'Answered', 'Everything'];

  const active = TABS.find(t => t.key === bucket) || TABS[0];
  const shown = buckets[bucket];

  return (
    /* The panel drops OVER the order list rather than above it.
       This page is a hard `height: calc(100vh - 116px)` with overflow-hidden,
       and the table takes whatever is left of that column -- so opening a 300px
       card in the flow did not push the table down, it shrank it, and the page
       could not scroll to compensate. Keeping the header strip in flow and
       floating the body means the table never changes size. */
    <div className={cn('relative mb-4', !isCollapsed && 'z-30')}>
    <div className={cn('bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]',
      'ring-1 ring-gray-100', isCollapsed && 'overflow-hidden')}>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            waitingCount > 0 ? 'bg-amber-100' : 'bg-gray-100')}>
            <Clock className={cn('w-5 h-5', waitingCount > 0 ? 'text-amber-600' : 'text-gray-400')} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">Requests Centre</h3>
            <p className="text-xs text-gray-500 truncate">
              {q
                ? `${matching.length} match${matching.length === 1 ? '' : 'es'} for "${q}"`
                : waitingCount > 0
                  ? `${waitingCount} ${waitingCount === 1 ? 'request' : 'requests'} waiting on Source Lab`
                    + (answeredStyles > 0 ? ` · ${answeredStyles} styles already answered` : '')
                  : `Nothing outstanding · ${answeredStyles} styles answered`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search PO, style or reason…"
                className="w-[250px] pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          )}
          <button
            /* Toggle the DERIVED value, not the raw state. `collapsed` starts
               null so the default can be data-dependent, and !null is true --
               so flipping the raw value moved an already-collapsed card to
               collapsed again and the button did nothing. */
            onClick={() => setCollapsed(!isCollapsed)}
            className="text-xs font-semibold text-gray-500 hover:text-gray-900 px-2 py-1 inline-flex items-center gap-1"
          >
            {isCollapsed ? <>Show <ChevronDown className="w-3.5 h-3.5" /></> : <>Hide <ChevronRight className="w-3.5 h-3.5 rotate-90" /></>}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="lg:absolute lg:left-0 lg:right-0 lg:top-full lg:mt-1 bg-white lg:rounded-xl
                        lg:ring-1 lg:ring-gray-200 lg:shadow-2xl overflow-hidden
                        grid lg:grid-cols-[300px_1fr] lg:h-[min(520px,calc(100vh-240px))]">
          {/* Buckets, grouped by who owes the work */}
          <div className="lg:border-r border-b lg:border-b-0 border-gray-100 bg-gray-50/60 p-3
                          lg:h-full min-h-0 overflow-y-auto">
            {groups.map((g) => {
              const tabs = TABS.filter(t => t.group === g && buckets[t.key].length > 0);
              if (!tabs.length) return null;
              return (
                <div key={g} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-2">{g}</p>
                  <div className="space-y-0.5">
                    {tabs.map((t) => {
                      const on = bucket === t.key;
                      const tone = {
                        amber: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
                        green: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
                        red: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
                        gray: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
                      }[t.tone];
                      return (
                        <button
                          key={t.key}
                          onClick={() => setBucket(t.key)}
                          className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-lg transition-colors',
                            on ? `${tone.bg} ${tone.text}` : 'text-gray-700 hover:bg-gray-100/80')}
                        >
                          <span className={cn('w-[7px] h-[7px] rounded-full flex-shrink-0', tone.dot)} />
                          <span className="flex-1 text-xs font-medium truncate">{t.label}</span>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[20px] text-center',
                            on ? 'bg-white/60' : `${tone.bg} ${tone.text}`)}>
                            {buckets[t.key].length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* The requests */}
          <div className="p-5 lg:h-full min-h-0 overflow-y-auto">
            <div className="flex items-start justify-between gap-4 pb-3 mb-3.5 border-b border-gray-100">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-gray-900">{active.label}</h4>
                <p className="text-xs text-gray-500 mt-0.5 max-w-[62ch]">
                  {active.key === 'waiting' && 'Source Lab have these. Nothing on your orders moves until each one is approved.'}
                  {active.key === 'stale' && 'Sent over a week ago and still unanswered. Worth a chase.'}
                  {active.key === 'approved' && 'Approved — the new date is live on the order.'}
                  {active.key === 'declined' && 'Turned down. The original date stands, and their reason is on each one.'}
                  {active.key === 'all' && 'Everything you have ever asked for, newest first.'}
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 bg-gray-100 text-gray-600 whitespace-nowrap">
                {shown.length} {shown.length === 1 ? 'request' : 'requests'}
              </span>
            </div>

            {shown.length === 0 ? (
              <p className="py-10 text-center text-xs text-gray-400">Nothing here.</p>
            ) : (
              <div className="space-y-2.5">
                {shown.map((r) => (
                  <RequestRow
                    key={r.key}
                    r={r}
                    expanded={open.has(r.key)}
                    onToggle={() => setOpen(prev => {
                      const n = new Set(prev);
                      n.has(r.key) ? n.delete(r.key) : n.add(r.key);
                      return n;
                    })}
                    onCancel={cancel}
                    cancelling={cancelling}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

/** One request, two lines.
 *
 *  The first version gave each request a header line, a date line, a labelled
 *  reason block, an optional second labelled block and a footer bar -- about
 *  150px each, so five requests filled the card and the order list underneath
 *  was down to five visible rows. Everything here is the same information with
 *  the labels and the footer bar removed: PO and the move share a line, the
 *  reason sits under it in quotes, and the actions only appear on hover.
 */
function RequestRow({
  r, expanded, onToggle, onCancel, cancelling,
}: {
  r: Request;
  expanded: boolean;
  onToggle: () => void;
  onCancel: (id: number) => void;
  cancelling: number | null;
}) {
  const delta = deltaWords(r.current, r.proposed);
  const held = r.declined > 0 && r.approved === 0 && r.pending === 0;
  const stillOpen = r.rows.filter(x => x.state === 'pending');
  const age = ago(r.submittedAt);

  return (
    <div className="group rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/40 transition-colors">
      <div className="px-3 py-2">
        {/* Line one: who and what, with the move as the loudest thing on it. */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-mono text-[13.5px] font-extrabold text-gray-900 tabular-nums flex-shrink-0">{r.po}</span>

          {held ? (
            <span className="text-[13px] font-bold text-gray-900 tabular-nums">
              stays {fmt(r.current)}
            </span>
          ) : (
            <span className="inline-flex items-baseline gap-1.5 tabular-nums">
              <span className="text-[11.5px] text-gray-400 line-through">{fmt(r.current) || '—'}</span>
              <span className="text-gray-300 text-[10px]">→</span>
              <span className={cn('text-[13.5px] font-extrabold',
                r.pending > 0 ? 'text-amber-700' : 'text-green-700')}>{fmt(r.proposed) || '—'}</span>
            </span>
          )}
          {delta && <span className="text-[11px] text-gray-400 flex-shrink-0">{delta}</span>}

          <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {r.pending > 0 && r.approved > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">{r.approved} ok</span>
            )}
            {r.declined > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700">{r.declined} declined</span>
            )}
            <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
              {r.pending > 0 && r.rows.length > r.pending
                ? `${r.pending}/${r.rows.length} styles`
                : `${r.rows.length} ${r.rows.length === 1 ? 'style' : 'styles'}`}
            </span>
            {age && <span className="text-[11px] text-gray-400 whitespace-nowrap">{age}</span>}
            <button
              onClick={onToggle}
              title={expanded ? 'Hide styles' : 'Show styles'}
              className="p-0.5 rounded text-gray-300 hover:text-gray-700 hover:bg-gray-100"
            >
              <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-90')} />
            </button>
          </span>
        </div>

        {/* Line two: the reason, unlabelled. The quotes say whose it is. */}
        {r.reason && (
          <p className="text-[12px] text-gray-600 mt-1 pr-2 max-w-[80ch]">
            &ldquo;{r.reason}&rdquo;
            {stillOpen.length > 0 && (
              <button
                onClick={() => stillOpen.forEach(x => onCancel(x.id))}
                disabled={cancelling != null}
                className="ml-2 text-[11px] font-semibold text-red-600 opacity-0 group-hover:opacity-100
                           transition-opacity hover:text-red-700 disabled:opacity-50 align-baseline"
              >
                {cancelling != null ? 'cancelling…'
                  : stillOpen.length === r.rows.length ? 'cancel' : `cancel ${stillOpen.length}`}
              </button>
            )}
          </p>
        )}

        {/* Only a decline earns a third line — it is the one thing you cannot
            work out from the rest of the row. */}
        {r.declineReason && (
          <p className="text-[12px] text-gray-700 mt-1 pl-2 border-l-2 border-red-200">
            <span className="font-semibold text-red-700">
              Source Lab{r.reviewedBy ? ` · ${r.reviewedBy}` : ''}:
            </span>{' '}
            {r.declineReason}
          </p>
        )}
      </div>

      {expanded && (
        <ul className="border-t border-gray-100 divide-y divide-gray-50">
          {r.rows.map((x) => (
            <li key={x.id} className="flex items-center gap-2.5 px-3 py-1 text-[11.5px]">
              <span className="font-mono text-gray-700 tabular-nums">{x.style_code || `#${x.id}`}</span>
              <span className={cn('ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded',
                x.state === 'pending' ? 'bg-amber-50 text-amber-700'
                : x.state === 'approved' ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700')}>
                {x.state === 'pending' ? 'Waiting' : x.state === 'approved' ? 'Approved' : 'Declined'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
