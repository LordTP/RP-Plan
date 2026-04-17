'use client';

import { useState, useMemo } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  Palette,
  Layers,
  Beaker,
  MessageSquare,
  AlertTriangle,
  FileSpreadsheet,
  Ship,
  Package,
  Users,
  Settings,
  CheckCircle,
  Search,
  X,
  ArrowLeft,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { cn } from '@/lib/utils';

interface GuideStep {
  title: string;
  content: string[];
  tips?: string[];
}

interface GuideSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  steps: GuideStep[];
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Login, dashboard overview, and finding your way around',
    icon: LayoutDashboard,
    color: 'from-blue-500 to-blue-600',
    steps: [
      {
        title: 'Logging In',
        content: [
          'Navigate to the login page and enter your username and password.',
          'Your account is set up by an admin. If you don\'t have credentials, contact your administrator to get set up.',
        ],
        tips: ['Login uses your username — not your email address.', 'If you can\'t get in, ask an admin to check your account is active and reset your password from Settings.'],
      },
      {
        title: 'Your Dashboard',
        content: [
          'The Dashboard is your home screen after logging in. At the top you\'ll see key metrics — total orders, orders in production, shipped, and overdue.',
          'Below that is the Warnings Centre, which flags orders that need your attention (more on that later).',
          'The right column shows an Order Breakdown by status and a live Recent Activity feed.',
        ],
        tips: ['Click any metric number to jump straight to orders filtered by that status.'],
      },
      {
        title: 'Navigating the App',
        content: [
          'The top navigation bar has links to all pages. Which ones you see depends on your role:',
          '• Dashboard — your home screen, always visible',
          '• Orders — the full spreadsheet-style table view',
          '• Design — the V2 card-based view for the design team',
          '• Factory (dropdown) — Product and Shipping views for suppliers',
          '• Tracking — bulk vessel ETA updates by tracking reference',
          '• Analytics — charts, factory performance, design sampling stats',
          '• Import — upload Excel files to create/update orders',
        ],
        tips: ['Your user menu (top right) has links to this Help Guide, Settings (admin only), and Source Lab Apps.'],
      },
    ],
  },
  {
    id: 'design-v2',
    title: 'Design V2 View',
    description: 'The card-based view for managing orders visually',
    icon: Palette,
    color: 'from-violet-500 to-violet-600',
    steps: [
      {
        title: 'Browsing Orders',
        content: [
          'The Design page shows orders grouped by Purchase Order in expandable cards. Click a PO to expand and see all its styles.',
          'Use the search bar to filter by PO number, style code, customer, or factory. Status pills at the top let you filter by order status.',
        ],
      },
      {
        title: 'The Style Detail Modal',
        content: [
          'Click any style row to open a full detail modal. This is a two-column view:',
          'Left column — Quick stats (qty, cost, value), size breakdown with bar chart, product details (customer, style code, colour, etc.), and shipping info.',
          'Right column — Components, Samples (grouped by type), and the full Timeline showing every date from order received through to delivery.',
        ],
        tips: ['Press Escape or click the backdrop to close.', 'The "Comments" button in the header switches the right column to show comments and change history.'],
      },
      {
        title: 'Editing Inline',
        content: [
          'Editable fields respond to clicks. Text fields open an inline input. Date fields show a date picker. Status fields show a custom dropdown.',
          'Changes save immediately — no need for a save button.',
        ],
        tips: ['Status dropdowns include NOT REQUIRED to skip a sample type entirely.', 'The timeline has a row hover highlight so you can trace dates easily.'],
      },
      {
        title: 'Size Guide',
        content: [
          'The ruler icon next to the Gender field opens a Size Guide modal. It shows the correct size labels for each gender code — for example, 001-MENS shows 2XS through 5XL while 002-LADIES shows 6 through 24.',
          'Your current gender\'s row is highlighted with a "CURRENT" badge.',
        ],
      },
    ],
  },
  {
    id: 'components',
    title: 'Components',
    description: 'Track sampling per-material across styles',
    icon: Layers,
    color: 'from-teal-500 to-teal-600',
    steps: [
      {
        title: 'What Are Components?',
        content: [
          'Components represent the individual materials or trims in a style — Main Fabric, Lining, Zip, Woven Labels, Badges, etc.',
          'Each component has its own Fit Sample, Strike Off, and Lab Dip tracking. This means you can track sampling progress independently for each material.',
          'When a style has components, the order-level sampling fields are hidden — the data lives inside each component instead.',
        ],
      },
      {
        title: 'Adding Components',
        content: [
          'In the style detail modal, find the Components section (above Samples). Click the "+" button or the dashed "Add Component" area.',
          'Enter a name and choose where to add it:',
          'This style only — just this one row. All styles on PO — every style on this purchase order. Selected styles — tick which specific styles to add it to.',
        ],
        tips: ['Common names: Main Fabric, Lining, Rib Fabric, Zip, Buttons, Woven Label, Badges, Trim, Drawstring, Pocket Fabric.'],
      },
      {
        title: 'Editing & Bulk Applying',
        content: [
          'Expand a component to see its sampling fields laid out in a 2-column grid (Fit Sample | Strike Off, Lab Dip below). All fields are editable.',
          'When you save a field change, you get three options: this style only, all styles on the PO with this component, or select specific styles from a picker.',
        ],
      },
    ],
  },
  {
    id: 'sampling',
    title: 'Sampling Workflow',
    description: 'Fit, strike off, lab dip, and PPS tracking',
    icon: Beaker,
    color: 'from-amber-500 to-amber-600',
    steps: [
      {
        title: 'The Four Sample Types',
        content: [
          'There are four sample types tracked through the production process:',
          '• Fit Sample — checks the garment fits correctly. Has a Required flag, Status, Received date, and Approved date.',
          '• Strike Off — verifies prints, embroidery, or decorations. Tracks Status, Received, and Approved.',
          '• Lab Dip — confirms the fabric colour matches the specification. Tracks Status, Received, and Approved.',
          '• PPS (Pre-Production Sample) — the final check before full production begins. Tracks Status, Received, Sent to Customer, and Approved.',
        ],
      },
      {
        title: 'Status Options',
        content: [
          'Each sample type has a status dropdown with these options:',
          '• NOT REQUIRED — skips this sample entirely (suppresses warnings)',
          '• OUTSTANDING — sample has been requested but not yet received',
          '• P23 ADVISE UPDATE — waiting on an update from the factory',
          '• LATE — sample is overdue',
          '• RECEIVED — sample has arrived',
          '• APPROVED — sample has been reviewed and approved',
        ],
      },
      {
        title: 'Components vs Order-Level',
        content: [
          'Sampling data can live in two places depending on whether the style has components:',
          'Without components — Fit Sample, Strike Off, Lab Dip, and PPS all appear in the Samples section of the detail modal.',
          'With components — Fit Sample, Strike Off, and Lab Dip move inside each component (tracked independently per material). PPS, Photo Sample, and Shipment Sample always remain at the order level.',
        ],
      },
    ],
  },
  {
    id: 'comments',
    title: 'Comments & History',
    description: 'Team communication and change tracking',
    icon: MessageSquare,
    color: 'from-pink-500 to-pink-600',
    steps: [
      {
        title: 'Comments',
        content: [
          'In the V2 detail modal, click "Comments" in the header to switch the right column to comments.',
          'Type your message and press Enter or click Send. Comments are tagged as "Sourcelab" or "Supplier" based on your role.',
          'Tick "Add to all styles on this PO" to post the same comment to every row on the PO.',
        ],
        tips: ['Shift+Enter adds a new line without sending.', 'Unread comments show a blue ring. The count badge on PO cards shows your personal unread count.'],
      },
      {
        title: 'Change History',
        content: [
          'Internal users can switch to the History tab to see every field change — who made it, when, what changed (old → new value), and the source.',
          'Sources are colour-coded: blue for Sourcelab, orange for Supplier, purple for Excel Import, green for approved supplier changes, red for rejected.',
        ],
      },
    ],
  },
  {
    id: 'warnings',
    title: 'Warnings Centre',
    description: 'Automated alerts for things needing attention',
    icon: AlertTriangle,
    color: 'from-orange-500 to-orange-600',
    steps: [
      {
        title: 'How It Works',
        content: [
          'The Warnings Centre sits on your Dashboard. It groups warnings by severity (Urgent / Needs Attention) on the left, with flagged items on the right.',
          'Click any warning category to see its items. Click an item to jump directly to it in the Design V2 view.',
          'Use the search bar in the top-right to filter across all warnings by PO, style, factory, or customer.',
        ],
      },
      {
        title: 'Warning Types & Thresholds',
        content: [
          'All thresholds use business days (Monday–Friday only):',
          '• Tech Packs Need Sending — order sent to factory 3+ days ago, tech packs not sent',
          '• Specs Need Sending — order sent to factory 3+ days ago, specs not sent',
          '• Fit Sample Overdue — 15+ days since tech packs sent, no fit sample received',
          '• Lab Dip Overdue — 15+ days since tech packs sent, no lab dip received',
          '• Lab Dip Needs Approval — lab dip received 5+ days ago, not yet approved',
          '• Strike Off Overdue — 20+ days since tech packs (25 for badges/woven labels/tapes)',
          '• Strike Off Needs Approval — strike off received 5+ days ago, not yet approved',
          '• PPS Needs Approval — sent to customer 7+ days ago, not yet approved',
        ],
        tips: ['Samples marked NOT REQUIRED are excluded from all warnings.', 'When components exist, warnings check each component individually.'],
      },
    ],
  },
  {
    id: 'auto-calc',
    title: 'Auto-Calculated Fields',
    description: 'Fields that update automatically — you can\'t edit them',
    icon: Settings,
    color: 'from-gray-500 to-gray-600',
    steps: [
      {
        title: 'All Auto-Calculations',
        content: [
          'The following fields are calculated automatically whenever their source values change. They cannot be edited manually.',
          '• Total Qty — sum of all size columns',
          '• Total Order Cost — Trade Price × Total Qty',
          '• ETA UK — Revised Ex-Factory + 60 days',
          '• ETA Customer — ETA UK + 5 days',
          '• PO Open Month — month name from Customer Requested Delivery date (e.g. "February")',
          '• Expected Customer Delivery Month — month name from ETA Customer',
          '• Ex-Factory from PP Approval — PPS Approved + 35 days',
          '• Estimated Del to Customer — Vessel ETA + 5 days (FCL), 7 days (LCL), or 2 days (AIR)',
          '• Revised Ex-Factory — defaults to Factory Confirmed Ex-Factory when left blank',
        ],
      },
      {
        title: 'During Import',
        content: [
          'Auto-calculated columns are always skipped during Excel import, even if the spreadsheet has values in them. A yellow warning banner in the preview tells you which columns were ignored.',
        ],
      },
    ],
  },
  {
    id: 'import',
    title: 'Import & Export',
    description: 'Upload Excel files and download order data',
    icon: FileSpreadsheet,
    color: 'from-green-500 to-green-600',
    steps: [
      {
        title: 'Uploading a File',
        content: [
          'Go to the Import page. Drag and drop an .xlsx or .xlsm file, or click to browse.',
          'The system analyses the file and shows a preview: how many rows are new, updated, unchanged, or have conflicts.',
        ],
        tips: ['The file must have PO# and STYLE CODE columns at minimum.', 'Column headers must match the expected names (see Field Reference in Settings).'],
      },
      {
        title: 'Import Modes',
        content: [
          'Full Import — creates new orders AND updates existing ones with any changes from the spreadsheet.',
          'New Orders Only — only adds rows with PO + Style Code combinations that don\'t already exist. Existing rows are completely ignored.',
        ],
        tips: ['Use New Orders Only when adding new styles from a master sheet without touching existing data.'],
      },
      {
        title: 'Conflicts & Undo',
        content: [
          'If an Excel value conflicts with a pending supplier approval, the preview flags it. You choose which value to keep.',
          'After importing, you can undo the most recent import to revert all changes (delete new rows, restore updated values).',
        ],
      },
    ],
  },
  {
    id: 'excel-format',
    title: 'Excel Template Format',
    description: 'Expected columns and data formats for import',
    icon: FileSpreadsheet,
    color: 'from-emerald-500 to-emerald-600',
    steps: [
      {
        title: 'Required Columns',
        content: [
          'Every import file must have these two columns: PO# (purchase order number) and STYLE CODE.',
          'These are used together as the unique key to match rows — if both match an existing record, it\'s treated as an update. If the combination is new, a new order is created.',
        ],
      },
      {
        title: 'Column Headers',
        content: [
          'Column headers must appear in the first row of the spreadsheet. The system matches by name (not position) and is case-insensitive.',
          'The full list of recognised columns, grouped by section:',
          '• Core — PO#, SL SYSTEM PO#, ACTIVE, CUSTOMER, ORDER REFERENCE, CUSTOMER PO#, DIRECT REPEAT/ NEW?, SEASON, SUPPLIER, TERMS, SL SALES PERSON, STYLE CODE, CUSTOMER STYLE CODE, DESCRIPTION, COLOUR, GENDER',
          '• Sizes — 2XS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, S11, S12, S13, S14',
          '• Financial — FACTORY COST PRICE (TOTAL and TOTAL ORDER COST are auto-calculated)',
          '• Order Dates — ORDER RECEIVED DATE, ORDER SENT TO FACTORY DATE, TECH PACKS SENT TO FACTORY, SPECS SENT TO FACTORY, BARCODES SENT TO FACTORY, REQUESTED EX-FACTORY, FACTORY CONFIRMED EX-FACTORY',
          '• Samples — FIT SAMPLE REQUIRED Y/N, FIT SAMPLE STATUS, FIT SAMPLE RECEIVED, FIT SAMPLE APPROVED, STRIKE OFF STATUS/RECEIVED/APPROVED, LAB DIP STATUS/RECEIVED/APPROVED, PPS STATUS/RECEIVED/APPROVED, PPS Sent to Customer by SL, PHOTO SAMPLE RECEIVED, SHIPMENT SAMPLE RECEIVED',
          '• Delivery — REVISED EX-FACTORY, CUSTOMER REQUESTED DELIVERY DATE',
          '• Shipping — FCL/ LCL, VESSEL NAME, VESSEL ETD, VESSEL ETA TO PORT, REVISED VESSEL ETA TO PORT',
          'You don\'t need every column — include what you have and the system will match what it can.',
        ],
      },
      {
        title: 'Date Formats',
        content: [
          'Dates can be in any of these formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY. Excel date values (serial numbers) are also accepted.',
          'Empty cells, "None", "N/A", or "-" are treated as blank.',
        ],
      },
      {
        title: 'Skipped Columns',
        content: [
          'These columns are auto-calculated and always ignored on import, even if present: TOTAL, TOTAL ORDER COST, ETA TO UK, ETA TO CUSTOMER, CUSTOMER PO OPEN MONTH, EXPECTED CUSTOMER DELIVERY MONTH, ESTIMATED DEL TO CUSTOMER, EX FACTORY BASED FROM PP APPROVAL.',
        ],
      },
    ],
  },
  {
    id: 'tracking',
    title: 'Tracking',
    description: 'Bulk-update vessel ETAs by tracking reference',
    icon: Ship,
    color: 'from-indigo-500 to-indigo-600',
    steps: [
      {
        title: 'Finding Orders',
        content: [
          'Go to the Tracking page. Click the search field to see a dropdown of all existing tracking references with order counts.',
          'Pick one from the list, or start typing to filter. Partial matches are supported.',
        ],
      },
      {
        title: 'Selecting & Updating',
        content: [
          'Matching orders appear with checkboxes — all selected by default. Use Select All / Deselect All, or tick individual rows.',
          'Set a new Revised Vessel ETA date in the right panel and click Apply. A confirmation modal shows exactly which orders will update.',
          'Estimated Delivery dates recalculate automatically based on each order\'s FCL/LCL/AIR setting.',
        ],
      },
    ],
  },
  {
    id: 'factory',
    title: 'Factory Views',
    description: 'Supplier-specific pages and the approval workflow',
    icon: Package,
    color: 'from-teal-500 to-emerald-600',
    steps: [
      {
        title: 'Factory Product Page',
        content: [
          'The Factory Product page is focused on production and sampling. It shows:',
          '• PO#, Customer, Order Reference, Direct Repeat/New, Season',
          '• Style Code, Description, Colour, Gender',
          '• Full size breakdown and quantities',
          '• Trade price and order values',
          '• Order and factory dates (sent to factory, tech packs, specs, barcodes, ex-factory)',
          '• All sampling columns (fit sample, strike off, lab dip, PPS)',
          '• Delivery dates (revised ex-fac, customer delivery, ETA)',
        ],
      },
      {
        title: 'Factory Shipping Page',
        content: [
          'The Factory Shipping page focuses on logistics and delivery. It shows:',
          '• PO#, Customer, Order Reference, Terms',
          '• Style Code, Description, Colour, Gender, sizes and quantities',
          '• Trade price and order values',
          '• Ex-factory dates (original and confirmed)',
          '• PPS status and dates',
          '• All delivery dates and shipping info',
          '• FCL/LCL, Vessel Name, Vessel ETD, Vessel ETA, Revised ETA',
          '• Estimated delivery to customer',
        ],
      },
      {
        title: 'What Can Suppliers Edit?',
        content: [
          'Which fields suppliers can edit is configured by the admin in Settings > Supplier Columns.',
          'Editable fields are highlighted green in both the table and V2 modal views.',
          'There are two types of editable fields:',
          '• Date fields — require a reason and go through the approval workflow (pending → admin approves/rejects)',
          '• Text fields — save directly without approval (e.g. vessel name, FCL/LCL)',
        ],
        tips: [
          'Suppliers can only see and edit orders assigned to their factory.',
          'Orders must have all three dates filled before editing is unlocked: Sent to Factory, Tech Packs Sent, and Specs Sent.',
        ],
      },
      {
        title: 'Approval Workflow',
        content: [
          'When a supplier changes a date field:',
          '• They must provide a reason for the change',
          '• The change is saved as "pending" — it doesn\'t apply to the order yet',
          '• They can choose to apply the change to this style only, all styles on the PO, or selected styles',
          '• Admins/internal users see pending approvals on the Dashboard',
          '• Each approval can be individually approved or rejected (rejection requires a reason)',
          '• Bulk approve/reject is also available',
        ],
      },
      {
        title: 'V2 View',
        content: [
          'Each factory page has a "Try V2" button that opens the card-based view at its own URL (/factory-product-v2 or /factory-shipping-v2).',
          'The V2 view shows the same columns as the table view and respects the same edit permissions — editable fields are highlighted green.',
        ],
      },
    ],
  },
  {
    id: 'users',
    title: 'User Management',
    description: 'Accounts, roles, passwords, and permissions',
    icon: Users,
    color: 'from-purple-500 to-purple-600',
    steps: [
      {
        title: 'Managing Users',
        content: [
          'Go to Settings (in the user dropdown) and click the Users tab.',
          'Here you can add new users, edit existing ones (username, email, full name, role, factory), reset passwords, and deactivate or delete accounts.',
        ],
      },
      {
        title: 'Roles Explained',
        content: [
          'There are four user roles, each with different access levels:',
          '• Admin — full access to all features, including Settings, user management, and column configuration.',
          '• Internal — full access to all order data, import/export, analytics, and tracking. Cannot access Settings.',
          '• Designer — focused on the Design page and sampling workflow. Cost and value columns are hidden.',
          '• Supplier — restricted to Factory Product and Factory Shipping pages. Can only edit fields configured by the admin, and date changes require approval.',
        ],
      },
      {
        title: 'Supplier Column Settings',
        content: [
          'In Settings > Supplier Columns, admins can toggle which columns are visible and editable for all supplier users.',
          'Visibility controls what suppliers can see. Editability controls what they can change (within the visible columns).',
          'Use the search bar to find columns quickly. Changes apply to all supplier accounts.',
        ],
      },
    ],
  },
];

