'use client';

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag, Truck, BookOpen, CheckCircle2, AlertTriangle, Info, Search, Calendar,
  FileSpreadsheet, Edit3, Lock, MessageSquare, X, Plus, ChevronDown, ChevronRight,
  Image as ImageIcon, Ship, ArrowRight, Clock, CheckCircle, XCircle, RefreshCw, Package,
  Layers, Trash2, Tag, FileText,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { cn } from '@/lib/utils';
import { FactoryGuideBook } from './GuideBook';

export default function FactoryGuidePage() {
  return (
    <AuthProvider>
      <FactoryGuideContent />
    </AuthProvider>
  );
}

type Section = 'product' | 'shipping' | 'components';

function FactoryGuideContent() {
  const [section, setSection] = useState<Section>('product');

  return (
    <AppShell title="Factory Guide">
      <div className="pb-24">
        {/* Hero */}
        <div className="bg-white rounded-xl ring-1 ring-gray-100 px-8 py-7 mb-5 flex items-start gap-5">
          <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-7 h-7 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Factory Guide</h1>
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed max-w-[78ch]">
              How to use the Critical Path app — for our factory partners. Three pages: <strong>Product</strong> (find your orders, request date changes, track approvals), <strong>Components</strong> (add the components for every new order, then track them to sign-off) and <strong>Shipping</strong> (raise shipment drafts when goods are ready to leave).
            </p>
          </div>
        </div>


        {/* ============== SECTION: PRODUCT ============== */}
        <FactoryGuideBook />

        <div className="mt-12 text-center text-[11px] text-gray-400">
          If you spot something wrong or confusing, please email Source Lab — we'd rather know.
        </div>
      </div>
    </AppShell>
  );
}

/* ============== Layout helpers ============== */

function SectionHeader({ icon: Icon, title, blurb }: { icon: any; title: string; blurb: string }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-gray-100 px-7 py-5 mb-4 flex items-start gap-4">
      <div className="w-11 h-11 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-violet-600" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        <p className="text-sm text-gray-600 mt-1 leading-relaxed max-w-[78ch]">{blurb}</p>
      </div>
    </div>
  );
}

/** Anchor id for a step, so the index on the left can jump to it. */
const stepId = (n: string) => `step-${n.replace('.', '-')}`;

/**
 * One step: what to do on the left, the screen it happens on beside it.
 *
 * The page used to stack full-width prose above a full-width mock, which gave
 * a wall of text with a picture dropped into it and no shared edge between
 * them. Splitting the two means the words cannot run long — the column will
 * not let them — and the picture sits next to the instruction it illustrates
 * instead of interrupting it.
 *
 * Children are sorted rather than passed as separate props, so the ~18 call
 * sites did not all have to change: anything visual (a MockShot or a
 * reference Table) goes right, the words go left. A step with nothing visual
 * just gets one readable column.
 */
function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  const kids = React.Children.toArray(children) as React.ReactElement[];
  const visual = kids.filter((c) => React.isValidElement(c) && (c.type === MockShot || c.type === Table));
  const words = kids.filter((c) => !(React.isValidElement(c) && (c.type === MockShot || c.type === Table)));

  return (
    <section id={stepId(number)} className="scroll-mt-28 bg-white rounded-xl ring-1 ring-gray-100 px-6 py-5 mb-3">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-[12px] font-bold text-violet-600 tabular-nums flex-shrink-0 w-5">{number}</span>
        <h3 className="text-[17px] font-bold tracking-tight text-gray-900 leading-snug">{title}</h3>
      </div>

      <div className={cn(
        'gap-x-8 gap-y-4',
        visual.length ? 'grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start' : '',
      )}>
        <div className="min-w-0 text-[14px] text-gray-700 space-y-3 leading-[1.7] max-w-[62ch]">
          {words}
        </div>
        {visual.length > 0 && <div className="min-w-0 space-y-4">{visual}</div>}
      </div>
    </section>
  );
}

function MockShot({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="my-4 rounded-lg overflow-hidden ring-1 ring-gray-200 bg-white">
      <div className="bg-gray-100 px-3 py-2 border-b border-gray-200 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
        <span className="ml-2 text-[10px] text-gray-400 font-mono">criticalpath.sourcelab.co</span>
      </div>
      <div className="bg-gradient-to-br from-gray-50 to-white">
        {children}
      </div>
      <figcaption className="bg-gray-50 px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500 italic text-center">
        {caption}
      </figcaption>
    </figure>
  );
}

