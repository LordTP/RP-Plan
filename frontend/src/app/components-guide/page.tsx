'use client';

/**
 * Universal Components Guide.
 *
 * Sits at /components-guide and is linked from both /guide (internal) and
 * /factory-guide (supplier). Written so both audiences can read it —
 * factories will start managing components soon, so the same content
 * applies to everyone.
 *
 * Six sections, by design:
 *   1. The basics — what components are, Strike Off vs Lab Dip
 *   2. Adding a component — type picker → name → scope
 *   3. Tracking the sample — Outstanding → Received → Approved
 *   4. Rejections & v2 — reason / note flow + attempt counters
 *   5. The catalogue — Design → Components page
 *   6. Warning thresholds — when each dashboard warning fires
 */

import {
  Layers, Plus, Edit3, AlertTriangle, Info, Clock,
  CheckCircle2, RefreshCw, Search, Tag, FileText,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { cn } from '@/lib/utils';

export default function ComponentsGuidePage() {
  return (
    <AuthProvider>
      <Content />
    </AuthProvider>
  );
}

function Content() {
  return (
    <AppShell title="Components Guide">
      <div className="pb-24 max-w-4xl mx-auto">
        {/* Hero */}
        <div className="bg-white rounded-xl ring-1 ring-gray-100 px-8 py-7 mb-5 flex items-start gap-5">
          <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <Layers className="w-7 h-7 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Components Guide</h1>
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
              Everything you need to know about components — what they are, how to add them, how to track their samples, and how the system warns you when something's overdue. Same guide whether you're at Source Lab or at a factory.
            </p>
          </div>
        </div>

        {/* =========================================================== */}
        <SectionHeader
          icon={Info}
          title="1. The basics"
          blurb="What a component is, and the two types each one can be."
        />

        <Step number="1.1" title="What's a component?">
          <p>
            A <strong>component</strong> is one part of a finished garment — a fabric, trim, or detail that needs its own sample sign-off. Common examples: Main Fabric, Lining, Rib Fabric, Zip, Buttons, Woven Label, Badges, Embroidered Logo, Pocket Fabric, Drawstring.
          </p>
          <p>
            Most garments have several. Each one gets tracked independently so you can see at a glance which parts are approved and which are still bouncing.
          </p>
          <Callout type="info" title="Why split them out?">
            Without components, the whole garment's sampling lives in one row — you can't tell whether the Main Fabric or just the Lining is holding things up. Splitting into components means a stuck Lining doesn't make the whole style look stuck.
          </Callout>
        </Step>

        <Step number="1.2" title="Strike Off vs Lab Dip">
          <p>
            Every component tracks <strong>one</strong> sample type — Strike Off OR Lab Dip. Not both. You pick the type when you create it, and it can't change afterwards.
          </p>
          <Table>
            <TableRow
              label="Strike Off (SO)"
              value="A physical printed/woven sample of the fabric or trim, to sign off the pattern, weave, or print quality. Things like Main Fabric, Rib, Print, Woven Label."
            />
            <TableRow
              label="Lab Dip (LD)"
              value="A colour-match sample, to sign off the specific shade. Same swatch in three different colourways = three Lab Dip components."
            />
          </Table>
          <Callout type="info" title="The same name can be both types">
            "Pocket" might exist as a Strike Off component (sample the fabric) AND as a Lab Dip component (match the colour) on the same style. They're treated as separate, with their own statuses and dates.
          </Callout>
        </Step>

        <Step number="1.3" title="Fit Sample and PPS are NOT components">
          <p>
            Fit Sample and PPS (Pre-Production Sample) are <em>whole-garment</em> concerns and live at the order/style level, not on individual components. You'll see them in their own section of the style detail — not inside the Components list.
          </p>
        </Step>

        {/* =========================================================== */}
        <SectionHeader
          icon={Plus}
          title="2. Adding a component"
          blurb="The flow is type first, name second, scope third."
        />

        <Step number="2.1" title="Step 1 — Pick the type">
          <p>
            From a style's detail view, click the <strong>+ Add Component</strong> button (top-right of the Components section). The first thing you'll see is a two-card chooser:
          </p>
          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="p-4 border-2 border-amber-200 bg-amber-50/40 rounded-xl">
              <div className="text-sm font-bold text-gray-900">Strike Off</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Fabric / print sample</div>
            </div>
            <div className="p-4 border-2 border-cyan-200 bg-cyan-50/40 rounded-xl">
              <div className="text-sm font-bold text-gray-900">Lab Dip</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Colour match sample</div>
            </div>
          </div>
          <Callout type="warn" title="Type is locked once you save">
            Pick the right one. You can't change a Strike Off component to a Lab Dip later — you'd need to delete and re-add it (losing any history attached to that record).
          </Callout>
        </Step>

        <Step number="2.2" title="Step 2 — Name it">
          <p>
            Once you've picked the type, the rest of the form opens. Type the component name in the field. As you type, the app suggests existing names that match — pick from the dropdown to keep things consistent across the catalogue.
          </p>
          <Tips>
            <Tip icon={Tag}>If you type something that already exists with different casing or spacing (e.g. "Main fabric" when "Main Fabric" is already used), you'll get an amber warning. Click "use existing" to avoid duplicates.</Tip>
            <Tip icon={Tag}>Common names: Main Fabric, Lining, Rib Fabric, Pocket Fabric, Zip, Buttons, Drawstring, Woven Label, Badges, Chest Emb, Print.</Tip>
          </Tips>
        </Step>

        <Step number="2.3" title="Step 3 — Pick the scope">
          <p>
            By default the component is added to just the style you're on. If the same component exists on other styles in the same PO, you can apply it to those at the same time:
          </p>
          <Table>
            <TableRow label="This style only" value="Just the current row. Quickest." />
            <TableRow label="All styles on PO" value="Every style on this purchase order gets a copy of the component." />
            <TableRow label="Selected styles" value="Opens a picker so you tick which specific styles to add it to." />
          </Table>
          <Callout type="info" title="Dedupe is per type">
            Adding "Pocket" Strike Off to a style that already has "Pocket" Strike Off is skipped (no duplicate). But a Strike Off "Pocket" and a Lab Dip "Pocket" are treated as separate — both can coexist.
          </Callout>
        </Step>

        {/* =========================================================== */}
        <SectionHeader
          icon={Edit3}
          title="3. Tracking the sample"
          blurb="The three fields each component has and how they move through the lifecycle."
        />

        <Step number="3.1" title="The three fields">
          <p>
            Once a component exists, expand it to see its sample tracking. There are three fields, all editable:
          </p>
          <Table>
            <TableRow
              label="Status"
              value="One of: OUTSTANDING (default — sample requested, not back yet), RECEIVED, APPROVED, REJECTED, NOT REQUIRED."
            />
            <TableRow
              label="Received"
              value="The date the sample physically arrived back at Source Lab / customer for inspection."
            />
            <TableRow
              label="Approved"
              value="The date the sample was signed off. Setting this date moves the component to done."
            />
          </Table>
        </Step>

        <Step number="3.2" title="The lifecycle">
          <p>
            A component flows through these states:
          </p>
          <div className="my-4 flex items-center gap-2 text-[11px] flex-wrap">
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
            <strong>OUTSTANDING</strong> is the default when a component is first created — we're waiting on the sample. Once it physically arrives, set the <em>Received</em> date (this auto-bumps the status to RECEIVED). After review, either approve it (setting the <em>Approved</em> date) or reject it.
          </p>
          <p>
            <strong>NOT REQUIRED</strong> is a special status that says "we don't need this sample at all." Use it when, say, a Lab Dip isn't relevant because the colour's already a standard. NOT REQUIRED suppresses warnings and counts as done.
          </p>
        </Step>

        <Step number="3.3" title="Applying a change to all matching styles">
          <p>
            When you save a field change, you get three options for where to apply it:
          </p>
          <Table>
            <TableRow label="This style only" value="Just the current row. Default." />
            <TableRow label="All styles on PO" value="Every style on the same PO that has a component with the same name AND same sample type gets the change." />
            <TableRow label="Selected styles" value="Opens a picker — tick which sibling styles to apply to." />
          </Table>
          <Callout type="info" title="Matching is name + type">
            "Pocket" Strike Off only matches other "Pocket" Strike Off rows. A "Pocket" Lab Dip on a sibling style won't be touched.
          </Callout>
        </Step>

        {/* =========================================================== */}
        <SectionHeader
          icon={RefreshCw}
          title="4. Rejections and v2 (rework)"
          blurb="When a sample isn't right, how the rework cycle works."
        />

        <Step number="4.1" title="Rejecting a sample">
          <p>
            Pick <strong>REJECTED</strong> from the Status dropdown. A modal opens asking for:
          </p>
          <Table>
            <TableRow label="Reason" value="A structured reason (Colour, Placement, Stitch, Material, Spec, Print, or Other). Makes it possible to chart 'what are we getting rejected for' over time." />
            <TableRow label="Note (optional)" value="Free-text note explaining what's wrong. Highly recommended — this is what the factory sees when looking at v2." />
            <TableRow label="Photo (optional)" value="Upload a photo so the factory can see exactly what you mean." />
          </Table>
          <p>
            Confirming closes the current attempt as REJECTED and opens v2 at OUTSTANDING. The Received and Approved dates are cleared on the new attempt — the clock starts fresh.
          </p>
        </Step>

        <Step number="4.2" title="What the badges mean">
          <p>
            Components show small badges next to their name to summarise their current state:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3 text-[11px]">
            <div className="px-3 py-2 bg-white ring-1 ring-gray-200 rounded-lg flex items-center gap-2">
              <StatusPill tone="green"><CheckCircle2 className="w-3 h-3" /> SO</StatusPill>
              <span className="text-gray-600">Strike Off approved (v1).</span>
            </div>
            <div className="px-3 py-2 bg-white ring-1 ring-gray-200 rounded-lg flex items-center gap-2">
              <StatusPill tone="amber">SO v2 ·1</StatusPill>
              <span className="text-gray-600">Currently on v2, 1 prior rejection.</span>
            </div>
            <div className="px-3 py-2 bg-white ring-1 ring-gray-200 rounded-lg flex items-center gap-2">
              <StatusPill tone="red">SO v3 ·2</StatusPill>
              <span className="text-gray-600">Stuck — 3+ attempts, 2+ prior rejections.</span>
            </div>
            <div className="px-3 py-2 bg-white ring-1 ring-gray-200 rounded-lg flex items-center gap-2">
              <StatusPill tone="gray">LD</StatusPill>
              <span className="text-gray-600">Lab Dip in OUTSTANDING state.</span>
            </div>
          </div>
          <Callout type="warn" title="Stuck components need direct attention">
            Anything on v3+ shows up on the Resubmissions dashboard. There's usually a comms issue with the factory that the reason/note alone hasn't fixed — pick up the phone.
          </Callout>
        </Step>

        <Step number="4.3" title="The clock resets per attempt">
          <p>
            "Days on v2" measures how long v2 has been open, not cumulative time from v1. This is intentional — once you've kicked off a new attempt, the previous one's clock stops mattering.
          </p>
        </Step>

        {/* =========================================================== */}
        <SectionHeader
          icon={Search}
          title="5. The Components catalogue"
          blurb="The Design → Components page is where you browse every component across every order."
        />

        <Step number="5.1" title="What it shows">
          <p>
            Found at <strong>Design → Components</strong>. Two-pane layout:
          </p>
          <Table>
            <TableRow
              label="Left sidebar"
              value="Every distinct (name, sample type) combination, with usage counts. 'Pocket SO' and 'Pocket LD' appear as separate entries with coloured SO/LD badges."
            />
            <TableRow
              label="Right pane"
              value="Detail view for the selected entry: every style using that component, grouped by status. Click any row to open the full style."
            />
          </Table>
        </Step>

        <Step number="5.2" title="Search, sort and filter">
          <Table>
            <TableRow label="Search" value="Matches component name, PO number, customer name, or Chinese orderbook reference at the same time." />
            <TableRow label="Used" value="Sort by how many orders use the component (most common at top)." />
            <TableRow label="Pending" value="Filter to just components with at least one unresolved sample. Quickly surfaces what needs attention." />
            <TableRow label="A–Z" value="Alphabetical by name." />
            <TableRow label="Hide shipped" value="Hide components whose orders are all shipped — stops finished work cluttering the view." />
          </Table>
        </Step>

        <Step number="5.3" title="Cleaning up duplicates (merge)">
          <p>
            If the system detects near-duplicate names (e.g. "Main Fabric" and "Main  Fabric" with extra spaces), a yellow callout appears above the table with a "Merge" prompt. Pick which name to keep, tick the variants to roll in, and merge — every component with one of the other names gets renamed in one go.
          </p>
        </Step>

        <Step number="5.4" title="Bulk edit and cross-PO add">
          <p>
            Tick checkboxes next to multiple components in the right pane to enable bulk actions — set the same Received date across them, mark a whole set as Approved, etc.
          </p>
          <p>
            The big <strong>+ Add component</strong> button (top-right) opens a cross-PO modal where you can add the same component to many styles across multiple POs in one shot — useful when, say, a new branding is being added to half the season's range.
          </p>
        </Step>

        {/* =========================================================== */}
        <SectionHeader
          icon={Clock}
          title="6. When things go overdue"
          blurb="The dashboard Warnings Centre fires automatically — here's exactly what triggers each one."
        />

        <Step number="6.1" title="The thresholds">
          <p>
            All thresholds are in <strong>business days</strong> (Mon–Fri, weekends skipped). The clock starts from whichever date the warning measures from.
          </p>
          <Table>
            <TableRow
              label="Tech Packs Need Sending"
              value="Order sent to factory 3+ business days ago, tech packs not sent."
            />
            <TableRow
              label="Specs Need Sending"
              value="Order sent to factory 3+ business days ago, specs not sent."
            />
            <TableRow
              label="Strike Off Overdue"
              value="Tech packs sent 20+ business days ago (25 for badge / woven label / woven tape), Strike Off not received."
            />
            <TableRow
              label="Strike Off Needs Approval"
              value="Strike Off received 5+ business days ago, not approved."
            />
            <TableRow
              label="Lab Dip Overdue"
              value="Tech packs sent 15+ business days ago, Lab Dip not received."
            />
            <TableRow
              label="Lab Dip Needs Approval"
              value="Lab Dip received 5+ business days ago, not approved."
            />
            <TableRow
              label="Fit Sample Overdue"
              value="Tech packs sent 15+ business days ago, no Fit Sample received. Order-level — not per component."
            />
            <TableRow
              label="PPS Overdue"
              value="40+ business days since Lab Dip was approved, PPS not received. Order-level."
            />
            <TableRow
              label="PPS Needs Approval"
              value="PPS sent to customer 7+ business days ago, not approved. Order-level."
            />
          </Table>
        </Step>

        <Step number="6.2" title="What stops warnings firing">
          <p>
            A warning won't show for an order when any of these are true:
          </p>
          <Tips>
            <Tip icon={CheckCircle2}>The order's status is <strong>Cancelled</strong>, <strong>Delivered</strong>, <strong>Complete</strong>, or <strong>Completed</strong>.</Tip>
            <Tip icon={CheckCircle2}>The order has a <strong>tracking reference</strong> set — once an order has been confirmed onto a shipment, the sampling / spec windows aren't actionable anymore.</Tip>
            <Tip icon={CheckCircle2}>The component's status is <strong>NOT REQUIRED</strong>, or it's already <strong>APPROVED</strong>.</Tip>
            <Tip icon={CheckCircle2}>The clock hasn't reached the threshold yet (e.g. tech packs sent 18 business days ago — Strike Off Overdue fires at 20).</Tip>
          </Tips>
        </Step>

        {/* Footer */}
        <div className="mt-8 px-4 py-4 bg-white rounded-xl ring-1 ring-gray-100 flex items-start gap-3 text-sm text-gray-600">
          <FileText className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
          <div>
            Spotted something wrong, or a workflow you'd like documented here? Tell Thomas — this guide is the single source of truth for both sides of the app and worth keeping up to date.
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ============== Layout helpers (mirrors /factory-guide style) ============== */

function SectionHeader({ icon: Icon, title, blurb }: { icon: any; title: string; blurb: string }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-gray-100 px-7 py-5 mb-4 mt-10 flex items-start gap-4">
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
    <div className="grid grid-cols-[200px_1fr] gap-3 px-4 py-2.5 hover:bg-gray-50">
      <span className="text-[12px] font-semibold text-gray-900">{label}</span>
      <span className="text-[12px] text-gray-600 leading-relaxed">{value}</span>
    </div>
  );
}

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
