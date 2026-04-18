# Critical Path — Source Lab Order Management

A full-stack order management system for TruePath Group / Source Lab. Manages purchase orders across internal teams, designers, and factory suppliers with per-component sampling tracking, approval workflows, and automated warnings.

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand, Recharts
- **Backend:** FastAPI (Python 3.11), SQLAlchemy, Pydantic
- **Database:** PostgreSQL 15 (production), SQLite (local dev)
- **Real-Time:** WebSockets
- **Deployment:** Docker Compose, Nginx reverse proxy, Let's Encrypt SSL
- **Hosting:** DigitalOcean (1GB droplet)

## Features

### Order Management
- Full spreadsheet-style table view with inline editing
- V2 card-based view with detail modal (2-column layout)
- Excel import with preview, conflict resolution, undo, and "New Orders Only" mode
- Excel export with filters
- Per-user comment system with read receipts
- Change history tracking for all fields
- Bulk update capabilities (dates, statuses, FCL/LCL)

### Components & Sampling
- Per-component sampling tracking (Fit Sample, Strike Off, Lab Dip)
- Components can be added to individual styles, all styles on PO, or selected styles
- Status dropdowns: NOT REQUIRED, OUTSTANDING, P23 ADVISE UPDATE, LATE, RECEIVED, APPROVED
- Bulk apply component field values across styles
- PPS tracking at order level

### Auto-Calculations
- Total Qty (sum of sizes), Total Order Cost (price × qty)
- ETA UK (revised ex-factory + 60 days), ETA Customer (ETA UK + 5 days)
- Estimated Del to Customer (vessel ETA + 5d FCL / 7d LCL / 2d AIR)
- Ex-Factory from PP Approval (PPS approved + 35 days)
- PO Open Month, Expected Delivery Month
- Revised Ex-Factory defaults to Factory Confirmed when blank

### Warnings Centre
Dashboard warnings with business-day calculations:
- Tech Packs / Specs need sending (3+ days)
- Fit Sample / Lab Dip overdue (15+ days from tech packs)
- Lab Dip / Strike Off needs approval (5+ days)
- Strike Off overdue (20+ days, 25 for badges/woven)
- PPS needs approval (7+ days from sent to customer)
- Searchable, click-through to Design view

### Design Overview
- PO Completion Tracker with progress bars
- Season Overview with completion percentages
- Customer Workload with expandable PO drilldown
- Factory Sample Performance (avg business days to approve)
- At Risk Samples and Awaiting Action (searchable)
- Component Coverage analysis

### Factory / Supplier Views
- Factory Product and Factory Shipping pages with filtered columns
- Green-highlighted editable cells
- Supplier date changes require approval with reason
- Editable fields configurable per-role via Settings
- Orders must have Sent to Factory + Tech Packs + Specs dates before suppliers can edit

### Tracking Page
- Search by tracking reference (P number) with autocomplete
- Bulk update Revised Vessel ETA with select all/individual checkboxes
- Confirmation modal, auto-recalculates estimated delivery

### Roles & Auth
- **Admin:** full access + settings + user management
- **Internal:** full access except settings
- **Designer:** design-focused, no cost/value columns
- **Supplier:** factory pages only, configurable editable fields, approval workflow

### Other
- Top navbar with Factory and Design dropdowns
- Source Lab Apps switcher in user menu
- Help Guide with searchable card-based articles
- Field Reference documentation in Settings
- Size Guide modal with gender-based labels
- Per-user comment read/unread tracking with read receipts
- Full name display with username fallback

## Project Structure

```
frontend/src/
  app/
    dashboard/          # Dashboard with warnings centre, metrics, activity feed
    orders/             # Table view
    orders-v2/          # V2 card view with detail modal
    design/             # Design page (wraps orders-v2)
    design-overview/    # Design analytics & sampling overview
    factory-product/    # Factory product table view
    factory-shipping/   # Factory shipping table view
    factory-product-v2/ # Factory product V2
    factory-shipping-v2/# Factory shipping V2
    tracking/           # Bulk vessel ETA updates
    analytics/          # Charts & performance metrics
    import/             # Excel import with preview & undo
    settings/           # User management, supplier columns, field reference
    guide/              # Help guide with searchable articles
  components/
    layout/             # AppShell, Navbar, AuthProvider
    orders/             # OrderTable, EditableCell, CommentSidebar, 
                        # FactoryV2View, InlineComments, StatusDropdown,
                        # ComponentsSection
  lib/                  # API client, WebSocket client, utils
  store/                # Zustand global state
  types/                # TypeScript interfaces, column definitions

backend/
  main.py               # FastAPI app, all endpoints
  models.py             # SQLAlchemy models
  schemas.py            # Pydantic schemas
  excel_utils.py        # Import/export logic
  auth.py               # JWT auth
  database.py           # DB connection
```

## Deployment

```bash
cd /root/app && git pull && docker compose up -d --build frontend backend && docker restart app_nginx_1
```

Database migrations run automatically on backend startup via `Base.metadata.create_all()` and inline ALTER TABLE checks.

## Local Development

```bash
# Backend (port 8004)
cd backend && source venv/bin/activate
CORS_ORIGINS="http://localhost:3000,http://localhost:3001" uvicorn main:app --port 8004

# Frontend (port 3001)
cd frontend && PORT=3001 npm run dev
```

Login: username-based (not email). Seeded accounts in `init_db.py`.
