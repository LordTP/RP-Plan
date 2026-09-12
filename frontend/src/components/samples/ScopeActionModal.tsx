'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Check, Inbox, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionsApi, type SampleType } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import {
  ScopePicker, scopeTargetCount, DEFAULT_SCOPE,
  type ApplyScope, type Sibling,
} from './ScopePicker';

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

const SAMPLE_LABEL: Record<SampleType, string> = {
  fit: 'Fit Sample',
  strike: 'Strike Off',
  lab: 'Lab Dip',
  pps: 'PPS',
  label: 'Label',
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
  const [applyScope, setApplyScope] = useState<ApplyScope>(DEFAULT_SCOPE);
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
  const effectiveCount = useMemo(
    () => scopeTargetCount(applyScope, siblingCount, selectedOrderIds.size),
    [applyScope, siblingCount, selectedOrderIds.size],
  );

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

          <ScopePicker
            scope={applyScope}
            onScopeChange={setApplyScope}
            siblings={siblings}
            loading={loadingSiblings}
            selectedOrderIds={selectedOrderIds}
            onToggleSelected={toggleSelected}
            styleCode={styleCode}
            componentName={componentName}
            accent={isApprove ? 'emerald' : 'blue'}
          />
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
