'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingBag, Truck, BookOpen, CheckCircle2, AlertTriangle, Info, Search, Calendar,
  FileSpreadsheet, Edit3, Lock, MessageSquare, X, Plus, ChevronDown, ChevronRight,
  Image as ImageIcon, Ship, ArrowRight, Clock, CheckCircle, XCircle, RefreshCw, Package,
  Layers, Trash2, Tag, FileText,
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
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
              How to use the Critical Path app — for our factory partners. Two main pages: <strong>Product</strong> (find your orders, request date changes, track approvals) and <strong>Shipping</strong> (raise shipment drafts when goods are ready to leave).
            </p>
          </div>
        </div>

        {/* Section tabs (sticky) — switch between Product and Shipping. Only
            the active section renders below, so it's not a scroll jump. */}
        <div className="sticky top-12 z-20 bg-gray-50/95 backdrop-blur-sm py-2 -mx-6 px-6 mb-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSection('product')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                section === 'product' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <ShoppingBag className="w-4 h-4" /> Product
            </button>
            <button
              onClick={() => setSection('shipping')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                section === 'shipping' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <Truck className="w-4 h-4" /> Shipping
            </button>
            <button
              onClick={() => setSection('components')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                section === 'components' ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <Layers className="w-4 h-4" /> Components
            </button>
            <span className="ml-auto text-[11px] text-gray-400">Need help? Reply to any rejection email and we'll respond.</span>
          </div>
        </div>

        {/* ============== SECTION: PRODUCT ============== */}
        {section === 'product' && (
        <section className="mb-12">
          <SectionHeader
            icon={ShoppingBag}
            title="Factory · Product"
            blurb="When you sign in, you land here. Your orders are grouped by PO with the styles inside. Use this page to track samples, request date changes, and stay across what Source Lab has approved."
          />

          <Step number="1" title="Finding your orders">
            <p>
              When you sign in, you'll see <strong>your factory's purchase orders</strong> on the Product page — we filter automatically so you only ever see your own work.
            </p>
            <p>
              The page is split into two parts: a <strong>tracker bar</strong> across the top showing the status of your date-change requests, and the <strong>list of purchase orders</strong> grouped by PO number underneath.
            </p>
            <MockShot caption="Factory · Product — tracker bar across the top, then your PO list">
              <ProductPageMock />
            </MockShot>
            <Tips>
              <Tip icon={Search}>Use the search bar to find a specific <strong>PO number</strong>, <strong>style code</strong>, <strong>customer</strong>, or <strong>factory</strong>. Filter chips below let you narrow by status.</Tip>
              <Tip icon={ChevronRight}>Each row in the list is one PO. Click the row to <strong>expand it</strong> and see the styles inside.</Tip>
            </Tips>
          </Step>

          <Step number="2" title="Reading a PO + the styles inside">
            <p>
              An expanded PO shows every style on the order. For each style you'll see the style code, description, colour, quantity, the Ex-Factory date, and the status.
            </p>
            <MockShot caption="A PO expanded — one row per style, with a Date change button on each">
              <ExpandedPOMock />
            </MockShot>
            <Table>
              <TableRow label="Style code" value="The unique code for the style. Source Lab sets this and it doesn't change." />
              <TableRow label="Description / Colour" value="What the garment is and which colourway." />
              <TableRow label="Quantity" value="Units ordered for that style. Read-only." />
              <TableRow label="Ex-Factory" value="The current target ex-factory date. If a revised date has been approved, that's what shows here." />
              <TableRow label="Status" value="Where the order is in the lifecycle — Sampling, Production, Shipped, etc. Source Lab updates this." />
              <TableRow label="Date change button" value="The orange button on the right of each style row. Click it to request a change to the Revised Ex-Factory date (see step 4)." />
            </Table>
          </Step>

          <Step number="3" title="Tracking your date-change requests">
            <p>
              Every time you submit a date change, it appears in the <strong>tracker bar at the top of the page</strong>. Three columns: <strong>Pending approval</strong> (waiting for Source Lab), <strong>Approved</strong> (live), and <strong>Rejected</strong> (with the reason explained).
            </p>
            <MockShot caption="Tracker bar — see at a glance what's waiting, what's live, what's been rejected">
              <TrackerMock />
            </MockShot>
            <Tips>
              <Tip icon={Clock}>A pending request shows the current date → proposed date so you can see what you've asked for.</Tip>
              <Tip icon={X}>Cancel a pending request with the small × in the top-right of the card if you submitted it by mistake or things changed.</Tip>
              <Tip icon={CheckCircle}>When Source Lab approves, the new date goes live on the order. Until then, the original date is still what we're tracking against.</Tip>
              <Tip icon={XCircle}>If a request is rejected, the rejection reason shows on the card so you know why and what to try next.</Tip>
            </Tips>
          </Step>

          <Step number="4" title="Requesting a date change">
            <p>
              If you can't make the agreed Ex-Factory date, you can request a new one. The change won't go live immediately — Source Lab has to approve it first.
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 my-3">
              <li>Expand the PO that contains the style.</li>
              <li>Click the orange <strong>Date change</strong> button on the right of the style row.</li>
              <li>A focused modal opens — pick the new date.</li>
              <li>Give a <strong>reason</strong> — required. "Fabric mill delay 1 week" is more useful than "delay".</li>
              <li>Choose the <strong>scope</strong>: just this style, all styles on this PO, or specific styles.</li>
              <li>Click <strong>Submit for approval</strong>. The request appears in the Pending column at the top of the page.</li>
            </ol>
            <MockShot caption="Date change modal — locked to Revised Ex-Factory, current value shown, scope picker at the bottom">
              <DateChangeModalMock />
            </MockShot>
            <Callout type="warn" title="What happens next">
              Source Lab gets notified and either approves or rejects. <strong>Don't ship to the new date until you see the request in the Approved column.</strong> If they reject, the rejection reason will explain why.
            </Callout>
          </Step>

          <Step number="5" title="Comments &amp; questions">
            <p>
              Every order has a <strong>comments panel</strong>. Use it for anything that needs a written trail — questions, photos, confirmations.
            </p>
            <MockShot caption="Comments — mention people with @ to make sure they see it">
              <CommentsSidebarMock />
            </MockShot>
            <Tips>
              <Tip icon={MessageSquare}>Mention a specific Source Lab person with <strong>@</strong> + their name.</Tip>
              <Tip icon={Info}>Comments save instantly. They appear in Source Lab's dashboard alongside email notifications.</Tip>
            </Tips>
          </Step>
        </section>
        )}

        {/* ============== SECTION: SHIPPING ============== */}
        {section === 'shipping' && (
        <section>
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
              <Tip icon={Edit3}>Enter a <strong>partial quantity</strong> if you're only shipping some of the units now. The remainder stays open for a later draft.</Tip>
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
              The confirmation modal shows a full summary: number of POs, number of SKUs, total units, and any warnings. <strong>Read it carefully — the SKU list locks after you confirm.</strong>
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
        )}

        {/* ============== SECTION: COMPONENTS ============== */}
        {section === 'components' && (
        <section className="mb-12">
          <SectionHeader
            icon={Layers}
            title="Factory · Components"
            blurb="What components are, how to add them, how the sample lifecycle works, and exactly when the dashboard warns you. Same content for both Source Lab and factory users."
          />

          {/* 1. Basics — start with the SO vs LD distinction; factory users
              already know what a component is. */}
          <Step number="1.1" title="Strike Off vs Lab Dip">
            <p>
              Every component tracks <strong>one</strong> sample type — Strike Off OR Lab Dip. Not both. You pick the type when you create it, and it can't change afterwards.
            </p>
            <Table>
              <TableRow
                label="Strike Off (SO)"
                value="A physical printed/woven sample of the fabric or trim, to sign off the pattern, weave, or print quality."
              />
              <TableRow
                label="Lab Dip (LD)"
                value="A colour-match sample, to sign off the specific shade. Same swatch in three different colourways = three Lab Dip components."
              />
            </Table>
            <MockShot caption="Strike Off and Lab Dip live in separate columns and have their own SO / LD badge.">
              <TypeComparisonMock />
            </MockShot>
            <Callout type="info" title="The same name can be both types">
              "Pocket" might exist as a Strike Off component (sample the fabric) AND as a Lab Dip component (match the colour) on the same style. They're treated as separate, with their own statuses and dates.
            </Callout>
          </Step>

          <Step number="1.2" title="Fit Sample and PPS are NOT components">
            <p>
              Fit Sample and PPS (Pre-Production Sample) are <em>whole-garment</em> concerns and live at the order/style level, not on individual components. You'll see them in their own section of the style detail — not inside the Components list.
            </p>
          </Step>

          {/* 2. Adding */}
          <Step number="2.1" title="Adding a component — Step 1: pick the type">
            <p>
              From a style's detail view, click the <strong>+ Add Component</strong> button (top-right of the Components section). The first thing you'll see is a two-card chooser:
            </p>
            <MockShot caption="Step 1 of the Add Component flow. The form for name + scope is hidden until you pick a type.">
              <AddTypePickerMock />
            </MockShot>
            <Callout type="warn" title="Type is locked once you save">
              Pick the right one. You can't change a Strike Off component to a Lab Dip later — you'd need to delete and re-add it.
            </Callout>
          </Step>

          <Step number="2.2" title="Step 2: name it">
            <p>
              Once you've picked the type, the rest of the form opens. Type the component name in the field. As you type, the app suggests existing names that match — pick from the dropdown to keep things consistent across the catalogue.
            </p>
            <Tips>
              <Tip icon={Tag}>If you type something that already exists with different casing or spacing (e.g. "Main fabric" when "Main Fabric" is already used), you'll get an amber warning. Click "use existing" to avoid duplicates.</Tip>
              <Tip icon={Tag}>Common names: Main Fabric, Lining, Rib Fabric, Pocket Fabric, Zip, Buttons, Drawstring, Woven Label, Badges, Chest Emb, Print.</Tip>
            </Tips>
          </Step>

          <Step number="2.3" title="Step 3: pick the scope">
            <p>
              By default the component is added to just the style you're on. If the same component exists on other styles in the same PO, you can apply it to those at the same time:
            </p>
            <Table>
              <TableRow label="This style only" value="Just the current row. Quickest." />
              <TableRow label="All styles on PO" value="Every style on this purchase order gets a copy of the component." />
              <TableRow label="Selected styles" value="Opens a picker so you tick which specific styles to add it to." />
            </Table>
            <MockShot caption="Step 2: name + scope. The type chip at the top is a click-to-change shortcut back to step 1.">
              <AddFormMock />
            </MockShot>
            <Callout type="info" title="Dedupe is per type">
              Adding "Pocket" Strike Off to a style that already has "Pocket" Strike Off is skipped. But a Strike Off "Pocket" and a Lab Dip "Pocket" are treated as separate — both can coexist.
            </Callout>
          </Step>

          {/* 3. Tracking */}
          <Step number="3.1" title="Tracking the sample">
            <p>
              Once a component exists, expand it to see its sample tracking. There are three fields:
            </p>
            <Table>
              <TableRow label="Status" value="OUTSTANDING (default — sample requested, not back yet), RECEIVED, APPROVED, REJECTED, or NOT REQUIRED." />
              <TableRow label="Received" value="The date the sample physically arrived back at Source Lab / customer for inspection." />
              <TableRow label="Approved" value="The date the sample was signed off. Setting this date moves the component to done." />
            </Table>
            <MockShot caption="A component card expanded — type badge, status chip, three field tiles, Remove at the bottom.">
              <ComponentCardMock
                name="Main Fabric"
                type="strike_off"
                status="APPROVED"
                received="14 May 2026"
                approved="20 May 2026"
              />
            </MockShot>
            <Callout type="info" title="Factory users see these read-only">
              Suppliers can add / delete components and rename them, but the Status / Received / Approved fields are managed by Source Lab. You'll see them but won't be able to edit them.
            </Callout>
          </Step>

          <Step number="3.2" title="The lifecycle">
            <div className="my-3 flex items-center gap-2 text-[11px] flex-wrap">
              <StatusPill tone="gray">OUTSTANDING</StatusPill>
              <span className="text-gray-400">→</span>
              <StatusPill tone="blue">RECEIVED</StatusPill>
              <span className="text-gray-400">→</span>
              <StatusPill tone="green">APPROVED</StatusPill>
              <span className="text-gray-400 ml-2">or</span>
              <StatusPill tone="red">REJECTED</StatusPill>
              <span className="text-gray-400">→ opens v2</span>
            </div>
            <p>
              <strong>OUTSTANDING</strong> is the default when a component is first created — Source Lab is waiting on the sample. Once it physically arrives, the Received date is set (this auto-bumps the status to RECEIVED). After review, either approved (signed off) or rejected.
            </p>
            <p>
              <strong>NOT REQUIRED</strong> is a special status that says "we don't need this sample at all." Use it when, say, a Lab Dip isn't relevant because the colour's already a standard. NOT REQUIRED suppresses warnings and counts as done.
            </p>
          </Step>

          {/* 4. Rejections */}
          <Step number="4.1" title="Rejections and v2 (rework)">
            <p>
              When Source Lab rejects a sample, they pick a structured <strong>reason</strong> (Colour / Placement / Stitch / Material / Spec / Print / Other), add an optional <strong>note</strong>, and optionally a <strong>photo</strong>. Confirming closes the current attempt as REJECTED and opens v2 at OUTSTANDING. The Received and Approved dates are cleared on the new attempt — the clock starts fresh.
            </p>
            <MockShot caption="Same component on v2 with the rejection context banner. Factories see the reason + note read-only so they know what to fix.">
              <ComponentCardMock
                name="CHEST EMB"
                type="strike_off"
                attempt="v2 ·1"
                status="OUTSTANDING"
                rejected={{
                  reason: 'Placement',
                  note: "Logo sitting 2cm too low — please raise to spec position.",
                }}
              />
            </MockShot>
            <Callout type="warn" title="Stuck components need direct attention">
              Anything on v3+ shows up on the Source Lab Resubmissions dashboard. There's usually a comms issue worth a phone call when things hit a third attempt.
            </Callout>
          </Step>

          {/* 5. Catalogue */}
          <Step number="5.1" title="The Components catalogue">
            <p>
              Reachable from <strong>Factory → Components</strong> in the nav. Two-pane layout: the sidebar lists every distinct (name, sample type) combination across your orders. The right pane shows the detail for whichever one you've selected.
            </p>
            <MockShot caption="Catalogue sidebar — same name with different SO / LD types appears as separate entries.">
              <CatalogueSidebarMock />
            </MockShot>
            <Tips>
              <Tip icon={Search}>Search matches name, PO, customer, and Chinese orderbook reference simultaneously.</Tip>
              <Tip icon={Tag}>Sort by Used (most common at top), Pending (anything unresolved), or A–Z.</Tip>
              <Tip icon={Tag}>Hide shipped to drop components whose orders are all on a shipment already.</Tip>
            </Tips>
          </Step>

          {/* 6. Warnings */}
          <Step number="6.1" title="When things go overdue">
            <p>
              The dashboard Warnings Centre fires automatically based on business-day thresholds:
            </p>
            <Table>
              <TableRow label="Tech Packs Need Sending" value="Order sent to factory 3+ business days ago, tech packs not sent." />
              <TableRow label="Specs Need Sending" value="Order sent to factory 3+ business days ago, specs not sent." />
              <TableRow label="Strike Off Overdue" value="Tech packs sent 20+ business days ago (25 for badge / woven label / woven tape), Strike Off not received." />
              <TableRow label="Strike Off Needs Approval" value="Strike Off received 5+ business days ago, not approved." />
              <TableRow label="Lab Dip Overdue" value="Tech packs sent 15+ business days ago, Lab Dip not received." />
              <TableRow label="Lab Dip Needs Approval" value="Lab Dip received 5+ business days ago, not approved." />
              <TableRow label="Fit Sample Overdue" value="Tech packs sent 15+ business days ago, no Fit Sample received. Order-level." />
              <TableRow label="PPS Overdue" value="40+ business days since Lab Dip approved, PPS not received. Order-level." />
              <TableRow label="PPS Needs Approval" value="PPS sent to customer 7+ business days ago, not approved. Order-level." />
            </Table>
            <MockShot caption="A warning entry on the Source Lab dashboard — each row shows the PO, style, the affected component, and how long it's been overdue.">
              <WarningEntryMock />
            </MockShot>
            <p className="mt-3"><strong>A warning won't show</strong> when the order is Cancelled / Delivered / Complete, or has a tracking reference (already on a shipment), or the component is NOT REQUIRED / APPROVED.</p>
          </Step>
        </section>
        )}

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
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', styles[tone])}>{children}</span>;
}

/**
 * Mini tracker that mirrors SupplierChangeTracker — three columns of date-
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
function ProductPageMock() {
  return (
    <div className="p-4 space-y-3">
      {/* Tracker */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-lg ring-1 ring-gray-100 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-orange-50 border-b border-orange-100 flex items-center gap-1.5">
            <Clock className="w-2.5 h-2.5 text-orange-600" />
            <span className="text-[9px] font-medium text-orange-800">Pending</span>
            <span className="ml-auto text-[9px] bg-orange-200 text-orange-800 px-1 py-0.5 rounded-full font-semibold">2</span>
          </div>
        </div>
        <div className="bg-white rounded-lg ring-1 ring-gray-100 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-green-50 border-b border-green-100 flex items-center gap-1.5">
            <CheckCircle className="w-2.5 h-2.5 text-green-600" />
            <span className="text-[9px] font-medium text-green-800">Approved</span>
            <span className="ml-auto text-[9px] bg-green-200 text-green-800 px-1 py-0.5 rounded-full font-semibold">3</span>
          </div>
        </div>
        <div className="bg-white rounded-lg ring-1 ring-gray-100 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
            <XCircle className="w-2.5 h-2.5 text-red-600" />
            <span className="text-[9px] font-medium text-red-800">Rejected</span>
            <span className="ml-auto text-[9px] bg-red-200 text-red-800 px-1 py-0.5 rounded-full font-semibold">1</span>
          </div>
        </div>
      </div>
      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <div className="pl-7 pr-3 py-1.5 text-[11px] bg-white border border-gray-200 rounded-lg text-gray-400">Search PO, customer, style, factory…</div>
        </div>
        <button className="p-1.5 bg-white border border-gray-200 rounded-lg">
          <RefreshCw className="w-3 h-3 text-gray-500" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold">All 12</span>
          <span className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[9px] text-gray-600">Sampling</span>
          <span className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[9px] text-gray-600">Production</span>
        </div>
      </div>
      {/* PO list — mix of collapsed and one expanded teaser */}
      <div className="space-y-2">
        <POCardCollapsedMock po="PO 5050" customer="Acme Apparel" factory="Shanghai Boomscarf" styles={4} units="2,400" exFac="12 May" status="Sampling" tone="amber" />
        <POCardCollapsedMock po="PO 4992" customer="Acme Apparel" factory="YKK Vietnam" styles={3} units="1,800" exFac="21 May" status="Sampling" tone="amber" />
        <POCardCollapsedMock po="PO 4980" customer="Other Customer" factory="Wuxi Print" styles={9} units="4,400" exFac="3 Jun" status="Production" tone="green" />
        <POCardCollapsedMock po="PO 4965" customer="Other Customer" factory="Hangzhou Knit" styles={8} units="1,600" exFac="15 May" status="Production" tone="green" />
      </div>
    </div>
  );
}

