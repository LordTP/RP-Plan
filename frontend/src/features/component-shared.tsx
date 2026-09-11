'use client';

/**
 * Shared model + chrome for the /components surfaces.
 *
 * Lifted out of InProgressTab when the page moved to a flat worklist, so the
 * worklist and the library table read the same status rules instead of each
 * carrying a copy. Anything that decides what a sample "is" belongs here.
 */

import { useEffect, useState } from 'react';
import { X, ChevronUp, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { businessDaysBetween, businessDaysUntil, isSampleDone } from '@/lib/sampleStatus';
import type { Order, OrderComponent, ComponentSampleType } from '@/types';

export const STALE_BIZ_DAYS = 14;
export const EX_FAC_URGENT_BIZ_DAYS = 7;
export const HARD_ATTENTION_STATUSES = new Set(['REJECTED', 'LATE', 'P23 ADVISE UPDATE']);

export const SHIPPED_STATUSES = new Set([
  'Shipped', 'In Transit',
  'Delivered', 'Delivered to UK', 'Delivered to Customer',
  'Complete', 'Completed',
]);

export type Instance = { order: Order; component: OrderComponent };
export type TypeFilter = 'all' | ComponentSampleType;

/** A component is strictly one sample type, so "the" status is the one
 *  belonging to its own lane. Reading the other lanes' columns would surface
 *  values no UI ever writes. */
export function activeSampleFor(component: OrderComponent) {
  const t = component.sample_type;
  const status = (t === 'strike_off' ? component.strike_off_status
                : t === 'lab_dip'   ? component.lab_dip_status
                : component.label_status) || '';
  const approved = t === 'strike_off' ? component.strike_off_approved
                 : t === 'lab_dip'   ? component.lab_dip_approved
                 : component.label_approved;
  const received = t === 'strike_off' ? component.strike_off_received
                 : t === 'lab_dip'   ? component.lab_dip_received
                 : component.label_received;
  return { status: status.trim().toUpperCase(), approved, received };
}

/** Attempt rollup for the component's own sample lane. Defaults to v1 / 0,
 *  matching the backend, so a never-rejected sample reads as attempt 1. */
export function attemptFor(component: OrderComponent) {
  const t = component.sample_type;
  const attemptNo = (t === 'strike_off' ? component.strike_off_attempt_no
                   : t === 'lab_dip'   ? component.lab_dip_attempt_no
                   : component.label_attempt_no) ?? 1;
  const rejectionCount = (t === 'strike_off' ? component.strike_off_rejection_count
                        : t === 'lab_dip'   ? component.lab_dip_rejection_count
                        : component.label_rejection_count) ?? 0;
  return { attemptNo, rejectionCount };
}

export function isNeedsAttention(inst: Instance): boolean {
  const { order, component } = inst;
  const { status } = activeSampleFor(component);
  if (HARD_ATTENTION_STATUSES.has(status)) return true;
  const updatedDays = component.updated_at ? businessDaysBetween(component.updated_at, new Date()) : 0;
  if (status === 'OUTSTANDING' && updatedDays >= STALE_BIZ_DAYS) return true;
  const exFac = order.revised_po_ex_factory || order.original_po_ex_factory;
  const daysToExFac = businessDaysUntil(exFac);
  if (daysToExFac !== null && daysToExFac <= EX_FAC_URGENT_BIZ_DAYS) return true;
  return false;
}

/** In-flight means: needed, not finished. NOT REQUIRED and anything already
 *  approved drop out — they're not work. */
export function isInFlight(inst: Instance, hideShipped: boolean): boolean {
  const { status, approved } = activeSampleFor(inst.component);
  if (status === 'NOT REQUIRED') return false;
  if (isSampleDone(status, approved)) return false;
  if (hideShipped && SHIPPED_STATUSES.has(inst.order.status || '')) return false;
  return true;
}

export function isStale(inst: Instance): boolean {
  const { status } = activeSampleFor(inst.component);
  if (status !== 'OUTSTANDING') return false;
  const days = inst.component.updated_at ? businessDaysBetween(inst.component.updated_at, new Date()) : 0;
  return days >= STALE_BIZ_DAYS;
}

export function isExFacUrgent(inst: Instance): boolean {
  const exFac = inst.order.revised_po_ex_factory || inst.order.original_po_ex_factory;
  const d = businessDaysUntil(exFac);
  return d !== null && d <= EX_FAC_URGENT_BIZ_DAYS;
}

/** Business days since the sample last moved. This is the chase clock. */
export function ageDays(inst: Instance): number {
  return inst.component.updated_at ? businessDaysBetween(inst.component.updated_at, new Date()) : 0;
}

export function statusPillStyle(status: string | null | undefined) {
  const s = (status || '').trim().toUpperCase();
  switch (s) {
    case 'APPROVED':          return { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved' };
    case 'NOT REQUIRED':      return { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Not required' };
    case 'OUTSTANDING':       return { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Outstanding' };
    case 'RECEIVED':          return { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Received' };
    case 'REJECTED':          return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected' };
    case 'LATE':              return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Late' };
    case 'P23 ADVISE UPDATE': return { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Advise update' };
    case '':                  return { bg: 'bg-gray-100',   text: 'text-gray-400',   label: 'Not started' };
    default:                  return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: status as string };
  }
}

export function sampleTypeLabel(t: ComponentSampleType) {
  return t === 'strike_off' ? 'SO' : t === 'lab_dip' ? 'LD' : 'LB';
}

export function sampleTypeFullLabel(t: ComponentSampleType) {
  return t === 'strike_off' ? 'Strike Off' : t === 'lab_dip' ? 'Lab Dip' : 'Label';
}

export function sampleTypeChipBg(t: ComponentSampleType) {
  return t === 'strike_off' ? 'bg-amber-100 text-amber-700'
       : t === 'lab_dip'    ? 'bg-cyan-100 text-cyan-700'
       :                       'bg-fuchsia-100 text-fuchsia-700';
}

// ─────────────────────────────────────────────────────────────────────────
// Chrome
// ─────────────────────────────────────────────────────────────────────────

/** Right-hand drawer. Mounts hidden, then transitions in on the next frame —
 *  a CSS transition needs two committed states to animate between, so setting
 *  the shown class during the same paint as the mount does nothing. */
export function SideDrawer({
  open, onClose, width = 'max-w-3xl', children,
}: {
  open: boolean;
  onClose: () => void;
  width?: string;
  children: React.ReactNode;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) { setEntered(false); return; }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className={cn('absolute inset-0 bg-gray-900/30 transition-opacity duration-300', entered ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative h-full w-full bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out',
          width,
          entered ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerHeader({
  eyebrow, title, subtitle, onClose, onPrev, onNext, position, children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3 border-b border-gray-100 flex items-start gap-3 flex-shrink-0">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-widest text-primary-600 font-bold">{eyebrow}</div>
        )}
        <div className="text-[17px] font-bold text-gray-900 leading-tight truncate">{title}</div>
        {subtitle && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{subtitle}</div>}
      </div>
      {children}
      {(onPrev || onNext) && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {position && <span className="text-[10px] text-gray-400 tabular-nums mr-1">{position}</span>}
          <button
            onClick={onPrev}
            disabled={!onPrev}
            className="p-1 rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Previous"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onNext}
            disabled={!onNext}
            className="p-1 rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Next"
          >
            <ChevronDownIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      <button
        onClick={onClose}
        className="p-1 rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 flex-shrink-0"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