function Tips({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-1.5 my-3">{children}</ul>;
}

function Tip({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] text-gray-700 max-w-[72ch]">
      <Icon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function Callout({ type, title, children }: { type: 'info' | 'warn'; title: string; children: React.ReactNode }) {
  const styles = type === 'warn'
    ? { bg: 'bg-amber-50', ring: 'ring-amber-200', icon: 'text-amber-600', title: 'text-amber-900' }
    : { bg: 'bg-blue-50', ring: 'ring-blue-200', icon: 'text-blue-600', title: 'text-blue-900' };
  const Icon = type === 'warn' ? AlertTriangle : Info;
  return (
    <div className={cn('rounded-lg ring-1 px-4 py-3 my-3 flex items-start gap-3 max-w-[76ch]', styles.bg, styles.ring)}>
      <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', styles.icon)} />
      <div className="flex-1">
        <p className={cn('text-[12px] font-bold uppercase tracking-wider mb-0.5', styles.title)}>{title}</p>
        <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-lg ring-1 ring-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 px-4 py-2.5 hover:bg-gray-50">
      <span className="text-[12px] font-semibold text-gray-900">{label}</span>
      <span className="text-[12px] text-gray-600 leading-relaxed max-w-[62ch]">{value}</span>
    </div>
  );
}

/* ============== Inline mockups ============== */

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray' }) {
  const styles: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', styles[tone])}>{children}</span>;
}

/**
 * Mini tracker that mirrors the Requests Centre — the factory's own date-
 * change requests by status. Used in the page-level mock and standalone in
 * step 3.
 */
function TrackerMock() {
  return (
    <div className="p-4 grid grid-cols-3 gap-3">
      {/* Pending */}
      <div className="bg-white rounded-xl ring-1 ring-gray-100 overflow-hidden">
        <div className="px-3 py-2 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
          <Clock className="w-3 h-3 text-orange-600" />
          <span className="text-[10px] font-medium text-orange-800">Pending approval</span>
          <span className="ml-auto text-[9px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full font-semibold">2</span>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium">5050 <span className="text-[9px] text-gray-400">(SS26-CREW-NVY)</span></p>
                <p className="text-[10px] text-gray-500">Revised Po Ex Factory</p>
                <p className="text-[10px] mt-0.5"><span className="text-gray-400">12 May</span> → <span className="font-medium text-orange-600">20 May</span></p>
              </div>
              <X className="w-3 h-3 text-gray-300" />
            </div>
          </div>
          <div className="p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium">4992 <span className="text-[9px] text-gray-400">(SS26-PARKA-OLV)</span></p>
                <p className="text-[10px] text-gray-500">Revised Po Ex Factory</p>
                <p className="text-[10px] mt-0.5"><span className="text-gray-400">21 May</span> → <span className="font-medium text-orange-600">28 May</span></p>
              </div>
              <X className="w-3 h-3 text-gray-300" />
            </div>
          </div>
        </div>
      </div>
      {/* Approved */}
      <div className="bg-white rounded-xl ring-1 ring-gray-100 overflow-hidden">
        <div className="px-3 py-2 bg-green-50 border-b border-green-100 flex items-center gap-2">
          <CheckCircle className="w-3 h-3 text-green-600" />
          <span className="text-[10px] font-medium text-green-800">Approved</span>
          <span className="ml-auto text-[9px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-semibold">3</span>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="p-2">
            <p className="text-[11px] font-medium">4980 <span className="text-[9px] text-gray-400">(SS26-TEE-WHT)</span></p>
            <p className="text-[10px] text-gray-500">Revised Po Ex Factory</p>
            <p className="text-[10px] text-green-600 mt-0.5">Approved by Tom Paul</p>
          </div>
          <div className="p-2">
            <p className="text-[11px] font-medium">4965 <span className="text-[9px] text-gray-400">(SS26-HOOD-BLK)</span></p>
            <p className="text-[10px] text-gray-500">Revised Po Ex Factory</p>
            <p className="text-[10px] text-green-600 mt-0.5">Approved by Sarah Chen</p>
          </div>
        </div>
      </div>
      {/* Rejected */}
      <div className="bg-white rounded-xl ring-1 ring-gray-100 overflow-hidden">
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <XCircle className="w-3 h-3 text-red-600" />
          <span className="text-[10px] font-medium text-red-800">Rejected</span>
          <span className="ml-auto text-[9px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full font-semibold">1</span>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="p-2">
            <p className="text-[11px] font-medium">4992 <span className="text-[9px] text-gray-400">(SS26-PARKA-NVY)</span></p>
            <p className="text-[10px] text-gray-500">Revised Po Ex Factory</p>
            <p className="text-[10px] text-red-600 mt-0.5 truncate">Customer's deadline can't slip — need original date</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single collapsed PO card matching the real V2 styling. */
function POCardCollapsedMock({ po, customer, factory, styles, units, exFac, status, tone }: {
  po: string; customer: string; factory: string; styles: number; units: string; exFac: string;
  status: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray';
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 px-4 py-3 flex items-center gap-3">
      <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold">{po}</span>
          <span className="text-[10px] text-gray-400">·</span>
          <span className="text-[11px] text-gray-500 truncate">{customer}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-gray-400">{factory}</span>
          <span className="text-[10px] text-gray-300">·</span>
          <span className="text-[10px] text-gray-400">{styles} styles</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[11px] font-semibold text-gray-900">{units}</p>
        <p className="text-[9px] text-gray-400">units</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[10px] font-medium text-gray-700">{exFac}</p>
        <p className="text-[9px] text-gray-400">ex-factory</p>
      </div>
      <div className="flex-shrink-0">
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>
    </div>
  );
}

/** Full V2 product page mockup — tracker bar + search row + PO list. */
/* Both drawn from the live supplier view (FactoryV2View). The previous pair
   showed a Pending/Approved/Rejected chip bar over "Sampling / Production" PO
   cards — a design that no longer exists on either the default or the table
   view, so the labels had been corrected on a picture of the wrong screen. */

const V2_POS: { po: string; customer: string; styles: number; qty: string; exfac: string }[] = [
  { po: '5278', customer: 'AL-HILAL', styles: 5, qty: '1,000', exfac: '09 Oct 2026' },
  { po: '5260', customer: 'TK MAXX', styles: 6, qty: '10,512', exfac: '10 Oct 2026' },
  { po: '5265', customer: 'SOURCE LAB', styles: 6, qty: '36', exfac: '10 Oct 2026' },
  { po: '5252', customer: 'LEVY MERCHANDISING', styles: 4, qty: '936', exfac: '30 Oct 2026' },
];

function V2Chrome({ children, expandLabel }: { children: React.ReactNode; expandLabel: string }) {
  return (
    <div className="p-3 bg-gray-50">
      {/* Supplier-only date-change tracker, above everything else */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[['Pending', '2', 'amber'], ['Approved', '3', 'green'], ['Rejected', '1', 'red']].map(([l, n, tone]) => (
          <div key={l} className={cn('rounded-md border px-2 py-1 flex items-center gap-1.5',
            tone === 'amber' ? 'border-amber-200 bg-amber-50' : tone === 'green' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')}>
            <span className={cn('text-[9px] font-semibold',
              tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-green-700' : 'text-red-700')}>{l}</span>
            <span className="ml-auto text-[9px] font-bold text-gray-700">{n}</span>
          </div>
        ))}
      </div>
      {/* Search + actions */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[9px] text-gray-400">
          Search PO, customer, style, factory…
        </div>
        {['Refresh', 'Export', 'Table View'].map(x => (
          <span key={x} className="px-1.5 py-1 rounded-md border border-gray-200 bg-white text-[9px] font-semibold text-gray-600">{x}</span>
        ))}
      </div>
      {/* Status tiles — filters */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="rounded-md border border-primary-400 ring-1 ring-primary-200 bg-white px-2 py-1.5">
          <p className="text-[7.5px] font-bold tracking-wide text-gray-500">OPEN ORDERS</p>
          <p className="text-sm font-extrabold text-gray-900">13</p>
          <p className="text-[7.5px] text-gray-400">13 shown</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5">
          <p className="text-[7.5px] font-bold tracking-wide text-gray-500">· UNKNOWN</p>
          <p className="text-sm font-extrabold text-gray-900">13</p>
          <p className="text-[7.5px] text-gray-400">11,280 units</p>
        </div>
      </div>
      {/* Chips */}
      <div className="flex items-center gap-1.5 mb-2">
        {['Customer ⌄', 'Ex-factory ⌄', 'Missing dates'].map(x => (
          <span key={x} className="px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-[9px] font-semibold text-gray-600">{x}</span>
        ))}
        <span className="ml-auto px-1.5 py-0.5 rounded-full border border-primary-300 bg-primary-50 text-primary-700 text-[9px] font-semibold">Group by PO</span>
        <span className="text-[9px] font-semibold text-gray-500">{expandLabel}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[9px] font-semibold">Open</span>
        <span className="text-[9px] text-gray-400">All</span>
        <span className="text-[9px] text-gray-400">Shipped</span>
      </div>
      {/* Table */}
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 border-b border-gray-100 text-[8px] font-semibold text-gray-500">
          <span className="w-[86px]">Style</span><span className="flex-1">Description</span>
          <span className="w-[64px]">Colour</span><span className="w-[52px]">Status</span>
          <span className="w-[64px]">Ex-factory</span><span className="w-[30px] text-right">Qty</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function PORow({ po, customer, styles, qty, exfac, open }: {
  po: string; customer: string; styles: number; qty: string; exfac: string; open?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-50 text-[9px]">
      <span className="w-[86px] flex items-center gap-1">
        <span className="text-gray-400">{open ? '⌄' : '›'}</span>
        <span className="font-mono font-bold text-gray-900">{po}</span>
      </span>
      <span className="flex-1 text-gray-700">{customer} <span className="text-gray-400">· PRIME-23</span></span>
      <span className="w-[64px] text-gray-500">{styles} styles</span>
      <span className="w-[52px]"><span className="px-1 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[8px] font-semibold">Unknown</span></span>
      <span className="w-[64px] text-gray-600">{exfac}</span>
      <span className="w-[30px] text-right font-semibold text-gray-900">{qty}</span>
    </div>
  );
}

function ProductPageMock() {
  return (
    <V2Chrome expandLabel="Expand all">
      {V2_POS.map(r => <PORow key={r.po} {...r} />)}
    </V2Chrome>
  );
}

/* The style detail panel. Drawn as what it is — a panel sliding OVER the list
   from the right, not a full-width page. The first attempt rendered it edge to
   edge with everything crammed together, which read as a different screen. */
function StyleDetailMock() {
  const kpis: [string, string, string | null][] = [
    ['TOTAL QTY', '393', null],
    ['EX-FACTORY', '07 Oct 2026', 'in 23d'],
    ['ETA CUSTOMER', '\u2014', null],
    ['SAMPLING', '0 of 2', 'Fit, PPS pending'],
  ];
  // Right-hand column. The panel calls this ORDER, not "Product", and none
  // of these carry a pencil for a factory — the only field a factory can
  // touch on the whole panel is Revised Ex-Factory, and that opens a change
  // request rather than saving.
  const orderFacts: [string, string][] = [
    ['Description', 'AL-HILAL SNAPBACK HAT HIGH CROWN'],
    ['Customer', 'AL-HILAL'],
    ['Order Reference', 'CAPS'],
    ['Colour', 'BIRCH'],
    ['Gender', '009'],
    ['Season', 'AW26'],
  ];
  const journey: [string, string, 'done' | 'now' | 'todo'][] = [
    ['Sent to Factory', '29/07/2026', 'done'],
    ['Tech Packs Sent', '29/07/2026', 'done'],
    ['Specs Sent', '31/07/2026', 'done'],
    ['Requested Ex-Factory', '23/09/2026', 'done'],
    ['Revised Ex-Factory', '07/10/2026', 'now'],
    ['ETA UK', '01/12/2026', 'todo'],
    ['ETA Customer', '06/12/2026', 'todo'],
  ];
  const comps: [string, 'strike_off' | 'lab_dip'][] = [
    ['AOP PRINT', 'strike_off'], ['AOP PRINT', 'strike_off'],
    ['RIB FABRIC', 'strike_off'], ['NINE IRON', 'lab_dip'],
  ];
  return (
    <div className="relative bg-gray-50" style={{ minHeight: 430 }}>
      {/* the list, still there behind the panel */}
      <div className="absolute inset-0 p-3">
        <div className="h-6 w-56 rounded bg-white border border-gray-200 mb-2" />
        <div className="space-y-1">
          {['5278', 'S006165A-0501-NRO', 'S006166A-0217-NRO', 'S006167A-0501-NRO', '5260', '5265'].map((r, i) => (
            <div key={r} className={cn('h-5 rounded border border-gray-100 bg-white flex items-center px-2',
              i === 1 && 'ring-1 ring-primary-200')}>
              <span className="font-mono text-[8px] text-gray-500">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* the panel itself */}
      <div className="absolute inset-y-0 right-0 w-[78%] bg-white shadow-2xl border-l border-gray-200 overflow-hidden">
        <div className="px-3 pt-2.5 pb-2 border-b border-gray-100">
          <p className="text-[8px] text-gray-400">5278 · S006165A-0501-NRO · updated 6 hours ago</p>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-[13px] font-extrabold text-gray-900">AL-HILAL SNAPBACK HAT</p>
            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[8px] font-semibold">Unknown</span>
            <span className="text-[9px] text-gray-500">· BIRCH</span>
            <span className="ml-auto px-1.5 py-1 rounded-md border border-gray-200 text-[8.5px] font-semibold text-gray-600">Comments</span>
            <span className="text-[9px] text-gray-300">⌃ ⌄ ✕</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 px-3 py-2.5 bg-gray-50/70">
          {kpis.map(([l, v, sub], i) => (
            <div key={l} className={cn('rounded-lg border bg-white px-2 py-2',
              i === 3 ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200')}>
              <p className="text-[7px] font-bold tracking-wide text-gray-500">{l}</p>
              <p className="text-[12px] font-extrabold text-gray-900 leading-snug">{v}</p>
              {sub && <p className="text-[7px] text-gray-400">{sub}</p>}
            </div>
          ))}
        </div>

        {/* Two columns: the work on the left, the facts on the right. There is
            no jump bar — the panel dropped it when it went two-column, and
            drawing one here sent factories looking for a control that does
            not exist. */}
        <div className="grid grid-cols-[1.35fr_1fr] border-t border-gray-100">
          <div className="px-3 py-2.5 border-r border-gray-200">
            <div className="flex items-center gap-1.5 mb-1.5">
              <p className="text-[8px] font-bold tracking-wide text-gray-700 border-l-2 border-amber-500 pl-1.5">SAMPLING</p>
              <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[7px] font-bold">2 PENDING</span>
              <span className="ml-1 text-[8px] text-gray-500">COMPONENTS</span>
              <span className="px-1 rounded-full bg-gray-100 text-gray-600 text-[7px] font-bold">3</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {comps.slice(0, 3).map(([name, type], i) => (
                <div key={i} className="rounded-lg border border-green-200 bg-white px-2.5 py-2">
                  <div className="flex items-center"><TypeBadge type={type} /><span className="ml-auto text-[9px] text-gray-300">›</span></div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <p className="text-[9.5px] font-bold text-gray-900 truncate">{name}</p>
                    <span className="text-[6.5px] font-semibold px-1 py-0.5 rounded-full bg-violet-50 text-violet-700 flex-shrink-0">5 styles</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="px-1 py-0.5 rounded bg-green-100 text-green-700 text-[7px] font-bold">APPROVED</span>
                    <span className="text-[7px] text-gray-400">approved 3 Sep</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[7.5px] font-bold tracking-wide text-gray-500 mt-2.5 mb-1">FIT SAMPLE</p>
            <div className="rounded-lg border border-amber-200 bg-amber-50/30 px-2.5 py-1.5">
              {['Required', 'Status', 'Received', 'Approved'].map((k) => (
                <div key={k} className="flex items-center justify-between py-0.5">
                  <span className="text-[8.5px] text-gray-600">{k}</span>
                  <span className="text-[8.5px] text-gray-400">—</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-3 py-2.5">
            <p className="text-[8px] font-bold tracking-wide text-gray-700 border-l-2 border-primary-500 pl-1.5 mb-1.5">ORDER</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden mb-2.5">
              {orderFacts.map(([k, v]) => (
                <div key={k} className="flex items-center px-2.5 py-1 border-b border-gray-50 last:border-0">
                  <span className="text-[8.5px] text-gray-600 flex-1">{k}</span>
                  <span className="text-[8.5px] font-semibold text-gray-900 truncate max-w-[92px]">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-[8px] font-bold tracking-wide text-gray-700 border-l-2 border-violet-500 pl-1.5 mb-1.5">JOURNEY</p>
            <div className="rounded-lg border border-gray-200 px-2.5 py-1.5">
              {journey.map(([k, v, state]) => (
                <div key={k} className="flex items-center gap-1.5 py-0.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
                    state === 'done' ? 'bg-emerald-500' : state === 'now' ? 'bg-amber-500' : 'border border-gray-300')} />
                  <span className={cn('text-[8.5px] flex-1', state === 'now' ? 'font-bold text-gray-900' : 'text-gray-600')}>{k}</span>
                  <span className="text-[8px] text-gray-500 tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandedPOMock() {
  const styles: [string, string, string, string][] = [
    ['S006165A-0501-NRO', 'AL-HILAL SNAPBACK HAT HIGH CROWN', 'BIRCH', '393'],
    ['S006166A-0217-NRO', 'AL-HILAL VINTAGE WASH HAT', 'NINE IRON', '334'],
    ['S006167A-0501-NRO', 'AL-HILAL DAD STYLE CORDUROY HAT', 'BIRCH', '358'],
    ['S006169A-0875-NRO', 'AL-HILAL VINTAGE WASH HAT', 'BLUE WING TEAL', '169'],
  ];
  return (
    <V2Chrome expandLabel="Collapse all">
      <PORow {...V2_POS[0]} open />
      {styles.map(([code, desc, colour, qty]) => (
        <div key={code} className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-50 text-[9px] bg-white">
          <span className="w-[86px] font-mono text-gray-800 truncate">{code}</span>
          <span className="flex-1 text-gray-700">{desc}</span>
          <span className="w-[64px] text-gray-500">{colour}</span>
          <span className="w-[52px]"><span className="px-1 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[8px] font-semibold">Unknown</span></span>
          <span className="w-[64px] text-gray-600">07 Oct 2026</span>
          <span className="w-[30px] text-right font-semibold text-gray-900">{qty}</span>
        </div>
      ))}
      {V2_POS.slice(1, 3).map(r => <PORow key={r.po} {...r} />)}
    </V2Chrome>
  );
}

function DateChangeModalMock() {
  return (
    <div className="p-6 bg-gray-100/60 flex items-center justify-center min-h-[400px]">
      <div className="bg-white rounded-xl shadow-lg ring-1 ring-gray-200 w-full max-w-md">
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-orange-600" strokeWidth={2.5} />
          </div>
          <div>
            <h4 className="text-sm font-bold">Request Revised Ex-Factory change</h4>
            <p className="text-[10px] text-gray-500">PO 5050 · SS26-CREW-NVY</p>
          </div>
        </div>
        <div className="px-5 pb-4 space-y-3">
          {/* Approval warning */}
          <div className="px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2 text-[11px] text-orange-800">
            <Clock className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>This change requires approval from Source Lab. They'll be notified once you submit.</span>
          </div>
          {/* Current value */}
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between text-[11px]">
            <span className="text-gray-500">Current Revised Ex-Factory</span>
            <span className="font-semibold text-gray-900">12 May 2026</span>
          </div>
          {/* New date */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 block mb-1">New date</label>
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-[12px] font-semibold num">
              <Calendar className="w-3 h-3 text-gray-400" />
              20 May 2026
            </div>
          </div>
          {/* Reason */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Reason <span className="text-red-500 normal-case">*</span></label>
            <div className="px-3 py-2 border-2 border-orange-200 rounded-lg text-[11px] text-gray-700 min-h-[44px]">
              Fabric mill delay — knitting starts 1 week late
            </div>
          </div>
          {/* Scope */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 block mb-1.5">Apply to</label>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[11px]"><div className="w-3 h-3 rounded-full border-2 border-orange-600 bg-orange-600 ring-2 ring-white shadow-sm"></div>This style only</label>
              <label className="flex items-center gap-2 text-[11px] text-gray-600"><div className="w-3 h-3 rounded-full border-2 border-gray-300"></div>All styles on PO 5050</label>
              <label className="flex items-center gap-2 text-[11px] text-gray-600"><div className="w-3 h-3 rounded-full border-2 border-gray-300"></div>Specific styles</label>
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          <button className="flex-1 px-3 py-2 text-[11px] font-medium text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
          <button className="flex-1 px-3 py-2 text-[11px] font-bold text-white bg-orange-600 rounded-lg">Submit for approval</button>
        </div>
      </div>
    </div>
  );
}

function RejectionPanelMock() {
  return (
    <div className="p-4">
      <div className="rounded-lg ring-2 ring-red-200 bg-red-50/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">REJECTED · v2</div>
          <span className="text-[10px] text-gray-500">14 days ago</span>
          <span className="ml-auto text-[10px] text-gray-500">by Tom Paul (Source Lab)</span>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 mb-3">
          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Reason</span>
          <span className="text-[12px] font-semibold text-gray-900">Quality — surface defect</span>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 mb-3">
          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Notes from brand</span>
          <span className="text-[12px] text-gray-700 italic leading-relaxed">"Twist on the selvedge edge — please re-knit the rib with corrected tension. The body fabric is fine, this is rib only."</span>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3">
          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Photo</span>
          <div className="bg-white border border-gray-200 rounded h-24 w-32 flex items-center justify-center text-gray-300">
            <ImageIcon className="w-6 h-6"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentsSidebarMock() {
  return (
    <div className="p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5"/>Comments</h4>
        <span className="text-[10px] text-gray-500">3 comments</span>
      </div>
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-700 flex-shrink-0">TP</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold">Tom Paul</span><span className="text-[9px] text-gray-400">Source Lab · 2d ago</span></div>
            <p className="text-[11px] text-gray-700 mt-0.5 leading-relaxed">Hi <span className="text-violet-700 font-semibold">@Cherry</span> — can you confirm when v2 rib will ship? Need to manage internal expectations.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-[9px] font-bold text-amber-700 flex-shrink-0">CW</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold">Cherry Wang</span><span className="text-[9px] text-gray-400">PRIME-23 · 1d ago</span></div>
            <p className="text-[11px] text-gray-700 mt-0.5 leading-relaxed">Hi Tom — fabric mill confirmed delivery on Wed. We'll knit Thu/Fri and courier v2 rib Monday. Aiming arrival London end of next week.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-700 flex-shrink-0">TP</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold">Tom Paul</span><span className="text-[9px] text-gray-400">Source Lab · 1d ago</span></div>
            <p className="text-[11px] text-gray-700 mt-0.5 leading-relaxed">Great, thanks 🙏</p>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-400">Add a comment… @ to mention</div>
      </div>
    </div>
  );
}

function ShippingListMock() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-bold">Shipping</h4>
        <span className="text-[10px] text-gray-500">5 active</span>
        <button className="ml-auto px-2.5 py-1 text-[10px] font-bold text-white bg-violet-600 rounded flex items-center gap-1"><Plus className="w-3 h-3"/>New draft</button>
      </div>
      <div className="border border-gray-200 rounded overflow-hidden bg-white">
        <table className="w-full text-[10px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500 font-semibold uppercase tracking-wider">
              <th className="px-2 py-1.5">Reference</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Vessel</th>
              <th className="px-2 py-1.5">ETD</th>
              <th className="px-2 py-1.5">POs / SKUs / Units</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold">SH-2026-014</td><td className="px-2 py-1.5"><StatusPill tone="green">CONFIRMED</StatusPill></td><td className="px-2 py-1.5 text-gray-700">MAERSK SEALAND</td><td className="px-2 py-1.5 num text-gray-600">14 May</td><td className="px-2 py-1.5 num text-gray-600">2 · 18 · 3,400</td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold">SH-2026-015</td><td className="px-2 py-1.5"><StatusPill tone="amber">DRAFT</StatusPill></td><td className="px-2 py-1.5 text-gray-400">—</td><td className="px-2 py-1.5 num text-gray-400">—</td><td className="px-2 py-1.5 num text-gray-600">1 · 6 · 1,200</td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold">SH-2026-013</td><td className="px-2 py-1.5"><StatusPill tone="green">CONFIRMED</StatusPill></td><td className="px-2 py-1.5 text-gray-700">CMA CGM JAGUAR</td><td className="px-2 py-1.5 num text-gray-600">2 May</td><td className="px-2 py-1.5 num text-gray-600">3 · 22 · 4,800</td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold">SH-2026-012</td><td className="px-2 py-1.5"><StatusPill tone="amber">DRAFT</StatusPill></td><td className="px-2 py-1.5 text-gray-400">—</td><td className="px-2 py-1.5 num text-gray-400">—</td><td className="px-2 py-1.5 num text-gray-600">1 · 4 · 850</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SKUPickerMock() {
  return (
    <div className="p-4">
      <h4 className="text-sm font-bold mb-2">Select SKUs to include</h4>
      <div className="relative mb-2">
        <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2"/>
        <div className="pl-7 pr-3 py-1.5 text-[11px] bg-white border border-gray-200 rounded text-gray-400">Filter by PO or style…</div>
      </div>
      <div className="border border-gray-200 rounded bg-white">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-violet-600 bg-violet-600 flex items-center justify-center"><span className="text-white text-[8px] font-bold">✓</span></div>
          <span className="text-[11px] font-bold">PO 5050</span>
          <span className="text-[10px] text-gray-500">LEVY MERCHANDISING · 4 styles · 2,400 units</span>
          <ChevronDown className="w-3 h-3 text-gray-400 ml-auto"/>
        </div>
        <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-violet-600 bg-violet-600 flex items-center justify-center"><span className="text-white text-[8px] font-bold">✓</span></div>
          <span className="text-[10px] font-semibold flex-1">SS26-CREW-OAT</span>
          <span className="text-[9px] text-gray-500">Oat · 600u</span>
          <div className="w-14 px-2 py-0.5 text-[10px] font-semibold text-center border border-gray-200 rounded num">600</div>
        </div>
        <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-violet-600 bg-violet-600 flex items-center justify-center"><span className="text-white text-[8px] font-bold">✓</span></div>
          <span className="text-[10px] font-semibold flex-1">SS26-CREW-CHA</span>
          <span className="text-[9px] text-gray-500">Charcoal · 600u</span>
          <div className="w-14 px-2 py-0.5 text-[10px] font-semibold text-center border border-amber-300 bg-amber-50 text-amber-700 rounded num">300</div>
        </div>
        <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-100 bg-amber-50/30">
          <div className="w-3 h-3 rounded border-2 border-gray-300"></div>
          <span className="text-[10px] font-semibold flex-1">SS26-HOOD-BLK</span>
          <span className="text-[9px] text-red-600 font-semibold">⚠ already in draft SH-2026-012</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-gray-300"></div>
          <span className="text-[11px] font-bold">PO 4992</span>
          <span className="text-[10px] text-gray-500">AL-HILAL · 3 styles · 1,800 units</span>
          <ChevronRight className="w-3 h-3 text-gray-400 ml-auto"/>
        </div>
      </div>
    </div>
  );
}

function ShipmentDetailsMock() {
  return (
    <div className="p-4">
      <h4 className="text-sm font-bold mb-3">Shipment details</h4>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Mode</label>
          <div className="flex items-center gap-1">
            <div className="px-3 py-1.5 text-[11px] font-bold bg-violet-600 text-white rounded">FCL</div>
            <div className="px-3 py-1.5 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 rounded">LCL</div>
            <div className="px-3 py-1.5 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 rounded">AIR</div>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Vessel name</label>
          <div className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[12px] font-semibold flex items-center gap-2"><Ship className="w-3 h-3 text-gray-400"/>MAERSK SEALAND</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Vessel ETD</label>
            <div className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[12px] font-semibold flex items-center gap-2 num"><Calendar className="w-3 h-3 text-gray-400"/>14 May 2026</div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">ETA to port</label>
            <div className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[12px] font-semibold flex items-center gap-2 num"><Calendar className="w-3 h-3 text-gray-400"/>9 Jun 2026</div>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Tracking / P-number</label>
          <div className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[12px] font-mono">MAEU4892017</div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
        <button className="px-3 py-1.5 text-[11px] font-medium text-gray-700 border border-gray-300 rounded">Save draft</button>
        <button className="px-3 py-1.5 text-[11px] font-bold text-white bg-violet-600 rounded">Confirm shipment</button>
      </div>
    </div>
  );
}

function ConfirmModalMock() {
  return (
    <div className="p-6 bg-gray-100/60 flex items-center justify-center min-h-[300px]">
      <div className="bg-white rounded-lg shadow-lg ring-1 ring-gray-200 w-full max-w-md">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600"/><h4 className="text-sm font-bold">Confirm shipment</h4></div>
          <X className="w-4 h-4 text-gray-400"/>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[12px] text-gray-700">You're about to confirm <strong>SH-2026-015</strong>. This locks the SKU list and notifies Source Lab.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded p-2 text-center"><div className="text-[9px] uppercase tracking-widest font-bold text-gray-500">POs</div><div className="text-xl font-extrabold num">2</div></div>
            <div className="bg-gray-50 rounded p-2 text-center"><div className="text-[9px] uppercase tracking-widest font-bold text-gray-500">SKUs</div><div className="text-xl font-extrabold num">7</div></div>
            <div className="bg-gray-50 rounded p-2 text-center"><div className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Units</div><div className="text-xl font-extrabold num">1,800</div></div>
          </div>
          <div className="bg-amber-50 ring-1 ring-amber-200 rounded p-2.5 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5"/>
            <p className="text-[11px] text-amber-900">1 SKU is a partial shipment — 300 of 600 units. Remainder stays open for a future draft.</p>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 text-[11px] font-medium text-gray-700 rounded">Back</button>
          <button className="px-3 py-1.5 text-[11px] font-bold text-white bg-green-600 rounded flex items-center gap-1.5">Confirm shipment <ArrowRight className="w-3 h-3"/></button>
        </div>
      </div>
    </div>
  );
}

function ConfirmedShipmentMock() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-bold">SH-2026-015</h4>
        <StatusPill tone="green">CONFIRMED</StatusPill>
        <span className="text-[10px] text-gray-500">confirmed 12 May 2026 by Cherry Wang</span>
        <button className="ml-auto px-2 py-1 text-[10px] font-semibold bg-white border border-gray-200 rounded flex items-center gap-1"><Edit3 className="w-3 h-3"/>Edit shipping fields</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-gray-200 rounded">
          <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-100 flex items-center gap-2">
            <Lock className="w-3 h-3 text-gray-500"/>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">SKUs (locked)</span>
          </div>
          <div className="p-2 space-y-1 bg-gray-50/50">
            <div className="bg-white rounded px-2 py-1 text-[10px] flex items-center gap-2"><span className="font-semibold">SS26-CREW-OAT</span><span className="text-gray-500 ml-auto num">600</span></div>
            <div className="bg-white rounded px-2 py-1 text-[10px] flex items-center gap-2"><span className="font-semibold">SS26-CREW-CHA</span><span className="text-amber-700 ml-auto num">300 / 600</span></div>
            <div className="bg-white rounded px-2 py-1 text-[10px] flex items-center gap-2"><span className="font-semibold">SS26-PARKA-OLV</span><span className="text-gray-500 ml-auto num">900</span></div>
          </div>
        </div>
        <div className="border border-gray-200 rounded">
          <div className="bg-violet-50 px-3 py-1.5 border-b border-gray-100 flex items-center gap-2">
            <Edit3 className="w-3 h-3 text-violet-600"/>
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Shipping (editable)</span>
          </div>
          <div className="p-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between"><span className="text-gray-500">Mode</span><span className="font-semibold">FCL</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-500">Vessel</span><span className="font-semibold">MAERSK SEALAND</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-500">ETD</span><span className="font-semibold num">14 May 2026</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-500">ETA port</span><span className="font-semibold num">9 Jun 2026</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-500">Tracking</span><span className="font-mono text-[10px]">MAEU4892017</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ============== Component mocks (for the Components tab) ============== */

function TypeBadge({ type }: { type: 'strike_off' | 'lab_dip' | 'label' }) {
  const styles = type === 'strike_off' ? 'bg-amber-100 text-amber-800'
    : type === 'lab_dip'   ? 'bg-cyan-100 text-cyan-800'
    :                        'bg-fuchsia-100 text-fuchsia-800';
  const label = type === 'strike_off' ? 'SO' : type === 'lab_dip' ? 'LD' : 'LB';
  return (
    <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', styles)}>
      {label}
    </span>
  );
}

function TypeComparisonMock() {
  return (
    <div className="p-5 grid grid-cols-3 gap-4">
      <div className="bg-amber-50/50 rounded-xl ring-1 ring-amber-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TypeBadge type="strike_off" />
          <span className="text-sm font-bold text-gray-900">Strike Off</span>
        </div>
        <p className="text-[11px] text-gray-600 mb-3">Physical fabric / print sample. Sign off pattern, weave, or print quality.</p>
        <div className="space-y-1.5">
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">MAIN FABRIC</div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">CHEST PRINT</div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">SLEEVE EMBROIDERY</div>
        </div>
      </div>
      <div className="bg-cyan-50/50 rounded-xl ring-1 ring-cyan-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TypeBadge type="lab_dip" />
          <span className="text-sm font-bold text-gray-900">Lab Dip</span>
        </div>
        <p className="text-[11px] text-gray-600 mb-3">Colour-match sample. Sign off the exact shade.</p>
        <div className="space-y-1.5">
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-cyan-100 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> BOTTLE GREEN
          </div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-cyan-100 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400" /> MUSTARD
          </div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-cyan-100 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-400" /> CORAL
          </div>
        </div>
      </div>
      <div className="bg-fuchsia-50/50 rounded-xl ring-1 ring-fuchsia-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TypeBadge type="label" />
          <span className="text-sm font-bold text-gray-900">Label</span>
        </div>
        <p className="text-[11px] text-gray-600 mb-3">Woven / printed labels. Colour is optional here.</p>
        <div className="space-y-1.5">
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-fuchsia-100">CARE LABEL — STANDARD</div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-fuchsia-100">NECK LABEL — INTERIOR PRINT</div>
        </div>
      </div>
    </div>
  );
}

function AddTypePickerMock() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 max-w-md mx-auto overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Add component</p>
              <p className="text-[10px] text-gray-500">Pick a type to get started</p>
            </div>
          </div>
          <X className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="p-5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">What kind of component?</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 border-2 border-violet-300 bg-violet-50/40 rounded-xl">
              <p className="text-sm font-bold text-gray-900">Strike Off</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Fabric / print sample</p>
            </div>
            <div className="p-4 border-2 border-gray-200 rounded-xl">
              <p className="text-sm font-bold text-gray-900">Lab Dip</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Colour match sample</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddFormMock() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 max-w-md mx-auto overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Add component</p>
              <p className="text-[10px] text-gray-500">2 styles selected</p>
            </div>
          </div>
          <X className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="p-5 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-50 border border-violet-200 rounded text-[10px] font-medium text-violet-800">
            <span className="uppercase tracking-wide text-[8px] text-violet-500">Type</span>
            <span>Strike Off</span>
            <span className="text-violet-400">·</span>
            <span className="text-violet-500 text-[9px]">change</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Component name</p>
            <div className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700">Main Fabric</div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Apply to</p>
            <div className="space-y-1 text-xs">
              <div className="px-3 py-1.5 rounded ring-1 ring-violet-300 bg-violet-50/40 text-violet-800 font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full ring-1 ring-violet-400 bg-violet-300" />
                All styles on PO 5050 (7 styles)
              </div>
              <div className="px-3 py-1.5 rounded text-gray-600 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full ring-1 ring-gray-300" />
                This style only
              </div>
              <div className="px-3 py-1.5 rounded text-gray-600 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full ring-1 ring-gray-300" />
                Selected styles…
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 text-[11px] font-medium text-gray-600 border border-gray-300 rounded-md">Cancel</button>
          <button className="px-3 py-1.5 text-[11px] font-semibold text-white bg-violet-600 rounded-md">Add to 7 styles</button>
        </div>
      </div>
    </div>
  );
}

/* The read-only detail a factory gets when they click a Worklist row. Drawn
   from the real thing: facts pinned left, journey right. */
function FactoryDetailMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeBadge type="strike_off" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">v2</span>
              <span className="text-[13px] font-extrabold text-gray-900">FLAT PRINT TO SLVE</span>
            </div>
            <p className="text-[9.5px] text-gray-500 mt-0.5 font-mono">S004780K-0211-MCI · MCI KIDS CREW NECK · SKYWAY</p>
          </div>
          <X className="w-3 h-3 text-gray-400 ml-auto flex-shrink-0" />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="p-3 border-r border-gray-100 bg-gray-50/50">
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-2.5 py-2 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold text-amber-900 leading-tight">Waiting on your remake</p>
                <p className="text-[8.5px] text-amber-800/80 mt-0.5">We rejected v1 on 22 Jul. v2 hasn&apos;t arrived.</p>
              </div>
              <div className="ml-auto text-right flex-shrink-0">
                <div className="text-[15px] font-extrabold text-amber-700 tabular-nums leading-none">41</div>
                <div className="text-[7px] uppercase tracking-wider text-amber-700/80">days</div>
              </div>
            </div>
            {[['This style', [['PO', '5254'], ['Customer', 'STICHD'], ['Ex-factory', '30 Oct 2026']]],
              ['Component', [['Sample type', 'Strike Off'], ['Colour', 'SKYWAY'], ['Received', '—'], ['Approved', '—']]]]
              .map(([title, rows]) => (
              <div key={title as string}>
                <p className="text-[7.5px] font-bold uppercase tracking-widest text-gray-400 mt-3 mb-1">{title as string}</p>
                {(rows as string[][]).map(([k, v]) => (
                  <div key={k} className="flex text-[9.5px] py-0.5">
                    <span className="text-gray-400 w-[46%]">{k}</span>
                    <span className={cn('font-semibold', v === '—' ? 'text-gray-300' : 'text-gray-800')}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-3 rounded-lg bg-primary-50 ring-1 ring-primary-200 px-2.5 py-2">
              <p className="text-[7.5px] font-bold uppercase tracking-widest text-primary-700">Next</p>
              <p className="text-[9.5px] text-primary-900/90 mt-1 leading-snug">
                Remake and send it in. <b>v2 is already open</b> — don&apos;t add a new component.
              </p>
            </div>
          </div>

          <div className="p-3">
            <p className="text-[7.5px] font-bold uppercase tracking-widest text-gray-400 mb-2">The journey</p>
            <ol className="ml-1 border-l-2 border-gray-100 pl-3.5 space-y-2.5">
              {[['11 Jun 2026', 'Order sent to you', 'plain'],
                ['14 Jul 2026', 'v1 received by Source Lab', 'plain'],
                ['22 Jul 2026', 'v1 rejected', 'bad'],
                ['Now · 41 working days', 'v2 outstanding', 'now']].map(([when, what, tone], i) => (
                <li key={i} className="relative list-none">
                  <span className={cn('absolute -left-[18px] top-1 w-2 h-2 rounded-full border-2',
                    tone === 'bad' ? 'bg-red-500 border-red-500'
                    : tone === 'now' ? 'bg-amber-500 border-amber-500 ring-2 ring-amber-100'
                    : 'bg-white border-gray-300')} />
                  <div className="text-[8px] text-gray-400 tabular-nums">{when}</div>
                  <div className="text-[10px] font-semibold text-gray-800">{what}</div>
                  {tone === 'bad' && (
                    <div className="mt-1 rounded bg-red-50 ring-1 ring-red-100 px-2 py-1.5">
                      <p className="text-[7.5px] font-bold uppercase tracking-wider text-red-700">Placement wrong</p>
                      <p className="text-[9px] text-gray-700 mt-0.5 leading-snug">Logo sitting 2cm low — raise to the spec position.</p>
                      <p className="text-[8px] text-gray-400 mt-1">Source Lab · Charlotte Makinson</p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 flex items-center">
          <span className="text-[8.5px] text-gray-500">Status and dates are set by Source Lab.</span>
          <span className="ml-auto text-[9px] font-semibold px-2 py-0.5 rounded bg-white ring-1 ring-gray-200 text-gray-600">Open style</span>
        </div>
      </div>
    </div>
  );
}

function ComponentCardMock({ name, type, attempt, status, received, approved, rejected }: {
  name: string;
  type: 'strike_off' | 'lab_dip';
  attempt?: string;
  status: string;
  received?: string;
  approved?: string;
  rejected?: { reason: string; note: string };
}) {
  const statusTone: 'green' | 'amber' | 'red' | 'gray' =
    status.toUpperCase() === 'APPROVED' ? 'green' :
    status.toUpperCase() === 'REJECTED' ? 'red' :
    status.toUpperCase() === 'OUTSTANDING' ? 'amber' : 'gray';
  return (
    <div className="p-4 bg-gray-50/40">
      <div className="border border-gray-200 rounded-xl bg-white max-w-xl mx-auto overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 rotate-90" />
            <span className="text-xs font-semibold text-gray-700">{name}</span>
            <TypeBadge type={type} />
            {attempt && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                {attempt}
              </span>
            )}
          </div>
          <StatusPill tone={statusTone}>
            {type === 'strike_off' ? 'SO' : 'LD'} {status}
          </StatusPill>
        </div>
        <div className="px-3 py-3 space-y-1.5">
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">{type === 'strike_off' ? 'Strike Off' : 'Lab Dip'}</p>
          {rejected && (
            <div className="px-3 py-2 bg-red-50 ring-1 ring-red-200 rounded-md text-[11px] my-2">
              <p className="font-semibold text-red-900 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" /> v1 rejected — {rejected.reason}
              </p>
              <p className="text-red-700 mt-0.5">"{rejected.note}"</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-md px-2 py-1.5 bg-gray-50 ring-1 ring-gray-200">
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">Status</p>
              <p className="text-gray-800 font-medium mt-0.5">{status}</p>
            </div>
            <div className="rounded-md px-2 py-1.5 bg-gray-50 ring-1 ring-gray-200">
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">Received</p>
              <p className="text-gray-800 font-medium mt-0.5">{received || <span className="text-gray-400 italic">—</span>}</p>
            </div>
            <div className="rounded-md px-2 py-1.5 bg-gray-50 ring-1 ring-gray-200">
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">Approved</p>
              <p className="text-gray-800 font-medium mt-0.5">{approved || <span className="text-gray-400 italic">—</span>}</p>
            </div>
          </div>
        </div>
        <div className="px-3 py-2 border-t border-gray-100 flex justify-end">
          <span className="text-[10px] text-red-500 flex items-center gap-1">
            <Trash2 className="w-3 h-3" />
            Remove
          </span>
        </div>
      </div>
    </div>
  );
}

function CatalogueSidebarMock() {
  const groups: { name: string; type: 'strike_off' | 'lab_dip'; count: number; dot: 'green' | 'amber' | 'gray'; active?: boolean }[] = [
    { name: 'Main Fabric', type: 'strike_off', count: 12, dot: 'amber' },
    { name: 'Main Fabric', type: 'lab_dip', count: 12, dot: 'green', active: true },
    { name: 'Lining', type: 'strike_off', count: 8, dot: 'gray' },
    { name: 'Chest Emb', type: 'strike_off', count: 5, dot: 'amber' },
    { name: 'Woven Label', type: 'strike_off', count: 14, dot: 'green' },
    { name: 'Pocket', type: 'strike_off', count: 3, dot: 'amber' },
    { name: 'Pocket', type: 'lab_dip', count: 3, dot: 'gray' },
  ];
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden max-w-sm mx-auto">
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <div className="pl-6 pr-2 py-1 border border-gray-200 rounded text-[11px] text-gray-400">Search components…</div>
          </div>
        </div>
        <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-gray-100 flex items-center gap-2">
          <span>Sort:</span>
          <span className="font-semibold text-gray-700">Used</span>
          <span className="text-gray-300">·</span>
          <span>Pending</span>
          <span className="text-gray-300">·</span>
          <span>A–Z</span>
        </div>
        <div className="py-1">
          {groups.map((g, i) => (
            <div key={i} className={cn(
              'px-3 py-2 flex items-center gap-2 text-[11px]',
              g.active ? 'bg-violet-100/60 text-violet-700' : 'hover:bg-gray-50 text-gray-700'
            )}>
              <span className={cn(
                'w-2 h-2 rounded-full',
                g.dot === 'green' ? 'bg-green-400' : g.dot === 'amber' ? 'bg-amber-400' : 'bg-gray-300'
              )} />
              <span className="flex-1 font-semibold truncate">{g.name}</span>
              <TypeBadge type={g.type} />
              <span className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                g.active ? 'bg-white/70' : 'bg-gray-200 text-gray-600'
              )}>{g.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WarningEntryMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-amber-200 overflow-hidden max-w-2xl mx-auto">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <div>
            <p className="text-sm font-bold text-gray-900">Strike Off Needs Approval</p>
            <p className="text-[11px] text-gray-600">Received 5+ business days ago, not approved</p>
          </div>
          <span className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">3</span>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            { po: '5098', style: 'S004000A-0003-NEW', cust: 'COLLEGIATE', factory: 'PRIME-23', comp: 'CHEST EMB', days: 18 },
            { po: '5050', style: 'S005940K-0014-BUB', cust: 'STICHD', factory: 'PRIME-23', comp: 'Main Fabric', days: 12 },
            { po: '4992', style: 'S004810A-1234-NEW', cust: 'BARBOUR', factory: 'BEIJING TEX', comp: 'Lining', days: 7 },
          ].map((r, i) => (
            <div key={i} className="px-4 py-2 flex items-center gap-2 text-[11px]">
              <span className="font-mono font-semibold text-gray-700 w-12 flex-shrink-0">{r.po}</span>
              <span className="font-mono text-gray-600 truncate w-44">{r.style}</span>
              <span className="text-gray-500 truncate flex-1">{r.cust} · {r.factory}</span>
              <span className="text-gray-700 font-medium">{r.comp}</span>
              <span className="ml-2 text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">{r.days}d</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ─── Mocks for the library-first Add flow, the Worklist and bulk edit ─── */

function LibraryTabMock() {
  const tiles = [
    { label: 'NAMES', n: '19', active: true },
    { label: 'STYLES OUT OF STEP', n: '0', red: true },
    { label: 'ON A STYLE', n: '19' },
    { label: 'UNUSED', n: '0' },
    { label: 'NO SPEC', n: '19' },
  ];
  const rail: { name: string; type: 'strike_off' | 'lab_dip' | 'label'; meta: string; active?: boolean }[] = [
    { name: 'AOP PRINT', type: 'strike_off', meta: '2 entries · 38 styles', active: true },
    { name: 'EMBROIDERED LOGO', type: 'strike_off', meta: '1 entry · 34 styles' },
    { name: 'FLOATY BLUE', type: 'lab_dip', meta: '1 entry · 34 styles' },
    { name: 'CARE LABEL', type: 'label', meta: '3 entries · 20 styles' },
    { name: 'MAIN FABRIC', type: 'lab_dip', meta: '3 entries · 18 styles' },
    { name: 'PANEL FABRIC', type: 'lab_dip', meta: '2 entries · 17 styles' },
  ];
  return (
    <div className="p-3 bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-extrabold text-gray-900">Components</p>
        <span className="text-[9px] text-gray-400">Identity for every component — the only place a rename happens</span>
        <span className="ml-auto inline-flex rounded-md border border-gray-200 bg-white overflow-hidden">
          <span className="px-2 py-1 text-[10px] font-medium text-gray-500">Worklist</span>
          <span className="px-2 py-1 text-[10px] font-bold text-primary-700 bg-primary-50">Library</span>
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 mb-2">
        {tiles.map(t => (
          <div key={t.label} className={cn('rounded-md border bg-white px-2 py-1.5',
            t.active ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200')}>
            <p className="text-[7.5px] font-bold tracking-wide text-gray-500">{t.label}</p>
            <p className={cn('text-sm font-extrabold', t.red ? 'text-red-600' : 'text-gray-900')}>{t.n}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[150px_1fr] gap-1.5">
        {/* One card per NAME */}
        <div className="space-y-1">
          {rail.map((c, i) => (
            <div key={i} className={cn('rounded-lg border bg-white px-2 py-1.5',
              c.active ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200')}>
              <div className="flex items-center gap-1">
                <TypeBadge type={c.type} />
                <span className="text-[7.5px] font-semibold text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2 h-2" /> in step
                </span>
              </div>
              <p className="text-[10px] font-extrabold text-gray-900 mt-0.5 leading-tight">{c.name}</p>
              <p className="text-[8px] text-gray-500">{c.meta}</p>
            </div>
          ))}
        </div>

        {/* Every entry under that name */}
        <div className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <TypeBadge type="strike_off" />
            <span className="text-[11px] font-extrabold text-gray-900">AOP PRINT</span>
            <span className="text-[8.5px] text-gray-500">2 entries · 38 styles</span>
          </div>

          <div className="rounded-md border border-gray-200 overflow-hidden mb-1.5">
            <div className="px-2 py-1.5 flex items-center gap-1.5 text-[9px]">
              <span className="font-mono font-bold text-gray-400">#1</span>
              <span className="font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">HIGH RISK RED</span>
              <span className="text-gray-500">4 styles</span>
              <span className="font-mono font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">5252</span>
              <span className="ml-auto text-gray-400">signed off 10 Sept</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> All approved
              </span>
            </div>
            <div className="h-1 bg-emerald-500" />
          </div>

          <div className="rounded-md border border-gray-200 overflow-hidden">
            <div className="px-2 py-1.5 flex items-center gap-1.5 text-[9px]">
              <span className="font-mono font-bold text-gray-400">#2</span>
              <span className="font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">FLOATY BLUE</span>
              <span className="text-gray-500">34 styles</span>
              <span className="font-mono font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">5279</span>
              <span className="ml-auto font-semibold text-amber-600 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" /> None back yet
              </span>
            </div>
            <div className="h-1 bg-amber-400" />
            <div className="px-2 py-1 bg-gray-50/60 text-[8.5px] font-mono font-bold text-gray-600">
              PO 5279 <span className="font-sans font-normal text-gray-400">STICHD · 34 styles</span>
            </div>
            {[['S006367A-0868-MCI', 'MCI MENS REVERSIBLE BUCKET HAT'],
              ['S006028A-0868-MCI', 'MCI MENS SHORT SLEEVE SHIRT'],
              ['S006368A-0868-MCI', 'MCI MENS SWIM SHORTS']].map(([code, desc]) => (
              <div key={code} className="px-2 py-1 border-t border-gray-50 flex items-center gap-2 text-[8.5px]">
                <span className="font-mono text-gray-600">{code}</span>
                <span className="text-gray-500 truncate">{desc}</span>
                <span className="ml-auto font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Outstanding</span>
              </div>
            ))}
            <div className="px-2 py-1 border-t border-gray-50 text-[8.5px] font-semibold text-primary-600">
              Show all 34 styles on 5279
            </div>
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-[8px] text-gray-400">One card per name · an entry is one add</p>
    </div>
  );
}

/* The Add Component modal as it actually is: one numbered flow, not tabs.
   Left column carries steps 1 + 2, right column is the style picker, and the
   footer keeps a live summary of what is about to be created. */
function AddModalMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-[8px] uppercase tracking-widest font-bold text-blue-600">New component</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">Add component</p>
            <p className="text-[10px] text-gray-500">Creates one library entry and puts a blank sample against every style you pick.</p>
          </div>
          <X className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </div>

        <div className="grid grid-cols-[1fr_1.15fr]">
          {/* 1 + 2 */}
          <div className="border-r border-gray-100 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-widest font-bold text-gray-500 flex items-center gap-1.5">
                <StepDot n="1" /> Sample type
              </p>
              <span className="text-[9px] font-semibold text-blue-600">Copy an existing component</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border-2 border-blue-500 bg-blue-50/50 p-2">
                <p className="text-[10px] font-bold text-gray-900">Strike Off</p>
                <p className="text-[8px] text-gray-500 leading-tight mt-0.5">Print or embroidery, approved in position</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-2">
                <p className="text-[10px] font-bold text-gray-900">Lab Dip</p>
                <p className="text-[8px] text-gray-500 leading-tight mt-0.5">Colour matched against a reference</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-2">
                <p className="text-[10px] font-bold text-gray-900">Label</p>
                <p className="text-[8px] text-gray-500 leading-tight mt-0.5">Woven, care and branding labels</p>
              </div>
            </div>
            <p className="text-[8.5px] text-gray-500 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Permanent — a component can&apos;t change type after it&apos;s created.
            </p>

            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-500 flex items-center gap-1.5 pt-1">
              <StepDot n="2" /> Identity
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[8px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                  Name <span className="text-red-500 normal-case">(required)</span>
                </p>
                <div className="px-2 py-1.5 border border-gray-200 rounded-md text-[10px] font-mono text-gray-900">CHEST PRINT</div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                  Colour <span className="text-red-500 normal-case">(required)</span>
                </p>
                <div className="px-2 py-1.5 border border-gray-200 rounded-md text-[10px] font-mono text-gray-900">FIG</div>
              </div>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                Positions <span className="text-gray-400 normal-case">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {['CHEST CENTRAL', 'CHEST LEFT', 'CHEST RIGHT', 'BACK', 'BACK NECK', 'HEM', 'LEFT SLEEVE', 'RIGHT SLEEVE'].map((pos) => (
                  <span key={pos} className={cn('text-[8px] font-semibold px-1.5 py-0.5 rounded border',
                    pos === 'CHEST CENTRAL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {pos}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[9px] font-semibold text-gray-500 flex items-center gap-1">
              <ChevronRight className="w-2.5 h-2.5" /> MORE DETAILS
            </p>
          </div>

          {/* 3 */}
          <div className="p-3.5">
            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-500 flex items-center gap-1.5 mb-2">
              <StepDot n="3" /> Apply to styles
            </p>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 pl-6 pr-2 py-1 border border-gray-200 rounded-md text-[9px] text-gray-400 flex items-center">
                <Search className="w-2.5 h-2.5 text-gray-400 -ml-4 mr-1.5" />
                Search PO, style, customer…
              </div>
              <span className="text-[9px] font-semibold text-gray-500 whitespace-nowrap">Select all</span>
              <span className="text-[9px] font-semibold text-gray-500 whitespace-nowrap">Collapse</span>
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden text-[9.5px]">
              <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border border-gray-300 bg-blue-600 flex-shrink-0" />
                <span className="font-mono font-bold">PO 5254</span>
                <span className="text-gray-400">· STICHD</span>
                <span className="ml-auto text-gray-400">14 styles</span>
              </div>
              {[['S004807A-0767-MCI', 'MCI LADIES OVERSIZED HOODY', 'FIG'],
                ['S004807K-0767-MCI', 'MCI KIDS OVERSIZED HOODY', 'FIG'],
                ['S002603A-0767-MCI', 'MCI LADIES OVERSIZED 1/4 ZIP', 'FIG']].map(([code, desc, col]) => (
                <div key={code} className="px-2 py-1 pl-6 border-b border-gray-50 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm border border-gray-300 bg-blue-600 flex-shrink-0" />
                  <span className="font-mono text-gray-700">{code}</span>
                  <span className="text-gray-500 truncate">{desc}</span>
                  <span className="ml-auto text-gray-400">{col}</span>
                </div>
              ))}
              <div className="px-2 py-1.5 bg-gray-50 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border border-gray-300 bg-white flex-shrink-0" />
                <span className="font-mono font-bold">PO 5260</span>
                <span className="text-gray-400">· TK MAXX</span>
                <span className="ml-auto text-gray-400">6 styles</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <p className="text-[9px] text-gray-500 flex items-center gap-1.5">
            <span className="uppercase tracking-widest font-bold text-gray-400">Creates</span>
            <TypeBadge type="strike_off" />
            <span className="font-mono font-bold text-gray-800">CHEST PRINT</span>
            <span className="text-gray-400">· 3 styles picked</span>
          </p>
          <button className="px-3 py-1 text-[10px] font-semibold text-white bg-blue-600 rounded-md flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> Create &amp; add
          </button>
        </div>
      </div>
    </div>
  );
}

function StepDot({ n }: { n: string }) {
  return (
    <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-700 text-[8px] font-bold flex items-center justify-center">
      {n}
    </span>
  );
}

/* "Copy an existing component" swaps the left column for a searchable list of
   what already exists. It prefills — it does not link the two together. */
function CreateNewFormMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Copy from existing</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Prefills the form below. Still creates a new entry.</p>
          </div>
          <X className="w-3 h-3 text-gray-400 flex-shrink-0" />
        </div>
        <div className="p-3">
          <div className="pl-6 pr-2 py-1.5 border-2 border-blue-500 rounded-md text-[10px] text-gray-400 flex items-center mb-2">
            <Search className="w-3 h-3 text-gray-400 -ml-4 mr-1.5" />
            Search name, colour, PO, style code…
          </div>
          <div className="divide-y divide-gray-50">
            {[['AOP PRINT', 'HIGH RISK RED', '4 styles · 1 customer'],
              ['AOP PRINT', 'FLOATY BLUE', '34 styles · 1 customer'],
              ['CHEST PRINT', 'FIG', '14 styles · 1 customer'],
              ['EMBROIDERED CREST', 'BIRCH', '5 styles · 1 customer'],
              ['HEAT TRANSFER LOGO', 'JET BLACK', '6 styles · 1 customer']].map(([name, col, meta], i) => (
              <div key={i} className="py-1.5">
                <div className="flex items-center gap-1.5">
                  <TypeBadge type="strike_off" />
                  <span className="text-[10.5px] font-bold text-gray-900">{name}</span>
                  <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{col}</span>
                </div>
                <p className="text-[9px] text-gray-500 mt-0.5">{meta}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[9px] text-gray-500">
            Two entries can share a name — <b className="text-gray-700">AOP PRINT</b> in two colours is two separate entries.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The Worklist as it actually looks: status tiles that double as filters, a
 * filter row, then a grid of add-event cards. Redrawn from the live page —
 * the previous mock still showed the old In Progress left-rail layout with
 * only the tab label changed, which is arguably worse than not having a
 * picture at all.
 */
/* The Worklist as a factory sees it: table first, no tick boxes, a v2 badge on
   anything that has been rejected once. Source Lab get the same page as cards. */
function WorklistMock() {
  const tiles = [
    { label: 'IN FLIGHT', n: '3', active: true },
    { label: 'NEEDS ATTENTION', n: '3', red: true },
    { label: 'REJECTED', n: '0' },
    { label: 'STALE 14D+', n: '3' },
    { label: 'OUTSTANDING', n: '3' },
    { label: 'RECEIVED', n: '0' },
  ];
  const rows: { name: string; v?: string; type: 'strike_off' | 'lab_dip' | 'label';
                style: string; po: string; cust: string; status: string;
                tone: string; exfac: string; idle: string; hot?: boolean }[] = [
    { name: 'FLAT PRINT TO SLVE', v: 'v2', type: 'strike_off', style: 'S004780K-0211-MCI',
      po: '5254', cust: 'STICHD', status: 'Outstanding', tone: 'bg-amber-100 text-amber-700',
      exfac: '30/10/2026', idle: '41d', hot: true },
    { name: 'PUFF PRINT FRONT AND BACK', v: 'v2', type: 'strike_off', style: 'S004808A-0833-MCI',
      po: '5254', cust: 'STICHD', status: 'Outstanding', tone: 'bg-amber-100 text-amber-700',
      exfac: '30/10/2026', idle: '41d', hot: true },
    { name: 'GLACIER MARL', type: 'lab_dip', style: 'S004805A-0220-MCI',
      po: '5254', cust: 'STICHD', status: 'Approved', tone: 'bg-green-100 text-green-700',
      exfac: '30/10/2026', idle: '—' },
    { name: 'CARE LABEL', type: 'label', style: 'S004901B-0126-NRO',
      po: '5252', cust: 'LEVY', status: 'Received', tone: 'bg-blue-100 text-blue-700',
      exfac: '30/10/2026', idle: '4d' },
  ];
  return (
    <div className="p-3 bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-extrabold text-gray-900">Components</p>
        <span className="text-[9px] text-gray-400">Every sample still in development</span>
        <span className="ml-auto inline-flex rounded-md border border-gray-200 bg-white overflow-hidden">
          <span className="px-2 py-1 text-[10px] font-bold text-primary-700 bg-primary-50">Worklist</span>
          <span className="px-2 py-1 text-[10px] font-medium text-gray-500">Library</span>
        </span>
        <span className="px-2 py-1 rounded-md bg-primary-600 text-white text-[10px] font-semibold">+ Add component</span>
      </div>

      <div className="grid grid-cols-6 gap-1.5 mb-2">
        {tiles.map(t => (
          <div key={t.label} className={cn('rounded-md border bg-white px-2 py-1.5',
            t.active ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200')}>
            <p className="text-[7px] font-bold tracking-wide text-gray-500">{t.label}</p>
            <p className={cn('text-sm font-extrabold', t.red ? 'text-red-600' : 'text-gray-900')}>{t.n}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <div className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[9px] text-gray-400">
          Search component, style, PO, customer…
        </div>
        <span className="text-[8px] font-bold text-gray-400">TYPE</span>
        {['All', 'Strike Off', 'Lab Dip', 'Label'].map((x, i) => (
          <span key={x} className={cn('px-1.5 py-0.5 rounded-full border text-[9px] font-semibold',
            i === 0 ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500')}>{x}</span>
        ))}
        <span className="px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-gray-500 text-[9px] font-semibold">Cards</span>
        <span className="px-1.5 py-0.5 rounded-full border border-primary-300 bg-primary-50 text-primary-700 text-[9px] font-semibold">Table</span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-[9.5px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              {['Component', 'Type', 'Style', 'PO', 'Customer', 'Status', 'Ex-fac', 'Idle'].map(h => (
                <th key={h} className="px-2 py-1.5 font-bold uppercase tracking-wider text-[7.5px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    {r.hot && <span className="w-0.5 h-3 rounded-full bg-red-500 flex-shrink-0" />}
                    <span className="font-bold text-gray-900">{r.name}</span>
                    {r.v && <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">{r.v}</span>}
                  </div>
                </td>
                <td className="px-2 py-1.5"><TypeBadge type={r.type} /></td>
                <td className="px-2 py-1.5 font-mono text-gray-600">{r.style}</td>
                <td className="px-2 py-1.5 font-mono font-bold text-gray-700">{r.po}</td>
                <td className="px-2 py-1.5 text-gray-500">{r.cust}</td>
                <td className="px-2 py-1.5">
                  <span className={cn('px-1.5 py-0.5 rounded font-semibold', r.tone)}>{r.status}</span>
                </td>
                <td className="px-2 py-1.5 text-gray-500 tabular-nums">{r.exfac}</td>
                <td className={cn('px-2 py-1.5 tabular-nums font-semibold',
                  r.hot ? 'text-red-600' : 'text-gray-400')}>{r.idle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[8px] text-gray-400">Click any row to open the component in full.</p>
    </div>
  );
}

