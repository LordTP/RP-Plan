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
              Top to bottom: a <strong>tracker bar</strong> showing the state of your date-change
              requests, a <strong>search box</strong> with Refresh / Export / Table View beside it,
              <strong> status tiles</strong> that double as filters, a row of{' '}
              <strong>filter chips</strong>, and then your orders <strong>grouped by PO</strong>.
            </p>
            <MockShot caption="Factory · Product — tracker bar, status tiles, then your POs grouped">
              <ProductPageMock />
            </MockShot>
            <Tips>
              <Tip icon={Search}>Search matches <strong>PO number</strong>, <strong>customer</strong>, <strong>style</strong> or <strong>factory</strong>.</Tip>
              <Tip icon={Tag}>The status tiles are filters. Click one to show only those orders, click it again to clear.</Tip>
              <Tip icon={Tag}>Chips narrow further — <strong>Customer</strong>, <strong>Ex-factory</strong>, and <strong>Missing dates</strong> for anything with a gap.</Tip>
              <Tip icon={ChevronRight}>Each row is one PO. Click it to <strong>expand</strong> and see the styles inside — or <strong>Expand all</strong> on the right.</Tip>
              <Tip icon={Tag}><strong>Open / All / Shipped</strong> on the right switches which orders are listed at all.</Tip>
              <Tip icon={FileSpreadsheet}><strong>Table View</strong> swaps to the flat spreadsheet layout if you prefer one row per style.</Tip>
            </Tips>
          </Step>

          <Step number="2" title="Reading a PO + the styles inside">
            <p>
              Clicking a PO expands it into one row per style — code, description, colour, status,
              ex-factory and quantity. That is the summary. To actually <strong>read</strong> a style,
              click its row: a detail panel slides in from the right with everything on it.
            </p>
            <MockShot caption="A PO expanded — one row per style, with the amber date-change icon on each">
              <ExpandedPOMock />
            </MockShot>
            <p>
              The panel is where you will spend most of your time. Four KPI tiles across the top, then
              a <strong>Jump to</strong> bar — Product, Sampling, Shipping, Timeline — so you can get
              straight to the part you need on a long style.
            </p>
            <MockShot caption="Click a style and its detail panel slides in — KPI tiles, Jump to, then each section">
              <StyleDetailMock />
            </MockShot>
            <Table>
              <TableRow label="Total Qty" value="Units ordered for that style. Read-only." />
              <TableRow label="Ex-Factory" value="The current target date, with how far away it is underneath. If a revised date has been approved, that is the one showing." />
              <TableRow label="ETA Customer" value="When the goods are expected with the customer. Source Lab maintains this." />
              <TableRow label="Sampling" value="How many samples are signed off out of how many are needed, e.g. '0 of 2', with what is still outstanding named underneath." />
              <TableRow label="Product" value="Description, customer, order reference, colour, gender, season, direct/repeat/new. A small pencil marks the fields you are allowed to edit." />
              <TableRow label="Sampling section" value="Every component on the style as a card — Strike Off, Lab Dip or Label badge, its status, and when it was approved. Click a card to open it." />
              <TableRow label="Comments" value="Top right of the panel. Mention someone with @ and they get an email." />
              <TableRow label="Date change" value="The amber calendar icon on a style row in the list. Click it to request a change to the Revised Ex-Factory date (see step 4)." />
            </Table>
            <Callout type="info" title="Move between styles without closing">
              The chevrons beside Comments step to the previous or next style in the list, so you can
              work down a PO without going back and forth.
            </Callout>
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
            blurb="What components are, the two views on the /components page, how the library-first Add flow works, single-instance edits, bulk edits across POs, and when warnings fire. Same content for both Source Lab and factory users."
          />

          {/* Top-of-section key note — sets responsibility so everyone reads it before anything else. */}
          <div className="my-4 rounded-xl bg-violet-50 ring-1 ring-violet-200 border-l-4 border-violet-500 px-5 py-4 flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-violet-600 mb-1">Key note · Prime</p>
              <p className="text-sm font-bold text-gray-900 mb-1">When a new order lands on Critical Path, add its components.</p>
              <p className="text-[13px] text-gray-700 leading-relaxed">
                As soon as a new order appears in CP, Prime need to add the components for it. Don't wait for Sourcelab to ask — the sample workflow doesn't start until the components exist. Everything downstream (statuses, dates, warnings) depends on them being there.
              </p>
            </div>
          </div>

          {/* 1. Basics — the three sample types */}
          <Step number="1.1" title="Sample types — SO, LD, LB">
            <p>
              A <strong>component</strong> is one physical thing being sampled: a fabric, a print, a label, a colour swatch. Every component tracks <strong>one</strong> sample type. Pick it when you create — it can't change afterwards.
            </p>
            <Table>
              <TableRow
                label="Strike Off (SO)"
                value="A physical printed / woven sample of the fabric or trim. Sign off the pattern, weave, or print quality. Has an optional Position field (Front / Back / Hem / etc)."
              />
              <TableRow
                label="Lab Dip (LD)"
                value="A colour-match sample. Sign off the exact shade. Same swatch in three different colourways = three separate Lab Dip components."
              />
              <TableRow
                label="Label (LB)"
                value="Woven / printed labels. Colour is optional here (labels are often mono-colour or spec-driven)."
              />
            </Table>
            <MockShot caption="Strike Off, Lab Dip, and Label each have their own SO / LD / LB badge and live independently.">
              <TypeComparisonMock />
            </MockShot>
            <Callout type="info" title="The same name can be two types">
              "Pocket" might exist as a Strike Off (sample the fabric) AND as a Lab Dip (match the colour) on the same style. Each is a separate component with its own status + dates.
            </Callout>
          </Step>

          <Step number="1.2" title="Fit Sample and PPS are NOT components">
            <p>
              Fit Sample and PPS (Pre-Production Sample) are <em>whole-garment</em> concerns and live at the order / style level, not on individual components. Look for them in their own section on the style detail — not inside the Components list.
            </p>
          </Step>

          {/* 2. The two views on /components */}
          <Step number="2.1" title="The /components page — Worklist + Library">
            <p>
              Everything happens under <strong>Components</strong> in the nav. Two tabs at the top:
            </p>
            <Table>
              <TableRow
                label="Worklist"
                value="What needs chasing today. One card per add-event — the group of styles created together in a single Add Component action — with status tiles across the top you can click to filter (Needs attention, In flight, and so on). Expand a card to see every style in the group. There's a Cards / Table toggle if you'd rather scan a dense list."
              />
              <TableRow
                label="Library"
                value="What components exist. A rail of cards, one per NAME, and a detail panel listing every separate entry sharing that name — because one name is not one component. Each Add Component creates a fresh entry, so 'Rib Fabric' can be a dozen unrelated ones across different POs and seasons."
              />
            </Table>
            <Callout type="info" title="Worklist vs Library in one line">
              <strong>Worklist</strong> = "what needs chasing today?"  ·  <strong>Library</strong> = "what components exist?"
            </Callout>
            <Callout type="warn" title="OUT OF STEP — the one alarm in the Library">
              If an entry's own styles hold different statuses, it's flagged <strong>OUT OF STEP</strong>.
              Entries that merely share a name differ all the time — different POs, different seasons,
              approved months apart — and that's normal. But one entry is one add and one decision, so
              its styles should move together. When one lags behind, somebody missed it.
            </Callout>
          </Step>

          <Step number="2.2" title="Library — browse + edit identity">
            <p>
              A rail of cards down the left, <strong>one per name</strong>, each showing how many
              separate entries share that name and how many styles they cover between them. Click a
              card and the right panel lists every entry under it — its colour, its position (Strike
              Offs only), the POs it touches and each style&apos;s status.
            </p>
            <p>
              Grouped by name because a name is a label, not an identity. Every Add Component mints a
              fresh entry, so &quot;Rib Fabric&quot; can be a dozen unrelated ones. A flat list of
              those is unreadable, which is exactly what the old table gave you.
            </p>
            <MockShot caption="Library tab — a card per name on the left; the right panel lists every separate entry sharing it, with its styles and statuses.">
              <LibraryTabMock />
            </MockShot>
            <Tips>
              <Tip icon={Tag}>Names are stored UPPERCASE. Entries are never merged by name — two with the same name sit under the same card as separate entries, because they came from separate adds.</Tip>
              <Tip icon={Tag}>Colour is <strong>required</strong> for Strike Offs + Lab Dips, optional for Labels.</Tip>
              <Tip icon={Tag}>Position is Strike-Off-only. Pick from a fixed list (Central / Left as Worn / Back Neck / Hem / etc).</Tip>
              <Tip icon={Search}>Search matches name, description, colour and supplier notes — and it narrows the entries inside a card, not just which cards show.</Tip>
            </Tips>
            <Callout type="warn" title="Editing identity propagates within the add-event group">
              Rename or update the colour on the Library and it hits every instance in that same add-event group — not other library entries that happen to share the name. If a change needs to reach a style in a different entry, edit that entry too, or delete + re-add so it lands in the same group.
            </Callout>
          </Step>

          {/* 3. Adding — every add is a fresh library entry */}
          <Step number="3.1" title="Adding — every add is a fresh library entry">
            <p>
              Click <strong>+ Add component</strong> — either the page-level button on <span className="font-mono">/components</span>, or the button on any style's Components section. Same modal opens with two tabs:
            </p>
            <Table>
              <TableRow
                label="From library (as template)"
                value="Search the left rail, pick an existing entry, then tick target styles. The picked entry's identity (name / sample type / colour / position / spec / supplier notes) is copied into the form so you don't retype — but a brand-new library entry is created for this add-event with no link back to the picked one."
              />
              <TableRow
                label="+ Create new"
                value="Fill identity (name auto-uppercases, colour, position for SO, description, spec URL, supplier notes) and target styles. Every field starts blank."
              />
            </Table>
            <MockShot caption="Add Component modal — pick an existing entry as a template or start blank. Either way, a fresh library entry is created.">
              <AddModalMock />
            </MockShot>
            <Callout type="info" title="Both tabs behave the same way">
              Every submit mints a fresh library entry that groups only the styles you ticked in this add-event. All instances start blank (OUTSTANDING, no dates). There is no way to inherit approved status from another style or start a new instance as APPROVED — the sample has to actually happen.
            </Callout>
            <Callout type="info" title="You land where the work is">
              When the add succeeds you're taken straight to the Library tab with the fresh entry pre-selected — so you can see exactly which styles you just linked and start managing them from there.
            </Callout>
          </Step>

          <Step number="3.2" title="Create new — filling the form">
            <p>
              Flip to the <strong>+ Create new</strong> tab when the component genuinely doesn't exist in the library yet. Fields:
            </p>
            <Table>
              <TableRow
                label="Name"
                value="The component's identity. Auto-uppercases as you type — 'Chest Print' becomes 'CHEST PRINT' before it hits the DB. Casing dupes are impossible."
              />
              <TableRow
                label="Sample type"
                value="Strike Off / Lab Dip / Label. Locked once created — pick carefully."
              />
              <TableRow
                label="Description"
                value="Optional. One or two lines to explain what this is (e.g. 'Digital transfer, cotton base, 2026 crest')."
              />
              <TableRow
                label="Colour"
                value="REQUIRED for Strike Offs + Lab Dips. Optional for Labels. The specific shade — 'Sky Captain', 'Bottle Green', 'Peacoat'."
              />
              <TableRow
                label="Position"
                value="Strike Off only. Optional. Where the print / embroidery sits: CHEST POSITION – CENTRAL / LEFT AS WORN / RIGHT AS WORN, BACK, BACK NECK, HEM, LEFT SLEEVE AS WORN, RIGHT SLEEVE AS WORN."
              />
              <TableRow
                label="Spec URL"
                value="Optional. Link to the tech pack PDF, drawing, or wherever the sign-off spec lives."
              />
              <TableRow
                label="Supplier notes"
                value="Optional. Anything the supplier needs to know that doesn't fit in the description — colour reference codes, base fabric hint, tolerances."
              />
            </Table>
            <MockShot caption="Create new form — name auto-uppercases, colour is required for SO/LD, position dropdown appears for Strike Offs.">
              <CreateNewFormMock />
            </MockShot>
            <Callout type="info" title="Save + apply in one shot">
              Fill identity, tick target styles, hit Create — the canonical lands in the library AND instances land on each ticked style, all in one action. No two-step "save then apply."
            </Callout>
          </Step>

          <Step number="3.3" title="Target styles — pick which to apply">
            <p>
              Style picker groups by PO. Search matches PO number, style code, customer, or orderbook reference. Tick individual styles, or tick the PO row to select all its styles at once. <strong>Collapse all / Expand all</strong> in the top-right for fast scanning of a long list.
            </p>
            <Tips>
              <Tip icon={Tag}>Cross-PO selection is fine — apply the same component to Chelsea PO 5310 and Stoke PO 5205 in one go, and both POs will show up in the same Library entry.</Tip>
              <Tip icon={Tag}>Ticking a style that already has a same-named component from a previous add-event is allowed — the new instance sits alongside the old one and belongs to a separate group. Only detach + re-add if you need them under a single group.</Tip>
            </Tips>
          </Step>

          {/* 4. Worklist + editing */}
          <Step number="4.1" title="Worklist — the working queue">
            <p>
              One card per <strong>add-event</strong> — the group of styles created together in a single
              Add Component action — showing the component's name, colour, sample type, how many styles
              it covers and how long it has been waiting.
            </p>
            <p>
              Status tiles run across the top. They are filters, not just counts: click{' '}
              <strong>Needs attention</strong> to cut the list to the urgent ones, click it again to
              clear. Expand any card to see every style in that group with its own status.
            </p>
            <MockShot caption="Worklist — one card per add-event, status tiles across the top double as filters.">
              <WorklistMock />
            </MockShot>
            <Tips>
              <Tip icon={Tag}>Cards / Table toggle — cards to scan, table when you want a dense list.</Tip>
              <Tip icon={Tag}>Type filter (All / SO / LD / LB) scopes the whole tab.</Tip>
              <Tip icon={Tag}>Search narrows to a PO number, style code or component name.</Tip>
            </Tips>
          </Step>

          <Step number="4.2" title="Editing a single instance">
            <p>
              Expand a Worklist card and click any style on it — an edit modal opens on top, no page navigation. Set status, received date, approved date, or reject with a reason. Save and the change immediately reflects in both tabs.
            </p>
            <MockShot caption="Sample lifecycle inside the instance edit modal — status pill, three field tiles, attempt history.">
              <ComponentCardMock
                name="CHEST PRINT — HOME KIT BLUE"
                type="strike_off"
                status="APPROVED"
                received="14 May 2026"
                approved="20 May 2026"
              />
            </MockShot>
            <Callout type="info" title="Factories see this read-only">
              Suppliers can add / detach components and edit identity fields on ones touching their POs, but Status / Received / Approved are Sourcelab's call.
            </Callout>
          </Step>

          {/* 5. Bulk edit — Source Lab only. Documented here so factories know
              what Source Lab is doing on their components, not as a how-to. */}
          <Step number="5.1" title="Bulk edit across styles + POs — Source Lab only">
            <Callout type="warn" title="You won't see this — it's here so you know what's happening">
              Bulk edit sets sample status, received and approved dates, which are Source Lab's
              to set. The button doesn't appear for factory logins and the endpoint refuses the
              request. This section explains what Source Lab is doing to your components, so a
              status changing across several styles at once isn't a surprise.
            </Callout>
            <p>
              Source Lab tick the checkbox on multiple styles (or use the PO-level checkbox to grab a whole PO). A dark <strong>bar floats up at the bottom of the screen</strong> showing how many are selected, with a <strong>Bulk edit</strong> button on it — the same bar you get on the orders table. The status dropdown has the full seven options (NOT REQUIRED / OUTSTANDING / P23 ADVISE UPDATE / LATE / RECEIVED / APPROVED / REJECTED). Received + Approved dates are separate optional field overrides.
            </p>
            <p>
              Picking <strong>REJECTED</strong> swaps in a red panel with the standard reason list (Colour / Placement / Stitch / Material / Spec / Print / Other) plus an optional note. Confirming closes the current attempt on each ticked instance and opens v+1 at OUTSTANDING with a fresh clock. Received / Approved dates are cleared per instance — this is a lifecycle event, not a field edit.
            </p>
            <MockShot caption="Bulk edit modal — set status, received date, and approved date across every ticked instance at once. Picking REJECTED reveals the reason picker inline.">
              <BulkEditMock />
            </MockShot>
            <p>
              You can set any combination of the three fields. If any of the ticked instances already have an Approved date and you're setting a new one, you'll see a warning before it overwrites.
            </p>
            <Callout type="info" title="Why it matters to you">
              Source Lab can approve "CHEST PRINT — HOME KIT BLUE" across 6 styles on 3 POs in one
              action. So several of your styles can move to APPROVED at the same moment from a
              single decision — that's expected, not a glitch.
            </Callout>
            <Callout type="info" title="No accidental dismiss">
              The bulk edit modal only closes via the X or Cancel — clicking outside the card won't drop your work. Same behaviour on the single-instance edit modal.
            </Callout>
          </Step>

          {/* 6. Lifecycle */}
          <Step number="6.1" title="The sample lifecycle">
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
              <strong>OUTSTANDING</strong> is the default — sample requested, not back yet. Once it physically arrives, the Received date is set (this auto-bumps the status to RECEIVED). After review, either Approved (signed off) or Rejected.
            </p>
            <p>
              <strong>NOT REQUIRED</strong> is a special status that says "we don't need this sample at all." Use it when e.g. a Lab Dip isn't relevant because the colour's a standard. NOT REQUIRED suppresses warnings and counts as done.
            </p>
          </Step>

          {/* 7. Rejections */}
          <Step number="7.1" title="Rejections and v2 (rework)">
            <p>
              When Sourcelab rejects, they pick a structured <strong>reason</strong> (Colour / Placement / Stitch / Material / Spec / Print / Other), add an optional <strong>note</strong>, and optionally a <strong>photo</strong>. Confirming closes the attempt as REJECTED and opens v2 at OUTSTANDING with the clock reset.
            </p>
            <MockShot caption="Same component on v2 with the rejection context banner — factories see the reason + note so they know what to fix.">
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
            <Callout type="warn" title="Stuck on v3+ needs direct attention">
              Anything on v3+ shows on the Sourcelab Resubmissions dashboard. Usually a comms issue worth a phone call when things hit a third attempt.
            </Callout>
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
/* Both drawn from the live supplier view (FactoryV2View). The previous pair
   showed a Pending/Approved/Rejected chip bar over "Sampling / Production" PO
   cards — a design that no longer exists on either the default or the table
   view, so the labels had been corrected on a picture of the wrong screen. */