export default function GuidePage() {
  return (
    <AuthProvider>
      <GuideContent />
    </AuthProvider>
  );
}

function GuideContent() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return GUIDE_SECTIONS;
    return GUIDE_SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.steps.some(step =>
        step.title.toLowerCase().includes(q) ||
        step.content.some(c => c.toLowerCase().includes(q)) ||
        (step.tips || []).some(t => t.toLowerCase().includes(q))
      )
    );
  }, [search]);

  const selectedSection = activeSection ? GUIDE_SECTIONS.find(s => s.id === activeSection) : null;

  return (
    <AppShell title="Help Guide">
      <div>
        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-sm">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Help Guide</h1>
              <p className="text-sm text-gray-500">Everything you need to know about Critical Path</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-lg">
            <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search guides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
            />
          </div>
        </div>

        {/* Card Grid */}
        {filteredSections.length === 0 ? (
          <div className="py-16 text-center">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No guides match your search</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredSections.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-primary-300 hover:shadow-md transition-all group"
                >
                  <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 shadow-sm group-hover:scale-105 transition-transform', section.color)}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">{section.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">{section.description}</p>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{section.steps.length} topic{section.steps.length !== 1 ? 's' : ''}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Article Modal */}
      {selectedSection && (
        <ArticleModal
          section={selectedSection}
          onClose={() => setActiveSection(null)}
          onNavigate={(id) => setActiveSection(id)}
          currentIndex={GUIDE_SECTIONS.findIndex(s => s.id === activeSection)}
          totalSections={GUIDE_SECTIONS.length}
          allSections={GUIDE_SECTIONS}
        />
      )}
    </AppShell>
  );
}

function ArticleModal({ section, onClose, onNavigate, currentIndex, totalSections, allSections }: {
  section: GuideSection;
  onClose: () => void;
  onNavigate: (id: string) => void;
  currentIndex: number;
  totalSections: number;
  allSections: GuideSection[];
}) {
  const Icon = section.icon;
  const prev = currentIndex > 0 ? allSections[currentIndex - 1] : null;
  const next = currentIndex < totalSections - 1 ? allSections[currentIndex + 1] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[900px] max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn('px-6 py-5 flex items-center justify-between flex-shrink-0 bg-gradient-to-r text-white', section.color)}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{section.title}</h2>
              <p className="text-xs text-white/70 mt-0.5">{section.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">{currentIndex + 1} / {totalSections}</span>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-8">
            {section.steps.map((step, idx) => (
              <div key={idx}>
                <div className="flex items-start gap-4 mb-3">
                  <div className={cn('w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-sm font-bold text-white flex-shrink-0', section.color)}>
                    {idx + 1}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 pt-0.5">{step.title}</h3>
                </div>
                <div className="ml-12 space-y-2">
                  {step.content.map((paragraph, i) => {
                    if (paragraph.startsWith('• ')) {
                      return (
                        <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed ml-1">
                          <span className="text-primary-400 mt-0.5 flex-shrink-0">•</span>
                          <span>{paragraph.slice(2)}</span>
                        </div>
                      );
                    }
                    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{paragraph}</p>;
                  })}
                  {step.tips && step.tips.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {step.tips.map((tip, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm bg-amber-50 border border-amber-100 px-4 py-2.5 rounded-lg">
                          <CheckCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <span className="text-amber-900">{tip}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {idx < section.steps.length - 1 && (
                  <div className="border-b border-gray-100 mt-8 ml-12" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer nav */}
        <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between flex-shrink-0 bg-gray-50/60">
          {prev ? (
            <button onClick={() => onNavigate(prev.id)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-700 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="font-medium">{prev.title}</span>
            </button>
          ) : <div />}
          {next ? (
            <button onClick={() => onNavigate(next.id)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-700 transition-colors">
              <span className="font-medium">{next.title}</span>
              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            </button>
          ) : <div />}
        </div>
      </div>
    </div>
  );
}
