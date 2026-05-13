'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingBag, Truck, BookOpen, CheckCircle2, AlertTriangle, Info, Search, Calendar,
  FileSpreadsheet, Edit3, Lock, MessageSquare, X, Plus, ChevronDown, Image as ImageIcon,
  Ship, Package, ArrowRight,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { cn } from '@/lib/utils';

export default function FactoryGuidePage() {
  return (
    <AuthProvider>
      <FactoryGuideContent />
    </AuthProvider>
  );
}

type Section = 'product' | 'shipping';

function FactoryGuideContent() {
  const [section, setSection] = useState<Section>('product');

  useEffect(() => {
    const handler = () => {
      const productEl = document.getElementById('section-product');
      const shippingEl = document.getElementById('section-shipping');
      if (!productEl || !shippingEl) return;
      const y = window.scrollY + 120;
      if (shippingEl.offsetTop <= y) setSection('shipping');
      else setSection('product');
    };
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
  };

  return (
    <AppShell title="Factory Guide">
      <div className="max-w-5xl mx-auto pb-24">
        {/* Hero */}
        <div className="bg-white rounded-xl ring-1 ring-gray-100 px-8 py-7 mb-5 flex items-start gap-5">
          <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-7 h-7 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Factory Guide</h1>
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
              How to use the Critical Path app — for our factory partners. Two main pages: <strong>Product</strong> (find your orders, update dates) and <strong>Shipping</strong> (raise shipment drafts when goods are ready to leave).
            </p>
          </div>
        </div>

        {/* Section nav (sticky) */}
        <div className="sticky top-12 z-20 bg-gray-50/95 backdrop-blur-sm py-2 -mx-6 px-6 mb-5 border-b border-gray-200">
          <div className="flex items-center gap-2 max-w-5xl mx-auto">
            <button
              onClick={() => scrollTo('section-product')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                section === 'product' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <ShoppingBag className="w-4 h-4" /> Product
            </button>
            <button
              onClick={() => scrollTo('section-shipping')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                section === 'shipping' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <Truck className="w-4 h-4" /> Shipping
            </button>
            <span className="ml-auto text-[11px] text-gray-400">Need help? Reply to any rejection email and we'll respond.</span>
          </div>
        </div>

        {/* ============== SECTION: PRODUCT ============== */}
        <section id="section-product" className="mb-12 scroll-mt-24">
          <SectionHeader
            icon={ShoppingBag}
            title="Factory · Product"
            blurb="The Product page lists every order under your factory. Use it to find your styles, update ex-fac dates, and read rejection feedback on samples."
          />

          <Step number="1" title="Finding your orders">
            <p>
              When you open <strong>Factory → Product</strong>, you'll see a table of all orders assigned to your factory. We filter automatically — you only ever see your own work.
            </p>
            <MockShot caption="Factory · Product — your order list">
              <ProductTableMock />
            </MockShot>
            <Tips>
              <Tip icon={Search}>Use the search bar at the top to filter by <strong>PO number</strong>, <strong>style code</strong>, or <strong>customer name</strong>. Type your term and press <kbd>Enter</kbd> or click Apply.</Tip>
              <Tip icon={Info}>The list pages 100 rows at a time. Scroll down and more will load automatically.</Tip>
              <Tip icon={FileSpreadsheet}>Click <strong>Export</strong> to download a CSV of what's currently shown — handy for your own records or to share internally.</Tip>
            </Tips>
          </Step>

          <Step number="2" title="What the columns mean">
            <p>Some columns are more important to you than others. The ones that matter most day-to-day:</p>
            <Table>
              <TableRow label="PO#" value="The Source Lab purchase order number. Your main reference." />
              <TableRow label="Style Code" value="The unique code for each style in the PO." />
              <TableRow label="Description / Colour" value="What the garment is and the colourway." />
              <TableRow label="Sizes (2XS → S14)" value="Quantities per size. Read-only — set by Source Lab." />
              <TableRow label="Order Received" value="Date Source Lab issued the PO to you." />
              <TableRow label="Original Ex-Fac" value="The agreed ship-out date from your factory. Read-only — was set when the PO was placed." />
              <TableRow label="Revised Ex-Fac" value="If the date needs to slip, this is where the new date lives. You can request a change here (see step 3)." />
              <TableRow label="Fit / Strike / Lab / PPS Status" value="Where each sample type is in the approval cycle. Read-only on this page — Source Lab updates these when they receive your samples." />
              <TableRow label="Specs Sent" value="Date the latest specs were sent to you." />
            </Table>
          </Step>

          <Step number="3" title="Updating the Revised Ex-Fac date">
            <p>
              If you can't make the agreed ex-fac date, you can request a new one. The change won't go live immediately — it needs Source Lab to approve it.
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 my-3">
              <li>Click the <strong>Revised Ex-Fac</strong> cell on the row you want to change.</li>
              <li>Pick a new date.</li>
              <li>A box will appear asking for a <strong>reason</strong> — please fill this in honestly. "Fabric delay 1 week" is more useful than just "delay".</li>
              <li>Choose the <strong>scope</strong>: just this style, all styles on this PO, or specific styles you pick.</li>
              <li>Click <strong>Submit for approval</strong>.</li>
            </ol>
            <MockShot caption="Date change modal — pick the date, give a reason, choose the scope">
              <DateChangeModalMock />
            </MockShot>
            <Callout type="warn" title="What happens next">
              Source Lab gets a notification and either approves or rejects. If approved, the new date sticks. If rejected, you'll see a comment explaining why. <strong>Don't ship to the new date until you've seen the approval confirmation.</strong>
            </Callout>
          </Step>

          <Step number="4" title="When a sample is rejected">
            <p>
              When Source Lab rejects a Strike Off or Lab Dip, you'll see the row light up with a rejection marker. Click into the order to see the reason, any notes, and (often) a photo showing the problem.
            </p>
            <MockShot caption="Rejection panel — reason, notes, and (where given) a photo">
              <RejectionPanelMock />
            </MockShot>
            <Tips>
              <Tip icon={MessageSquare}>Read the rejection notes carefully before re-submitting. The brand has flagged a specific issue — fix exactly that.</Tip>
              <Tip icon={AlertTriangle}>If the rejection doesn't make sense, leave a comment on the order (see step 5) rather than guessing.</Tip>
              <Tip icon={Info}>After you ship the next attempt, the status will move to <strong>Received</strong> when Source Lab gets it. You don't need to mark anything yourself — they handle the system update.</Tip>
            </Tips>
          </Step>

          <Step number="5" title="Comments &amp; questions">
            <p>
              Every order has a <strong>comments panel</strong> down the right side of the order detail view. Use it for anything that needs a written trail — questions, photos, confirmations.
            </p>
            <MockShot caption="Comments sidebar — mention people with @ to make sure they see it">
              <CommentsSidebarMock />
            </MockShot>
            <Tips>
              <Tip icon={MessageSquare}>Mention a specific Source Lab person with <strong>@</strong> + their name to make sure they see it.</Tip>
              <Tip icon={Info}>Comments are saved instantly. They show up in Source Lab's dashboard alongside email-style notifications.</Tip>
            </Tips>
          </Step>

          <Callout type="info" title="What's read-only for factory users">
            You can update the <strong>Revised Ex-Fac</strong> date (with approval) and add <strong>comments</strong>. Everything else — PO number, customer, sizes, pricing, sample statuses, approval dates, original ex-fac — is set by Source Lab and is read-only on your side. If something looks wrong, leave a comment and they'll fix it.
          </Callout>
        </section>

        {/* ============== SECTION: SHIPPING ============== */}
        <section id="section-shipping" className="scroll-mt-24">
          <SectionHeader
            icon={Truck}
            title="Factory · Shipping"
            blurb="When goods are ready to leave your factory, raise a shipment draft. Add the styles + quantities going out, fill in vessel info, then confirm. Source Lab gets the shipment in their tracking instantly."
          />

          <Step number="1" title="Create a new shipment draft">
            <p>
              Go to <strong>Factory → Shipping</strong> and click <strong>New draft</strong>. Your factory is set automatically — you don't need to pick it.
            </p>
            <MockShot caption="Shipping page — drafts and confirmed shipments, with the New draft button">
              <ShippingListMock />
            </MockShot>
            <Callout type="info" title="What's a draft?">
              A draft is a shipment-in-progress. You can save it half-filled, come back later, change SKUs around — nothing is sent to Source Lab until you click <strong>Confirm shipment</strong>.
            </Callout>
          </Step>

          <Step number="2" title="Select which SKUs are going">
            <p>
              On the left of the draft page, you'll see a list of all SKUs from your factory that are eligible for shipping. Tick the boxes for what's in this container/load.
            </p>
            <MockShot caption="SKU picker — group-tick a whole PO, set partial quantities">
              <SKUPickerMock />
            </MockShot>
            <Tips>
              <Tip icon={Search}>Use the search at the top to filter by <strong>PO#</strong> or <strong>style code</strong> when you have lots of orders.</Tip>
              <Tip icon={CheckCircle2}>Click the <strong>checkbox next to a PO heading</strong> to select every style in that PO at once.</Tip>
              <Tip icon={Edit3}>You can enter a <strong>partial quantity</strong> if you're only shipping some of the units now. The remainder stays open for a later draft.</Tip>
              <Tip icon={AlertTriangle}>If you tick a SKU that's <em>already in another draft</em>, you'll see a red warning. Decide which draft it belongs in before confirming.</Tip>
            </Tips>
          </Step>

          <Step number="3" title="Fill in the shipment details">
            <p>
              On the right of the draft page, fill in the vessel and tracking info. Source Lab uses this to track the shipment from your door to UK arrival.
            </p>
            <MockShot caption="Shipment details panel — FCL/LCL, vessel, dates, tracking">
              <ShipmentDetailsMock />
            </MockShot>
            <Table>
              <TableRow label="FCL / LCL / AIR" value="How it's moving. Pick one." />
              <TableRow label="Vessel Name" value="The container ship name (or the airline + flight for AIR)." />
              <TableRow label="Vessel ETD" value="Estimated time of departure from port." />
              <TableRow label="ETA to Port" value="Estimated time of arrival at the destination port." />
              <TableRow label="Tracking Number / P-number" value="Container number, BoL reference, or P-number depending on shipment type." />
            </Table>
            <Tips>
              <Tip icon={Calendar}>Dates can be approximate — you can update them later (see step 5).</Tip>
            </Tips>
          </Step>

          <Step number="4" title="Save vs Confirm — what's the difference?">
            <Table>
              <TableRow label="Save draft" value="Keeps your work-in-progress. Nothing is sent to Source Lab. You can come back and edit anything." />
              <TableRow label="Confirm shipment" value="Locks the SKU list and notifies Source Lab. Use this when the container is sealed / the truck has left." />
            </Table>
            <MockShot caption="Confirm modal — summary before you commit">
              <ConfirmModalMock />
            </MockShot>
            <Callout type="warn" title="Before you confirm">
              The confirmation modal shows a full summary: number of POs, number of SKUs, total units, and any warnings (overwrites, partial shipments). <strong>Read it carefully — the SKU list locks after you confirm.</strong>
            </Callout>
          </Step>

          <Step number="5" title="After you've confirmed">
            <p>
              The draft becomes a <strong>confirmed shipment</strong> with a green badge. The SKU list is now frozen — you can't add or remove styles without raising a new draft. But you <em>can</em> still update vessel info if details change.
            </p>
            <MockShot caption="Confirmed shipment — SKU list locked, vessel fields still editable">
              <ConfirmedShipmentMock />
            </MockShot>
            <Tips>
              <Tip icon={Lock}>To change a SKU or quantity after confirmation, contact Source Lab. They'll cancel the shipment and you can raise a new draft.</Tip>
              <Tip icon={Edit3}>To update vessel name, dates, or tracking number, click <strong>Edit shipping fields</strong>. Changes are pushed to every linked PO automatically.</Tip>
            </Tips>
          </Step>

          <Step number="6" title="Common situations">
            <Table>
              <TableRow label="Goods are split across two containers" value="Raise two drafts. Put each container's SKUs and quantities in its own draft. Confirm each separately when each container leaves." />
              <TableRow label="Only shipping half of a PO this week" value="Add the SKUs and enter partial quantities. The unshipped remainder stays open for a future draft." />
              <TableRow label="Need to add a SKU after confirming" value="Raise a new draft for the missing SKU. The confirmed shipment stays as-is." />
              <TableRow label="Vessel got delayed" value="Open the confirmed shipment, click Edit shipping fields, update the dates." />
              <TableRow label="Don't have a tracking number yet" value="Leave it blank for now. Update once the freight forwarder sends it." />
            </Table>
          </Step>
        </section>

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
        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{blurb}</p>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-gray-100 px-7 py-6 mb-4">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-[10px] uppercase tracking-widest font-bold text-violet-600 num">Step {number}</span>
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
      </div>
      <div className="text-sm text-gray-700 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}

function MockShot({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="my-4 rounded-lg overflow-hidden ring-1 ring-gray-200 bg-white">
      {/* Faux browser chrome */}
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
    <li className="flex items-start gap-2.5 text-sm text-gray-700">
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
    <div className={cn('rounded-lg ring-1 px-4 py-3 my-3 flex items-start gap-3', styles.bg, styles.ring)}>
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
      <span className="text-[12px] text-gray-600 leading-relaxed">{value}</span>
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
  return <span className={cn('inline-block px-1.5 py-0.5 rounded text-[9px] font-bold', styles[tone])}>{children}</span>;
}

function ProductTableMock() {
  return (
    <div className="p-4">
      {/* Faux toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <div className="pl-7 pr-3 py-1.5 text-[11px] bg-white border border-gray-200 rounded text-gray-400">Search PO, style, customer…</div>
        </div>
        <button className="px-2 py-1 text-[10px] font-medium bg-white border border-gray-200 rounded text-gray-600">Filters</button>
        <button className="px-2 py-1 text-[10px] font-medium bg-white border border-gray-200 rounded text-gray-600 flex items-center gap-1"><FileSpreadsheet className="w-3 h-3"/>Export</button>
      </div>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-[10px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500 font-semibold uppercase tracking-wider">
              <th className="px-2 py-1.5">PO#</th>
              <th className="px-2 py-1.5">Style</th>
              <th className="px-2 py-1.5">Customer</th>
              <th className="px-2 py-1.5">Description</th>
              <th className="px-2 py-1.5">Original Ex-Fac</th>
              <th className="px-2 py-1.5">Revised Ex-Fac</th>
              <th className="px-2 py-1.5">Strike</th>
              <th className="px-2 py-1.5">Lab</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold num">5050</td><td className="px-2 py-1.5">SS26-CREW-NVY</td><td className="px-2 py-1.5">Acme Apparel</td><td className="px-2 py-1.5 text-gray-600">Heavy crew rib · Navy</td><td className="px-2 py-1.5 num text-gray-600">12 May</td><td className="px-2 py-1.5 num text-gray-600">—</td><td className="px-2 py-1.5"><StatusPill tone="red">REJECTED</StatusPill></td><td className="px-2 py-1.5"><StatusPill tone="amber">OUTSTANDING</StatusPill></td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold num">5050</td><td className="px-2 py-1.5">SS26-CREW-CHA</td><td className="px-2 py-1.5">Acme Apparel</td><td className="px-2 py-1.5 text-gray-600">Heavy crew rib · Charcoal</td><td className="px-2 py-1.5 num text-gray-600">12 May</td><td className="px-2 py-1.5 num text-gray-600">—</td><td className="px-2 py-1.5"><StatusPill tone="blue">RECEIVED</StatusPill></td><td className="px-2 py-1.5"><StatusPill tone="amber">OUTSTANDING</StatusPill></td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold num">5050</td><td className="px-2 py-1.5">SS26-CREW-OAT</td><td className="px-2 py-1.5">Acme Apparel</td><td className="px-2 py-1.5 text-gray-600">Heavy crew rib · Oat</td><td className="px-2 py-1.5 num text-gray-600">12 May</td><td className="px-2 py-1.5 num text-gray-600">—</td><td className="px-2 py-1.5"><StatusPill tone="green">APPROVED</StatusPill></td><td className="px-2 py-1.5"><StatusPill tone="green">APPROVED</StatusPill></td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold num">5050</td><td className="px-2 py-1.5">SS26-HOOD-BLK</td><td className="px-2 py-1.5">Acme Apparel</td><td className="px-2 py-1.5 text-gray-600">Pullover hood · Black</td><td className="px-2 py-1.5 num text-gray-600">12 May</td><td className="px-2 py-1.5 num text-amber-700 font-semibold">20 May</td><td className="px-2 py-1.5"><StatusPill tone="amber">OUTSTANDING</StatusPill></td><td className="px-2 py-1.5"><StatusPill tone="amber">OUTSTANDING</StatusPill></td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold num">4992</td><td className="px-2 py-1.5">SS26-PARKA-OLV</td><td className="px-2 py-1.5">Acme Apparel</td><td className="px-2 py-1.5 text-gray-600">Lightweight parka · Olive</td><td className="px-2 py-1.5 num text-gray-600">21 May</td><td className="px-2 py-1.5 num text-gray-600">—</td><td className="px-2 py-1.5"><StatusPill tone="green">APPROVED</StatusPill></td><td className="px-2 py-1.5"><StatusPill tone="amber">OUTSTANDING</StatusPill></td></tr>
            <tr className="border-t border-gray-100"><td className="px-2 py-1.5 font-semibold num">4980</td><td className="px-2 py-1.5">SS26-TEE-WHT</td><td className="px-2 py-1.5">Other Customer</td><td className="px-2 py-1.5 text-gray-600">Boxy tee · White</td><td className="px-2 py-1.5 num text-gray-600">8 May</td><td className="px-2 py-1.5 num text-gray-600">—</td><td className="px-2 py-1.5"><StatusPill tone="gray">NOT REQ</StatusPill></td><td className="px-2 py-1.5"><StatusPill tone="green">APPROVED</StatusPill></td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-[9px] text-gray-400 mt-2 italic">…and 94 more rows below — scroll to load more</p>
    </div>
  );
}

function DateChangeModalMock() {
  return (
    <div className="p-6 bg-gray-100/60 flex items-center justify-center min-h-[280px]">
      <div className="bg-white rounded-lg shadow-lg ring-1 ring-gray-200 w-full max-w-md">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-600"/>
            <h4 className="text-sm font-bold">Request date change</h4>
          </div>
          <X className="w-4 h-4 text-gray-400"/>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"/>
            This change will require approval from Source Lab.
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">New Revised Ex-Fac</label>
            <div className="flex items-center gap-2 px-3 py-2 border-2 border-amber-300 rounded text-[12px] font-semibold num">
              <Calendar className="w-3.5 h-3.5 text-amber-600"/>
              20 May 2026
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Reason</label>
            <div className="px-3 py-2 border-2 border-amber-300 rounded text-[11px] text-gray-700 leading-relaxed min-h-[46px]">
              Fabric mill delay — knitting starts 1 week late
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1.5">Apply to</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[12px]"><div className="w-3 h-3 rounded-full border-2 border-violet-600 bg-violet-600 ring-2 ring-white shadow-sm"></div>This style only</label>
              <label className="flex items-center gap-2 text-[12px] text-gray-600"><div className="w-3 h-3 rounded-full border-2 border-gray-300"></div>All 22 styles on PO 5050</label>
              <label className="flex items-center gap-2 text-[12px] text-gray-600"><div className="w-3 h-3 rounded-full border-2 border-gray-300"></div>Specific styles I pick</label>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 text-[11px] font-medium text-gray-700 rounded">Cancel</button>
          <button className="px-3 py-1.5 text-[11px] font-bold text-white bg-amber-600 rounded">Submit for approval</button>
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
            <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold">Cherry Wang</span><span className="text-[9px] text-gray-400">Boomscarf · 1d ago</span></div>
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
        {/* PO 5050 group header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-violet-600 bg-violet-600 flex items-center justify-center"><span className="text-white text-[8px] font-bold">✓</span></div>
          <span className="text-[11px] font-bold">PO 5050</span>
          <span className="text-[10px] text-gray-500">Acme Apparel · 4 styles · 2,400 units</span>
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
        {/* PO 4992 group header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-gray-300"></div>
          <span className="text-[11px] font-bold">PO 4992</span>
          <span className="text-[10px] text-gray-500">Acme Apparel · 3 styles · 1,800 units</span>
          <ChevronDown className="w-3 h-3 text-gray-400 ml-auto -rotate-90"/>
        </div>
      </div>
      <p className="text-[9px] text-gray-400 mt-2 italic">Tick the box next to a PO to select every style in that PO. Enter a partial quantity in the box on the right for split shipments.</p>
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
