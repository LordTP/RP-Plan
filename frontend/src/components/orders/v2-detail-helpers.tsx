'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseISO } from 'date-fns';
import { cn, formatDate } from '@/lib/utils';
import { DEFAULT_SCOPE, type ApplyScope } from '@/components/samples/ScopePicker';
import { ordersApi } from '@/lib/api';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { StatusDropdown } from '@/components/orders/StatusDropdown';

/**
 * Shared layout primitives for the V2 detail modal — used by both the
 * orders-v2 page (Sourcelab/internal view) and FactoryV2View (factory views).
 * Pure presentational, no state — each page owns its own data + section
 * composition, these just keep the look consistent.
 */

// ─── Bulk-scope context ────────────────────────────────────────────────
// Lets DetailRow / TimelineItem detect bulk-update context without
// threading PO + orderId props through every call site. The orders-v2
// DetailPanel wraps its content in a Provider; rows read from it.

export interface BulkScopeCtx {
  poNumber: string;
  currentOrderId: number;
  /** The style being edited. Optional so existing providers keep working; the
   *  editor falls back to "this style" when it isn't supplied. */
  currentStyleCode?: string | null;
  currentDescription?: string | null;
  onAfterBulkSave: () => void;
}

const BulkScopeContext = createContext<BulkScopeCtx | null>(null);

export function BulkScopeProvider({ children, ...ctx }: BulkScopeCtx & { children: React.ReactNode }) {
  return <BulkScopeContext.Provider value={ctx}>{children}</BulkScopeContext.Provider>;
}

export function useBulkScope(): BulkScopeCtx | null {
  return useContext(BulkScopeContext);
}

// ─── Inline bulk-scope editor ──────────────────────────────────────────
// Replaces the inline value-editor on bulkable fields. User picks the
// new value AND the apply-to scope in one go, then hits Save. Calls the
// /api/orders/bulk-update-date endpoint (which despite the name also
// accepts dropdown text fields like fcl_lcl + sample statuses).

interface BulkSibling {
  id: number;
  style_code: string;
  description: string;
  colour: string;
}

// Same three scopes as everywhere else — this file called the middle one
// 'all' where the sample modals call it 'all_on_po'.
type ApplyMode = ApplyScope;

