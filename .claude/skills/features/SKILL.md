---
name: Feature Reference
description: Detailed feature documentation for components, warnings, auto-calcs, comments, excel import, supplier gate
globs:
  - backend/main.py
  - backend/excel_utils.py
  - "frontend/src/components/orders/*"
  - "frontend/src/types/index.ts"
triggers:
  - components
  - warnings
  - auto-calc
  - sampling
  - excel import
  - supplier gate
  - approval
  - comments
---

# Feature Reference

## Components System

- OrderComponent model with per-component fit/strike off/lab dip tracking
- Add to single style, all styles on PO, or selected styles
- Component badges: green tick (done) or amber (in progress)
- "Done" = status APPROVED or NOT REQUIRED, OR approved date exists (`is_sample_done` helper)
- When components exist, order-level fit/SO/LD hidden; PPS stays order-level

## Auto-Calculation Chain

Runs in 4 places: order update, single approve, bulk approve, Excel import.

| Calculation | Formula |
|------------|---------|
| Total Qty | sum of sizes |
| Total Cost | price x qty |
| ETA UK | Revised Ex-Fac + 60d |
| ETA Customer | ETA UK + 5d |
| Est Del to Customer | Vessel ETA + 5d (FCL) / 7d (LCL) / 2d (AIR) |
| Ex-Fac from PP | PPS Approved + 35d |
| PO Open Month | from source dates |
| Expected Del Month | from source dates |
| Revised Ex-Fac | defaults to Factory Confirmed when blank |

## Warnings Centre

Dashboard with 9 warning types, all using business days:

- Tech Packs/Specs: 3 days
- Fit/Lab Dip overdue: 15 days from tech packs
- Lab Dip/Strike Off approval: 5 days
- Strike Off overdue: 20 days (25 for badges/woven)
- PPS approval: 7 days from sent to customer

Uses `is_sample_done` helper consistently. Searchable, click-through to design view.

## Comment System

- Per-user read tracking via CommentRead join table
- Read receipts ("Seen by X" with hover popup)
- Chat-style bubbles: SL left, Supplier right
- V2 shows comments + history side-by-side (not tabs)
- Comment count updates live without refresh

## Excel Import

- Full Import (create + update) OR "New Orders Only" (skip existing)
- Auto-calc columns warned and skipped on import
- Preview, conflict resolution, undo

## Supplier Edit Gate

- 3 dates required: Sent to Factory + Tech Packs + Specs
- Date fields go through approval; text fields save direct
- Editable fields configurable via DB settings (RoleColumnSettings)

## Status Dropdowns

- Fit: NOT REQUIRED, APPROVED, OUTSTANDING, P23 ADVISE UPDATE, LATE, RECEIVED
- SO/LD/PPS: same + NOT REQUIRED
- FCL/LCL: FCL, LCL, AIR (dropdown with bulk apply)
