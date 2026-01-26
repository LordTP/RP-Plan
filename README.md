# RP App - Order Management Portal

A web application for managing purchase orders, tracking shipments, and collaborating with suppliers.

## Tech Stack

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** FastAPI (Python), SQLAlchemy
- **Database:** PostgreSQL
- **Deployment:** Docker Compose, Nginx reverse proxy

## Project Structure

```
.
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js app router pages
│   │   │   ├── dashboard/   # Dashboard with stats overview
│   │   │   ├── orders/      # Order management table
│   │   │   ├── import/      # Excel import functionality
│   │   │   └── settings/    # User settings & admin panel
│   │   ├── components/      # Reusable React components
│   │   ├── lib/             # API client & utilities
│   │   ├── store/           # Zustand state management
│   │   └── types/           # TypeScript type definitions
│   ├── Dockerfile
│   └── package.json
│
├── backend/                  # FastAPI backend application
│   ├── main.py              # API routes and endpoints
│   ├── models.py            # SQLAlchemy database models
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── auth.py              # Authentication (JWT tokens)
│   ├── database.py          # Database connection
│   ├── excel_utils.py       # Excel import/export logic
│   ├── init_db.py           # Database initialization script
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml        # Container orchestration
├── nginx.conf               # Reverse proxy configuration
└── .env.production.example  # Environment variables template
```

## Features

- **Order Management:** View, edit, and track purchase orders
- **Role-Based Access:**
  - Admin: Full access to all features
  - Internal: View and edit all orders
  - Supplier: Limited view of their factory's orders only
- **Excel Import/Export:** Bulk import orders from Excel files with undo support
- **Import Undo:** Revert the last Excel import — deletes newly created orders and restores updated orders to their pre-import values
- **Real-Time Updates:** WebSocket support for live data sync
- **Comments System:** Add comments to orders with read/unread tracking
- **Change History:** Track all modifications to orders
- **Dashboard:** Overview statistics, recent activity, and "While You Were Away" summary of changes between login sessions
- **User Management:** Admin panel with last login tracking and password reset

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
- Server with ports 80 open

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
- **Admin:** `admin` / `admin123`
- **Internal:** `thomas` / `thomas123`
- **Supplier:** `factory1` / `factory123`

## Updating the Application

```bash
cd /root/app
git pull
docker-compose up -d --build
```

### Troubleshooting Docker

If you encounter `ContainerConfig` errors during rebuild:
```bash
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)
docker-compose up -d --build
```

Database migrations run automatically on startup — no manual steps needed after updating.

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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/me` | GET | Get current user |
| `/api/orders` | GET | List orders (paginated) |
| `/api/orders/{id}` | GET/PUT | Get or update order |
| `/api/orders/{id}/comments` | GET/POST | Order comments |
| `/api/excel/import` | POST | Import Excel file |
| `/api/excel/export` | GET | Export to Excel |
| `/api/excel/last-import` | GET | Get last import batch info |
| `/api/excel/undo` | POST | Undo the last Excel import |
| `/api/stats/dashboard` | GET | Dashboard statistics |
| `/api/stats/activity-summary` | GET | Recent activity summary |
| `/api/stats/missed-activity` | GET | Changes since last logout |
| `/api/users` | GET/POST | List or create users |
| `/api/users/{id}` | PUT/DELETE | Update or delete user |
| `/ws` | WebSocket | Real-time updates |
