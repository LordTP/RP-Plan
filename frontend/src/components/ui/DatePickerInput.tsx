'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { format, parseISO, isValid } from 'date-fns';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** ISO date string (YYYY-MM-DD) or empty string. */
  value: string;
  /** Fired with an ISO date string or empty string when cleared. */
  onChange: (value: string) => void;
  /** Optional: fires when the popover closes (matches native input.onBlur). */
  onBlur?: () => void;
  /** Auto-open the popover on mount — used when this picker replaces an
   *  inline-edit native input the user just clicked into. */
  autoFocus?: boolean;
  /** Visual size — sm matches the inline DetailRow input style; md matches a
   *  standalone form field (e.g. shipment drafts). */
  size?: 'sm' | 'md';
  /** Visual variant — 'inline' is the right-aligned inline-edit style used in
   *  DetailRow / TimelineItem; 'block' is a full-width input (forms). */
  variant?: 'inline' | 'block';
  placeholder?: string;
  disabled?: boolean;
  /** Allow clearing the value with an inline X button. */
  clearable?: boolean;
  className?: string;
}

/**
 * Drop-in replacement for `<input type="date">` that renders the same UI on
 * every OS — Mac, Windows, Linux, all browsers. The native input is fine on
 * Safari/Chrome on macOS but truly horrible on Windows + Firefox; this wraps
 * react-day-picker so we own the look.
 *
 * API matches the native input as closely as possible: ISO YYYY-MM-DD string
 * in `value`, ISO string out via `onChange` (or '' on clear).
 */
export function DatePickerInput({
  value,
  onChange,
  onBlur,
  autoFocus,
  size = 'sm',
  variant = 'inline',
  placeholder = 'Pick date',
  disabled,
  clearable = true,
  className,
}: Props) {
  const [open, setOpen] = useState(!!autoFocus);
  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Parse the ISO string into a Date object for react-day-picker. Empty string
  // → undefined so the calendar shows nothing selected.
  const selectedDate = (() => {
    if (!value) return undefined;
    try {
      const d = parseISO(value);
      return isValid(d) ? d : undefined;
    } catch { return undefined; }
  })();

  const formatted = selectedDate ? format(selectedDate, 'd MMM yyyy') : '';

  // Position the popover next to the trigger via a portal so it never gets
  // clipped by parent overflow:hidden (modal cards, comment bubbles, etc.).
  useLayoutEffect(() => {
    if (!open) { setPopupPos(null); return; }
    const update = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      // Default below + aligned to the trigger's left edge.
      let left = r.left;
      let top = r.bottom + 4;
      // If the popup would go off the right edge, anchor right instead.
      const popupWidth = 320;
      if (left + popupWidth > window.innerWidth - 8) {
        left = Math.max(8, r.right - popupWidth);
      }
      // If the popup would go off the bottom, flip above.
      const popupHeight = 380;
      if (top + popupHeight > window.innerHeight - 8) {
        top = Math.max(8, r.top - popupHeight - 4);
      }
      setPopupPos({ left, top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Click-outside closes the popover and fires onBlur. Skipped if the click
  // was inside the trigger or the popup.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
      onBlur?.();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onBlur]);

  // Esc closes the popover.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        onBlur?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onBlur]);

  const handleSelect = (d: Date | undefined) => {
    if (!d) {
      onChange('');
    } else {
      // Local-time ISO YYYY-MM-DD (so the displayed day matches what the user picked).
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      onChange(`${yyyy}-${mm}-${dd}`);
    }
    setOpen(false);
    onBlur?.();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    onBlur?.();
  };

  // Trigger styles vary by variant. 'inline' matches the existing DetailRow
  // inline-edit input (right-aligned, narrow, simple border); 'block' is a
  // standalone form field (full width, taller).
  const triggerClass = variant === 'block'
    ? cn(
        'w-full text-left flex items-center justify-between gap-2 rounded-md border bg-white transition-colors',
        size === 'sm' ? 'px-3 py-2 text-xs' : 'px-3 py-2 text-sm',
        disabled
          ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
          : 'border-gray-200 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 cursor-pointer',
        className
      )
    : cn(
        'inline-flex items-center justify-between gap-1.5 rounded-md border bg-white transition-colors',
        size === 'sm' ? 'px-2 py-1 text-xs w-[160px]' : 'px-2.5 py-1.5 text-xs w-[180px]',
        disabled
          ? 'border-gray-200 text-gray-400 cursor-not-allowed'
          : 'border-primary-300 hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer',
        className
      );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={triggerClass}
      >
        <span className={cn('flex items-center gap-1.5 min-w-0', !formatted && 'text-gray-400')}>
          <Calendar className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className="truncate">{formatted || placeholder}</span>
        </span>
        {clearable && formatted && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleClear}
            className="flex-shrink-0 p-0.5 -m-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Clear"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && popupPos && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', left: popupPos.left, top: popupPos.top, zIndex: 100 }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl ring-1 ring-gray-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            defaultMonth={selectedDate}
            weekStartsOn={1}
            classNames={{
              root: 'rdp-modern p-3 font-sans',
              months: 'flex flex-col',
              month_caption: 'text-sm font-semibold text-gray-800 mb-2 px-1',
              nav: 'flex items-center gap-1',
              button_previous: 'inline-flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 text-gray-600',
              button_next: 'inline-flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 text-gray-600',
              weekdays: 'grid grid-cols-7 mb-1',
              weekday: 'text-[10px] uppercase tracking-wider text-gray-400 font-semibold text-center w-8 py-1',
              week: 'grid grid-cols-7',
              day: 'p-0',
              day_button: 'w-8 h-8 text-xs rounded hover:bg-blue-50 hover:text-blue-700 text-gray-700',
              today: 'font-bold text-blue-600',
              selected: '!bg-blue-600 !text-white hover:!bg-blue-700',
              outside: 'text-gray-300',
              disabled: 'text-gray-200 cursor-not-allowed',
            }}
          />
          <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between bg-gray-50/50">
            <button
              type="button"
              onClick={() => handleSelect(new Date())}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              Today
            </button>
            {clearable && formatted && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); onBlur?.(); }}
                className="text-[11px] font-medium text-gray-500 hover:text-red-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
