'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseISO, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { avatarColour, avatarInitials } from '@/lib/avatar';

interface Reader {
  username: string;
  full_name?: string | null;
  read_at: string;
}

/**
 * Avatar stack with hover/click popup listing every reader. The popup is
 * rendered via a portal anchored to document.body so it escapes any parent
 * overflow:hidden clipping (e.g. the comment card's rounded clip). Position
 * is computed from the trigger's bounding box on open + window resize.
 */
export function SeenByStack({ readers }: { readers: Reader[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Recompute popup position whenever it opens, on scroll, or on window resize.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Place popup ABOVE the trigger by default (the trigger usually sits at
      // the bottom of a card and there's more room going up).
      setPos({ left: r.left, top: r.top - 8 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true); // capture phase to catch nested scrolls
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Click-outside dismissal — checks both trigger and popup so hovering between
  // them doesn't immediately close.
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

  if (!readers || readers.length === 0) return null;

  const visible = readers.slice(0, 3);
  const overflow = readers.length - visible.length;

  const popup = open && pos ? createPortal(
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transform: 'translateY(-100%)',
      }}
      className="z-[100] bg-white text-gray-800 rounded-lg shadow-lg ring-1 ring-gray-200 px-3 py-2.5 min-w-[220px] max-w-[280px] max-h-[280px] overflow-y-auto"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">
        Read by {readers.length}
      </div>
      <ul className="space-y-1.5">
        {readers.map((r) => {
          let when = '';
          try { when = formatDistanceToNow(parseISO(r.read_at), { addSuffix: true }); } catch {}
          return (
            <li key={r.username} className="flex items-center gap-2.5 text-[11px]">
              <span className={cn('w-5 h-5 rounded-full text-white text-[8px] font-semibold flex items-center justify-center flex-shrink-0', avatarColour(r.username))}>
                {avatarInitials(r.full_name || r.username)}
              </span>
              <span className="flex-1 font-medium text-gray-800 truncate">{r.full_name || r.username}</span>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{when}</span>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <span
      className="inline-flex items-center gap-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="text-[10px] text-gray-500">Seen by</span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center -space-x-1 cursor-pointer"
        aria-label={`Read by ${readers.length} ${readers.length === 1 ? 'person' : 'people'}`}
      >
        {visible.map((r) => (
          <span
            key={r.username}
            className={cn(
              'w-4 h-4 rounded-full ring-2 ring-white text-white text-[7px] font-semibold flex items-center justify-center',
              avatarColour(r.username)
            )}
            title={r.full_name || r.username}
          >
            {avatarInitials(r.full_name || r.username)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="w-4 h-4 rounded-full ring-2 ring-white bg-gray-700 text-white text-[7px] font-semibold flex items-center justify-center">
            +{overflow}
          </span>
        )}
      </button>
      <span className="text-[10px] text-gray-400">{readers.length} reader{readers.length === 1 ? '' : 's'}</span>
      {popup}
    </span>
  );
}
