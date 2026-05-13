'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, Truck, BookOpen, CheckCircle2, AlertTriangle, Info, Search, Calendar, FileSpreadsheet, Anchor, Edit3, Lock, MessageSquare } from 'lucide-react';
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

  // Sync scroll position with section nav highlighting.
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

          {/* Step 1: Finding your orders */}
          <Step number="1" title="Finding your orders">
            <p>
              When you open <strong>Factory → Product</strong>, you'll see a table of all orders assigned to your factory. We filter automatically — you only ever see your own work.
            </p>
            <Screenshot label="Factory · Product table — all your orders" route="/factory-product" />
            <Tips>
              <Tip icon={Search}>Use the search bar at the top to filter by <strong>PO number</strong>, <strong>style code</strong>, or <strong>customer name</strong>. Type your term and press <kbd>Enter</kbd> or click Apply.</Tip>
              <Tip icon={Info}>The list pages 100 rows at a time. Scroll down and more will load automatically.</Tip>
              <Tip icon={FileSpreadsheet}>Click <strong>Export</strong> to download a CSV of what's currently shown — handy for your own records or to share internally.</Tip>
            </Tips>
          </Step>

          {/* Step 2: Reading the columns */}
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

          {/* Step 3: Updating ex-fac */}
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
            <Screenshot label="Date change modal — reason + scope" route="/factory-product (clicking a date cell)" />
            <Callout type="warn" title="What happens next">
              Source Lab gets a notification and either approves or rejects. If approved, the new date sticks. If rejected, you'll see a comment explaining why. <strong>Don't ship to the new date until you've seen the approval confirmation.</strong>
            </Callout>
          </Step>

          {/* Step 4: Sample submissions */}
          <Step number="4" title="When a sample is rejected">
            <p>
              When Source Lab rejects a Strike Off or Lab Dip, you'll see the row light up with a rejection marker. Click into the order to see the reason, any notes, and (often) a photo showing the problem.
            </p>
            <Screenshot label="Rejection panel — reason, notes, photo" route="/factory-product (clicking a rejected row)" />
            <Tips>
              <Tip icon={MessageSquare}>Read the rejection notes carefully before re-submitting. The brand has flagged a specific issue — fix exactly that.</Tip>
              <Tip icon={AlertTriangle}>If the rejection doesn't make sense, leave a comment on the order (see step 5) rather than guessing.</Tip>
              <Tip icon={Info}>After you ship the next attempt, the status will move to <strong>Received</strong> when Source Lab gets it. You don't need to mark anything yourself — they handle the system update.</Tip>
            </Tips>
          </Step>

          {/* Step 5: Comments */}
          <Step number="5" title="Comments &amp; questions">
            <p>
              Every order has a <strong>comments panel</strong> down the right side of the order detail view. Use it for anything that needs a written trail — questions, photos, confirmations.
            </p>
            <Screenshot label="Comments sidebar on an order" route="/factory-product (order detail view)" />
            <Tips>
              <Tip icon={MessageSquare}>Mention a specific Source Lab person with <strong>@</strong> + their name to make sure they see it.</Tip>
              <Tip icon={Info}>Comments are saved instantly. They show up in Source Lab's dashboard alongside email-style notifications.</Tip>
            </Tips>
          </Step>

          {/* What's read-only */}
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

          {/* Step 1: New draft */}
          <Step number="1" title="Create a new shipment draft">
            <p>
              Go to <strong>Factory → Shipping</strong> and click <strong>New draft</strong>. Your factory is set automatically — you don't need to pick it.
            </p>
            <Screenshot label="Shipping page with the New draft button" route="/factory-shipping" />
            <Callout type="info" title="What's a draft?">
              A draft is a shipment-in-progress. You can save it half-filled, come back later, change SKUs around — nothing is sent to Source Lab until you click <strong>Confirm shipment</strong>.
            </Callout>
          </Step>

          {/* Step 2: Select SKUs */}
          <Step number="2" title="Select which SKUs are going">
            <p>
              On the left of the draft page, you'll see a list of all SKUs from your factory that are eligible for shipping. Tick the boxes for what's in this container/load.
            </p>
            <Screenshot label="SKU picker on the left — checkboxes per style" route="/factory-shipping/[draftId]" />
            <Tips>
              <Tip icon={Search}>Use the search at the top to filter by <strong>PO#</strong> or <strong>style code</strong> when you have lots of orders.</Tip>
              <Tip icon={CheckCircle2}>Click the <strong>checkbox next to a PO heading</strong> to select every style in that PO at once.</Tip>
              <Tip icon={Edit3}>You can enter a <strong>partial quantity</strong> if you're only shipping some of the units now. The remainder stays open for a later draft.</Tip>
              <Tip icon={AlertTriangle}>If you tick a SKU that's <em>already in another draft</em>, you'll see a red warning. Decide which draft it belongs in before confirming.</Tip>
            </Tips>
          </Step>

          {/* Step 3: Shipment details */}
          <Step number="3" title="Fill in the shipment details">
            <p>
              On the right of the draft page, fill in the vessel and tracking info. Source Lab uses this to track the shipment from your door to UK arrival.
            </p>
            <Screenshot label="Shipment details panel — FCL/LCL, vessel, dates, tracking" route="/factory-shipping/[draftId]" />
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

          {/* Step 4: Confirm */}
          <Step number="4" title="Save vs Confirm — what's the difference?">
            <Table>
              <TableRow label="Save draft" value="Keeps your work-in-progress. Nothing is sent to Source Lab. You can come back and edit anything." />
              <TableRow label="Confirm shipment" value="Locks the SKU list and notifies Source Lab. Use this when the container is sealed / the truck has left." />
            </Table>
            <Screenshot label="Confirm modal — summary of POs, SKUs, units" route="/factory-shipping/[draftId] (clicking Confirm)" />
            <Callout type="warn" title="Before you confirm">
              The confirmation modal shows a full summary: number of POs, number of SKUs, total units, and any warnings (overwrites, partial shipments). <strong>Read it carefully — the SKU list locks after you confirm.</strong>
            </Callout>
          </Step>

          {/* Step 5: After confirming */}
          <Step number="5" title="After you've confirmed">
            <p>
              The draft becomes a <strong>confirmed shipment</strong> with a green badge. The SKU list is now frozen — you can't add or remove styles without raising a new draft. But you <em>can</em> still update vessel info if details change.
            </p>
            <Screenshot label="Confirmed shipment view — green badge, Edit shipping fields button" route="/factory-shipping/[draftId] (after confirm)" />
            <Tips>
              <Tip icon={Lock}>To change a SKU or quantity after confirmation, contact Source Lab. They'll cancel the shipment and you can raise a new draft.</Tip>
              <Tip icon={Edit3}>To update vessel name, dates, or tracking number, click <strong>Edit shipping fields</strong>. Changes are pushed to every linked PO automatically.</Tip>
            </Tips>
          </Step>

          {/* Common questions */}
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

        {/* Footer */}
        <div className="mt-12 text-center text-[11px] text-gray-400">
          If you spot something wrong or confusing, please email Source Lab — we'd rather know.
        </div>
      </div>
    </AppShell>
  );
}

/* ============== Small helper components ============== */

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

function Screenshot({ label, route }: { label: string; route: string }) {
  return (
    <div className="my-4 rounded-lg overflow-hidden ring-1 ring-gray-200">
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 text-center border-b border-gray-200">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[10px] text-gray-500 font-semibold uppercase tracking-widest border border-gray-200">
          📸 Screenshot placeholder
        </div>
        <p className="text-xs text-gray-500 mt-2 italic">{label}</p>
        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{route}</p>
      </div>
    </div>
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
