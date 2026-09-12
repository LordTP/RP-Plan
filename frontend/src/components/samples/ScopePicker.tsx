'use client';

/**
 * The one "apply to" picker for sample actions.
 *
 * Three modals each carried their own copy of this: a private ScopeRadio, a
 * near-identical radio stack, and a private Sibling interface. They drifted,
 * and the drift mattered — RejectSampleModal listed "All styles on this PO"
 * FIRST and preselected it, so opening the reject modal and pressing Reject
 * rejected every sibling style. Approve, the safe one, defaulted to this
 * style only. The destructive action was the one that fanned out.
 *
 * So the default lives here now, exported as DEFAULT_SCOPE, and the option
 * order is fixed: narrowest first. Fanning out to a whole PO should be
 * something you chose, not something you failed to notice.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ApplyScope = 'single' | 'all_on_po' | 'selected';

/** Always the narrowest scope. Widening is a decision; it shouldn't be a
 *  default that a distracted user inherits. */
export const DEFAULT_SCOPE: ApplyScope = 'single';

export interface Sibling {
  order_id: number;
  component_id: number | null;
  style_code: string | null;
  description: string | null;
  colour: string | null;
}

type Accent = 'blue' | 'emerald' | 'red';

const ACCENT: Record<Accent, { wash: string; border: string; title: string; sub: string; radio: string }> = {
  blue: {
    wash: 'bg-primary-50/60', border: 'border-primary-200',
    title: 'text-primary-800', sub: 'text-primary-700',
    radio: 'text-primary-600 focus:ring-primary-500',
  },
  emerald: {
    wash: 'bg-emerald-50/60', border: 'border-emerald-200',
    title: 'text-emerald-800', sub: 'text-emerald-700',
    radio: 'text-emerald-600 focus:ring-emerald-500',
  },
  red: {
    wash: 'bg-red-50/60', border: 'border-red-200',
    title: 'text-red-800', sub: 'text-red-700',
    radio: 'text-red-600 focus:ring-red-500',
  },
};

/** How many targets the current scope actually reaches, counting the style
 *  you started from. Shared so every caller's confirmation copy agrees. */
export function scopeTargetCount(
  scope: ApplyScope,
  siblingCount: number,
  selectedCount: number,
): number {
  if (scope === 'single') return 1;
  if (scope === 'all_on_po') return 1 + siblingCount;
  return 1 + selectedCount;
}

export function ScopePicker({
  scope,
  onScopeChange,
  siblings,
  loading,
  selectedOrderIds,
  onToggleSelected,
  styleCode,
  componentName,
  accent = 'blue',
  /** Verb for the no-siblings message, e.g. "rejection", "action". */
  actionNoun = 'action',
  label = 'Apply to',
}: {
  scope: ApplyScope;
  onScopeChange: (s: ApplyScope) => void;
  siblings: Sibling[];
  loading?: boolean;
  selectedOrderIds: Set<number>;
  onToggleSelected: (orderId: number) => void;
  styleCode?: string | null;
  componentName?: string | null;
  accent?: Accent;
  actionNoun?: string;
  label?: string;
}) {
  const siblingCount = siblings.length;
  const tone = ACCENT[accent];

  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
        {label}
      </label>

      {loading ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking sibling styles…
        </div>
      ) : siblingCount === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          No other styles on this PO {componentName ? `have "${componentName}"` : 'share this sample type'} — {actionNoun} applies to this style only.
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Narrowest first, always. */}
          <ScopeRadio
            checked={scope === 'single'}
            onChange={() => onScopeChange('single')}
            title="This style only"
            subtitle={styleCode ? `Just ${styleCode}` : 'Just the one you clicked'}
            tone={tone}
          />
          <ScopeRadio
            checked={scope === 'all_on_po'}
            onChange={() => onScopeChange('all_on_po')}
            title="All styles on this PO"
            subtitle={`${1 + siblingCount} styles${componentName ? ` with "${componentName}"` : ''}`}
            tone={tone}
          />
          <ScopeRadio
            checked={scope === 'selected'}
            onChange={() => onScopeChange('selected')}
            title="Select specific styles"
            subtitle={scope === 'selected'
              ? `${selectedOrderIds.size} of ${siblingCount} siblings ticked`
              : 'Pick which siblings to include'}
            tone={tone}
          />
          {scope === 'selected' && (
            <div className="ml-6 mt-2 border border-gray-200 rounded-lg bg-gray-50/40 max-h-40 overflow-y-auto divide-y divide-gray-100">
              {siblings.map((s) => (
                <label
                  key={s.order_id}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.has(s.order_id)}
                    onChange={() => onToggleSelected(s.order_id)}
                    className={cn('w-3.5 h-3.5 rounded border-gray-300', tone.radio)}
                  />
                  <span className="font-mono text-gray-700">{s.style_code || `#${s.order_id}`}</span>
                  <span className="text-gray-500 truncate">{s.description}</span>
                  <span className="text-gray-400 ml-auto truncate max-w-[90px]">{s.colour}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScopeRadio({
  checked, onChange, title, subtitle, tone,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
  tone: (typeof ACCENT)[Accent];
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
        checked ? cn(tone.wash, tone.border) : 'bg-white border-gray-200 hover:bg-gray-50',
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className={cn('mt-0.5 w-3.5 h-3.5 border-gray-300 focus:ring-offset-0', tone.radio)}
      />
      <div className="min-w-0">
        <div className={cn('text-xs font-semibold', checked ? tone.title : 'text-gray-800')}>{title}</div>
        <div className={cn('text-[11px]', checked ? tone.sub : 'text-gray-500')}>{subtitle}</div>
      </div>
    </label>
  );
}
