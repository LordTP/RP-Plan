'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { businessDaysBetween } from '@/lib/sampleStatus';
import { componentsApi, ordersApi } from '@/lib/api';
import type { Order, OrderComponent, LastRejection } from '@/types';

/**
 * What a component looks like to the factory that has to make it.
 *
 * They were being shown the same edit modal as Source Lab with its fields
 * greyed out -- a form they can't submit, which answers "what can I change
 * here?" (nothing) rather than the question they actually opened it to ask:
 * where is this up to, and is anything waiting on me.
 *
 * So it reads instead of edits. Current state on the left where it doesn't
 * move, the attempt history on the right where it grows. The rejection reason
 * gets room because it is the one field that tells them what to do differently,
 * and it sat truncated or absent everywhere else.
 */

const SAMPLE_LABEL: Record<string, string> = {
  strike_off: 'Strike Off', lab_dip: 'Lab Dip', label: 'Label',
};

const TYPE_TAG: Record<string, { short: string; cls: string }> = {
  strike_off: { short: 'SO', cls: 'bg-amber-100 text-amber-800' },
  lab_dip: { short: 'LD', cls: 'bg-cyan-100 text-cyan-800' },
  label: { short: 'LB', cls: 'bg-fuchsia-100 text-fuchsia-800' },
};

const REASON_LABEL: Record<string, string> = {
  COLOUR: 'Colour / shade off', PLACEMENT: 'Placement wrong', STITCH: 'Stitch / construction',
  MATERIAL: 'Material / hand feel', SPEC: 'Spec mismatch', PRINT: 'Print quality', OTHER: 'Other',
};

const fmt = (d: string | null | undefined) => {
  if (!d) return null;
  try { return format(parseISO(d), 'd MMM yyyy'); } catch { return null; }
};

type Lane = { status: string; received: string | null; approved: string | null;
              attemptNo: number; lastRejection: LastRejection | null };

/** A component tracks exactly one sample type; read only that lane. */
function laneFor(c: OrderComponent): Lane {
  const p = c.sample_type === 'strike_off' ? 'strike_off'
          : c.sample_type === 'lab_dip' ? 'lab_dip' : 'label';
  const g = (suffix: string) => (c as unknown as Record<string, unknown>)[`${p}_${suffix}`];
  return {
    status: String(g('status') || '').trim().toUpperCase(),
    received: (g('received') as string) || null,
    approved: (g('approved') as string) || null,
    attemptNo: (g('attempt_no') as number) ?? 1,
    lastRejection: (g('last_rejection') as LastRejection) ?? null,
  };
}

