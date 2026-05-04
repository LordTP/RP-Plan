'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
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
 */

interface TestItem { id: string; text: string; }
interface TestGroup { title: string; items: TestItem[]; }
interface TestSection { id: string; title: string; subtitle?: string; flair?: string; groups: TestGroup[]; }

const PLAN: TestSection[] = [
  {
    id: 'merch',
    title: '1) Merch / Internal users',
    subtitle: 'Approving date changes, browsing orders, leaving comments, importing/exporting.',
    groups: [
      {
        title: 'Login + dashboard',
        items: [
          { id: 'm.l.1', text: 'Log in. Land on /dashboard. KPIs at top show numbers (Total / In Production / Shipped / Open Value / Overdue).' },
          { id: 'm.l.2', text: 'Both "While You Were Away" + "Changes This Session" cards collapse via the chevron and remember state on reload.' },
          { id: 'm.l.3', text: 'Click a PO in the activity feed → jumps to /orders-v2 with that PO expanded.' },
          { id: 'm.l.4', text: 'Click "Try the v2 layout →" — lands on /dashboard-v2.' },
        ],
      },
      {
        title: 'New v2 dashboard (/dashboard-v2)',
        items: [
          { id: 'm.v.1', text: 'Inbox top-left lists pending approvals — count beside "Inbox" matches what you expect.' },
          { id: 'm.v.2', text: 'Group: PO / Supplier / Flat — same approvals regroup; counts at the bottom stay the same.' },
          { id: 'm.v.3', text: 'Filter pills (Dates / Samples / Other) filter the list immediately.' },
          { id: 'm.v.4', text: 'Hover any row → Approve / Reject buttons appear on the right.' },
          { id: 'm.v.5', text: 'Tick a group checkbox → every row in that group selects + bulk action bar appears.' },
          { id: 'm.v.6', text: 'Click "Approve all N" on a group → those rows disappear and stay gone after reload.' },
          { id: 'm.v.7', text: 'Bulk Reject all → modal asks for a reason, submitting clears those rows.' },
          { id: 'm.v.8', text: 'Scroll the inbox — group headers stick to the top of the visible list.' },
          { id: 'm.v.9', text: 'Scroll the activity feed — PO headers stay sticky too.' },
          { id: 'm.v.10', text: 'Warnings Centre below the fold — categories on the left switch the right pane; search works.' },
        ],
      },
      {
        title: 'Orders pages (/orders + /orders-v2)',
        items: [
          { id: 'm.o.1', text: 'Open /orders-v2 → click a PO to expand → click a single style → detail modal opens.' },
          { id: 'm.o.2', text: 'Sticky pill nav: clicking Product / Sampling / Shipping / Timeline scrolls each section to the top of the visible area (NOT past it).' },
          { id: 'm.o.3', text: 'As you scroll, the matching pill highlights. Timeline highlights when you reach the bottom.' },
          { id: 'm.o.4', text: 'Edit an editable field (e.g. a date) — cross-OS date picker opens. Pick a date, click out, value saves.' },
          { id: 'm.o.5', text: 'Switch to Comments tab → leave a comment → close + reopen → comment persists.' },
        ],
      },
      {
        title: 'Approvals at scale (try with 10+ pending)',
        items: [
          { id: 'm.a.1', text: 'Multi-select 5 changes from different POs → bulk bar shows "5 selected" → Approve all clears them.' },
          { id: 'm.a.2', text: 'Same with bulk Reject — single reason applies to all 5.' },
        ],
      },
      {
        title: 'Excel import / export',
        items: [
          { id: 'm.e.1', text: '/import → upload a small test file → response shows rows_processed / created / updated.' },
          { id: 'm.e.2', text: 'Export an Excel from /orders → re-upload via /import → 0 created, N updated (upsert).' },
          { id: 'm.e.3', text: 'Export modal on /orders → "Export all" downloads a file.' },
          { id: 'm.e.4', text: 'Export modal on /orders → "Choose POs" → tick 2-3 → button says "Export 2 POs" → file downloads with only those.' },
        ],
      },
    ],
  },
  {
    id: 'designer',
    title: '2) Designers',
    subtitle: 'Components, samples, fit/strike/lab/PPS approvals, resubmissions. No cost/value columns.',
    groups: [
      {
        title: 'Login + dashboard',
        items: [
          { id: 'd.l.1', text: 'Log in. /dashboard renders. Nav has NO Tracking, Analytics, or Settings.' },
          { id: 'd.l.2', text: 'Warnings Centre shows up at bottom of dashboard — most important panel for designers.' },
          { id: 'd.l.3', text: 'Click a warning category on the left rail → click an item on the right → deep-links into /design with that PO/style open.' },
        ],
      },
      {
        title: 'Design submenu',
        items: [
          { id: 'd.s.1', text: '/design-overview renders.' },
          { id: 'd.s.2', text: '/design — table loads. Confirm cost/value columns NOT shown.' },
          { id: 'd.s.3', text: '/design-components — table loads.' },
          { id: 'd.s.4', text: '/resubmissions — page loads, shows rejected samples grouped by PO.' },
        ],
      },
      {
        title: 'Components',
        items: [
          { id: 'd.c.1', text: 'Open a PO with multiple styles → "Add component" → name it → Apply to: this style only / all on PO / select specific. Each option creates the right number of rows.' },
          { id: 'd.c.2', text: 'On a component → set Fit Sample status to APPROVED + received date. Order\'s overall Fit status updates via auto-calc.' },
          { id: 'd.c.3', text: 'Set status to REJECTED → Reject Sample modal opens, requires a reason. Submit → order Fit status flips to OUTSTANDING and AttemptBadge shows v2.' },
        ],
      },
      {
        title: 'Resubmissions flow',
        items: [
          { id: 'd.r.1', text: 'On /resubmissions → find a rejected sample → "View".' },
          { id: 'd.r.2', text: 'Rejection context (who/when/reason) + attempt history (v1, v2 timeline) shown.' },
          { id: 'd.r.3', text: 'Approve a v2 sample → attempt closes APPROVED, order overall sample status reverts to APPROVED.' },
        ],
      },
      {
        title: 'V2 modal samples section',
        items: [
          { id: 'd.v.1', text: '/orders-v2 → open a style → Sampling pill — each sample area (Fit / Strike / Lab / PPS) shows status + dates.' },
          { id: 'd.v.2', text: 'A REJECTED status shows the amber rejection banner with the prior rejection reason.' },
        ],
      },
    ],
  },
  {
    id: 'factory',
    title: '3) Factory / Supplier users',
    subtitle: 'Heavily gated — small editable set, date changes go through approval. Test exactly.',
    groups: [
      {
        title: 'Login + nav',
        items: [
          { id: 'f.l.1', text: 'Log in → /dashboard. Nav shows ONLY Factory submenu (no Design, Tracking, Analytics, Settings, Reporting).' },
          { id: 'f.l.2', text: 'Dashboard counts only show orders for THEIR factory.' },
        ],
      },
      {
        title: 'Factory Product (/factory-product + v2)',
        items: [
          { id: 'f.p.1', text: 'Page loads — only orders matching their factory visible. Try a different supplier login → only theirs shown.' },
          { id: 'f.p.2', text: 'Open a style → V2 detail modal. Sticky pill nav works the same as /orders-v2 (Product / Sampling / Shipping / Timeline).' },
          { id: 'f.p.3', text: 'Sampling section — try setting Fit Sample status to APPROVED. Saves OR returns 403 (depending on role_column_settings).' },
        ],
      },
      {
        title: 'Date-change approval gate (the critical flow)',
        items: [
          { id: 'f.d.1', text: 'Edit Vessel ETD on a style → reason prompt appears → submit. Refresh: field still shows OLD value (pending).' },
          { id: 'f.d.2', text: 'Hover the field → indicates "pending approval".' },
          { id: 'f.d.3', text: 'Switch to internal user → /dashboard-v2 → Inbox → find the change → Approve. Switch back to supplier: field shows NEW value.' },
          { id: 'f.d.4', text: 'Repeat — internal Reject this time. Supplier sees field rolled back + rejection reason somewhere on the order.' },
        ],
      },
      {
        title: 'Shipment drafts (/factory-shipping)',
        items: [
          { id: 'f.s.1', text: '"New shipment draft" → if admin, factory picker; if supplier, skips it.' },
          { id: 'f.s.2', text: 'In draft, search/filter SKUs by PO/style. Tick SKUs from one PO + a different PO. Right side shows them grouped by PO.' },
          { id: 'f.s.3', text: 'Fill 5 shared fields (FCL/LCL, Vessel Name, ETD, ETA, Tracking). Click Confirm → summary modal → confirm.' },
          { id: 'f.s.4', text: 'Open one of those orders → Shipping section. Vessel info is there.' },
          { id: 'f.s.5', text: 'Reopen the confirmed draft → red Edit button → change Vessel ETD → save → linked order shows new ETD.' },
          { id: 'f.s.6', text: 'Edit a SKU quantity in the draft (partial shipment). Save and confirm → linked order shows the partial.' },
          { id: 'f.s.7', text: 'Pick a SKU already on another confirmed shipment → conflict note appears under that SKU row warning of the prior link.' },
        ],
      },
      {
        title: 'Export modal',
        items: [
          { id: 'f.e.1', text: '/factory-product → click Export → "Choose POs" → ONLY their factory\'s POs in the picker.' },
          { id: 'f.e.2', text: '/factory-product-v2 → same export modal, same supplier-scoped picker.' },
        ],
      },
    ],
  },
  {
    id: 'cross',
    title: '4) Cross-role smoke tests',
    subtitle: 'Quick, ~2-3 minutes total.',
    groups: [
      {
        title: 'General',
        items: [
          { id: 'x.1', text: 'Comments — leave a comment as user A → log in as user B (other role) → they see it, can mark read, can @mention.' },
          { id: 'x.2', text: 'Date picker — open on Mac, Windows, Firefox. Looks identical (no native HTML date input anywhere).' },
          { id: 'x.3', text: 'PO deep link — copy /orders-v2?expandPO=XXX&style_code=YYY URL → open in fresh tab → auto-opens that style modal.' },
          { id: 'x.4', text: 'Logout / re-login from any role → no console errors → dashboard renders correctly.' },
        ],
      },
    ],
  },
  {
    id: 'edge',
    title: '5) Edge cases',
    subtitle: 'Things to spot-watch for.',
    groups: [
      {
        title: 'Empty + extreme states',
        items: [
          { id: 'e.1', text: 'Dashboard with 0 pending approvals + 0 warnings + 0 recent activity — friendly empty messages, not crashes.' },
          { id: 'e.2', text: 'One supplier with many POs in the Inbox grouped by Supplier — "Hangzhou · 47 changes across 12 POs" → "Approve all 47" works.' },
          { id: 'e.3', text: 'Long descriptions / customer names — truncate with ellipsis, never break layout.' },
          { id: 'e.4', text: 'Mobile view — open dashboard in dev tools mobile mode. Two-column grid stacks. Inbox + Activity scroll.' },
        ],
      },
    ],
  },
];

