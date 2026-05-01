'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Check, Inbox, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionsApi, type SampleType } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DatePickerInput } from '@/components/ui/DatePickerInput';

type ActionKind = 'approve' | 'markReceived';

interface Props {
  kind: ActionKind;
  orderId: number;
  componentId: number | null;
  componentName: string | null;
  styleCode: string | null;
  sampleType: SampleType;
  attemptNo: number;
  onClose: () => void;
  onDone: () => void;
}

type ApplyScope = 'single' | 'all_on_po' | 'selected';

interface Sibling {
  order_id: number;
  component_id: number | null;
  style_code: string | null;
  description: string | null;
  colour: string | null;
}

const SAMPLE_LABEL: Record<SampleType, string> = {
  fit: 'Fit Sample',
  strike: 'Strike Off',
  lab: 'Lab Dip',
  pps: 'PPS',
};

export function ScopeActionModal({
  kind,
  orderId,
  componentId,
  componentName,
  styleCode,
  sampleType,
  attemptNo,
  onClose,
  onDone,
}: Props) {
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [loadingSiblings, setLoadingSiblings] = useState(true);
  const [applyScope, setApplyScope] = useState<ApplyScope>('single');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [receivedAt, setReceivedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    submissionsApi
      .getSiblings({ order_id: orderId, component_id: componentId, sample_type: sampleType })
      .then((res) => {
        if (cancelled) return;
        setSiblings(res.siblings);
        setSelectedOrderIds(new Set(res.siblings.map((s) => s.order_id)));
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoadingSiblings(false); });
    return () => { cancelled = true; };
  }, [orderId, componentId, sampleType]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, submitting]);

  const siblingCount = siblings.length;
  const effectiveCount = useMemo(() => {
    if (applyScope === 'single') return 1;
    if (applyScope === 'all_on_po') return 1 + siblingCount;
    return 1 + selectedOrderIds.size;
  }, [applyScope, siblingCount, selectedOrderIds.size]);

  const toggleSelected = (id: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const scope = applyScope;
    const order_ids = applyScope === 'selected' ? Array.from(selectedOrderIds) : undefined;
    try {
      if (kind === 'approve') {
        const result = await submissionsApi.approve({
          order_id: orderId,
          component_id: componentId,
          sample_type: sampleType,
          apply_scope: scope,
          apply_to_order_ids: order_ids,
        });
        toast.success(result.applied_to_count > 1 ? `Approved on ${result.applied_to_count} styles` : 'Approved');
      } else {
        const result = await submissionsApi.markReceived({
          order_id: orderId,
          component_id: componentId,
          sample_type: sampleType,
          received_at: receivedAt,
          apply_scope: scope,
          apply_to_order_ids: order_ids,
        });
        toast.success(result.applied_to_count > 1 ? `Marked received on ${result.applied_to_count} styles` : 'Marked received');
      }
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Action failed');
      setSubmitting(false);
    }
  };

  const isApprove = kind === 'approve';
  const headerIcon = isApprove ? <Check className="w-5 h-5 text-emerald-600" /> : <Inbox className="w-5 h-5 text-blue-600" />;
  const headerBg = isApprove ? 'bg-emerald-100' : 'bg-blue-100';
  const kickerLabel = isApprove ? `Approve ${SAMPLE_LABEL[sampleType]} · v${attemptNo}` : `Mark ${SAMPLE_LABEL[sampleType]} received · v${attemptNo}`;
  const primaryBtnClasses = isApprove
    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';
  const actionVerb = isApprove ? 'Approve' : 'Mark received';
  const contextLine = componentName || 'Order-level sample';
  const subline = styleCode ? `Clicked from ${styleCode}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', headerBg)}>
              {headerIcon}
            </div>
            <div className="min-w-0">
              <div className={cn('text-[10px] font-semibold uppercase tracking-wide mb-0.5', isApprove ? 'text-emerald-700' : 'text-blue-700')}>
                {kickerLabel}
              </div>
              <h3 className="text-base font-bold text-gray-900 truncate">{contextLine}</h3>
              {subline && <div className="text-[11px] text-gray-500 truncate">{subline}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {!isApprove && (
            <div>
              <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
                Received date
              </label>
              <DatePickerInput value={receivedAt} onChange={setReceivedAt} variant="block" size="sm" />
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Apply to
            </label>
            {loadingSiblings ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking sibling styles…
              </div>
            ) : siblingCount === 0 ? (
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                No other styles on this PO {componentName ? `have "${componentName}"` : 'share this sample type'} — action applies to this style only.
              </div>
            ) : (
              <div className="space-y-1.5">
                <ScopeRadio
                  checked={applyScope === 'single'}
                  onChange={() => setApplyScope('single')}
                  title="This style only"
                  subtitle={styleCode ? `Just ${styleCode}` : 'Just the one you clicked'}
                  accent={isApprove ? 'emerald' : 'blue'}
                />
                <ScopeRadio
                  checked={applyScope === 'all_on_po'}
                  onChange={() => setApplyScope('all_on_po')}
                  title="All styles on PO"
                  subtitle={`${1 + siblingCount} styles ${componentName ? `with "${componentName}"` : ''}`}
                  accent={isApprove ? 'emerald' : 'blue'}
                />
                <ScopeRadio
                  checked={applyScope === 'selected'}
                  onChange={() => setApplyScope('selected')}
                  title="Select specific styles"
                  subtitle={applyScope === 'selected' ? `${selectedOrderIds.size} of ${siblingCount} siblings ticked` : 'Pick which siblings to include'}
                  accent={isApprove ? 'emerald' : 'blue'}
                />
                {applyScope === 'selected' && (
                  <div className="ml-6 mt-2 border border-gray-200 rounded-lg bg-gray-50/40 max-h-40 overflow-y-auto divide-y divide-gray-100">
                    {siblings.map((s) => (
                      <label key={s.order_id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.has(s.order_id)}
                          onChange={() => toggleSelected(s.order_id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loadingSiblings}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50',
              primaryBtnClasses
            )}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {effectiveCount === 1 ? actionVerb : `${actionVerb} on ${effectiveCount} styles`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeRadio({
  checked,
  onChange,
  title,
  subtitle,
  accent,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
  accent: 'emerald' | 'blue';
}) {
  const activeBg = accent === 'emerald' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-blue-50/60 border-blue-200';
  const activeText = accent === 'emerald' ? 'text-emerald-800' : 'text-blue-800';
  const activeSubtext = accent === 'emerald' ? 'text-emerald-700' : 'text-blue-700';
  const radioColour = accent === 'emerald' ? 'text-emerald-600 focus:ring-emerald-500' : 'text-blue-600 focus:ring-blue-500';
  return (
    <label
      className={cn(
        'flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
        checked ? activeBg : 'bg-white border-gray-200 hover:bg-gray-50'
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className={cn('mt-0.5 w-3.5 h-3.5 focus:ring-offset-0 border-gray-300', radioColour)}
      />
      <div className="min-w-0">
        <div className={cn('text-xs font-semibold', checked ? activeText : 'text-gray-800')}>{title}</div>
        <div className={cn('text-[11px]', checked ? activeSubtext : 'text-gray-500')}>{subtitle}</div>
      </div>
    </label>
  );
}
