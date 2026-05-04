'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { approvalsApi, type PendingApprovalGroup, type PendingChange } from '@/lib/api';

/**
 * Inbox built for volume — handles 30+ pending approvals without becoming
 * an unscrollable wall of cards. Pure approvals only — warnings are a
 * separate concern with their own surface.
 *
 * Group toggle: PO / Supplier / Flat
 *   - PO: changes folded under their PO (one supplier-batch = one header)
 *   - Supplier: same batch viewed by who sent it ("Wuxi · 17 changes")
 *   - Flat: every change as its own row, newest first, with full context inline
 *
 * Plus: filter pills for change type · multi-select with cascading group
 * checkbox · bulk action bar · hover-reveal Approve/Reject so the page
 * stays calm at rest.
 */

type GroupMode = 'po' | 'supplier' | 'flat';
type FilterKey = 'all' | 'date' | 'sample' | 'other';

interface ChangeWithCtx extends PendingChange {
  po_number: string;
  customer: string;
  factory: string;
}

interface GroupView {
  key: string;            // grouping key (po_number or factory or 'flat')
  primary: string;        // headline e.g. "PO-12345" or "Wuxi Factory"
  secondary?: string;     // sub-headline e.g. "ACME Co." or "5 changes from Wuxi"
  changes: ChangeWithCtx[];
  factory?: string;
  customer?: string;
  po_number?: string;
}

interface Props {
  pendingApprovals: PendingApprovalGroup[];
  onApproved: () => void;
  onPOClick: (po: string, style?: string) => void;
}

