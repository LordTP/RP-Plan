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

type ContentBlock =
  | string // plain paragraph, or "• " prefix for a bullet
  | { type: 'fields'; items: Array<{ name: string; desc: string; badge?: string }> }
  | { type: 'pills'; label?: string; items: string[] }
  | { type: 'pillGroups'; groups: Array<{ label: string; items: string[] }> }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'callout'; tone?: 'info' | 'warn' | 'success'; text: string };

interface GuideStep {
  title: string;
  content: ContentBlock[];
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
          'The top navigation bar has links to all pages. Which ones you see depends on your role.',
          {
            type: 'fields',
            items: [
              { name: 'Dashboard', desc: 'Your home screen. Always visible. KPIs, warnings, recent activity.' },
              { name: 'Orders', desc: 'Full spreadsheet-style table view with every column.' },
              { name: 'Design', desc: 'V2 card-based view plus the Components page.' },
              { name: 'Factory', desc: 'Product and Shipping views for suppliers. Dropdown in nav.' },
              { name: 'Tracking', desc: 'Bulk vessel ETA updates by tracking reference.' },
              { name: 'Analytics', desc: 'Factory performance, design sampling stats, charts.' },
              { name: 'Import', desc: 'Upload Excel files to create or update orders.' },
            ],
          },
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
          'In the style detail modal, find the Components section (above Samples). Click the "+" button or the dashed "Add Component" area. Enter a name and choose where to add it.',
          {
            type: 'fields',
            items: [
              { name: 'This style only', desc: 'Just the current row.' },
              { name: 'All styles on PO', desc: 'Every style on this purchase order gets the component.' },
              { name: 'Selected styles', desc: 'Open a picker to tick which specific styles to add it to.' },
            ],
          },
          { type: 'callout', tone: 'info', text: 'Typing an existing name auto-suggests it and warns you if a near-match exists (e.g. "Main fabric" when "Main Fabric" already exists) so you don\'t accidentally create duplicates.' },
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
    id: 'design-components',
    title: 'Design → Components',
    description: 'Catalogue of every component with bulk edit, merge, and search',
    icon: Layers,
    color: 'from-fuchsia-500 to-fuchsia-600',
    steps: [
      {
        title: 'What this page is for',
        content: [
          'The Components page is the catalogue of every component across every order. Left sidebar lists unique component names with counts; the right pane shows the detail for whichever one you\'ve selected. Use it to clean up duplicates, set statuses in bulk, and spot which components are causing trouble.',
        ],
      },
      {
        title: 'Sidebar — sort and filter',
        content: [
          'The sidebar lists every distinct component name with its usage count.',
          {
            type: 'fields',
            items: [
              { name: 'Used', desc: 'Sort by how many orders use the component (most common at the top).' },
              { name: 'Pending', desc: 'Filter to components that have at least one unresolved sample somewhere. Quickly surfaces what needs attention.' },
              { name: 'A–Z', desc: 'Alphabetical sort.' },
              { name: 'Hide shipped', desc: 'Toggle to drop components whose orders are all shipped — stops old orders cluttering the view.' },
            ],
          },
          { type: 'callout', tone: 'info', text: 'Search matches component name, PO number, and china_orderbook_ref (the Chinese orderbook reference) simultaneously.' },
        ],
      },
      {
        title: 'Data quality — duplicate detection & merge',
        content: [
          'A yellow callout appears above the table when the system detects near-duplicate component names (e.g. "Main Fabric", "main fabric", "Main  Fabric" — extra space). Click any cluster to open the merge picker.',
          'Pick one name as the canonical version, tick which variants to roll in, and hit merge. Every component with one of the other names gets renamed in one shot.',
          { type: 'callout', tone: 'warn', text: 'Merges are destructive — the other names no longer exist after. Confirm the cluster is genuinely the same thing before merging.' },
        ],
      },
      {
        title: 'Bulk actions',
        content: [
          'Tick the checkbox on multiple rows to open the bulk action bar at the bottom. Bulk set status, bulk rename, bulk delete — all with a confirmation modal that shows exactly which rows will change before you commit.',
        ],
        tips: ['The confirmation modal is the foolproof guard — you must tick "I understand this will change N rows" before the button enables.'],
      },
      {
        title: 'PO and Chinese orderbook references',
        content: [
          'Each component row shows its PO number alongside the china_orderbook_ref (the Chinese supplier-side reference). Format is "PO-NNNN — CO-NNNN". Both are searchable — paste either reference into the search bar and it\'ll find the component.',
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
          'Four sample types are tracked through the production process. Each has its own status, received date, and approved date.',
          {
            type: 'fields',
            items: [
              { name: 'Fit Sample', desc: 'Checks the garment fits correctly. Has a Required flag (Y/N) as well as the usual status + dates.' },
              { name: 'Strike Off', desc: 'Verifies prints, embroidery, or decorations applied to the fabric.' },
              { name: 'Lab Dip', desc: 'Confirms the fabric colour matches the specification.' },
              { name: 'PPS', badge: 'order-level', desc: 'Pre-Production Sample — the final check before full production begins. Also tracks "Sent to Customer" date.' },
            ],
          },
        ],
      },
      {
        title: 'Status Options',
        content: [
          'Every sample area uses the same status dropdown.',
          {
            type: 'fields',
            items: [
              { name: 'NOT REQUIRED', desc: 'Skips this sample entirely. Suppresses warnings, hides it from stuck lists, marks the component as done without waiting on it.' },
              { name: 'OUTSTANDING', desc: 'Sample has been requested but not yet received.' },
              { name: 'P23 ADVISE UPDATE', desc: 'Waiting on an update from the factory — intermediate state.' },
              { name: 'LATE', desc: 'Sample is overdue. Flagged in the Warnings Centre.' },
              { name: 'RECEIVED', desc: 'Sample has arrived and is ready for designer review.' },
              { name: 'APPROVED', desc: 'Sample has been reviewed and signed off. Closes the current attempt.' },
              { name: 'REJECTED', desc: 'Designer has rejected this attempt. A new attempt is requested (v2, v3, …) starting back at OUTSTANDING.' },
            ],
          },
        ],
      },
      {
        title: 'Components vs Order-Level',
        content: [
          'Sampling data lives in two places depending on whether the style has components:',
          {
            type: 'fields',
            items: [
              { name: 'Without components', desc: 'Fit Sample, Strike Off, Lab Dip, and PPS all appear in the Samples section of the detail modal. One clock per sample type per order.' },
              { name: 'With components', desc: 'Fit Sample, Strike Off, and Lab Dip move inside each component, tracked independently per material. PPS, Photo Sample, and Shipment Sample always remain order-level.' },
            ],
          },
          { type: 'callout', tone: 'info', text: 'When components exist, warnings check each component\'s sample areas individually — a late Lab Dip on "Main Fabric" won\'t stop "Zip" from being fully approved.' },
        ],
      },
    ],
  },
  {
    id: 'comments',
    title: 'Comments & History',
    description: 'Team communication, @mentions, and change tracking',
    icon: MessageSquare,
    color: 'from-pink-500 to-pink-600',
    steps: [
      {
        title: 'Writing Comments',
        content: [
          'In the V2 detail modal, click "Comments" in the header to switch the right column to comments. Type a message and press Enter or click Send.',
          'Comments are tagged "Sourcelab" or "Supplier" automatically based on your role. Tick "Add to all styles on this PO" to post the same comment to every row on the PO.',
        ],
        tips: ['Shift+Enter adds a new line without sending.', 'Unread comments show a blue ring. The count badge on PO cards shows your personal unread count.'],
      },
      {
        title: '@Mentioning teammates',
        content: [
          'Type @ in a comment to open the autocomplete dropdown. It lists every mentionable user — keep typing to filter. Pick one and the mention gets inserted as a clickable chip.',
          'The mentioned user is notified two ways: the comment highlights in-app with a blue ring, and they get an email with the comment text and a direct link to the order.',
          { type: 'callout', tone: 'info', text: 'Bulk mentions: if you tick "Add to all styles on this PO" and @mention someone, they receive a single grouped email rather than one email per style.' },
        ],
        tips: ['Admins can toggle a user\'s "mentionable" flag in Settings to hide them from the @mention autocomplete.'],
      },
      {
        title: 'Change History',
        content: [
          'Internal users can switch to the History tab to see every field change — who made it, when, what changed (old → new value), and the source.',
          {
            type: 'table',
            headers: ['Source', 'Meaning'],
            rows: [
              ['Sourcelab', 'Edit made by an internal / admin / designer user'],
              ['Supplier', 'Direct edit by a supplier (text fields that don\'t need approval)'],
              ['Excel Import', 'Change applied by an Excel import — the import file is noted'],
              ['Approved', 'Supplier date change that was approved by an admin'],
              ['Rejected', 'Supplier date change that was rejected by an admin'],
            ],
          },
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
          'All thresholds use business days (Monday–Friday only).',
          {
            type: 'table',
            headers: ['Warning', 'Threshold', 'Measured from'],
            rows: [
              ['Tech Packs Need Sending', '3 business days', 'Order sent to factory'],
              ['Specs Need Sending', '3 business days', 'Order sent to factory'],
              ['Fit Sample Overdue', '15 business days', 'Tech packs sent'],
              ['Lab Dip Overdue', '15 business days', 'Tech packs sent'],
              ['Lab Dip Needs Approval', '5 business days', 'Lab dip received'],
              ['Strike Off Overdue', '20 business days *', 'Tech packs sent'],
              ['Strike Off Needs Approval', '5 business days', 'Strike off received'],
              ['PPS Needs Approval', '7 business days', 'PPS sent to customer'],
            ],
          },
          { type: 'callout', tone: 'info', text: '* Strike Off threshold is 25 business days for badges, woven labels, and tapes (they take longer).' },
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
          'These fields are calculated automatically whenever their source values change. They cannot be edited manually and are always skipped on Excel import.',
          {
            type: 'table',
            headers: ['Field', 'Formula'],
            rows: [
              ['Total Qty', 'Sum of all size columns'],
              ['Total Order Cost', 'Trade Price × Total Qty'],
              ['ETA UK', 'Revised Ex-Factory + 60 days'],
              ['ETA Customer', 'ETA UK + 5 days'],
              ['PO Open Month', 'Month name from Customer Requested Delivery (e.g. "February")'],
              ['Expected Customer Delivery Month', 'Month name from ETA Customer'],
              ['Ex-Factory from PP Approval', 'PPS Approved + 35 days'],
              ['Estimated Del to Customer', 'Vessel ETA + 5 days (FCL), 7 (LCL), or 2 (AIR)'],
              ['Revised Ex-Factory', 'Defaults to Factory Confirmed Ex-Factory when left blank'],
            ],
          },
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
          'Column headers must appear in the first row of the spreadsheet. The system matches by name (not position) and is case-insensitive. You don\'t need every column — include what you have and the system will match what it can.',
          {
            type: 'pillGroups',
            groups: [
              { label: 'Core', items: ['PO#', 'SL SYSTEM PO#', 'ACTIVE', 'CUSTOMER', 'ORDER REFERENCE', 'CUSTOMER PO#', 'DIRECT REPEAT/ NEW?', 'SEASON', 'SUPPLIER', 'TERMS', 'SL SALES PERSON', 'STYLE CODE', 'CUSTOMER STYLE CODE', 'DESCRIPTION', 'COLOUR', 'GENDER'] },
              { label: 'Sizes', items: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'S11', 'S12', 'S13', 'S14'] },
              { label: 'Financial', items: ['FACTORY COST PRICE'] },
              { label: 'Order Dates', items: ['ORDER RECEIVED DATE', 'ORDER SENT TO FACTORY DATE', 'TECH PACKS SENT TO FACTORY', 'SPECS SENT TO FACTORY', 'BARCODES SENT TO FACTORY', 'REQUESTED EX-FACTORY', 'FACTORY CONFIRMED EX-FACTORY'] },
              { label: 'Sampling', items: ['FIT SAMPLE REQUIRED Y/N', 'FIT SAMPLE STATUS', 'FIT SAMPLE RECEIVED', 'FIT SAMPLE APPROVED', 'STRIKE OFF STATUS', 'STRIKE OFF RECEIVED', 'STRIKE OFF APPROVED', 'LAB DIP STATUS', 'LAB DIP RECEIVED', 'LAB DIP APPROVED', 'PPS STATUS', 'PPS RECEIVED', 'PPS APPROVED', 'PPS Sent to Customer by SL', 'PHOTO SAMPLE RECEIVED', 'SHIPMENT SAMPLE RECEIVED'] },
              { label: 'Delivery', items: ['REVISED EX-FACTORY', 'CUSTOMER REQUESTED DELIVERY DATE'] },
              { label: 'Shipping', items: ['FCL/ LCL', 'VESSEL NAME', 'VESSEL ETD', 'VESSEL ETA TO PORT', 'REVISED VESSEL ETA TO PORT'] },
            ],
          },
          { type: 'callout', tone: 'info', text: 'TOTAL and TOTAL ORDER COST are auto-calculated — don\'t include them, they\'ll be ignored on import.' },
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
          'The Factory Product page is focused on production and sampling.',
          {
            type: 'pillGroups',
            groups: [
              { label: 'Identification', items: ['PO#', 'Customer', 'Order Reference', 'Direct Repeat/New', 'Season'] },
              { label: 'Style', items: ['Style Code', 'Description', 'Colour', 'Gender', 'Sizes', 'Qty'] },
              { label: 'Commercial', items: ['Trade Price', 'Total Order Value'] },
              { label: 'Order Dates', items: ['Sent to Factory', 'Tech Packs Sent', 'Specs Sent', 'Barcodes Sent', 'Ex-Factory'] },
              { label: 'Sampling', items: ['Fit Sample', 'Strike Off', 'Lab Dip', 'PPS'] },
              { label: 'Delivery', items: ['Revised Ex-Factory', 'Customer Delivery', 'ETA'] },
            ],
          },
        ],
      },
      {
        title: 'Factory Shipping Page',
        content: [
          'The Factory Shipping page focuses on logistics and delivery.',
          {
            type: 'pillGroups',
            groups: [
              { label: 'Identification', items: ['PO#', 'Customer', 'Order Reference', 'Terms'] },
              { label: 'Style', items: ['Style Code', 'Description', 'Colour', 'Gender', 'Sizes', 'Qty'] },
              { label: 'Commercial', items: ['Trade Price', 'Total Order Value'] },
              { label: 'Ex-Factory', items: ['Requested Ex-Factory', 'Factory Confirmed Ex-Factory', 'Revised Ex-Factory'] },
              { label: 'PPS', items: ['PPS Status', 'PPS Received', 'PPS Approved'] },
              { label: 'Shipping', items: ['FCL/LCL', 'Vessel Name', 'Vessel ETD', 'Vessel ETA', 'Revised Vessel ETA'] },
              { label: 'Delivery', items: ['Estimated Delivery to Customer'] },
            ],
          },
        ],
      },
      {
        title: 'What Can Suppliers Edit?',
        content: [
          'Which fields suppliers can edit is configured by the admin in Settings > Supplier Columns. Editable fields are highlighted green in both the table and V2 modal views.',
          {
            type: 'fields',
            items: [
              { name: 'Date fields', desc: 'Require a reason and go through the approval workflow (pending → admin approves or rejects). Not applied to the order until approved.' },
              { name: 'Text fields', desc: 'Save directly without approval — e.g. vessel name, FCL/LCL, vessel ETD.' },
            ],
          },
        ],
        tips: [
          'Suppliers can only see and edit orders assigned to their factory.',
          'Orders must have all three dates filled before editing is unlocked: Sent to Factory, Tech Packs Sent, and Specs Sent.',
        ],
      },
      {
        title: 'Approval Workflow',
        content: [
          'When a supplier changes a date field, the change goes through admin approval before applying to the order.',
          {
            type: 'fields',
            items: [
              { name: '1. Reason', desc: 'Supplier must provide a reason for the change (free text).' },
              { name: '2. Scope', desc: 'Choose to apply to this style only, all styles on the PO, or pick specific styles.' },
              { name: '3. Pending', desc: 'Change is saved as "pending" and doesn\'t apply yet. Admin sees it on their Dashboard.' },
              { name: '4. Decision', desc: 'Admin approves or rejects (rejection also needs a reason). Individual or bulk actions both available.' },
            ],
          },
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
    id: 'notifications',
    title: 'Notifications & Emails',
    description: 'Kill switch, per-automation toggles, and the Resend API key',
    icon: MessageSquare,
    color: 'from-rose-500 to-rose-600',
    steps: [
      {
        title: 'How emails work',
        content: [
          'Emails are sent via Resend. Every outbound email is gated on two switches: the master kill switch AND the individual automation\'s toggle. Both must be on for an email to go out.',
          { type: 'callout', tone: 'warn', text: 'The master kill switch defaults to OFF. Even if a specific automation is enabled, no emails will send until the master is turned on too.' },
        ],
      },
      {
        title: 'Settings → Notifications',
        content: [
          'Admins configure email delivery in Settings > Notifications.',
          {
            type: 'fields',
            items: [
              { name: 'Resend API key', desc: 'Paste the Resend secret key here. Stored encrypted and never returned in plaintext — you\'ll see a masked value after saving.' },
              { name: 'Master kill switch', desc: 'One toggle that gates every outbound email. Use it to silence the app during migrations, tests, or incidents.' },
              { name: 'Per-automation toggles', desc: 'One toggle per automation type. Turn specific ones on/off without touching the master.' },
            ],
          },
        ],
      },
      {
        title: 'Available automations',
        content: [
          'Each automation is individually toggleable. As new ones are built they get added here.',
          {
            type: 'table',
            headers: ['Automation', 'Triggers on', 'Sent to'],
            rows: [
              ['Comment @mentions', 'Someone @mentions a user in a comment', 'The mentioned user'],
            ],
          },
          { type: 'callout', tone: 'info', text: 'Users can opt out of being @mentioned entirely via the "mentionable" flag on their account (admin-controlled in User Management).' },
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
          'There are four user roles, each with a different access scope.',
          {
            type: 'table',
            headers: ['Role', 'Can access', 'Cannot access'],
            rows: [
              ['Admin', 'Everything, including Settings, user management, column configuration, email automation toggles', 'Nothing'],
              ['Internal', 'All orders, V2 design view, table view, import/export, analytics, tracking, approvals, comments', 'Settings'],
              ['Designer', 'Design V2, Components page, Orders table view (with cost hidden), comments, @mentions', 'Cost/value columns, Settings, Import'],
              ['Supplier', 'Factory Product + Factory Shipping (their factory only), comments on their orders', 'All other pages, pricing, other factories\' data. Date changes need approval.'],
            ],
          },
          { type: 'callout', tone: 'info', text: 'Supplier date edits are gated: the order must have all three of Sent to Factory, Tech Packs Sent, and Specs Sent filled in before any fields unlock.' },
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
        step.content.some(c => blockMatchesQuery(c, q)) ||
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
                <div className="ml-12 space-y-3">
                  {step.content.map((block, i) => <ContentBlockView key={i} block={block} />)}
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

function blockMatchesQuery(block: ContentBlock, q: string): boolean {
  if (typeof block === 'string') return block.toLowerCase().includes(q);
  if (block.type === 'fields') return block.items.some(i => i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q));
  if (block.type === 'pills') return block.items.some(i => i.toLowerCase().includes(q)) || !!block.label?.toLowerCase().includes(q);
  if (block.type === 'pillGroups') return block.groups.some(g => g.label.toLowerCase().includes(q) || g.items.some(i => i.toLowerCase().includes(q)));
  if (block.type === 'table') return block.headers.some(h => h.toLowerCase().includes(q)) || block.rows.some(r => r.some(c => c.toLowerCase().includes(q)));
  if (block.type === 'callout') return block.text.toLowerCase().includes(q);
  return false;
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  if (typeof block === 'string') {
    if (block.startsWith('• ')) {
      return (
        <div className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed ml-1">
          <span className="text-primary-400 mt-0.5 flex-shrink-0">•</span>
          <span>{block.slice(2)}</span>
        </div>
      );
    }
    return <p className="text-sm text-gray-700 leading-relaxed">{block}</p>;
  }

  if (block.type === 'fields') {
    return (
      <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-100">
        {block.items.map((item, i) => (
          <div key={i} className="grid grid-cols-[200px_1fr] gap-4 px-4 py-2.5 text-sm hover:bg-gray-50/50">
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-900">{item.name}</span>
              {item.badge && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 mt-0.5">{item.badge}</span>
              )}
            </div>
            <div className="text-gray-600 leading-relaxed">{item.desc}</div>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'pills') {
    return (
      <div>
        {block.label && <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{block.label}</div>}
        <div className="flex flex-wrap gap-1.5">
          {block.items.map((item, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700 border border-gray-200 font-mono">{item}</span>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'pillGroups') {
    return (
      <div className="space-y-3">
        {block.groups.map((group, gi) => (
          <div key={gi}>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{group.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700 border border-gray-200 font-mono">{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'table') {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {block.headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {block.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-gray-700 align-top">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'callout') {
    const toneClasses = {
      info: 'bg-blue-50 border-blue-200 text-blue-900',
      warn: 'bg-amber-50 border-amber-200 text-amber-900',
      success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    }[block.tone ?? 'info'];
    return (
      <div className={cn('border-l-4 border-l-current border-y border-r rounded-r-md px-4 py-2.5 text-sm leading-relaxed', toneClasses)}>
        {block.text}
      </div>
    );
  }

  return null;
}