const ALL_ITEM_IDS = PLAN.flatMap(s => s.groups.flatMap(g => g.items.map(i => i.id)));

function QAContent() {
  const { user } = useStore();
  const [state, setState] = useState<Record<string, QACheckState>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

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
        {/* Header */}
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QA test plan</h1>
            <p className="text-sm text-gray-500 mt-1">
              Shared checklist · everyone signed in sees the same state · ticks save instantly
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refetch}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
              title="Pull fresh state from server"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" /> Reset all
              </button>
            )}
            <div className="text-xs text-gray-500">
              <span className="font-bold text-gray-900 tabular-nums">{totalDone}</span> / {totalCount} done
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mb-10">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
              style={{ width: `${totalCount === 0 ? 0 : (totalDone / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-12">
          {PLAN.map(section => {
            const stats = sectionStats[section.id] || { done: 0, total: 0 };
            const pct = stats.total === 0 ? 0 : (stats.done / stats.total) * 100;
            return (
              <section key={section.id}>
                <header className="mb-5">
                  <div className="flex items-baseline justify-between flex-wrap gap-3">
                    <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      <span className="tabular-nums"><span className="text-gray-900 font-bold">{stats.done}</span> / {stats.total}</span>
                      <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  {section.subtitle && (
                    <p className="text-xs text-gray-500 mt-1.5">{section.subtitle}</p>
                  )}
                </header>

                <div className="space-y-6">
                  {section.groups.map(group => (
                    <div key={group.title}>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{group.title}</h3>
                      <div className="bg-white rounded-xl ring-1 ring-gray-200 divide-y divide-gray-100 overflow-hidden">
                        {group.items.map(item => {
                          const s = state[item.id];
                          const isPending = pending.has(item.id);
                          const isChecked = !!s?.checked;
                          return (
                            <button
                              key={item.id}
                              onClick={() => toggle(item.id)}
                              disabled={isPending}
                              className={cn(
                                'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors disabled:opacity-60',
                                isChecked && 'bg-emerald-50/40'
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
                                <div className={cn(
                                  'text-[13px] leading-snug',
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
                              <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">{item.id}</span>
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
