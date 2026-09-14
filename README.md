# Critical Path

Order management for **TruePath Group / Source Lab** — a garment sourcing agency that
sits between UK customers and factories in China, Bangladesh and Turkey.

A purchase order is not "placed and shipped". It moves through a long chain of
approvals — tech packs, specs, lab dips, strike offs, fit samples, a pre-production
sample — and most of that chain is a factory waiting on Source Lab, or Source Lab
waiting on a factory. Tracking it in a shared spreadsheet meant nobody could answer
*"what is late, and whose fault is it?"* without reading every row.

Critical Path is that spreadsheet turned into an application: the same wide table
people already knew, plus a warnings engine that watches every gate on every style
and says exactly who is holding it up.

FastAPI + PostgreSQL behind Next.js 14, deployed as four containers on a single
DigitalOcean droplet.

---

## Contents

- [The domain model](#the-domain-model)
- [The critical path](#the-critical-path)
- [Business days and factory closures](#business-days-and-factory-closures)
- [Surfaces](#surfaces)
- [Roles](#roles)
- [Safety rails](#safety-rails)
- [Performance](#performance)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Tests](#tests)
- [Operational scripts](#operational-scripts)
- [Deployment](#deployment)
- [Known gaps](#known-gaps)

---

## The domain model

### Orders and styles

The unit of work is a **style**, not an order. One `purchase_orders` row is one
style on one PO — PO 5252 with four styles on it is four rows sharing a `po_number`.
Everything downstream (the table, the warnings, the bulk bar, the delete confirm)
has to hold both ideas at once, which is why the UI consistently says *"1 order,
4 styles"* rather than *"4 orders"*.

Identity is `po_number` + `style_code`. Those two columns are how an Excel import
matches an incoming row to an existing one, which makes them the most dangerous
fields in the schema — see [Safety rails](#safety-rails).

### Components

A component is a decorated part of a garment: a chest print, a woven label, a dyed
trim. Each one needs its own physical sample approved before production starts, and
the same component usually appears across several styles in the same order.

Two tables model that:

| Table | Meaning |
|---|---|
| `components` | The **canonical library** entry — one row per real-world component ("CHEST PRINT — HOME KIT BLUE"). Holds identity: name, colour, placement, spec sheet, supplier notes. |
| `order_components` | An **instance** of that canonical, attached to one style. Holds the sample lifecycle: status, received date, approved date. |

Identity is read from the canonical; progress is tracked per style. Renaming a
component in the library renames it everywhere it appears, while one style's strike
off can be rejected without touching the other seven.

A canonical is minted per *add event*: adding "CHEST PRINT" to four styles in one go
creates one canonical and four instances, all linked. Adding it again next season
creates a fresh canonical rather than reviving the old one, so the two seasons'
histories stay separate.

Each component tracks exactly one sample type — `strike_off`, `lab_dip` or `label` —
chosen at creation. Never two.

### Samples

Six gates, in the order work actually happens:

```
Tech packs → Specs → Lab dip → Strike off → Fit → PPS
             ╰─ order level ─╯   ╰── component level ──╯   ╰─ order level ─╯
```

Lab dips and strike offs belong to components, so a style has as many of them as it
has components. Fit samples and the pre-production sample are order-level — one per
style.

Status values are stored **UPPERCASE**: `NOT REQUIRED`, `OUTSTANDING`, `APPROVED`,
`REJECTED`. `NOT REQUIRED` is a completed state, not a missing one — use
`is_sample_done()` and `sample_needs_work()` in `sample_helpers.py` rather than
comparing strings, because that distinction is where sample logic usually goes wrong.

Rejections create a resubmission: the sample goes back to the factory with a reason,
and `/resubmissions` lists everything currently bouncing.

---

## The critical path

### The warnings centre

`dashboard_warnings.py` walks every active style and produces a list of things that
are late, grouped by who is holding them up:

- **Getting started** — an order went to the factory but tech packs or specs never followed
- **Waiting on the factory** — a sample was asked for and hasn't arrived
- **Waiting on Source Lab** — a sample arrived and nobody has approved it
- **Pre-production** — PPS is missing, or is sitting with the customer unsigned

Every threshold is **editable in Settings → Warning thresholds** by an admin. They
used to be literals scattered through the warnings code (`days_since >= 3`), which
meant changing how long the business waits before chasing required a deploy. They're
operational policy, not logic, and the people who set that policy aren't the people
who deploy. The registry lives in `app_settings.py`; defaults match the old
hardcoded values, so an untouched install behaves exactly as it did.

| Threshold | Default | Unit |
|---|---|---|
| Tech packs chase | 3 | business days |
| Specs chase | 3 | business days |
| Fit sample overdue | 15 | business days |
| Lab dip overdue | 15 | business days |
| Strike off overdue | 20 | business days |
| Strike off overdue — slow items (badges, woven labels, woven tape) | 25 | business days |
| Lab dip awaiting approval | 5 | business days |
| Strike off awaiting approval | 5 | business days |
| PPS overdue | 40 | calendar days |
| PPS awaiting customer approval | 7 | business days |

### The board

The dashboard's top panel is a grid: one row per live style, one column per gate.
It answers *"where is everything stuck"* in a shape you read as a pattern rather than
a list — a vertical run of amber down one column says the whole book is jammed on
that gate.

A gate goes **amber** at its threshold and **red** at 1.5× it: anything half again
past the number someone chose isn't running late, it's been forgotten about. Where a
gate has several carriers (five strike offs on one style), the worst carrier wins.

The board is its own endpoint (`routers/dashboard_board.py`) rather than a reshaping
of the orders list — it needs six derived states per style, not 77 raw columns. It
shares `active_order_clauses()` and the threshold registry with the warnings centre
so the two can never disagree about what is late, and
`smoke_dashboard_board.py` asserts exactly that.

---

## Business days and factory closures

Every threshold in the app is counted in **business days**, via
`business_days_between()` in `sample_helpers.py`. Weekends don't count against a
factory.

Neither does **Chinese New Year**. Factories close for two to four weeks and nothing
moves; counting that as lateness produced a wall of false warnings every February and
trained people to ignore the warnings centre entirely.

Admins maintain a closure calendar in **Settings → Factory closures** — named
windows with a start and end date. `closed_dates()` resolves it to a frozen set of
dates, cached with a 60-second TTL and invalidated on write, and every business-day
count skips them. The one calendar-day threshold (PPS overdue, which spans real
production time) subtracts closure days instead, via `closure_days_between()`.

> The counting semantics are worth stating precisely, because they were wrong once:
> `business_days_between(start, end)` counts weekdays **strictly after** `start`, up
> to and **including** `end`. An order sent Friday and chased Monday is 1 business
> day, not 2. The earlier off-by-one inflated every warning by a day for each
> weekend it spanned.

---

## Surfaces

### Source Lab (admin / internal / designer)

| Route | What it is |
|---|---|
| `/dashboard` | Critical-path board, warnings centre, pending date-change decisions, activity feed |
| `/orders` | The main table — 77 columns, inline editing, column filters, bulk actions |
| `/orders-v2` | The same data as PO cards that expand to their styles, with a full-detail slide-out per style |
| `/components` | Component **Worklist** (grouped by add event, what needs chasing) and **Library** (the canonical catalogue) |
| `/resubmissions` | Every rejected sample currently going back round |
| `/design` | Designer-facing order view (wraps `orders-v2`, no cost columns) |
| `/tracking` | Search by vessel tracking reference, bulk-update revised ETAs |
| `/import` | Excel import with preview, diff and undo |
| `/settings` | Users, supplier columns, warning thresholds, factory closures, email automations, size guide, field reference, backup |
| `/guide` | Searchable internal help articles |
| `/qa` | Shared QA test plan — tickboxes all users see the same state of |

### Factories (supplier)

| Route | What it is |
|---|---|
| `/factory-product` | Their styles only — dates, samples, components |
| `/factory-shipping` | Shipping dates and vessel details |
| `/components` | Same catalogue, scoped to their factory, bulk actions hidden |
| `/factory-guide` | Illustrated guide written for factory users |

Suppliers default to the V2 detail panel (`FactoryV2View`), not the flat table.

**Hidden but still routed:** `/analytics` and `/design-overview` were removed from
the nav in September 2026 — analytics was mostly order-value reporting and costing is
out of the app, so it would have read as zeros. Both routes and their endpoints still
resolve, so bookmarks keep working; restoring the nav entry is a one-line change in
`Navbar.tsx`.

---

## Roles

| Role | Access | Restrictions |
|---|---|---|
| `admin` | Everything, including Settings | — |
| `internal` | Full order access | No Settings |
| `sourcelab_designer` | Design pages and components | No cost or value columns |
| `supplier` | Factory pages only | Scoped to their own `factory_name`; three-date edit gate; date changes need approval |

**Supplier scoping is the security boundary of the app.** A factory must never see
another factory's orders, and must never see pricing. It's centralised in
`supplier_access.py` — `apply_supplier_filter()` for queries,
`assert_supplier_can_access()` for writes — and it **fails closed**: a supplier
account with no `factory_name` set gets an empty result, never an unrestricted one.

Components are the awkward case, because factories add their own, so every component
endpoint has to scope inside its own body rather than relying on a shared dependency.
`smoke_supplier_scope.py` builds a fixture where one canonical spans two factories and
then attacks every one of those endpoints as factory A aimed at factory B's data.

Suppliers can only edit a style once **Sent to Factory**, **Tech Packs** and **Specs**
dates are all set. Any date they then change becomes a `pending_date_changes` row with
a reason attached, which Source Lab approves or rejects from the dashboard. Which
columns a supplier sees at all is configurable per-role in Settings.

---

## Safety rails

The import once overwrote the style code on **every row in the database**. That
incident is the reason most of this section exists.

**The bulk-edit allowlist.** `bulk_fields.py` is a server-side registry of what may
be edited in bulk. Three tiers: fields absent from the file are refused outright no
matter what the request says (anything derived, computed, or owned by another
workflow — sample statuses reconcile themselves, tracking is set by shipping);
`identity=True` fields need an explicit confirmation flag; everything else is
ordinary. The endpoint maps requests against the registry rather than reflecting a
client-supplied field name onto the model.

**Preview before write.** `POST /api/bulk-edit/apply` defaults to a dry run. The
caller has to explicitly ask for the write, so a mistyped request changes nothing.
The preview reports how many rows will change, how many are already correct, and how
many have an existing value about to be overwritten, with examples. Capped at 500
rows — a bulk edit is a person fixing a batch, not a migration.

**Two-step delete.** Deleting from the orders table opens a modal that names what is
going, resolved to the right unit: *"1 order (PO 5252), 4 styles"*, not *"4 orders"*.
Component deletion in the detail panel is likewise two-step, because it cascades the
component's sample history with it.

**Full audit trail.** Every date change writes a `date_change_history` row — field,
old value, new value, who, when, and whether the change came from Source Lab or the
supplier. That trail has since been load-bearing: it's the only reliable evidence of
what a row *used to* say once its current state is in doubt.

**Confirm before destruction.** Operational scripts that delete data are dry-run by
default, print what they will destroy before doing it, require a typed confirmation,
and run inside one transaction so a failure rolls everything back rather than leaving
a half-cleaned database.

---

## Performance

The orders table is 77 columns wide and expected to reach tens of thousands of rows.
At that size the bottleneck is not JavaScript, it's DOM size — rendering 250 rows put
18,774 nodes on the page, and every click paid for a style recalculation across all
of them.

`OrderTable.tsx` renders a **fixed window** of rows (`ROW_H = 36`, `OVERSCAN = 10`)
with spacer rows above and below, so the node count stays constant no matter how many
orders exist. Measured at 5,000 rows: ~29 rows in the DOM, including after scrolling
deep into the list.

One implementation note that costs an hour if you don't know it: the spacers carry
their height on a `<td>`, not the `<tr>`. An empty `<tr>` collapses to zero height
regardless of what CSS you put on it.

Row indices passed to selection handlers are **absolute** (`windowFirst + windowIndex`),
not window-relative — shift-click range selection breaks subtly if you use the latter.

---

## Repository layout

```
backend/
  main.py                  FastAPI app, startup migrations, router registration
  models.py                SQLAlchemy models — the schema is the documentation
  schemas.py               Pydantic request/response shapes
  auth.py                  JWT auth, role dependencies
  database.py              Engine and session
  supplier_access.py       Supplier scoping — the security boundary
  sample_helpers.py        Business-day maths, closure calendar, sample-state helpers
  dashboard_warnings.py    The warnings engine
  app_settings.py          Warning-threshold and email-automation registries
  bulk_fields.py           Bulk-edit allowlist
  excel_utils.py           Excel import/export and the auto-calc chain
  notifications.py         Email automations
  email_service.py         Resend integration
  realtime.py              WebSocket broadcast
  routers/                 One module per surface (orders, components, closures, …)

frontend/src/
  app/                     Next.js routes (see Surfaces)
  components/
    layout/                AppShell, Navbar, AuthProvider
    orders/                OrderTable, EditableCell, FactoryV2View, bulk modals,
                           column filters, comments
    samples/               Rejection and resubmission modals
  features/                ComponentWorklist, ComponentLibraryCards
  lib/                     API client, WebSocket client, utils
  store/                   Zustand global state
  types/                   Order interface, COLUMNS definition, status options
```

Two conventions worth knowing before editing:

- **Full-width layouts exclusively.** No `max-w-*` containers anywhere.
- **Factory pages use local state**, not the global Zustand store, so a background
  refresh can't overwrite what a supplier is typing.

---

## Local development

```bash
# Backend — port 8004, SQLite
cd backend
source venv/bin/activate
CORS_ORIGINS="http://localhost:3000,http://localhost:3001" uvicorn main:app --port 8004

# Frontend — port 3001
cd frontend
PORT=3001 npm run dev

# Type check
cd frontend && npx tsc --noEmit
```

Login is by **username**, not email. Seeded accounts are in `init_db.py`.

`frontend/.env.local` must point `NEXT_PUBLIC_API_URL` at port 8004 — if the backend
runs anywhere else, CORS breaks silently.

Migrations run on backend startup: `Base.metadata.create_all()` plus inline
`ALTER TABLE` checks. A new column on an existing model needs its own inline
migration added to the startup event, or it will exist locally and not in production.

---

## Tests

Four smoke suites in `backend/`, each run directly against a local backend:

```bash
cd backend && source venv/bin/activate
python smoke_bulk_edit.py        # allowlist, identity gating, preview-never-writes
python smoke_supplier_scope.py   # cross-factory access sweep over every component endpoint
python smoke_dashboard_board.py  # board and warnings centre agree on what is late
python smoke_component_seam.py   # component lifecycle end to end
```

Each check prints PASS/FAIL with what it actually saw, so a failure tells you what's
wrong rather than just that something is.

---

## Operational scripts

Run inside the backend container on production. All of them are dry-run by default.

```bash
docker exec -it app-backend-1 python clear_order_data.py          # count only
docker exec -it app-backend-1 python clear_order_data.py --apply  # delete, with typed confirmation
```

`clear_order_data.py` removes every order, component, comment and history row while
keeping users, settings, closures and the size guide. Deletion order is explicit and
commented: `comments`, `date_change_history` and `pending_date_changes` reference
`purchase_orders` *without* `ondelete=CASCADE`, and `components.canonical_id` is
`SET NULL`, so relying on cascades leaves either a foreign-key violation or a library
full of ghosts.

`seed_real_po.py` builds a real purchase order — styles, components, sample attempts
and their approval history — from a script rather than by hand through the UI, which
is how production gets seeded reproducibly.

**Take a dump first**, to a file off the droplet. A DigitalOcean snapshot rolls back
the whole machine; a dump lets you pull one table back:

```bash
docker exec app-db-1 pg_dump -U orderbook orderbook > ~/before-clear.sql
```

---

## Deployment

Four containers behind nginx on a single droplet: `db` (Postgres 15), `backend`,
`frontend`, `nginx`, plus a `certbot` sidecar that renews TLS and reloads nginx via a
deploy hook.

```bash
cd /root/app && git pull && docker compose up -d --build frontend backend && docker restart app_nginx_1
```

Container names are `app-backend-1`, `app-frontend-1`, `app-db-1` — and
`app_nginx_1`, with **underscores**, because it predates docker-compose v2's naming
change.

Configuration comes from `.env` on the droplet; see `.env.production.example` for the
full set. Memory limits in `docker-compose.yml` are tuned for a 1 vCPU / 1 GB droplet
and are not decorative.

Full deploy runbook: `.claude/skills/deploy/SKILL.md`.

---

## Known gaps

Honest list, kept current.

**Tests run on SQLite; production runs PostgreSQL.** Nothing in the pipeline executes
a query against Postgres before it reaches the droplet. This has shipped three
production-only outages: two NUL-byte sentinels in `COALESCE` defaults (SQLite stores
`\x00` happily, Postgres refuses a string literal containing it outright) and one
`NOT IN` against a nullable column silently dropping every NULL row. Until the suites
run against a real Postgres container, treat any hand-built SQL construct as
unverified.

**The Excel import has not been audited since the SKU incident.** The failure mode is
known and reproducible: `_build_column_map` assigns `col_map[field] = col_idx` with
no duplicate check, so when a sheet carries the same header twice the *later* column
wins. A second `STYLE CODE` header sitting above a column of product descriptions
rebinds `style_code` to that column, and the import is accepted with no error at all.
Identity columns should not be writable by a bulk import path in the first place.

**The internal guide is stale** — it still references costing, removed analytics
pages, and an "In Progress" status that no longer exists.

**Charlotte's PD sheet carries fields the schema doesn't store**: production, photo
and shipment sample size and quantity.

---

*Internal tool. Not accepting external contributions.*