/** PO card expanded — showing the inner style rows. */
function ExpandedPOMock() {
  const rows = [
    { style: 'SS26-CREW-NVY', desc: 'Heavy crew rib', colour: 'Navy', qty: '600', exFac: '12 May', status: 'Sampling', tone: 'amber' as const },
    { style: 'SS26-CREW-CHA', desc: 'Heavy crew rib', colour: 'Charcoal', qty: '600', exFac: '12 May', status: 'Sampling', tone: 'amber' as const },
    { style: 'SS26-CREW-OAT', desc: 'Heavy crew rib', colour: 'Oat', qty: '500', exFac: '12 May', status: 'Production', tone: 'green' as const },
    { style: 'SS26-HOOD-BLK', desc: 'Pullover hood', colour: 'Black', qty: '700', exFac: '12 May', status: 'Sampling', tone: 'amber' as const },
  ];
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-primary-200 shadow-sm overflow-hidden">
        {/* Expanded header */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold">PO 5050</span>
              <span className="text-[10px] text-gray-400">·</span>
              <span className="text-[11px] text-gray-500">Acme Apparel</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">Shanghai Boomscarf</span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[10px] text-gray-400">4 styles</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] font-semibold text-gray-900">2,400</p>
            <p className="text-[9px] text-gray-400">units</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-medium text-gray-700">12 May</p>
            <p className="text-[9px] text-gray-400">ex-factory</p>
          </div>
          <StatusPill tone="amber">Sampling</StatusPill>
        </div>
        {/* Style table header */}
        <div className="grid grid-cols-[1.5fr_1.5fr_0.7fr_0.6fr_0.7fr_0.8fr_auto] gap-2 px-4 py-2 text-[9px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/60 border-b border-gray-100">
          <div>Style</div>
          <div>Description</div>
          <div>Colour</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Ex-Factory</div>
          <div>Status</div>
          <div></div>
        </div>
        {/* Style rows */}
        {rows.map((r) => (
          <div key={r.style} className="grid grid-cols-[1.5fr_1.5fr_0.7fr_0.6fr_0.7fr_0.8fr_auto] gap-2 px-4 py-2 items-center border-t border-gray-50">
            <div className="text-[11px] font-medium truncate">{r.style}</div>
            <div className="text-[11px] text-gray-600 truncate">{r.desc}</div>
            <div className="text-[11px] text-gray-600 truncate">{r.colour}</div>
            <div className="text-[11px] font-medium text-right num">{r.qty}</div>
            <div className="text-[10px] text-gray-600 text-right num">{r.exFac}</div>
            <div><StatusPill tone={r.tone}>{r.status}</StatusPill></div>
            <div className="flex items-center gap-1.5 justify-end">
              <button className="p-1 hover:bg-primary-50 rounded">
                <MessageSquare className="w-3 h-3 text-gray-400" />
              </button>
              <button className="inline-flex items-center gap-1 px-2 py-1 text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md text-[10px] font-bold">
                <Calendar className="w-3 h-3" strokeWidth={2.5} />
                Date change
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="w-3 h-3 rounded border-2 border-gray-300"></div>
          <span className="text-[11px] font-bold">PO 4992</span>
          <span className="text-[10px] text-gray-500">Acme Apparel · 3 styles · 1,800 units</span>
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

function TypeBadge({ type }: { type: 'strike_off' | 'lab_dip' }) {
  return (
    <span
      className={cn(
        'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
        type === 'strike_off' ? 'bg-amber-100 text-amber-800' : 'bg-cyan-100 text-cyan-800'
      )}
    >
      {type === 'strike_off' ? 'SO' : 'LD'}
    </span>
  );
}

function TypeComparisonMock() {
  return (
    <div className="p-5 grid grid-cols-2 gap-4">
      <div className="bg-amber-50/50 rounded-xl ring-1 ring-amber-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TypeBadge type="strike_off" />
          <span className="text-sm font-bold text-gray-900">Strike Off</span>
        </div>
        <p className="text-[11px] text-gray-600 mb-3">Physical fabric / print sample. Sign off the pattern, weave, or print quality.</p>
        <div className="space-y-1.5">
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">Main Fabric</div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">Rib Fabric</div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">Chest Print</div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-amber-100">Woven Label</div>
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
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Main Fabric — Bottle Green
          </div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-cyan-100 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400" /> Main Fabric — Mustard
          </div>
          <div className="px-2.5 py-1.5 bg-white rounded-md text-[11px] text-gray-700 ring-1 ring-cyan-100 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-400" /> Trim — Coral
          </div>
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
