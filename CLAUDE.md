# Critical Path (RP App)

Order management system for TruePath Group / Source Lab. FastAPI + Next.js.

## Commands

```bash
# Local backend
cd backend && source venv/bin/activate && CORS_ORIGINS="http://localhost:3000,http://localhost:3001" uvicorn main:app --port 8004

# Local frontend
cd frontend && PORT=3001 npm run dev

# Type check
cd frontend && npx tsc --noEmit
```

## Architecture

- Backend: FastAPI on port 8004, SQLAlchemy, PostgreSQL (prod) / SQLite (local)
- Frontend: Next.js 14 on port 3001, Tailwind CSS, Zustand store
- DB auto-migrates on startup via `create_all()` + inline ALTER TABLE checks
- CORS: `.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:8004` -- backend CORS must include frontend port

## Conventions

- Full-width layouts exclusively -- no `max-w-*` containers
- Status values stored UPPERCASE: `NOT REQUIRED`, `APPROVED`, `OUTSTANDING`
- All time thresholds use business days (Mon-Fri) via `business_days_between()`
- Sample completion: use `is_sample_done()` and `sample_needs_work()` helpers -- they handle NOT REQUIRED correctly
- Auto-calc chain runs in 4 places: order update, single approve, bulk approve, Excel import
- Component fields always editable (not gated by COLUMNS definition)
- Green highlights: factory/supplier views only, not main orders-v2
- Factory pages use local state (not global Zustand) to avoid data overwrite

## Roles

| Role | Access | Restrictions |
|------|--------|-------------|
| ADMIN | Full + settings (in user dropdown) | None |
| INTERNAL | Full order access | No settings |
| DESIGNER | Design pages + components | No cost/value columns |
| SUPPLIER | Factory pages only | 3-date edit gate, date changes need approval |

## Key Files

- `backend/main.py` -- all endpoints, auto-calc, warnings, analytics
- `backend/excel_utils.py` -- import/export with auto-calc
- `frontend/src/types/index.ts` -- Order interface, COLUMNS, status options
- `frontend/src/components/orders/FactoryV2View.tsx` -- V2 detail panel + components
- `frontend/src/app/orders-v2/page.tsx` -- main V2 view with detail modal

## Boundaries

- IMPORTANT: Confirm before any destructive action (delete, wipe, clear data). Describe what will happen and wait for explicit "yes."
- IMPORTANT: Supplier endpoints filter by `factory_name` -- suppliers must not see pricing or other factories' data.
- Production deploy details are in `.claude/skills/deploy/SKILL.md` -- read before any deploy task.
- Container names: `app-backend-1`, `app-frontend-1`, `app-db-1`, `app_nginx_1` (nginx uses underscores, others use hyphens).

## Gotchas

- Nginx container name has underscores (`app_nginx_1`) -- all others use hyphens
- Frontend `.env.local` points to port 8004 -- if backend runs elsewhere, CORS breaks
- New User model columns need inline ALTER TABLE migration in startup event
- `columnKeys` prop on OrderTable filters visible columns for factory views