export function FactoryComponentModal({
  open, order, component, onClose, onOpenStyle,
}: {
  open: boolean;
  order: Order;
  component: OrderComponent;
  onClose: () => void;
  onOpenStyle?: (orderId: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Spec, placement and notes live on the canonical library entry, not on the
  // instance, so the modal has to go and get them. Comments hang off the order
  // -- there is no such thing as a component comment -- so these are the
  // style's, labelled as such rather than implying they are about this print.
  const [detail, setDetail] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setDetail(null); setComments([]);
    if (component.canonical_id) {
      componentsApi.getLibraryEntry(component.canonical_id)
        .then((d) => { if (alive) setDetail(d); })
        .catch(() => { /* detail is a bonus; the modal still works without it */ });
    }
    ordersApi.getOrderComments(order.id)
      .then((c) => { if (alive) setComments(c || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, component.canonical_id, order.id]);

  const lane = useMemo(() => laneFor(component), [component]);
  if (!open) return null;

  const tag = TYPE_TAG[component.sample_type] || TYPE_TAG.strike_off;
  const exFac = order.revised_po_ex_factory || order.original_po_ex_factory;

  const approved = lane.status === 'APPROVED' || !!lane.approved;
  const notRequired = lane.status === 'NOT REQUIRED';
  // Only a rework while we are still waiting for it. A v2 that has arrived is
  // with Source Lab, not with the factory -- this is checked before the
  // RECEIVED branch below, so without it a received v2 read "hasn't arrived
  // yet" and its clock ran from the v1 rejection.
  const reworking = lane.attemptNo > 1 && !approved && lane.status !== 'RECEIVED';

  // Waiting-since depends on who is being waited on, the same rule the
  // worklist's idle clock uses.
  const waitingFrom = reworking ? lane.lastRejection?.rejected_at
                    : lane.status === 'RECEIVED' ? lane.received
                    : order.order_sent_to_factory_date;
  const waitingDays = Math.max(0, businessDaysBetween(waitingFrom, new Date()));

  const headline = approved ? 'Signed off'
    : notRequired ? 'Not required'
    : reworking ? 'Waiting on your remake'
    : lane.status === 'RECEIVED' ? 'With Source Lab'
    : 'Not sent yet';

  const subline = approved ? (lane.attemptNo > 1
      ? `Approved on attempt ${lane.attemptNo}.` : 'Approved first time — nothing outstanding.')
    : notRequired ? 'Source Lab have said this sample is not needed.'
    : reworking ? `We rejected v${lane.attemptNo - 1}${lane.lastRejection?.rejected_at ? ` on ${fmt(lane.lastRejection.rejected_at)}` : ''}. v${lane.attemptNo} hasn't arrived yet.`
    : lane.status === 'RECEIVED' ? 'It has arrived and is waiting on a decision from us.'
    : 'Nothing received against this sample yet.';

  const tone = approved ? 'ok' : notRequired ? 'mute' : reworking ? 'warn' : 'info';
  const band = {
    ok:   'bg-emerald-50 ring-emerald-200 text-emerald-900',
    warn: 'bg-amber-50 ring-amber-200 text-amber-900',
    info: 'bg-blue-50 ring-blue-200 text-blue-900',
    mute: 'bg-gray-50 ring-gray-200 text-gray-700',
  }[tone];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6
                    bg-gray-900/60 overflow-y-auto"
         role="dialog" aria-modal="true"
         onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden my-auto">

        <header className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', tag.cls)}>{tag.short}</span>
              {lane.attemptNo > 1 && (
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums',
                  lane.attemptNo >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                  v{lane.attemptNo}
                </span>
              )}
              <h2 className="text-[17px] font-extrabold text-gray-900 leading-tight">{component.name}</h2>
            </div>
            <p className="text-[12px] text-gray-500 mt-1 truncate">
              <span className="font-mono">{order.style_code || `#${order.id}`}</span>
              {order.description && <> · {order.description}</>}
              {order.colour && <> · {order.colour}</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* Facts — pinned, don't move */}
          <div className="p-5 sm:border-r border-b sm:border-b-0 border-gray-100 bg-gray-50/40">
            <div className={cn('rounded-lg ring-1 px-3 py-2.5 flex items-center gap-3', band)}>
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold leading-tight">{headline}</div>
                <div className="text-[11.5px] opacity-80 mt-0.5">{subline}</div>
              </div>
              {!approved && !notRequired && (
                <div className="ml-auto text-right flex-shrink-0">
                  <div className="text-[19px] font-extrabold tabular-nums leading-none">{waitingDays}</div>
                  <div className="text-[9px] uppercase tracking-wider opacity-75">days</div>
                </div>
              )}
              {approved && lane.approved && (
                <div className="ml-auto text-right flex-shrink-0">
                  <div className="text-[13px] font-extrabold leading-none">{fmt(lane.approved)}</div>
                  <div className="text-[9px] uppercase tracking-wider opacity-75 mt-1">approved</div>
                </div>
              )}
            </div>

            <SectionLabel>This style</SectionLabel>
            <Facts rows={[
              ['PO', order.po_number, true],
              ['Customer', order.customer, false],
              ['Orderbook', order.china_orderbook_ref, false],
              ['Ex-factory', fmt(exFac), false],
            ]} />

            <SectionLabel>Component</SectionLabel>
            <Facts rows={[
              ['Sample type', SAMPLE_LABEL[component.sample_type] || component.sample_type, false],
              // The spec reference is how the factory files these -- it is the
              // one field they asked for by name. Stored in spec_url, which the
              // UI has always labelled "Spec" because people put a reference in
              // it far more often than a link.
              ['Spec', detail?.spec_url, true],
              ['Colour', detail?.colour || order.colour, false],
              ['Placement', (() => {
                try {
                  const pos = typeof detail?.position === 'string'
                    ? JSON.parse(detail.position) : detail?.position;
                  return Array.isArray(pos) ? pos.join(', ') : pos || null;
                } catch { return detail?.position || null; }
              })(), false],
              // "Received" on its own is ambiguous in a factory-facing view --
              // received by whom. The journey step beside it already says
              // "received by Source Lab", so this matches it.
              ['Received by Source Lab', fmt(lane.received), false],
              ['Approved', fmt(lane.approved), false],
            ]} />

            {(detail?.description || detail?.supplier_notes) && (
              <>
                <SectionLabel>Brief</SectionLabel>
                {detail.description && (
                  <p className="text-[12.5px] text-gray-700 leading-relaxed">{detail.description}</p>
                )}
                {detail.supplier_notes && (
                  <p className="text-[12.5px] text-gray-700 leading-relaxed mt-2 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2">
                    {detail.supplier_notes}
                  </p>
                )}
              </>
            )}

            {comments.length > 0 && (
              <>
                {/* Comments belong to the style, not to this component -- the
                    table has no component_id -- so say so rather than letting
                    them read as notes about this print. */}
                <SectionLabel>Comments on this style</SectionLabel>
                <ul className="space-y-2">
                  {comments.slice(-4).map((c: any) => (
                    <li key={c.id} className="rounded-lg bg-gray-50 ring-1 ring-gray-200 px-3 py-2">
                      <p className="text-[12.5px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {c.comment_text}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {c.source === 'supplier' ? 'Factory' : 'Source Lab'}
                        {c.user_name ? ` · ${c.user_name}` : ''}
                        {fmt(c.created_at) ? ` · ${fmt(c.created_at)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                {comments.length > 4 && (
                  <p className="text-[11.5px] text-gray-500 mt-1.5">
                    Showing the last 4 of {comments.length} — open the style for the rest.
                  </p>
                )}
              </>
            )}

            {!approved && !notRequired && (
              <div className="mt-4 rounded-lg bg-primary-50 ring-1 ring-primary-200 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">Next</p>
                <p className="text-[12px] text-primary-900/90 mt-1 leading-relaxed">
                  {reworking
                    ? <>Remake against the reason and send it in. <b>v{lane.attemptNo} is already open on this
                        component</b> — don&apos;t add a new one, a duplicate splits the history.</>
                    : <>Send the sample in. Source Lab record it when it lands.</>}
                </p>
              </div>
            )}
          </div>

          {/* The journey */}
          <div className="p-5 min-w-0">
            <SectionLabel first>The journey</SectionLabel>
            <ol className="ml-1 border-l-2 border-gray-100 pl-4 mt-2">
              {order.order_sent_to_factory_date && (
                <Step when={fmt(order.order_sent_to_factory_date) || '—'} what="Order sent to you" />
              )}
              {lane.lastRejection?.rejected_at && (
                <>
                  {/* Only when we know the date. Rejecting clears the received
                      column -- correctly, since the next attempt hasn't arrived
                      -- so the earlier attempt's arrival date survives only in
                      sample_submissions.submitted_at, which this payload does
                      not carry. A step reading "—" is worse than no step. */}
                  {fmt(lane.lastRejection.submitted_at) && (
                    <Step when={fmt(lane.lastRejection.submitted_at)!}
                          what={`v${lane.attemptNo - 1} received by Source Lab`} />
                  )}
                  <Step tone="bad" when={fmt(lane.lastRejection.rejected_at) || '—'}
                        what={`v${lane.attemptNo - 1} rejected`}>
                    <div className="mt-1.5 rounded-lg bg-red-50 ring-1 ring-red-100 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                        {REASON_LABEL[lane.lastRejection.reason || ''] || lane.lastRejection.reason || 'Rejected'}
                      </p>
                      {lane.lastRejection.notes && (
                        <p className="text-[12.5px] text-gray-700 mt-1 leading-relaxed">{lane.lastRejection.notes}</p>
                      )}
                      {lane.lastRejection.rejected_by && (
                        <p className="text-[11px] text-gray-500 mt-1.5">
                          Source Lab · {lane.lastRejection.rejected_by}
                        </p>
                      )}
                    </div>
                  </Step>
                </>
              )}
              {lane.received && (
                <Step when={fmt(lane.received) || '—'}
                      what={lane.attemptNo > 1
                        ? `v${lane.attemptNo} received by Source Lab`
                        : 'Sample received by Source Lab'} />
              )}
              {approved ? (
                <Step tone="ok" when={fmt(lane.approved) || '—'} what={`v${lane.attemptNo} approved`} last />
              ) : notRequired ? (
                <Step tone="mute" when="—" what="Marked not required" last />
              ) : (
                <Step tone="now" when={`Now · ${waitingDays} working days`}
                      what={lane.received
                        ? `v${lane.attemptNo} with Source Lab`
                        : `v${lane.attemptNo} outstanding`} last>
                  <p className="text-[12px] text-gray-500 mt-1">
                    {lane.received
                      ? 'Received — waiting on a decision from Source Lab.'
                      : `Nothing received against attempt ${lane.attemptNo}.`}
                  </p>
                </Step>
              )}
            </ol>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 bg-gray-50/70 flex items-center gap-3 flex-wrap">
          <span className="text-[11.5px] text-gray-500">Status and dates are set by Source Lab.</span>
          {onOpenStyle && (
            <button
              onClick={() => onOpenStyle(order.id)}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]
                         font-semibold text-gray-700 bg-white ring-1 ring-gray-200 hover:bg-gray-50"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open style
            </button>
          )}
          <button
            onClick={onClose}
            className={cn('px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-primary-600 hover:bg-primary-700',
              !onOpenStyle && 'ml-auto')}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', first ? 'mt-0' : 'mt-5')}>
      <span className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400">{children}</span>
      <span className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function Facts({ rows }: { rows: [string, string | null | undefined, boolean][] }) {
  return (
    <table className="w-full mt-2 text-[12.5px]">
      <tbody>
        {rows.map(([k, v, mono]) => (
          <tr key={k}>
            <td className="py-1 text-[11.5px] text-gray-400 align-top w-[44%] pr-2">{k}</td>
            <td className={cn('py-1 align-top', v ? 'font-semibold text-gray-800' : 'text-gray-400',
              mono && 'font-mono tabular-nums')}>
              {v || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Step({
  when, what, children, tone = 'plain', last,
}: {
  when: string; what: string; children?: React.ReactNode;
  tone?: 'plain' | 'bad' | 'ok' | 'now' | 'mute'; last?: boolean;
}) {
  const dot = {
    plain: 'bg-white border-gray-300',
    bad: 'bg-red-500 border-red-500',
    ok: 'bg-emerald-500 border-emerald-500',
    now: 'bg-amber-500 border-amber-500 ring-4 ring-amber-100',
    mute: 'bg-gray-300 border-gray-300',
  }[tone];
  return (
    <li className={cn('relative list-none', last ? 'pb-0' : 'pb-4')}>
      <span className={cn('absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full border-2', dot)} />
      <div className="text-[10.5px] text-gray-400 tabular-nums">{when}</div>
      <div className="text-[13px] font-semibold text-gray-800 mt-0.5">{what}</div>
      {children}
    </li>
  );
}
