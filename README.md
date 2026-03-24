# RP App - China Orderbook Portal

A full-stack web application for managing purchase orders, tracking shipments, and collaborating with suppliers. Built for internal teams and factory partners.

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand, Recharts
- **Backend:** FastAPI (Python 3.11), SQLAlchemy, Pydantic
- **Database:** PostgreSQL 15 (production), SQLite (local dev)
- **Real-Time:** WebSockets
- **Deployment:** Docker Compose, Nginx reverse proxy, Let's Encrypt SSL

## Project Structure

```
.
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js app router pages
│   │   │   ├── dashboard/   # Dashboard with stats, approvals, activity
│   │   │   ├── orders/      # Order management table (v1)
│   │   │   ├── orders-v2/   # Alternative orders view (v2)
│   │   │   ├── analytics/   # Charts & performance metrics
│   │   │   ├── import/      # Excel import with preview & undo
│   │   │   ├── design/      # Design assets & artwork management
│   │   │   └── settings/    # User management & column config
│   │   ├── components/      # Reusable React components
│   │   │   ├── layout/      # AppShell, Sidebar, Navbar, AuthProvider
│   │   │   └── orders/      # OrderTable, EditableCell, CommentSidebar
│   │   ├── lib/             # API client (Axios) & WebSocket client
│   │   ├── store/           # Zustand state management
│   │   └── types/           # TypeScript type definitions
│   ├── Dockerfile
│   └── package.json
│
├── backend/                  # FastAPI backend application
│   ├── main.py              # All API routes (~59 endpoints)
│   ├── models.py            # SQLAlchemy models (User, PurchaseOrder, Comment, etc.)
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── auth.py              # JWT authentication & rate limiting
│   ├── database.py          # Database connection config
│   ├── excel_utils.py       # Excel import/export logic
│   ├── init_db.py           # Database initialization & seed users
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml        # Container orchestration (5 services)
├── nginx.conf               # Reverse proxy, SSL, security headers
└── .env.production.example  # Environment variables template
```

## Features

- **Order Management:** View, create, edit, and track purchase orders with inline editing
- **Role-Based Access Control:** 4 user roles with distinct permissions (see below)
- **Supplier Approval Workflow:** Suppliers propose date changes → internal staff approve/reject
- **Excel Import/Export:** Bulk import with preview, batch tracking, and undo support
- **Analytics Dashboard:** Factory performance, customer analytics, delivery KPIs, pipeline visualization
- **Comments System:** Per-order comments with separate read/unread tracking for internal vs supplier users
- **Change History:** Full audit trail of all field modifications with approval tracking
- **Dashboard:** Overview stats, recent activity, pending approvals, and "While You Were Away" summary
- **Real-Time Updates:** WebSocket-based live data sync with auto-reconnect
- **User Management:** Admin panel with role assignment, last login tracking, and password reset
- **Column Configuration:** Per-role column visibility and editability settings

## User Roles

| Feature | Admin | Internal | Designer | Supplier |
|---------|:-----:|:--------:|:--------:|:--------:|
| View all orders | ✓ | ✓ | ✗ | Own factory only |
| Edit order fields | ✓ | ✓ | ✗ | ✗ |
| Propose date changes | ✓ | ✓ | ✗ | ✓ (requires approval) |
| View pricing | ✓ | ✓ | ✗ | ✗ |
| Comments | ✓ | ✓ | ✗ | ✓ |
| Approve/reject changes | ✓ | ✓ | ✗ | ✗ |
| Analytics | ✓ | ✓ | ✗ | ✗ |
| Design page | ✓ | ✓ | ✓ | ✗ |
| Import/Export | ✓ | ✓ | ✗ | ✗ |
| User management | ✓ | ✗ | ✗ | ✗ |

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python init_db.py
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Production Deployment

### Prerequisites
- Docker and Docker Compose installed
- Server with ports 80/443 open

### Setup

1. Clone the repository:
```bash
git clone https://github.com/LordTP/RP-Plan.git app
cd app
```

2. Create environment file:
```bash
cp .env.production.example .env
nano .env  # Edit with your values
```

3. Start the application:
```bash
docker-compose up -d --build
```

