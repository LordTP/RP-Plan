/**
 * Frontend counterpart of backend/date_notes.py. A tiny set of date
 * fields accept free text like "ASAP" alongside real dates — the value
 * lives in either the date column or the date_notes map, never both.
 * These helpers hide the routing so display / edit sites don't care.
 */

import { format, parseISO, isValid } from 'date-fns';
import type { Order } from '@/types';

/** Mirrors backend DATE_NOTE_FIELDS. Kept narrow on purpose. */
export const NOTE_ELIGIBLE_FIELDS = new Set([
  'original_del_date_to_customer',
  'original_po_ex_factory',
  'revised_po_ex_factory',
  'factory_confirmed_ex_factory',
]);

/** Note text (if set) OR formatted date OR empty string. Use for
 *  read-only display sites. */
export function displayDateOrNote(order: Order, fieldKey: string): string {
  const note = order.date_notes?.[fieldKey];
  if (note) return note;
  const raw = (order as any)[fieldKey] as string | null | undefined;
  if (!raw) return '';
  try {
    const d = parseISO(raw);
    if (isValid(d)) return format(d, 'd MMM yyyy');
  } catch { /* fall through */ }
  return raw;
}

/** Note text (if set) OR ISO date string OR empty. Use as the initial
 *  value for the DatePickerInput / editor — the raw text form the user
 *  can type against. */
export function rawDateOrNote(order: Order, fieldKey: string): string {
  const note = order.date_notes?.[fieldKey];
  if (note) return note;
  const raw = (order as any)[fieldKey] as string | null | undefined;
  return raw || '';
}