export function InlineBulkScopeEditor({
  fieldKey,
  type,
  options,
  initialValue,
  fieldLabel,
  onSavedSingle,
  onCancel,
}: {
  fieldKey: string;
  type?: 'text' | 'date';
  options?: string[];
  initialValue: string;
  /** Display label — shown in the modal header. Defaults to a humanised fieldKey. */
  fieldLabel?: string;
  /** Called when the user chose "this style only" — parent handles single update via its own onSave path. */
  onSavedSingle: (value: string) => void;
  onCancel: () => void;
}) {
  const ctx = useBulkScope();
  const [value, setValue] = useState(initialValue);
  const [mode, setMode] = useState<ApplyMode>(DEFAULT_SCOPE);
  const [siblings, setSiblings] = useState<BulkSibling[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, saving]);

  // Fetch siblings on the same PO (excluding the current order). Start
  // with NOTHING pre-selected — otherwise switching to 'Select specific
  // styles' opens with every sibling already ticked, and the user has to
  // untick the ones they don't want (the opposite of what they expect).
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    setLoading(true);
    ordersApi.getStylesOnPO(ctx.poNumber)
      .then((res) => {
        if (cancelled) return;
        const others = res.orders.filter((o) => o.id !== ctx.currentOrderId);
        setSiblings(others);
        setSelectedIds(new Set());
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ctx]);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalIfBulk = mode === 'all_on_po' ? 1 + siblings.length : 1 + selectedIds.size;
  // Sentence case, not title case. Humanising the field key with a
  // capital-every-word pass turned specs_sent_to_factory into "Specs Sent To
  // Factory", which reads like a headline rather than a field name.
  const prettyLabel = fieldLabel || (() => {
    const words = fieldKey.replace(/_/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  })();

  const handleSubmit = async () => {
    if (!ctx) return;
    if (mode === 'single') {
      // Parent's onSavedSingle calls handleSave which closes the editor.
      onSavedSingle(value);
      return;
    }
    setSaving(true);
    try {
      const orderIds = mode === 'all_on_po'
        ? []  // empty list = all on PO
        : [ctx.currentOrderId, ...Array.from(selectedIds)];
      const result: any = await ordersApi.bulkUpdateDate(
        ctx.poNumber,
        fieldKey,
        value || null,
        orderIds,
      );
      // Backend field is `orders_updated` (the count of rows that ACTUALLY
      // changed — skips ones where the incoming value matched what was
      // already there). Fall back to selection count if the shape changes.
      // Older code read `updated_count`, which never existed on this endpoint,
      // so the toast always showed the total selected — misleading when
      // some rows were unchanged.
      const count = result?.orders_updated ?? totalIfBulk;
      const skipped = totalIfBulk - (result?.orders_updated ?? totalIfBulk);
      const suffix = skipped > 0 ? ` (${skipped} already matched)` : '';
      toast.success(`Updated ${count} style${count === 1 ? '' : 's'}${suffix}`);
      ctx.onAfterBulkSave();
      onCancel();  // close the modal — parent refreshes via the context callback
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Bulk update failed');
      setSaving(false);
    }
  };

  const showSiblings = !loading && siblings.length > 0;
  const styleLabel = ctx?.currentStyleCode || 'this style';

  // What Save will actually do, spelled out. The old footer said "Save · 14
  // styles" and nothing about the value, so the one irreversible detail --
  // what you are about to write, to how many rows -- was never stated.
  const shownValue = value
    ? (type === 'date' ? formatDate(value) : value)
    : 'nothing (clears it)';
  const scopeSummary = mode === 'single'
    ? styleLabel
    : `${totalIfBulk} style${totalIfBulk === 1 ? '' : 's'}`;

  // Portalled to the body. The detail panel slides in with a CSS transform, and
  // a transformed ancestor becomes the containing block for position:fixed --
  // so this overlay's inset-0 covered the panel rather than the viewport,
  // leaving the panel's own scrim exposed around it. A click there landed on
  // the scrim, closed the whole panel, and took the half-filled editor with it.
  // Escaping the transform is what makes "only the X closes it" actually true.
  return createPortal((
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Wide enough for the style picker to be usable. At max-w-sm the list of
          styles you were choosing between was a 384px column with a scrollbox
          inside it, which is the one part of this that needs room. */}
      <div
        className={cn(
          'w-full bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 overflow-hidden my-auto',
          showSiblings ? 'max-w-3xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — says what you are editing AND on what. */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-primary-600 font-bold">Edit</div>
            <h3 className="text-[17px] font-extrabold text-gray-900 leading-tight mt-0.5">{prettyLabel}</h3>
            <p className="text-[12px] text-gray-500 mt-1 truncate">
              {ctx?.currentStyleCode && <span className="font-mono">{ctx.currentStyleCode}</span>}
              {ctx?.currentDescription && <> · {ctx.currentDescription}</>}
              {ctx?.poNumber && <> · PO <span className="font-mono">{ctx.poNumber}</span></>}
            </p>
          </div>
          <button onClick={onCancel} disabled={saving} aria-label="Close"
                  className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className={cn(showSiblings && 'grid sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]')}>
          {/* ── 1 · the value ── */}
          <div className={cn('px-5 py-4', showSiblings && 'sm:border-r border-b sm:border-b-0 border-gray-100 bg-gray-50/40')}>
            <EditStepHeading n={1} title="New value" />
            <div className="mt-2.5">
              {options ? (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value.toUpperCase())}
                  autoFocus
                  className="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">— Select —</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : type === 'date' ? (
                <DatePickerInput value={value} onChange={setValue} variant="block" />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                  className="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              )}
            </div>
            {initialValue && (
              <p className="text-[11.5px] text-gray-500 mt-2">
                Currently <b className="text-gray-700">{type === 'date' ? formatDate(initialValue) : initialValue}</b>
              </p>
            )}
            {!initialValue && (
              <p className="text-[11.5px] text-gray-400 mt-2">Not set yet.</p>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-[11.5px] text-gray-400 mt-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking the rest of the PO…
              </div>
            )}
          </div>

          {/* ── 2 · who it applies to ── */}
          {showSiblings && (
            <div className="px-5 py-4 min-w-0">
              <EditStepHeading n={2} title="Apply to" />
              <div className="mt-2.5 space-y-1.5">
                <ScopeCard
                  on={mode === 'single'} onPick={() => setMode('single')}
                  title="This style only"
                  sub={ctx?.currentStyleCode || undefined}
                />
                <ScopeCard
                  on={mode === 'all_on_po'} onPick={() => setMode('all_on_po')}
                  title={`Every style on PO ${ctx?.poNumber ?? ''}`.trim()}
                  sub={`${1 + siblings.length} styles`}
                />
                <ScopeCard
                  on={mode === 'selected'} onPick={() => setMode('selected')}
                  title="Pick the styles"
                  sub={mode === 'selected'
                    ? `${selectedIds.size + 1} of ${siblings.length + 1} chosen`
                    : 'choose from the PO'}
                />
              </div>

              {mode === 'selected' && (
                <div className="mt-2.5 rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {siblings.length} other styles on this PO
                    </span>
                    <button
                      onClick={() => setSelectedIds(selectedIds.size === siblings.length
                        ? new Set() : new Set(siblings.map(x => x.id)))}
                      className="ml-auto text-[11px] font-semibold text-primary-600 hover:text-primary-700"
                    >
                      {selectedIds.size === siblings.length ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto divide-y divide-gray-50">
                    {/* The style being edited is always in scope, so it shows
                        as a fixed row rather than a checkbox you could untick
                        into a no-op. */}
                    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-primary-50/50 text-[12px]">
                      <span className="w-3.5 h-3.5 rounded bg-primary-600 flex-shrink-0" />
                      <span className="font-mono text-gray-800">{ctx?.currentStyleCode || 'This style'}</span>
                      <span className="ml-auto text-[10.5px] font-semibold text-primary-700">always</span>
                    </div>
                    {siblings.map((sib) => (
                      <label key={sib.id}
                             className="flex items-center gap-2.5 px-3 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(sib.id)}
                          onChange={() => toggleSelected(sib.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                        />
                        <span className="font-mono text-gray-700 flex-shrink-0">{sib.style_code}</span>
                        <span className="text-gray-500 truncate">{sib.description}</span>
                        {sib.colour && <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">{sib.colour}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — states the whole action before you commit it. */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/70 flex items-center gap-3 flex-wrap">
          <p className="text-[12px] text-gray-600 min-w-0">
            Sets <b className="text-gray-800">{prettyLabel.toLowerCase()}</b> to{' '}
            <b className="text-gray-800">{shownValue}</b> on <b className="text-gray-800">{scopeSummary}</b>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-1.5 text-[12px] font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

/** Tick / cross for an inline edit, so nothing is written until the person
 *  says so. Lives here rather than in either DetailRow because orders-v2 and
 *  FactoryV2View each carry their own copy of that component. */
export function ConfirmEdit({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      <button
        onClick={onSubmit}
        title="Submit"
        aria-label="Submit"
        className="p-1 rounded text-white bg-primary-600 hover:bg-primary-700"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={onCancel}
        title="Cancel"
        aria-label="Cancel"
        className="p-1 rounded text-gray-500 hover:bg-gray-100"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
}

function EditStepHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[18px] h-[18px] rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="text-[11.5px] uppercase tracking-widest text-gray-500 font-bold">{title}</span>
    </div>
  );
}

/** A scope choice with room to say what it means. The three tiny radios these
 *  replace made the most consequential decision in the modal -- how many rows
 *  this writes to -- its smallest element. */
function ScopeCard({ on, onPick, title, sub }: {
  on: boolean; onPick: () => void; title: string; sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2.5',
        on ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
           : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
      )}
    >
      <span className={cn('w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
        on ? 'border-primary-600' : 'border-gray-300')}>
        {on && <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-[12.5px] font-semibold', on ? 'text-primary-900' : 'text-gray-800')}>{title}</span>
        {sub && <span className="block text-[11px] text-gray-500 truncate">{sub}</span>}
      </span>
    </button>
  );
}


function ScopeRadio({ checked, onChange, title }: {
  checked: boolean;
  onChange: () => void;
  title: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="radio" checked={checked} onChange={onChange} className="w-3 h-3" />
      <span className={cn('text-[11px]', checked ? 'text-gray-900 font-medium' : 'text-gray-600')}>{title}</span>
    </label>
  );
}

export function HeroTile({ label, value, sub, tone }: {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className={cn('rounded-lg border px-3.5 py-3 min-w-0', tone || 'border-gray-200 bg-white')}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-none mb-1.5 truncate">{label}</div>
      <div className="text-base font-bold text-gray-900 leading-tight break-words">{value ?? '—'}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-1 leading-tight">{sub}</div>}
    </div>
  );
}

export function SectionPill({
  active, label, badge, badgeTone, onClick,
}: {
  active: boolean;
  label: string;
  badge?: string;
  badgeTone?: 'amber' | 'red' | 'blue';
  onClick: () => void;
}) {
  const badgeClass =
    badgeTone === 'red'  ? 'bg-red-100 text-red-700' :
    badgeTone === 'blue' ? 'bg-blue-100 text-blue-700' :
                           'bg-amber-100 text-amber-700';
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5',
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {label}
      {badge && (
        <span className={cn(
          'px-1 py-0 rounded text-[9px] font-bold',
          active ? 'bg-white/25 text-white' : badgeClass
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function SectionHeader({
  accent, label, badge, badgeTone,
}: {
  accent: 'blue' | 'amber' | 'teal' | 'violet';
  label: string;
  badge?: string;
  badgeTone?: 'amber' | 'red' | 'blue';
}) {
  const accentClass =
    accent === 'amber'  ? 'bg-amber-500' :
    accent === 'teal'   ? 'bg-teal-500' :
    accent === 'violet' ? 'bg-violet-500' :
                          'bg-blue-500';
  const badgeClass =
    badgeTone === 'red' ? 'bg-red-100 text-red-700' :
    badgeTone === 'blue' ? 'bg-blue-100 text-blue-700' :
                           'bg-amber-100 text-amber-700';
  return (
    <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className={cn('w-1 h-4 rounded-full', accentClass)} />
      {label}
      {badge && <span className={cn('text-[10px] px-1.5 py-0 rounded font-semibold', badgeClass)}>{badge}</span>}
    </h4>
  );
}

export function SectionDivider() {
  return <div className="px-6"><div className="border-t border-gray-200" /></div>;
}

/**
 * A sample card that leads with its STATUS.
 *
 * SampleCard below stacks Status, Received and Approved as identical
 * label/value rows, so the one thing you actually scan for — is this done? —
 * looks exactly like the two dates beside it. Six of those in a column is the
 * wall that made this section hard to read.
 *
 * Here the status is a coloured pill in the header and tints the card's edge,
 * so a glance down the section reads as green/amber/red rather than as prose.
 * The dates keep their DetailRows underneath, so editing is unchanged.
 */
export function SampleStatusCard({
  label, status, scope, attempt, empty, children,
}: {
  label: string;
  status: string | null | undefined;
  /** "order-level" etc — says where this sample lives. Leave it off when the
   *  card already sits inside a container that states the scope: the drawer
   *  wraps Fit and PPS in a box headed "ORDER-LEVEL · whole garment · not tied
   *  to a component", and repeating it per card pushed the status badge onto a
   *  second line on the longer title. */
  scope?: string;
  attempt?: React.ReactNode;
  /** Nothing recorded yet — no status, no dates. Collapses the rows behind a
   *  disclosure, because a sample nobody has touched was rendering four rows
   *  of "—". Two of those side by side is eight lines saying nothing, which
   *  dwarfed the component cards above them. */
  empty?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const s = (status || '').trim().toUpperCase();
  const tone =
    s === 'APPROVED' ? { edge: 'border-emerald-200', head: 'bg-emerald-50/70', pill: 'bg-emerald-100 text-emerald-800' }
    : s === 'NOT REQUIRED' ? { edge: 'border-gray-200', head: 'bg-gray-50', pill: 'bg-gray-100 text-gray-500' }
    : s === 'RECEIVED' ? { edge: 'border-blue-200', head: 'bg-blue-50/70', pill: 'bg-blue-100 text-blue-800' }
    : s === 'REJECTED' || s === 'LATE' ? { edge: 'border-red-200', head: 'bg-red-50/70', pill: 'bg-red-100 text-red-800' }
    : s ? { edge: 'border-amber-200', head: 'bg-amber-50/70', pill: 'bg-amber-100 text-amber-800' }
    : { edge: 'border-gray-200', head: 'bg-gray-50/60', pill: 'bg-gray-100 text-gray-400' };

  return (
    <div className={cn('rounded-lg border overflow-hidden bg-white', tone.edge)}>
      <div className={cn('px-3 py-2 border-b flex items-center gap-2', tone.edge, tone.head)}>
        {/* No wrap — the badge belongs on the title's line. A long title
            truncates instead of shunting the status onto a second row. */}
        <span className="text-[10.5px] uppercase tracking-wider font-bold text-gray-700 truncate">{label}</span>
        {scope && <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">{scope}</span>}
        {attempt}
        <span className={cn('ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap', tone.pill)}>
          {s || 'not set'}
        </span>
      </div>
      {empty && !open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full px-3 py-2 text-left text-[11px] text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Nothing recorded — click to set dates
        </button>
      ) : (
        <div className="divide-y divide-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

export function SampleCard({ label, highlight, children }: {
  label: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      'rounded-lg border overflow-hidden',
      highlight ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-white'
    )}>
      <div className={cn(
        'px-3 py-1.5 border-b text-[10px] uppercase tracking-wider font-semibold',
        highlight ? 'bg-amber-50/60 border-amber-100 text-amber-800' : 'bg-gray-50/60 border-gray-100 text-gray-600'
      )}>
        {label}
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}

/* ─── Journey ──────────────────────────────────────────────────────────
   Moved here from orders-v2 so the factory drawer uses the same timeline
   rather than its own older copy. The two had drifted: the factory one
   had no past/current/future dot states and no sub line, so its journey
   read as a column of dates rather than a timeline. */

export function TimelineItem({ label, date, note, highlight, editable, onSave, fieldKey, sub }: {
  label: string;
  date: string | null | undefined;
  /** Free-text override (e.g. "ASAP") — displayed in place of the date
   *  when set. Only relevant for note-eligible fields. */
  note?: string | null;
  highlight?: boolean;
  editable?: boolean;
  onSave?: (value: string) => void;
  fieldKey?: string;
  /** A quiet line under the step — what the date was derived from, or the
   *  attributes of that leg. The vessel details used to be their own strip of
   *  tiles above the timeline; they describe the sailing, so they belong on
   *  the sailing, not floating above the whole journey. */
  sub?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const hasDate = !!date || !!note;
  const bulkCtx = useBulkScope();
  const isBulkable = !!fieldKey && !!bulkCtx;

  // Past / future / unset, so scanning the journey tells you where the order
  // actually is. Every dot used to look the same whether the date had been and
  // gone or was months out, which made the timeline a list of dates in a
  // column rather than a timeline.
  //
  // A free-text note ("ASAP") counts as set but can't be placed in time, so it
  // reads as passed rather than pretending to a position it doesn't have.
  const past = (() => {
    if (!date) return !!note;
    try {
      const d = parseISO(String(date).split('T')[0]);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return d.getTime() <= today.getTime();
    } catch { return false; }
  })();

  const dotClass = !hasDate
    ? 'bg-white border-gray-200'
    : highlight
      ? 'bg-amber-500 border-amber-500 ring-4 ring-amber-100'
      : past
        ? 'bg-emerald-500 border-emerald-500'
        : 'bg-white border-primary-300';

  // The whole row is the target when the field is editable. It used to be the
  // value span alone, which on an unset date is a single grey em-dash -- a
  // ~10px hit area that reads as punctuation rather than a control, so the
  // commonest edit on this panel was also its best-hidden one.
  const openEditor = () => {
    if (!editable || editing) return;
    setDraft(note || (date ? String(date).split('T')[0] : ''));
    setEditing(true);
  };

  return (
    <div className="relative">
    <div
      onClick={openEditor}
      onKeyDown={(e) => {
        if (!editable || editing) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(); }
      }}
      role={editable && !editing ? 'button' : undefined}
      tabIndex={editable && !editing ? 0 : undefined}
      aria-label={editable && !editing ? `Edit ${label}` : undefined}
      className={cn(
        'flex items-center gap-3 py-2 relative group rounded-lg px-1 -mx-1 transition-colors',
        editable && !editing
          ? 'cursor-pointer hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-300'
          : 'hover:bg-gray-100',
      )}
    >
      <div className={cn('w-[15px] h-[15px] rounded-full border-2 flex-shrink-0 z-10', dotClass)}>
        {hasDate && !highlight && !past && <div className="w-full h-full rounded-full bg-primary-50" />}
      </div>
      <div className="flex-1 flex items-center justify-between min-w-0">
        <span className={cn(
          'text-xs',
          !hasDate ? 'text-gray-400' : highlight ? 'text-gray-900 font-bold' : 'text-gray-700 font-medium',
        )}>{label}</span>
        {editing && isBulkable && fieldKey ? (
          <InlineBulkScopeEditor
            fieldKey={fieldKey}
            type="date"
            initialValue={date ? date.split('T')[0] : ''}
            onSavedSingle={(v) => { onSave?.(v); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        ) : editing ? (
          /* Pick then confirm. onChange fires the moment a day is clicked in
             the calendar, so a misclick was already saved. */
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <DatePickerInput value={draft} onChange={setDraft} autoFocus size="sm" />
            <ConfirmEdit
              onSubmit={() => { onSave?.(draft); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </span>
        ) : (
          <span
            className={cn(
              'text-xs flex-shrink-0 ml-2 inline-flex items-center gap-1.5',
              hasDate ? 'text-gray-900 font-medium' : 'text-gray-300',
              editable && 'group-hover:text-primary-700',
            )}
          >
            {/* An unset editable field says so on hover. A bare em-dash gave no
                hint that anything could be done with the row. */}
            {!hasDate && editable
              ? <span className="text-gray-300 group-hover:text-primary-700">
                  <span className="group-hover:hidden">—</span>
                  <span className="hidden group-hover:inline font-semibold">Set date</span>
                </span>
              : (note || formatDate(date ?? null))}
            {editable && (
              <Pencil className="w-3 h-3 text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </span>
        )}
      </div>
    </div>
      {sub && (
        <div className="pl-[27px] -mt-1 pb-1 text-[10.5px] text-gray-400 leading-snug">{sub}</div>
      )}
    </div>
  );
}

/** A single non-date fact on the Journey — vessel, FCL/LCL, tracking ref.
 *  These came from the old Shipping section, where they sat as label/value
 *  rows among a dozen dates. They describe the shipping leg rather than being
 *  steps in it, so they read better as a strip above the timeline than as
 *  entries within it. */
export function JourneyFact({ label, value, mono }: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">{label}</span>
      <span className={cn(
        'text-[11.5px] truncate',
        value ? 'font-semibold text-gray-800' : 'text-gray-300',
        mono && value && 'font-mono',
      )}>
        {value || 'not set'}
      </span>
    </span>
  );
}