4. Initialize the database:
```bash
docker-compose exec backend python init_db.py
```

### Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Internal | `thomas` | `admin123` |
| Supplier | `factory1` | `factory123` |

> **Note:** Change these passwords after first login.

## Updating the Application

```bash
cd /root/app
git pull
docker-compose up -d --build
```

Database migrations run automatically on startup.

### Troubleshooting Docker

If you encounter `ContainerConfig` errors during rebuild:
```bash
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)
docker-compose up -d --build
```

## Backup & Restore

### Manual Backup
```bash
docker-compose exec -T db pg_dump -U orderbook orderbook > backup.sql
```

### Restore
```bash
cat backup.sql | docker-compose exec -T db psql -U orderbook orderbook
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key (generate with `openssl rand -hex 32`) |
| `CORS_ORIGINS` | Allowed origins for CORS |
| `POSTGRES_USER` | Database username |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_DB` | Database name |
| `NEXT_PUBLIC_API_URL` | Backend API URL for frontend |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for frontend |

## API Endpoints

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login (rate limited: 5/5min) |
| `/api/auth/register` | POST | Register user (admin only) |
| `/api/auth/me` | GET | Get current user |

### Orders
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orders` | GET | List orders (paginated, role-filtered) |
| `/api/orders` | POST | Create order (internal only) |
| `/api/orders/{id}` | GET/PUT/DELETE | Get, update, or delete order |
| `/api/orders/recent-changes` | GET | Recent field changes |
| `/api/orders/bulk-update-status` | POST | Bulk status update |
| `/api/orders/bulk-update-date` | POST | Bulk date update |
| `/api/orders/styles-on-po/{po}` | GET | Distinct styles for a PO |
| `/api/orders/batch-pending-changes` | POST | Pending changes for multiple orders |
| `/api/orders/bulk-add-comment` | POST | Comment on multiple orders |

### Comments
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orders/{id}/comments` | GET/POST | Get or add comments |
| `/api/orders/{id}/comments/mark-read` | POST | Mark comments as read |

### Approvals
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/approvals/pending` | GET | Pending approvals |
| `/api/approvals/rejected` | GET | Rejected changes |
| `/api/approvals/my-pending` | GET | Current user's pending |
| `/api/approvals/my-approved` | GET | Current user's approved |
| `/api/approvals/{id}/approve` | POST | Approve a change |
| `/api/approvals/{id}/reject` | POST | Reject a change |
| `/api/approvals/bulk-approve` | POST | Approve multiple |
| `/api/approvals/bulk-reject` | POST | Reject multiple |
| `/api/approvals/{id}/cancel` | DELETE | Cancel pending approval |

### Excel
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/excel/preview` | POST | Preview import |
| `/api/excel/import` | POST | Import Excel data |
| `/api/excel/export` | GET | Export to Excel |
| `/api/excel/template` | GET | Download template |
| `/api/excel/last-import` | GET | Last import info |
| `/api/excel/undo` | POST | Undo last import |

### Analytics (internal only)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics/overview` | GET | Overview stats |
| `/api/analytics/orders-over-time` | GET | Orders trend |
| `/api/analytics/factory-performance` | GET | Factory metrics |
| `/api/analytics/customer-analytics` | GET | Customer data |
| `/api/analytics/delivery-performance` | GET | Delivery KPIs |
| `/api/analytics/date-changes` | GET | Change analytics |
| `/api/analytics/pipeline` | GET | Pipeline visualization |

### Dashboard & Stats
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats/dashboard` | GET | Dashboard statistics |
| `/api/stats/recent-activity` | GET | Activity stream |
| `/api/stats/activity-summary` | GET | Activity summary |
| `/api/stats/missed-activity` | GET | Changes since last login |
| `/api/stats/po-summary` | GET | PO summary |

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET/POST | List or create users |
| `/api/users/{id}` | PUT/DELETE | Update or delete user |
| `/api/settings/role-columns/{role}` | GET/PUT | Column visibility per role |
| `/api/statuses` | GET | Valid order statuses |
| `/api/factories` | GET | All factories |
| `/ws` | WebSocket | Real-time updates |