const V2_POS: { po: string; customer: string; styles: number; qty: string; exfac: string }[] = [
  { po: 'DEMO-5301', customer: 'TRUEPATH RETAIL', styles: 4, qty: '1,254', exfac: '07 Oct 2026' },
  { po: 'DEMO-5302', customer: 'NORTHGATE SPORT', styles: 2, qty: '380', exfac: '13 Oct 2026' },
  { po: 'DEMO-5303', customer: 'BQ DIRECT', styles: 5, qty: '768', exfac: '19 Oct 2026' },
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

/* The style detail panel, drawn from the live slide-out. */
function StyleDetailMock() {
  const kpis: [string, string, string | null][] = [
    ['TOTAL QTY', '393', null],
    ['EX-FACTORY', '07 Oct 2026', 'in 23d'],
    ['ETA CUSTOMER', '\u2014', null],
    ['SAMPLING', '0 of 2', 'Fit, PPS pending'],
  ];
  const product: [string, string, boolean?][] = [
    ['Description', 'SS27 SHORT'],
    ['Customer', 'TRUEPATH RETAIL'],
    ['Order Reference', '\u2014'],
    ['Colour', 'WHITE'],
    ['Gender', '\u2014', true],
    ['Season', 'SS27'],
  ];
  const comps: [string, 'strike_off' | 'lab_dip' | 'label'][] = [
    ['AOP PRINT', 'strike_off'], ['AOP PRINT', 'strike_off'],
    ['RIB FABRIC', 'strike_off'], ['HIGH RISK RED', 'lab_dip'],
  ];
  return (
    <div className="bg-white">
      {/* header */}
      <div className="px-3 pt-2.5 pb-2 border-b border-gray-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[8.5px] text-gray-400">DEMO-5301 · S005010A-0121-NRO · updated 6 hours ago</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[13px] font-extrabold text-gray-900">SS27 SHORT</p>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[8px] font-semibold">Unknown</span>
              <span className="text-[9px] text-gray-500">· WHITE</span>
            </div>
          </div>
          <span className="px-1.5 py-1 rounded-md border border-gray-200 text-[9px] font-semibold text-gray-600">Comments</span>
          <span className="px-1 py-1 rounded-md border border-gray-200 text-[9px] text-gray-400">⌃ ⌄</span>
          <span className="text-[10px] text-gray-400">✕</span>
        </div>
      </div>
      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-1.5 p-2 bg-gray-50/70">
        {kpis.map(([l, v, sub], i) => (
          <div key={l} className={cn('rounded-md border bg-white px-2 py-1.5',
            i === 3 ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200')}>
            <p className="text-[7px] font-bold tracking-wide text-gray-500">{l}</p>
            <p className="text-[11px] font-extrabold text-gray-900 leading-tight">{v}</p>
            {sub && <p className="text-[7px] text-gray-400">{sub}</p>}
          </div>
        ))}
      </div>
      {/* jump to */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-100">
        <span className="text-[7.5px] font-bold text-gray-400">JUMP TO</span>
        <span className="px-1.5 py-0.5 rounded bg-primary-600 text-white text-[8.5px] font-semibold">Product</span>
        <span className="text-[8.5px] text-gray-600">Sampling</span>
        <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[7.5px] font-bold">2 pending</span>
        <span className="text-[8.5px] text-gray-600">Shipping</span>
        <span className="text-[8.5px] text-gray-600">Timeline</span>
      </div>
      {/* product */}
      <div className="p-2">
        <p className="text-[8px] font-bold text-gray-700 border-l-2 border-primary-500 pl-1.5 mb-1">PRODUCT</p>
        <div className="rounded-md border border-gray-200 overflow-hidden">
          {product.map(([k, v, editable]) => (
            <div key={k} className="flex items-center px-2 py-1 border-b border-gray-50 last:border-0">
              <span className="text-[9px] text-gray-600 flex-1">{k}{editable && <span className="text-gray-300"> ✎</span>}</span>
              <span className="text-[9px] font-semibold text-gray-900">{v}</span>
            </div>
          ))}
        </div>
        {/* sampling */}
        <div className="flex items-center gap-1.5 mt-2 mb-1">
          <p className="text-[8px] font-bold text-gray-700 border-l-2 border-amber-500 pl-1.5">SAMPLING</p>
          <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[7px] font-bold">2 PENDING</span>
          <span className="ml-1 text-[8px] text-gray-500">COMPONENTS</span>
          <span className="px-1 rounded-full bg-gray-100 text-gray-600 text-[7px] font-bold">6</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {comps.map(([name, type], i) => (
            <div key={i} className="rounded-md border border-green-200 bg-white px-2 py-1.5">
              <div className="flex items-center gap-1"><TypeBadge type={type} /><span className="ml-auto text-[9px] text-gray-300">›</span></div>
              <p className="text-[9.5px] font-bold text-gray-900 mt-0.5">{name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="px-1 py-0.5 rounded bg-green-100 text-green-700 text-[7.5px] font-bold">APPROVED</span>
                <span className="text-[7.5px] text-gray-400">approved 3 Sep</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpandedPOMock() {
  const styles: [string, string, string, string][] = [
    ['S005010A-0121-NRO', 'SS27 SHORT', 'WHITE', '393'],
    ['S005011A-0121-NRO', 'SS27 TEE', 'HIGH RISK RED', '334'],
    ['S005012A-0121-NRO', 'SS27 HOODIE', 'BOTTLE GREEN', '358'],
    ['S005013A-0121-NRO', 'SS27 TEE', 'BLACK', '169'],
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
          <span className="text-[10px] text-gray-500">TRUEPATH RETAIL · 3 styles · 1,800 units</span>
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
  const items: { name: string; type: 'strike_off' | 'lab_dip' | 'label'; colour?: string; position?: string; styles: number; customers: number; active?: boolean }[] = [
    { name: 'CHEST PRINT — HOME KIT BLUE', type: 'strike_off', colour: 'Sky Captain', position: 'CHEST POSITION – CENTRAL', styles: 11, customers: 3, active: true },
    { name: 'MAIN FABRIC — COTTON 200GSM', type: 'strike_off', colour: 'Bottle Green', styles: 14, customers: 4 },
    { name: 'SLEEVE EMB — CHELSEA CREST', type: 'strike_off', colour: 'Gold', position: 'LEFT SLEEVE AS WORN', styles: 4, customers: 1 },
    { name: 'CARE LABEL — STANDARD', type: 'label', styles: 22, customers: 5 },
    { name: 'PEACOAT NAVY', type: 'lab_dip', colour: 'Peacoat', styles: 7, customers: 2 },
  ];
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden max-w-4xl mx-auto">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <p className="text-sm font-bold text-gray-900">Components</p>
          <div className="flex items-center gap-3 border-b-2 border-transparent">
            <span className="pb-2 text-[11px] font-bold text-violet-700 border-b-2 border-violet-500 -mb-3">Library</span>
            <span className="pb-2 text-[11px] font-medium text-gray-500">Worklist</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-[10px] text-gray-400">+ Add component</div>
          </div>
        </div>
        <div className="grid grid-cols-[240px_1fr]">
          {/* Left rail */}
          <div className="border-r border-gray-100 bg-gray-50/40">
            <div className="p-2.5 border-b border-gray-100">
              <div className="pl-6 pr-2 py-1 border border-gray-200 rounded text-[11px] text-gray-400 bg-white flex items-center">
                <Search className="w-3 h-3 text-gray-400 -ml-4 mr-1.5" />
                Search library…
              </div>
            </div>
            <div>
              {items.map((c, i) => (
                <div key={i} className={cn(
                  'px-3 py-2.5 border-b border-gray-100 text-[11px]',
                  c.active ? 'bg-violet-50 border-l-4 border-l-violet-500 -ml-px' : ''
                )}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TypeBadge type={c.type} />
                    <span className="font-semibold text-gray-900 truncate flex-1">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {c.colour && (
                      <span className="text-[10px] font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[100px]">{c.colour}</span>
                    )}
                    {c.position && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 truncate max-w-[130px]">{c.position}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 tabular-nums">{c.styles} styles · {c.customers} customer{c.customers === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Right detail */}
          <div className="p-4 space-y-3">
            {/* Identity */}
            <div className="rounded-lg border border-gray-200 p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-sm">📷</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <TypeBadge type="strike_off" />
                  <p className="text-sm font-bold text-gray-900">CHEST PRINT — HOME KIT BLUE</p>
                  <span className="text-[11px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">Sky Captain</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-0.5">Central</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">Digital transfer, cotton base, 2026 crest · 📎 spec-chest-print-v2.pdf</p>
              </div>
              <button className="text-[10px] font-semibold text-violet-600">Edit</button>
            </div>
            {/* Rollup */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded border border-gray-200 bg-gray-50 p-1.5">
                <p className="text-[9px] uppercase font-bold text-gray-500">Used</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">11</p>
              </div>
              <div className="rounded border border-emerald-200 bg-emerald-50 p-1.5">
                <p className="text-[9px] uppercase font-bold text-emerald-700">Approved</p>
                <p className="text-sm font-bold text-emerald-700 tabular-nums">6</p>
              </div>
              <div className="rounded border border-blue-200 bg-blue-50 p-1.5">
                <p className="text-[9px] uppercase font-bold text-blue-700">Received</p>
                <p className="text-sm font-bold text-blue-700 tabular-nums">2</p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-1.5">
                <p className="text-[9px] uppercase font-bold text-amber-700">Outstanding</p>
                <p className="text-sm font-bold text-amber-700 tabular-nums">3</p>
              </div>
            </div>
            {/* Instance list */}
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">All styles using this</p>
                <p className="text-[10px] font-semibold text-violet-600">Bulk edit</p>
              </div>
              <div className="divide-y divide-gray-100 text-[11px]">
                {[
                  { code: 'S003883A-0001', po: '5202 · CHELSEA', st: 'Approved 12 Jun', tone: 'green' as const },
                  { code: 'S004450A-0001', po: '5205 · STOKE', st: 'Received 4 Jun', tone: 'blue' as const },
                  { code: 'S004612B-0002', po: '5251 · EVERTON', st: 'v1 out · 18 Jun', tone: 'amber' as const },
                ].map((r, i) => (
                  <div key={i} className="px-3 py-1.5 flex items-center gap-2">
                    <span className="w-3 h-3 rounded border border-gray-300 bg-white" />
                    <span className="font-mono tabular-nums text-gray-700">{r.code}</span>
                    <span className="flex-1 truncate text-gray-500">{r.po}</span>
                    <StatusPill tone={r.tone}>{r.st}</StatusPill>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddModalMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden max-w-3xl mx-auto shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Add component</p>
            <p className="text-[10px] text-gray-500">Every add creates a fresh library entry. Pick an existing entry to copy its identity, or fill from scratch.</p>
          </div>
          <X className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="px-5 pt-3">
          <div className="inline-flex p-0.5 bg-gray-100 rounded-lg text-[11px] font-semibold">
            <span className="px-3 py-1 rounded-md bg-white shadow-sm text-violet-700">From library (as template)</span>
            <span className="px-3 py-1 rounded-md text-gray-500">+ Create new</span>
          </div>
        </div>
        <div className="grid grid-cols-[220px_1fr]">
          <div className="border-r border-gray-100 p-3 bg-gray-50/40 space-y-1.5">
            <div className="pl-6 pr-2 py-1 border border-gray-200 rounded text-[10px] text-gray-400 bg-white flex items-center">
              <Search className="w-3 h-3 text-gray-400 -ml-4 mr-1.5" />
              Search library…
            </div>
            <div className="p-2 rounded border-2 border-violet-500 bg-violet-50">
              <div className="flex items-center gap-1.5">
                <TypeBadge type="strike_off" />
                <span className="text-[11px] font-bold text-gray-900 truncate">CHEST PRINT — HOME KIT BLUE</span>
              </div>
              <p className="text-[9px] text-gray-500 mt-0.5">11 styles · 3 customers · 📎</p>
            </div>
            <div className="p-2 rounded border border-gray-200 bg-white">
              <div className="flex items-center gap-1.5">
                <TypeBadge type="lab_dip" />
                <span className="text-[11px] font-bold text-gray-900 truncate">PEACOAT NAVY</span>
              </div>
              <p className="text-[9px] text-gray-500 mt-0.5">7 styles · 2 customers</p>
            </div>
            <div className="p-2 rounded border border-gray-200 bg-white">
              <div className="flex items-center gap-1.5">
                <TypeBadge type="label" />
                <span className="text-[11px] font-bold text-gray-900 truncate">CARE LABEL — STANDARD</span>
              </div>
              <p className="text-[9px] text-gray-500 mt-0.5">22 styles · 5 customers</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded border border-violet-200 bg-violet-50/60 p-2">
              <p className="text-[10px] font-bold text-violet-800">A new library entry will be created</p>
              <p className="text-[9px] text-violet-700/80 mt-0.5">Identity below is copied from the picked entry — no link back. Every ticked style starts blank (OUTSTANDING, no dates).</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Apply to styles</p>
                <p className="text-[9px] font-semibold text-gray-500">Collapse all</p>
              </div>
              <div className="rounded border border-gray-200 overflow-hidden text-[10px]">
                <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className="w-3 h-3 rounded border border-gray-300 bg-violet-500" />
                  <span className="font-mono font-bold">PO 5310</span>
                  <span className="text-gray-500">· CHELSEA · 4 styles</span>
                </div>
                <div className="px-2 py-1 pl-8 bg-violet-50/50 flex items-center gap-2">
                  <span className="w-3 h-3 rounded border border-gray-300 bg-violet-500" />
                  <span className="font-mono">S004901A-0001</span>
                  <span className="text-gray-500">Home Kit Body · Blue</span>
                </div>
                <div className="px-2 py-1 pl-8 bg-violet-50/50 border-t border-gray-100 flex items-center gap-2">
                  <span className="w-3 h-3 rounded border border-gray-300 bg-violet-500" />
                  <span className="font-mono">S004901A-0004</span>
                  <span className="text-gray-500">Home Kit Body · Red</span>
                </div>
                <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
                  <span className="w-3 h-3 rounded border border-gray-300 bg-white" />
                  <span className="font-mono font-bold">PO 5205</span>
                  <span className="text-gray-500">· STOKE · 3 styles</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <p className="text-[10px] text-gray-500">2 styles selected</p>
          <button className="px-3 py-1 text-[11px] font-semibold text-white bg-violet-600 rounded-md">Add to 2 styles</button>
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
function WorklistMock() {
  const tiles = [
    { label: 'IN FLIGHT', n: '9', active: true },
    { label: 'NEEDS ATTENTION', n: '1', red: true },
    { label: 'REJECTED', n: '1', red: true },
    { label: 'STALE 14D+', n: '0' },
    { label: 'OUTSTANDING', n: '5' },
    { label: 'RECEIVED', n: '3' },
  ];
  const cards: {
    type: 'strike_off' | 'lab_dip' | 'label';
    name: string; sub: string; chips: { t: string; tone: 'red' | 'amber' | 'blue' }[];
    exfac: string; attention?: string; multi?: boolean;
  }[] = [
    { type: 'strike_off', name: 'CHEST PRINT — HOME KIT BLUE', sub: '2 styles · 2 POs',
      chips: [{ t: 'Rejected', tone: 'red' }, { t: 'Outstanding', tone: 'amber' }],
      exfac: '06/11/2026', attention: '1 needs attention', multi: true },
    { type: 'strike_off', name: 'CHEST PRINT — HOME KIT BLUE', sub: '1 style · PO 5252 · LEVY MERCHANDISING',
      chips: [{ t: 'Outstanding', tone: 'amber' }], exfac: '30/10/2026' },
    { type: 'lab_dip', name: 'PEACOAT NAVY', sub: '1 style · PO 5261 · TRUEPATH RETAIL',
      chips: [{ t: 'Outstanding', tone: 'amber' }], exfac: '31/10/2026' },
    { type: 'label', name: 'CARE LABEL — STANDARD', sub: '2 styles · 2 POs',
      chips: [{ t: '2 Received', tone: 'blue' }], exfac: '13/10/2026', multi: true },
  ];
  const chipTone = {
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  } as const;

  return (
    <div className="p-3 bg-gray-50">
      {/* Tabs */}
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-extrabold text-gray-900">Components</p>
          <span className="text-[10px] text-gray-400">Every sample still in flight</span>
          <span className="ml-auto inline-flex rounded-md border border-gray-200 bg-white overflow-hidden">
            <span className="px-2 py-1 text-[10px] font-bold text-violet-700 bg-violet-50">Worklist</span>
            <span className="px-2 py-1 text-[10px] font-medium text-gray-500">Library</span>
          </span>
          <span className="px-2 py-1 rounded-md bg-primary-600 text-white text-[10px] font-semibold">+ Add component</span>
        </div>

        {/* Status tiles — these are the filters */}
        <div className="grid grid-cols-6 gap-1.5 mb-2">
          {tiles.map(t => (
            <div key={t.label} className={cn(
              'rounded-md border bg-white px-2 py-1.5',
              t.active ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200',
            )}>
              <p className="text-[7.5px] font-bold tracking-wide text-gray-500">{t.label}</p>
              <p className={cn('text-sm font-extrabold', t.red ? 'text-red-600' : 'text-gray-900')}>{t.n}</p>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-1.5 mb-2">
          <div className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[9px] text-gray-400">
            Search component, style, PO, customer…
          </div>
          <span className="text-[8px] font-bold text-gray-400">TYPE</span>
          {['All', 'Strike Off', 'Lab Dip', 'Label'].map((x, i) => (
            <span key={x} className={cn('px-1.5 py-0.5 rounded-full border text-[9px] font-semibold',
              i === 0 ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500')}>{x}</span>
          ))}
          <span className="px-1.5 py-0.5 rounded-full border border-primary-300 bg-primary-50 text-primary-700 text-[9px] font-semibold">Cards</span>
          <span className="px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-gray-500 text-[9px] font-semibold">Table</span>
        </div>

        {/* Add-event cards */}
        <div className="grid grid-cols-2 gap-1.5">
          {cards.map((c, i) => (
            <div key={i} className={cn('rounded-lg border bg-white overflow-hidden',
              c.attention ? 'border-red-200' : 'border-gray-200')}>
              <div className="p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-sm border border-gray-300" />
                  <TypeBadge type={c.type} />
                  {c.attention && (
                    <span className="text-[8px] font-bold text-white bg-red-500 px-1 py-0.5 rounded-full">{c.attention}</span>
                  )}
                </div>
                <p className="text-[11px] font-extrabold text-gray-900 leading-tight">{c.name}</p>
                <p className="text-[9px] text-gray-500 mt-0.5">{c.sub}</p>
                <div className="flex gap-1 mt-1">
                  {c.chips.map(ch => (
                    <span key={ch.t} className={cn('text-[8.5px] font-semibold px-1.5 py-0.5 rounded', chipTone[ch.tone])}>{ch.t}</span>
                  ))}
                </div>
              </div>
              <div className="px-2 py-1 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2">
                <span className="text-[8.5px] text-gray-400">idle 0d</span>
                <span className="text-[8.5px] text-gray-500">ex-fac {c.exfac}</span>
                <span className="ml-auto text-[8.5px] font-semibold text-primary-600">
                  {c.multi ? '\u203a Styles' : 'Open'}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function CreateNewFormMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden max-w-3xl mx-auto shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Add component</p>
            <p className="text-[10px] text-gray-500">Create a canonical component, then apply to styles.</p>
          </div>
          <X className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="px-5 pt-3">
          <div className="inline-flex p-0.5 bg-gray-100 rounded-lg text-[11px] font-semibold">
            <span className="px-3 py-1 rounded-md text-gray-500">From library</span>
            <span className="px-3 py-1 rounded-md bg-white shadow-sm text-violet-700">+ Create new</span>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Name</p>
              <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-800 bg-white uppercase">CHEST PRINT — HOME KIT BLUE</div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Sample type</p>
              <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-800 bg-white">Strike Off</div>
            </div>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Description <span className="lowercase font-normal text-gray-400" style={{ letterSpacing: 0 }}>(optional)</span></p>
            <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-800 bg-white min-h-[36px]">Digital transfer, cotton base, 2026 crest.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Colour <span className="lowercase font-normal text-red-500" style={{ letterSpacing: 0 }}>(required)</span></p>
              <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-800 bg-white">Sky Captain</div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Position <span className="lowercase font-normal text-gray-400" style={{ letterSpacing: 0 }}>(optional)</span></p>
              <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-800 bg-white flex items-center justify-between">
                <span>CHEST POSITION – CENTRAL</span>
                <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Spec URL <span className="lowercase font-normal text-gray-400" style={{ letterSpacing: 0 }}>(optional)</span></p>
            <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-400 bg-white">https://…</div>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Supplier notes <span className="lowercase font-normal text-gray-400" style={{ letterSpacing: 0 }}>(optional)</span></p>
            <div className="px-2 py-1.5 border border-gray-300 rounded-md text-[12px] text-gray-400 bg-white min-h-[36px]">Anything the supplier should know…</div>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1 flex items-center justify-between">
              <span>Apply to styles</span>
              <span className="lowercase font-semibold text-gray-500 tracking-normal">Collapse all</span>
            </p>
            <div className="rounded border border-gray-200 overflow-hidden text-[10px]">
              <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className="w-3 h-3 rounded border border-gray-300 bg-violet-500" />
                <span className="font-mono font-bold">PO 5310</span>
                <span className="text-gray-500">· CHELSEA · 4 styles</span>
              </div>
              <div className="px-2 py-1 pl-8 bg-violet-50/50 flex items-center gap-2">
                <span className="w-3 h-3 rounded border border-gray-300 bg-violet-500" />
                <span className="font-mono">S004901A-0001</span>
                <span className="text-gray-500">Home Kit Body · Blue</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <p className="text-[10px] text-gray-500">1 style selected</p>
          <button className="px-3 py-1.5 text-[11px] font-semibold text-white bg-violet-600 rounded-md">Create &amp; add to 1 style</button>
        </div>
      </div>
    </div>
  );
}

function BulkEditMock() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden max-w-md mx-auto shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">Bulk edit — 6 instances</p>
          <p className="text-[11px] text-gray-500 mt-0.5">CHEST PRINT — HOME KIT BLUE</p>
          <p className="text-[10px] text-gray-400">PO 5202 · PO 5205 (3) · PO 5251</p>
        </div>
        <div className="p-5 space-y-2">
          <label className="flex items-center gap-2 p-2.5 rounded border-2 border-violet-500 bg-violet-50">
            <span className="w-3.5 h-3.5 rounded border border-violet-500 bg-violet-500 flex items-center justify-center text-white text-[9px]">✓</span>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-gray-900">Status</p>
              <p className="text-[9px] text-gray-500">Set on every ticked instance</p>
            </div>
            <span className="text-[10px] border border-gray-300 rounded px-2 py-0.5 bg-white">APPROVED</span>
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded border-2 border-violet-500 bg-violet-50">
            <span className="w-3.5 h-3.5 rounded border border-violet-500 bg-violet-500 flex items-center justify-center text-white text-[9px]">✓</span>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-gray-900">Approved date</p>
              <p className="text-[9px] text-gray-500">Applies where blank; overrides where set</p>
            </div>
            <span className="text-[10px] border border-gray-300 rounded px-2 py-0.5 bg-white">2026-07-07</span>
          </label>
          <label className="flex items-center gap-2 p-2.5 rounded border border-gray-200 bg-white">
            <span className="w-3.5 h-3.5 rounded border border-gray-300 bg-white" />
            <div className="flex-1">
              <p className="text-[11px] font-bold text-gray-500">Received date</p>
              <p className="text-[9px] text-gray-400">(unchecked)</p>
            </div>
          </label>
          <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800">
            <p><strong>Heads up:</strong> 2 of the 6 instances already have an Approved date set. Confirming will overwrite them.</p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 text-[11px] font-medium text-gray-600 border border-gray-300 rounded-md">Cancel</button>
          <button className="px-3 py-1.5 text-[11px] font-semibold text-white bg-violet-600 rounded-md">Update 6 instances</button>
        </div>
      </div>
    </div>
  );
}
