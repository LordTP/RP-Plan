'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { qaApi, type QACheckState } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Shared QA test-plan checklist. State persists in the qa_checks table
 * so every logged-in user sees the same ticks. Refetches on tab focus.
 *
 * Test plan philosophy — focus on:
 *   1. Things that silently corrupt data
 *   2. Role boundaries (security)
 *   3. Recently-shipped code post-deploy validation
 *   4. Multi-user race conditions
 * Skip "page loads" tutorial-style filler.
 */

interface TestItem { id: string; text: string; severity?: 'critical' | 'data' | 'role' | 'recent' | 'edge'; }
interface TestGroup { title: string; items: TestItem[]; }
interface TestSection { id: string; title: string; subtitle?: string; groups: TestGroup[]; }

const PLAN: TestSection[] = [

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'critical',
    title: 'Critical paths',
    subtitle: 'If these break, nothing else matters. Run these first.',
    groups: [
      {
        title: 'Authentication',
        items: [
          { id: 'c.a.1', severity: 'critical', text: 'Each of the 4 role users (admin, internal, designer, supplier) can log in and lands on a dashboard.' },
          { id: 'c.a.2', severity: 'critical', text: 'Wrong password shows a sensible error, doesn\'t leak whether the username exists.' },
          { id: 'c.a.3', severity: 'critical', text: 'Logout actually clears the session — visiting /orders after logout bounces back to login.' },
        ],
      },
      {
        title: 'Supplier data scoping',
        items: [
          { id: 'c.s.1', severity: 'role', text: 'Supplier A logs in → /factory-product shows ONLY orders for their factory. Try at least 2 different supplier accounts.' },
          { id: 'c.s.2', severity: 'role', text: 'Supplier opens DevTools → API call to /api/orders/{some-other-factory-PO-id} → returns 403, not 200 with data.' },
          { id: 'c.s.3', severity: 'role', text: 'Supplier types /orders or /tracking in the URL bar → either redirects or shows access denied (no data leakage).' },
          { id: 'c.s.4', severity: 'role', text: 'Designer types /import or /settings in the URL → access denied.' },
          { id: 'c.s.5', severity: 'role', text: 'Designer\'s tables and modals do NOT show cost / value / margin columns anywhere.' },
        ],
      },
      {
        title: 'Date-approval gate (the big one)',
        items: [
          { id: 'c.d.1', severity: 'critical', text: 'Supplier edits Vessel ETD → reason prompt appears, no save without it.' },
          { id: 'c.d.2', severity: 'critical', text: 'After supplier submits → field STILL shows OLD value to the supplier (pending, not applied).' },
          { id: 'c.d.3', severity: 'critical', text: 'Internal sees the change in /dashboard-v2 inbox AND in any other approval surface — same row, not duplicated.' },
          { id: 'c.d.4', severity: 'critical', text: 'Internal Approves → DB row updates (verify in Postgres or refresh supplier view) AND a history record is created.' },
          { id: 'c.d.5', severity: 'critical', text: 'Internal Rejects with a reason → supplier sees the rejection reason somewhere on the order, the value stays the OLD one.' },
          { id: 'c.d.6', severity: 'critical', text: 'Supplier resubmits a rejected change → new pending row, OLD reason preserved in history.' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'data',
    title: 'Data integrity',
    subtitle: 'Silent corruption is the worst kind. Verify the system actually does what it says.',
    groups: [
      {
        title: 'Excel import',
        items: [
          { id: 'd.x.1', severity: 'data', text: 'Round-trip: export current orders → open in Excel → save (no edits) → re-import → result: 0 created, N updated, no field changes recorded.' },
          { id: 'd.x.2', severity: 'data', text: 'Import a row with PO# already present + new style_code → creates a new row (not an update of an existing different style).' },
          { id: 'd.x.3', severity: 'data', text: 'Import a row with PO# + style_code already present → updates that row in place; date_change_history record created for any changed field.' },
          { id: 'd.x.4', severity: 'data', text: 'File with style_code in scientific notation (e.g. "7.01E+08") — see if it imports as a number or rejects it. (Both are OK; what\'s NOT OK is silent corruption.)' },
          { id: 'd.x.5', severity: 'data', text: 'Mixed-format dates (some DD/MM, some MM/DD as text strings, plus real Excel datetimes) — confirm imported values match what was visible in the source file, not flipped day/month.' },
        ],
      },
      {
        title: 'Auto-calc + cascades',
        items: [
          { id: 'd.c.1', severity: 'data', text: 'Mark a component\'s Fit Sample APPROVED → the order\'s overall Fit Sample status updates without a refresh.' },
          { id: 'd.c.2', severity: 'data', text: 'Change Factory Confirmed Ex-Factory date → ETA UK and ETA Customer downstream dates recompute (auto-calc chain).' },
          { id: 'd.c.3', severity: 'data', text: 'Component with submitted samples → delete the component → samples + their history go too (no orphan rows in DB).' },
          { id: 'd.c.4', severity: 'data', text: 'Order has comments + components + samples → delete the order → all child records cascade-delete (verify count before/after in DB).' },
        ],
      },
      {
        title: 'Concurrent edits',
        items: [
          { id: 'd.r.1', severity: 'data', text: 'Two browsers, two internal users, both editing the same field → last save wins. The other user sees the new value next time they refresh (no lost write or 500 error).' },
          { id: 'd.r.2', severity: 'data', text: 'Internal approves a date change at the same moment supplier submits ANOTHER change for the same field → no constraint violation, both flows succeed.' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'merch',
    title: 'Merch / Internal — focused flows',
    subtitle: 'Common day-to-day tasks. Test the flow end-to-end, not each click.',
    groups: [
      {
        title: 'Approval workflows',
        items: [
          { id: 'm.a.1', text: 'Approval came from Supplier A → an internal user approves → activity feed records "approved by <user>" + "submitted by Supplier A".' },
          { id: 'm.a.2', text: '50+ pending approvals from one supplier on one PO → "Approve all 50" header CTA actually approves all 50 in one DB call.' },
          { id: 'm.a.3', text: 'Try approving your OWN previously-submitted change. (Currently allowed? If yes, that\'s probably a policy gap to flag.)' },
        ],
      },
      {
        title: '/dashboard-v2 inbox',
        items: [
          { id: 'm.i.1', severity: 'recent', text: 'Group toggle: PO / Supplier / Flat — total visible items count stays the same across modes (proof that grouping is just a re-render, not a re-fetch).' },
          { id: 'm.i.2', severity: 'recent', text: 'Tick a PO group checkbox → every nested row selects + bulk action bar appears at top. Untick → bar disappears.' },
          { id: 'm.i.3', severity: 'recent', text: 'Bulk Approve all → those rows disappear, refetch confirms they\'re gone from DB (not cached).' },
          { id: 'm.i.4', severity: 'recent', text: 'Bulk Reject 5 with one reason → all 5 PendingDateChange rows show that same reason in DB.' },
          { id: 'm.i.5', severity: 'recent', text: 'Filter pills (Dates / Samples / Other) actually filter — counts update when checks happen.' },
          { id: 'm.i.6', severity: 'recent', text: 'Group headers stick to top of the inbox while you scroll past the rows in that group.' },
        ],
      },
      {
        title: 'V2 detail modal',
        items: [
          { id: 'm.v.1', severity: 'recent', text: 'Click each pill (Product / Sampling / Shipping / Timeline) — section scrolls so its top sits right under the pill nav, NOT past it.' },
          { id: 'm.v.2', severity: 'recent', text: 'Scroll all the way down — Timeline pill highlights (the bottom-snap fix).' },
          { id: 'm.v.3', severity: 'recent', text: 'Edit a date field → cross-OS DatePicker opens (NOT the native HTML date input — check on Windows + Firefox if you have one).' },
        ],
      },
      {
        title: 'Activity feed',
        items: [
          { id: 'm.f.1', severity: 'recent', text: 'Activity surface is one continuous list (NOT separate boxed cards per PO). PO acts as a sticky section header inside the same surface.' },
          { id: 'm.f.2', severity: 'recent', text: 'Click any PO header in the feed → /orders-v2 opens with that PO expanded. Click a style-code event → opens the V2 modal directly on that style.' },
          { id: 'm.f.3', severity: 'recent', text: 'Bulk approval (e.g. "Sarah approved Fit Sample on 4 styles") shows ONE row in the activity feed, not 4 separate rows.' },
        ],
      },
      {
        title: 'Export modal',
        items: [
          { id: 'm.e.1', severity: 'recent', text: '/orders → Export → "Export all" downloads file. Open it in Excel — column headers + data look correct.' },
          { id: 'm.e.2', severity: 'recent', text: '"Choose POs" → search filter works, tick 3 POs → "Export 3 POs" downloads file with ONLY those POs.' },
        ],
      },
      {
        title: 'Tracking',
        items: [
          { id: 'm.t.1', severity: 'recent', text: '/tracking page lists tracking refs grouped by reference number with vessel info per group.' },
          { id: 'm.t.2', severity: 'recent', text: 'Search a vessel name / ref → list filters live as you type.' },
          { id: 'm.t.3', severity: 'data', text: 'Edit Revised Vessel ETA on a tracking ref → all orders linked to that ref get the new value (bulk update).' },
          { id: 'm.t.4', severity: 'data', text: 'Tracking ref typed directly on an order → tracking page picks it up the next time it\'s loaded.' },
        ],
      },
      {
        title: 'Comments + collaboration',
        items: [
          { id: 'm.c.1', text: 'User A leaves a comment with @username → user B sees it as unread + with the @mention highlighted.' },
          { id: 'm.c.2', text: 'User B opens the comment → marks it read → user A sees the read state propagate (refresh ok).' },
          { id: 'm.c.3', text: 'Long comment (300+ chars) — wraps cleanly, doesn\'t blow out modal width.' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'designer',
    title: 'Designer — focused flows',
    subtitle: 'Component management + sample resubmission lifecycle.',
    groups: [
      {
        title: 'Components',
        items: [
          { id: 'g.c.1', text: 'Add component "Outer Shell" to a PO with 5 styles via "Apply to: all styles on PO" → 5 component rows created, all with the same name.' },
          { id: 'g.c.2', text: 'Add a component name that\'s a near-match of an existing one (whitespace / casing diff) → autocomplete should nudge towards the existing name to avoid variants.' },
          { id: 'g.c.3', text: 'On a component, set Fit Sample to REJECTED → reject modal appears, requires reason → submit → next attempt is v2, v1 is preserved in attempt history.' },
        ],
      },
      {
        title: 'V2 modal · sample reject',
        items: [
          { id: 'g.v.1', severity: 'recent', text: 'On a component, set Fit Sample to REJECTED → modal asks for reason → on save, AttemptBadge shows v2 + RejectionContextBanner appears on the order.' },
        ],
      },
      {
        title: 'Resubmissions',
        items: [
          { id: 'g.r.1', text: 'A v2 sample comes in → in /resubmissions, the v1 rejection context (reason + date) is visible alongside.' },
          { id: 'g.r.2', text: 'Approve a v2 sample → AttemptHistory shows v1 REJECTED + v2 APPROVED in order. Order\'s overall sample status flips back to APPROVED.' },
          { id: 'g.r.3', text: 'Reject v2 → next attempt is v3. Confirm v1 + v2 history both intact.' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'factory',
    title: 'Factory / Supplier — focused flows',
    subtitle: 'Heavily gated role. Validate the gates work + the workflow is usable.',
    groups: [
      {
        title: 'Editable-field gate',
        items: [
          { id: 'f.g.1', severity: 'role', text: 'Supplier tries to edit a non-allowed field (e.g. Cost Price, Customer) — input is disabled or the API returns 403.' },
          { id: 'f.g.2', text: 'Supplier tries to edit fields BEFORE Tech Packs / Specs are sent → blocked with a clear message, not silent.' },
          { id: 'f.g.3', text: 'Supplier sees their OWN submitted-pending changes in /dashboard-v2 (or wherever supplier sees their pending state).' },
        ],
      },
      {
        title: 'Shipment drafts',
        items: [
          { id: 'f.d.1', text: 'Supplier creates a draft → it\'s automatically scoped to their factory; no factory picker shown.' },
          { id: 'f.d.2', text: 'Supplier sees only their own drafts in the list, never another factory\'s drafts.' },
          { id: 'f.s.1', severity: 'recent', text: 'Build a draft from scratch, tick SKUs from 2 different POs, fill 5 shared fields, Confirm → vessel info propagates to all linked orders.' },
          { id: 'f.s.2', severity: 'data', text: 'Edit a CONFIRMED shipment → change Vessel ETD → save → all linked orders show the new ETD (no stragglers).' },
          { id: 'f.s.3', severity: 'recent', text: 'Pick a SKU already on another confirmed shipment → conflict note appears under that SKU row (not a separate alert).' },
          { id: 'f.s.4', severity: 'data', text: 'Partial-shipment quantity: edit qty in draft, confirm → linked order quantity reflects the partial, not the full SKU qty.' },
        ],
      },
      {
        title: 'Export modal',
        items: [
          { id: 'f.e.1', severity: 'role', text: 'Supplier opens Export on /factory-product → "Choose POs" picker shows ONLY their factory\'s POs (not all POs).' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  {
    id: 'edge',
    title: 'Edge cases + UX guard rails',
    subtitle: 'Where things visually break or feel weird at extremes.',
    groups: [
      {
        title: 'Empty + extreme states',
        items: [
          { id: 'e.s.1', severity: 'edge', text: 'A user with 0 pending approvals + 0 warnings + 0 activity — friendly empty messages on each surface, no spinner-forever.' },
          { id: 'e.s.2', severity: 'edge', text: 'Inbox grouped by Supplier with 50+ changes from one supplier on one PO → "Approve all 50" doesn\'t time out or freeze the UI.' },
          { id: 'e.s.3', severity: 'edge', text: 'Customer name 60+ chars, description 100+ chars — truncate with ellipsis everywhere, never break grid alignment.' },
          { id: 'e.s.4', severity: 'edge', text: 'Browser zoom at 80% and 125% — layout still readable, no horizontal scroll on the dashboard at standard 1280-1440px desktop widths.' },
        ],
      },
    ],
  },
];

const ALL_ITEM_IDS = PLAN.flatMap(s => s.groups.flatMap(g => g.items.map(i => i.id)));

const SEVERITY_COLOR: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  critical: { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200',     label: 'CRITICAL' },
  data:     { bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-200',  label: 'DATA' },
  role:     { bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-200',  label: 'ROLE' },
  recent:   { bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200',    label: 'RECENT' },
  edge:     { bg: 'bg-gray-100',   text: 'text-gray-600',    ring: 'ring-gray-200',    label: 'EDGE' },
};

function QAContent() {
  const { user } = useStore();
  const [state, setState] = useState<Record<string, QACheckState>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);

  const isAdmin = user?.role === 'admin';

  const refetch = async () => {
    try {
      const res = await qaApi.getState();
      setState(res.checks || {});
    } catch (err) {
      console.error('Failed to load QA state', err);
    }
  };

  useEffect(() => {
    refetch().finally(() => setLoading(false));
    const onFocus = () => { refetch(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (id: string) => {
    setPending(prev => new Set(prev).add(id));
    try {
      const res = await qaApi.toggle(id);
      setState(prev => {
        const next = { ...prev };
        if (res.checked) {
          next[id] = { checked: true, by: res.by, at: res.at };
        } else {
          delete next[id];
        }
        return next;
      });
    } catch (err) {
      toast.error('Failed to save');
    } finally {
      setPending(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const resetAll = async () => {
    setResetting(true);
    try {
      const res = await qaApi.resetAll();
      toast.success(`Reset ${res.deleted} checks`);
      setState({});
      setShowResetConfirm(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  // Per-section progress
  const sectionStats = useMemo(() => {
    const m: Record<string, { done: number; total: number }> = {};
    for (const s of PLAN) {
      const ids = s.groups.flatMap(g => g.items.map(i => i.id));
      m[s.id] = {
        done: ids.filter(id => state[id]?.checked).length,
        total: ids.length,
      };
    }
    return m;
  }, [state]);

  const totalDone = ALL_ITEM_IDS.filter(id => state[id]?.checked).length;
  const totalCount = ALL_ITEM_IDS.length;

  // Severity counts for the filter pills
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, data: 0, role: 0, recent: 0, edge: 0 };
    for (const s of PLAN) {
      for (const g of s.groups) {
        for (const i of g.items) {
          if (i.severity) counts[i.severity] = (counts[i.severity] || 0) + 1;
        }
      }
    }
    return counts;
  }, []);

  const itemMatchesFilter = (item: TestItem) => {
    if (filterSeverity && item.severity !== filterSeverity) return false;
    if (hideDone && state[item.id]?.checked) return false;
    return true;
  };

  if (loading) {
    return (
      <AppShell title="QA testing">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="QA testing">
      <div className="pb-12">
        {/* Header — stacks on mobile */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">QA test plan</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Shared checklist · everyone signed in sees the same state
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={refetch}
              className="px-2.5 py-1.5 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-2.5 py-1.5 text-[11px] font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" /> Reset all
              </button>
            )}
            <div className="text-xs text-gray-500 ml-auto sm:ml-0">
              <span className="font-bold text-gray-900 tabular-nums">{totalDone}</span> / {totalCount}
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mb-5">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
              style={{ width: `${totalCount === 0 ? 0 : (totalDone / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {/* Severity filter + hide done */}
        <div className="flex items-center gap-1.5 mb-8 flex-wrap text-[11px]">
          <button
            onClick={() => setFilterSeverity(null)}
            className={cn(
              'px-2 py-0.5 rounded-md font-semibold transition-colors',
              filterSeverity === null ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            All <span className="opacity-70 font-normal ml-0.5">{totalCount}</span>
          </button>
          {(['critical', 'data', 'role', 'recent', 'edge'] as const).map(sev => {
            const c = SEVERITY_COLOR[sev];
            const active = filterSeverity === sev;
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(active ? null : sev)}
                className={cn(
                  'px-2 py-0.5 rounded-md font-semibold transition-colors',
                  active ? `${c.bg} ${c.text} ring-1 ${c.ring}` : 'text-gray-500 hover:bg-gray-100'
                )}
              >
                {c.label.toLowerCase()} <span className="opacity-70 font-normal ml-0.5">{severityCounts[sev]}</span>
              </button>
            );
          })}
          <span className="w-px h-3 bg-gray-200 mx-1" />
          <label className="inline-flex items-center gap-1.5 text-gray-600 cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="w-3 h-3 rounded border-gray-300"
            />
            Hide done
          </label>
        </div>

        {/* Sections */}
        <div className="space-y-12">
          {PLAN.map(section => {
            const stats = sectionStats[section.id] || { done: 0, total: 0 };
            const pct = stats.total === 0 ? 0 : (stats.done / stats.total) * 100;
            // Apply filter to know if section has any visible items
            const visibleGroups = section.groups
              .map(g => ({ ...g, items: g.items.filter(itemMatchesFilter) }))
              .filter(g => g.items.length > 0);
            if (visibleGroups.length === 0) return null;
            return (
              <section key={section.id}>
                <header className="mb-5">
                  <div className="flex items-baseline justify-between flex-wrap gap-3">
                    <h2 className="text-base sm:text-lg font-bold text-gray-900">{section.title}</h2>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      <span className="tabular-nums"><span className="text-gray-900 font-bold">{stats.done}</span> / {stats.total}</span>
                      <div className="w-20 sm:w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  {section.subtitle && (
                    <p className="text-xs text-gray-500 mt-1.5">{section.subtitle}</p>
                  )}
                </header>

                {/* Groups in a responsive grid: 1 col mobile, 2 col tablet, 3 col desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  {visibleGroups.map(group => (
                    <div key={group.title} className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden flex flex-col">
                      <div className="px-3.5 py-2.5 bg-gray-50/60 border-b border-gray-100">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">{group.title}</h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {group.items.map(item => {
                          const s = state[item.id];
                          const isPending = pending.has(item.id);
                          const isChecked = !!s?.checked;
                          const sev = item.severity ? SEVERITY_COLOR[item.severity] : null;
                          return (
                            <button
                              key={item.id}
                              onClick={() => toggle(item.id)}
                              disabled={isPending}
                              className={cn(
                                'w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-gray-50 transition-colors disabled:opacity-60',
                                isChecked && 'bg-emerald-50/30'
                              )}
                            >
                              <div className={cn(
                                'mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors',
                                isChecked
                                  ? 'bg-emerald-500 text-white'
                                  : 'border border-gray-300 bg-white'
                              )}>
                                {isPending
                                  ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                  : isChecked && <CheckCircle2 className="w-3 h-3" strokeWidth={3} />
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                {sev && (
                                  <div className="mb-1">
                                    <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded', sev.bg, sev.text)}>
                                      {sev.label}
                                    </span>
                                  </div>
                                )}
                                <div className={cn(
                                  'text-[12.5px] leading-snug',
                                  isChecked ? 'text-gray-500 line-through' : 'text-gray-800'
                                )}>
                                  {item.text}
                                </div>
                                {isChecked && s?.by && (
                                  <div className="text-[10px] text-emerald-700 mt-1">
                                    Checked by <strong>{s.by}</strong>
                                    {s.at && <> · {timeAgo(s.at)}</>}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Reset confirm modal */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !resetting && setShowResetConfirm(false)}>
            <div className="bg-white rounded-xl shadow-xl ring-1 ring-gray-100 max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900">Reset all checks?</h3>
                <p className="text-xs text-gray-500 mt-1">This will untick every box for every user. Use it to start a fresh test pass.</p>
              </div>
              <div className="px-5 py-3 flex justify-end gap-2 bg-gray-50/40">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetting}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={resetAll}
                  disabled={resetting}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {resetting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Reset all
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export default function QAPage() {
  return (
    <AuthProvider>
      <QAContent />
    </AuthProvider>
  );
}
