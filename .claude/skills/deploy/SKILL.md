---
name: Production Deploy
description: Deploy RP App to production on DigitalOcean droplet, run migrations, restart services
globs:
  - docker-compose.yml
  - nginx.conf
  - "*/Dockerfile"
triggers:
  - deploy
  - production
  - droplet
  - nginx
  - docker compose
---

# Production Deploy

## Deploy Command

Deploy via DigitalOcean Console (Thomas uses the DO web console, not SSH):

```bash
cd /root/app && git pull && docker compose up -d --build frontend backend && docker restart app_nginx_1 && docker image prune -a -f
```

The trailing prune is not optional housekeeping. Every deploy leaves the
previous frontend and backend images behind, and the droplet only has 24GB:
in Sep 2026 it reached 91% full with 122 images, 5 of them in use and 12.75GB
reclaimable. At 100% the next build fails AND Postgres can't write, which is
a live outage rather than a failed deploy.

It runs AFTER the build and nginx restart on purpose — if the build fails,
the old images are still there and the running containers keep serving.

`prune -a` removes every image no running container uses, including the
`python:3.11-slim` and `node:18-alpine` bases, so the next build re-downloads
them and takes a few minutes longer. It does NOT touch Local Volumes, so the
Postgres data is safe.

Check disk with `df -h /` and `docker system df` if a build ever fails oddly.

## Environment

- Droplet: `ubuntu-s-1vcpu-1gb-lon1-01` (London, Ubuntu 25.04)
- App path: `/root/app`
- Docker Compose V2 (`docker compose` no hyphen) -- V1 is broken with ContainerConfig bug
- Only rebuild frontend + backend containers (not nginx/db)

## Post-Deploy Checklist

1. MUST restart nginx after every deploy: `docker restart app_nginx_1`
2. Nginx container is `app_nginx_1` (underscore format)
3. Other containers: `app-backend-1`, `app-frontend-1`, `app-db-1` (hyphen format)
4. DB migrations run automatically on backend startup (SQLAlchemy create_all)

## Database Migrations (Production = PostgreSQL)

`migrate_db.py` is for local SQLite only -- NEVER run it on production.

### New tables:

```bash
docker exec -it app-backend-1 python -c "
from database import engine
from models import Base
Base.metadata.create_all(engine, checkfirst=True)
print('Done')
"
```

### New columns on existing tables:

```bash
docker exec -it app-db-1 psql -U orderbook -d orderbook -c "ALTER TABLE ..."
```
