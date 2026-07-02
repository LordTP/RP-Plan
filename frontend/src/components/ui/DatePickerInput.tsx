'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { format, parseISO, isValid } from 'date-fns';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * The stored value. Either an ISO date (YYYY-MM-DD or a fuller ISO
   * datetime), a free-text override like "ASAP" (for note-eligible fields),
   * or empty. The component doesn't decide which — it just displays what
   * it's given and lets the caller/backend route it.
   */
  value: string;
  /**
   * Emits either an ISO YYYY-MM-DD string, empty, or the raw text the
   * user typed if it doesn't parse as a date. Backend on note-eligible
   * fields routes the raw text into date_notes.
   */
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
  variant?: 'inline' | 'block';
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

/**
 * Cross-platform date input. Two ways in: type into the text input
 * (supports d/m/yyyy, yyyy-m-d, "27 Mar 2026", free text like "ASAP")
 * or click the calendar icon for a picker. Emits ISO YYYY-MM-DD on a
 * parseable date, empty on clear, or the raw text otherwise so the
 * backend can decide what to do with it.
 */
export function DatePickerInput({
  value,
  onChange,
  onBlur,
  autoFocus,
  size = 'sm',
  variant = 'inline',
  placeholder = 'Type or pick date',
  disabled,
  clearable = true,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(null);
  const [editValue, setEditValue] = useState<string>(() => initialEdit(value));
  const [focused, setFocused] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Keep the input in sync when `value` changes externally (e.g. the
  // parent set a new value via calendar or after a save round-trip).
  // But leave the user's in-progress typing alone — only sync when the
  // field isn't focused.
  useEffect(() => {
    if (!focused) setEditValue(initialEdit(value));
  }, [value, focused]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDate = parseAny(value);

  // Position the calendar popover via a portal so parent overflow:hidden
  // can't clip it (modals, dropdown menus, etc.).
  useLayoutEffect(() => {
    if (!open) { setPopupPos(null); return; }
    const update = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      setPopupPos({ left: r.left, top: r.bottom + 4 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Click-outside closes the calendar popover.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const parsed = parseAny(trimmed);
    if (parsed) {
      onChange(toISODate(parsed));
    } else {
      // Not a date — pass through as-is so the backend can decide (note
      // vs reject). Fields that don't accept notes will bounce it.
      onChange(trimmed);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    commit(editValue);
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(editValue);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(initialEdit(value));
      inputRef.current?.blur();
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    if (!d) {
      onChange('');
      setEditValue('');
    } else {
      const iso = toISODate(d);
      onChange(iso);
      setEditValue(format(d, 'd MMM yyyy'));
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setEditValue('');
  };

  // Wrapper styles match the variants used by callers today so the
  // component slots in without breaking any layout.
  const wrapperClass = variant === 'block'
    ? cn(
        'w-full flex items-center gap-1 rounded-md border bg-white transition-colors',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2 py-1.5 text-sm',
        disabled
          ? 'border-gray-200 bg-gray-50'
          : 'border-gray-200 hover:border-gray-300 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-400',
        className
      )
    : cn(
        'inline-flex items-center gap-1 rounded-md border bg-white transition-colors',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs w-[170px]' : 'px-2 py-1 text-xs w-[190px]',
        disabled
          ? 'border-gray-200 bg-gray-50'
          : 'border-primary-300 hover:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20',
        className
      );

  return (
    <>
      <div ref={triggerRef} className={wrapperClass}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'flex-1 min-w-0 outline-none bg-transparent',
            disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-800 placeholder:text-gray-400',
          )}
        />
        {clearable && editValue && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Clear"
            tabIndex={-1}
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          className="flex-shrink-0 p-0.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded"
          title="Pick from calendar"
          tabIndex={-1}
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && popupPos && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', left: popupPos.left, top: popupPos.top, zIndex: 100 }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl ring-1 ring-gray-100 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <DayPicker
            mode="single"
            selected={selectedDate ?? undefined}
            onSelect={handleCalendarSelect}
            defaultMonth={selectedDate ?? undefined}
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
              onClick={() => handleCalendarSelect(new Date())}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              Today
            </button>
            {clearable && editValue && (
              <button
                type="button"
                onClick={() => { onChange(''); setEditValue(''); setOpen(false); }}
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

// ─── helpers ───────────────────────────────────────────────────────────

/** What to show in the input when we haven't been touched yet. Formats
 *  a parseable date as "27 Mar 2026" so it reads nicely; passes free
 *  text (e.g. "ASAP") through unchanged. */
function initialEdit(value: string): string {
  if (!value) return '';
  const parsed = parseAny(value);
  if (parsed) return format(parsed, 'd MMM yyyy');
  return value;
}

/** Try several date formats. Returns null if nothing parsed. */
function parseAny(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO first (handles both YYYY-MM-DD and full datetime).
  try {
    const iso = parseISO(trimmed);
    if (isValid(iso)) return iso;
  } catch { /* fall through */ }

  // d/m/yyyy and d-m-yyyy — common UK entry.
  const dmY = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmY) {
    const d = parseInt(dmY[1], 10);
    const m = parseInt(dmY[2], 10);
    let y = parseInt(dmY[3], 10);
    if (y < 100) y += 2000;  // "26" → 2026
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d);
      if (isValid(dt)) return dt;
    }
  }

  // "27 Mar 2026" / "27 March 2026" via a permissive Date.parse.
  const flexible = new Date(trimmed);
  if (isValid(flexible)) return flexible;

  return null;
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
