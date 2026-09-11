'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
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

type ApplyMode = 'single' | 'all' | 'selected';

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
  const [mode, setMode] = useState<ApplyMode>('single');
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

  const totalIfBulk = mode === 'all' ? 1 + siblings.length : 1 + selectedIds.size;
  const prettyLabel = fieldLabel || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const handleSubmit = async () => {
    if (!ctx) return;
    if (mode === 'single') {
      // Parent's onSavedSingle calls handleSave which closes the editor.
      onSavedSingle(value);
      return;
    }
    setSaving(true);
    try {
      const orderIds = mode === 'all'
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6"
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-xl shadow-xl ring-1 ring-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Edit</div>
            <h3 className="text-sm font-bold text-gray-900 truncate">{prettyLabel}</h3>
          </div>
          <button onClick={onCancel} disabled={saving} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Value input */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 block">Value</label>
            {options ? (
              <select
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                autoFocus
                className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">— Select —</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : type === 'date' ? (
              <DatePickerInput value={value} onChange={setValue} variant="block" size="sm" />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            )}
          </div>

          {/* Scope picker — only shown if there are siblings on the PO */}
          {showSiblings && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 block">Apply to</label>
              <div className="space-y-1">
                <ScopeRadio checked={mode === 'single'} onChange={() => setMode('single')} title="This style only" />
                <ScopeRadio checked={mode === 'all'} onChange={() => setMode('all')} title={`All styles on this PO (${1 + siblings.length})`} />
                <ScopeRadio checked={mode === 'selected'} onChange={() => setMode('selected')} title={`Select specific styles (${selectedIds.size + 1} of ${siblings.length + 1})`} />
                {mode === 'selected' && (
                  <div className="ml-5 mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-gray-50/40 divide-y divide-gray-100">
                    {siblings.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelected(s.id)}
                          className="w-3 h-3"
                        />
                        <span className="font-mono text-gray-700">{s.style_code}</span>
                        <span className="text-gray-500 truncate">{s.description}</span>
                        <span className="text-gray-400 ml-auto">{s.colour}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking sibling styles…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-md flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {mode === 'single' ? 'Save' : `Save · ${totalIfBulk} style${totalIfBulk === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
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