export function InboxAtScale({ pendingApprovals, onApproved, onPOClick }: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>('po');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('');

  // Flatten the API shape into change-with-context, then re-group per mode.
  const flatChanges = useMemo<ChangeWithCtx[]>(() => {
    const all: ChangeWithCtx[] = [];
    for (const g of pendingApprovals) {
      for (const c of g.changes) {
        all.push({ ...c, po_number: g.po_number, customer: g.customer, factory: g.factory });
      }
    }
    return all;
  }, [pendingApprovals]);

  // Filter (by change type) before grouping — keeps groups consistent with what's visible.
  const filteredChanges = useMemo(() => {
    if (filter === 'all') return flatChanges;
    return flatChanges.filter(c => classifyField(c.field_name) === filter);
  }, [flatChanges, filter]);

  // Counts for the filter pills
  const counts = useMemo(() => {
    const c = { all: flatChanges.length, date: 0, sample: 0, other: 0 };
    for (const ch of flatChanges) {
      const k = classifyField(ch.field_name);
      c[k]++;
    }
    return c;
  }, [flatChanges]);

  // Build the group views for the chosen mode
  const groupViews = useMemo<GroupView[]>(() => {
    if (groupMode === 'flat') {
      return [{
        key: 'flat',
        primary: 'All changes',
        changes: [...filteredChanges].sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || '')),
      }];
    }
    if (groupMode === 'po') {
      const map = new Map<string, GroupView>();
      for (const c of filteredChanges) {
        const v = map.get(c.po_number);
        if (v) {
          v.changes.push(c);
        } else {
          map.set(c.po_number, {
            key: c.po_number,
            primary: c.po_number,
            secondary: c.customer,
            changes: [c],
            po_number: c.po_number,
            customer: c.customer,
            factory: c.factory,
          });
        }
      }
      return Array.from(map.values()).sort((a, b) => b.changes.length - a.changes.length);
    }
    // supplier
    const map = new Map<string, GroupView>();
    for (const c of filteredChanges) {
      const k = c.factory || 'Unknown supplier';
      const v = map.get(k);
      if (v) {
        v.changes.push(c);
      } else {
        map.set(k, {
          key: k,
          primary: k,
          changes: [c],
          factory: c.factory,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.changes.length - a.changes.length);
  }, [filteredChanges, groupMode]);

  const totalVisible = filteredChanges.length;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectGroup = (group: GroupView) => {
    const ids = group.changes.map(c => c.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
    });
  };

  const toggleSelectAll = () => {
    const allIds = filteredChanges.map(c => c.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleCollapse = (key: string) => {
    setCollapsedKeys(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const approveOne = async (id: number) => {
    setBusy(true);
    try {
      await approvalsApi.approveChange(id);
      toast.success('Approved');
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      onApproved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to approve');
    } finally { setBusy(false); }
  };

  const submitReject = async () => {
    if (!rejectingId || !rejectReason.trim()) return;
    setBusy(true);
    try {
      await approvalsApi.rejectChange(rejectingId, rejectReason.trim());
      toast.success('Rejected');
      setSelected(prev => { const n = new Set(prev); n.delete(rejectingId); return n; });
      setRejectingId(null);
      setRejectReason('');
      onApproved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to reject');
    } finally { setBusy(false); }
  };

  const bulkApprove = async (ids?: number[]) => {
    const target = ids ?? Array.from(selected);
    if (target.length === 0) return;
    setBusy(true);
    try {
      const res = await approvalsApi.bulkApprove(target);
      toast.success(`Approved ${res.approved_count}`);
      setSelected(new Set());
      onApproved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Bulk approve failed');
    } finally { setBusy(false); }
  };

  const submitBulkReject = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || !bulkReason.trim()) return;
    setBusy(true);
    try {
      const res = await approvalsApi.bulkReject(ids, bulkReason.trim());
      toast.success(`Rejected ${res.rejected_count}`);
      setSelected(new Set());
      setBulkRejectOpen(false);
      setBulkReason('');
      onApproved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Bulk reject failed');
    } finally { setBusy(false); }
  };

  const isFlat = groupMode === 'flat';

  return (
    <section>
      {/* Header — section title + group-by toggle */}
      <header className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">Inbox</h3>
          <span className="text-xs text-gray-400">{flatChanges.length} pending</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-1">Group:</span>
          <GroupToggle active={groupMode === 'po'} onClick={() => setGroupMode('po')}>PO</GroupToggle>
          <GroupToggle active={groupMode === 'supplier'} onClick={() => setGroupMode('supplier')}>Supplier</GroupToggle>
          <GroupToggle active={groupMode === 'flat'} onClick={() => setGroupMode('flat')}>Flat</GroupToggle>
        </div>
      </header>

      {/* Filter pills */}
      <div className="flex items-center gap-1 mb-3 text-[11px]">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
          All <span className="opacity-60 font-normal">{counts.all}</span>
        </FilterPill>
        <FilterPill active={filter === 'date'} onClick={() => setFilter('date')}>
          Dates <span className="opacity-60 font-normal">{counts.date}</span>
        </FilterPill>
        {counts.sample > 0 && (
          <FilterPill active={filter === 'sample'} onClick={() => setFilter('sample')}>
            Samples <span className="opacity-60 font-normal">{counts.sample}</span>
          </FilterPill>
        )}
        {counts.other > 0 && (
          <FilterPill active={filter === 'other'} onClick={() => setFilter('other')}>
            Other <span className="opacity-60 font-normal">{counts.other}</span>
          </FilterPill>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-blue-50 border border-blue-200 rounded-md text-[11px]">
          <span className="font-semibold text-blue-700">{selected.size} selected</span>
          <span className="text-gray-300">·</span>
          <button
            disabled={busy}
            onClick={() => bulkApprove()}
            className="font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
          >
            Approve all
          </button>
          <span className="text-gray-300">·</span>
          <button
            disabled={busy}
            onClick={() => setBulkRejectOpen(true)}
            className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Reject all
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Empty state */}
      {totalVisible === 0 ? (
        <div className="ring-1 ring-gray-200 rounded-lg px-4 py-10 text-center text-sm text-gray-400 italic">
          {filter === 'all' ? "Nothing pending — you're all caught up." : 'No items match this filter.'}
        </div>
      ) : (
        <div className="ring-1 ring-gray-200 rounded-lg overflow-hidden">
          {/* Flat mode: master select-all bar at the top */}
          {isFlat && (
            <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500">
              <input
                type="checkbox"
                className="w-3 h-3 rounded border-gray-300"
                checked={filteredChanges.length > 0 && filteredChanges.every(c => selected.has(c.id))}
                onChange={toggleSelectAll}
              />
              <span>Select all visible ({totalVisible})</span>
            </div>
          )}

          <div className="max-h-[calc(100vh-280px)] overflow-y-auto divide-y divide-gray-100">
            {groupViews.map(group => {
              if (isFlat) {
                return group.changes.map(change => (
                  <FlatRow
                    key={change.id}
                    change={change}
                    selected={selected.has(change.id)}
                    onToggleSelect={() => toggleSelect(change.id)}
                    onApprove={() => approveOne(change.id)}
                    onRejectClick={() => { setRejectingId(change.id); setRejectReason(''); }}
                    onPOClick={() => onPOClick(change.po_number, change.style_code)}
                    busy={busy}
                  />
                ));
              }

              const collapsed = collapsedKeys.has(group.key);
              const groupIds = group.changes.map(c => c.id);
              const allSelected = groupIds.length > 0 && groupIds.every(id => selected.has(id));
              const someSelected = !allSelected && groupIds.some(id => selected.has(id));

              return (
                <div key={group.key} className="divide-y divide-gray-100">
                  {/* Group header — sticky inside the scroll container */}
                  <div className="px-3 py-2 flex items-center gap-2 bg-gray-100 sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded border-gray-300"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={() => toggleSelectGroup(group)}
                    />
                    <button
                      onClick={() => toggleCollapse(group.key)}
                      className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                    >
                      {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {groupMode === 'po' ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); group.po_number && onPOClick(group.po_number); }}
                          className="font-mono text-xs font-semibold text-gray-900 hover:text-blue-700"
                        >
                          {group.primary}
                        </button>
                        {group.secondary && (
                          <span className="text-[11px] text-gray-500 truncate max-w-[180px]">{group.secondary}</span>
                        )}
                        <span className="text-[10px] text-gray-400 truncate">
                          · {group.changes.length} change{group.changes.length > 1 ? 's' : ''}
                          {group.factory ? ` from ${group.factory}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-gray-900">{group.primary}</span>
                        <span className="text-[10px] text-gray-400 truncate">
                          · {group.changes.length} change{group.changes.length > 1 ? 's' : ''}
                          {' across '}{distinctCount(group.changes, c => c.po_number)} PO{distinctCount(group.changes, c => c.po_number) > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() => bulkApprove(groupIds)}
                      disabled={busy}
                      className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 whitespace-nowrap"
                    >
                      Approve all {group.changes.length}
                    </button>
                  </div>
                  {/* Nested rows */}
                  {!collapsed && group.changes.map(change => (
                    <ChangeRow
                      key={change.id}
                      change={change}
                      showPO={groupMode === 'supplier'}
                      selected={selected.has(change.id)}
                      onToggleSelect={() => toggleSelect(change.id)}
                      onApprove={() => approveOne(change.id)}
                      onRejectClick={() => { setRejectingId(change.id); setRejectReason(''); }}
                      onPOClick={() => onPOClick(change.po_number, change.style_code)}
                      busy={busy}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reject reason modals */}
      {rejectingId !== null && (
        <RejectModal
          title="Reject change"
          reason={rejectReason}
          setReason={setRejectReason}
          onCancel={() => { setRejectingId(null); setRejectReason(''); }}
          onSubmit={submitReject}
          busy={busy}
        />
      )}
      {bulkRejectOpen && (
        <RejectModal
          title={`Reject ${selected.size} change${selected.size > 1 ? 's' : ''}`}
          reason={bulkReason}
          setReason={setBulkReason}
          onCancel={() => { setBulkRejectOpen(false); setBulkReason(''); }}
          onSubmit={submitBulkReject}
          busy={busy}
        />
      )}
    </section>
  );
}

/* --- Sub-components ----------------------------------------------------- */

function GroupToggle({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors',
        active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  );
}

function FilterPill({ active, onClick, children, tone }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'red';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded-md font-semibold transition-colors',
        active
          ? tone === 'red' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  );
}

function ChangeRow({ change, showPO, selected, onToggleSelect, onApprove, onRejectClick, onPOClick, busy }: {
  change: ChangeWithCtx;
  showPO?: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onRejectClick: () => void;
  onPOClick: () => void;
  busy: boolean;
}) {
  const fieldLabel = prettyField(change.field_name);
  const oldVal = stripTime(change.current_value || '');
  const newVal = stripTime(change.proposed_value || '');
  return (
    <div
      className={cn(
        'group pl-9 pr-3 py-1.5 flex items-center gap-2.5 text-[11px] hover:bg-gray-50 min-w-0',
        selected && 'bg-blue-50/60'
      )}
    >
      <input
        type="checkbox"
        className="w-3 h-3 rounded border-gray-300 flex-shrink-0"
        checked={selected}
        onChange={onToggleSelect}
      />
      <span className="text-gray-700 font-semibold whitespace-nowrap">{fieldLabel}</span>
      {change.style_code && (
        <span className="font-mono text-gray-500 truncate max-w-[110px]">{change.style_code}</span>
      )}
      {showPO && (
        <button onClick={(e) => { e.stopPropagation(); onPOClick(); }} className="font-mono text-gray-400 hover:text-blue-700">
          · {change.po_number}
        </button>
      )}
      <span className="text-gray-300">·</span>
      <span className="text-gray-400 line-through whitespace-nowrap">{oldVal || 'Not set'}</span>
      <span className="text-gray-300">→</span>
      <strong className="text-gray-700 whitespace-nowrap">{newVal || 'Not set'}</strong>
      {change.reason && (
        <span className="text-gray-400 italic truncate min-w-0 flex-1" title={change.reason}>· "{change.reason}"</span>
      )}
      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={onApprove}
          disabled={busy}
          className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={onRejectClick}
          disabled={busy}
          className="text-[10px] font-semibold px-1.5 py-0.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function FlatRow({ change, selected, onToggleSelect, onApprove, onRejectClick, onPOClick, busy }: {
  change: ChangeWithCtx;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onRejectClick: () => void;
  onPOClick: () => void;
  busy: boolean;
}) {
  const fieldLabel = prettyField(change.field_name);
  const oldVal = stripTime(change.current_value || '');
  const newVal = stripTime(change.proposed_value || '');
  return (
    <div
      className={cn(
        'group px-3 py-2 flex items-center gap-2.5 text-[11px] hover:bg-gray-50 min-w-0',
        selected && 'bg-blue-50/60'
      )}
    >
      <input
        type="checkbox"
        className="w-3 h-3 rounded border-gray-300 flex-shrink-0"
        checked={selected}
        onChange={onToggleSelect}
      />
      <span className="text-gray-700 font-semibold whitespace-nowrap">{fieldLabel}</span>
      <button onClick={(e) => { e.stopPropagation(); onPOClick(); }} className="font-mono text-gray-700 hover:text-blue-700 truncate max-w-[110px]">
        {change.style_code}
      </button>
      <span className="text-gray-300">·</span>
      <span className="font-mono text-gray-400">{change.po_number}</span>
      <span className="text-gray-300">·</span>
      <span className="text-gray-400 line-through whitespace-nowrap">{oldVal || 'Not set'}</span>
      <span className="text-gray-300">→</span>
      <strong className="text-gray-700 whitespace-nowrap">{newVal || 'Not set'}</strong>
      <span className="text-gray-300">·</span>
      <span className="text-gray-400 truncate min-w-0">{change.factory}</span>
      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={onApprove}
          disabled={busy}
          className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={onRejectClick}
          disabled={busy}
          className="text-[10px] font-semibold px-1.5 py-0.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function RejectModal({ title, reason, setReason, onCancel, onSubmit, busy }: {
  title: string;
  reason: string;
  setReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-semibold text-gray-700 mb-2">Reason <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you rejecting this?"
            rows={3}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
          />
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/40">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || !reason.trim()}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- helpers ------------------------------------------------------------ */

function classifyField(field: string): FilterKey {
  if (!field) return 'other';
  const f = field.toLowerCase();
  if (/(_date|_received|_approved|_etd|_eta|_factory|_dispatch|_arrive|_to_customer|_to_uk|_to_port|_sent|_required)$/.test(f)) return 'date';
  if (/_status$/.test(f) || f.includes('sample') || f.includes('pps') || f.includes('strike') || f.includes('lab')) return 'sample';
  return 'other';
}

function prettyField(field: string): string {
  if (!field) return '';
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function stripTime(v: string): string {
  if (!v) return v;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T\s]\d{2}:\d{2}(?::\d{2})?/);
  return m ? m[1] : v;
}

function distinctCount<T>(arr: T[], key: (v: T) => string): number {
  const set = new Set<string>();
  for (const v of arr) set.add(key(v));
  return set.size;
}
