# Critical Path — Development Guide

## Commands
- **Local backend:** `cd backend && source venv/bin/activate && CORS_ORIGINS="http://localhost:3000,http://localhost:3001" uvicorn main:app --port 8004`
- **Local frontend:** `cd frontend && PORT=3001 npm run dev`
- **Type check:** `cd frontend && npx tsc --noEmit`
- **Deploy:** `cd /root/app && git pull && docker compose up -d --build frontend backend && docker restart app_nginx_1`

## Architecture
- Backend: FastAPI on port 8004 (local), SQLAlchemy + PostgreSQL (prod) / SQLite (local)
- Frontend: Next.js 14 on port 3001 (local), Tailwind CSS, Zustand store
- Production containers: `app-backend-1`, `app-frontend-1`, `app-db-1`, `app_nginx_1` (nginx uses underscores)
- DB auto-migrates on startup via `create_all()` + inline ALTER TABLE checks
- IMPORTANT: `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8004` — backend CORS must include frontend port

## Code Conventions
- All pages use full-width layouts (no max-width containers)
- Status values stored UPPERCASE (NOT REQUIRED, APPROVED, OUTSTANDING, etc.)
- All time thresholds use business days (Mon-Fri) via `business_days_between()` helper
- Sample completion checks use module-level `is_sample_done()` and `sample_needs_work()` helpers — NEVER check NOT REQUIRED manually
- Auto-calc chain runs in 4 places: order update, single approve, bulk approve, Excel import
- Component fields always editable (not gated by COLUMNS definition)
- Green highlights only on factory/supplier views, not main orders v2
- Designer role hides cost/value columns

## Roles
- Admin: full access + settings (in user dropdown, not nav)
- Internal: full access except settings
- Designer: design pages, no cost/value, components
- Supplier: factory pages only, edit gate (3 dates required), date changes need approval

## Key Files
- `backend/main.py` — all endpoints, auto-calc logic, warnings, analytics
- `backend/excel_utils.py` — import/export with auto-calc
- `frontend/src/types/index.ts` — Order interface, COLUMNS, status options, column arrays
- `frontend/src/components/orders/FactoryV2View.tsx` — shared V2 detail panel + components
- `frontend/src/app/orders-v2/page.tsx` — main V2 view with detail modal

## Common Gotchas
- Nginx container name has underscores (`app_nginx_1`), others use hyphens
- Must restart nginx after deploy: `docker restart app_nginx_1`
- Frontend `.env.local` points to port 8004 — if backend runs on different port, CORS fails
- New columns on User model need inline ALTER TABLE migration in startup event
- Factory pages use local state (NOT global Zustand store) to avoid data overwrite
- `columnKeys` prop on OrderTable filters columns for factory views
