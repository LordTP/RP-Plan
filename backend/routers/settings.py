"""App settings endpoints — order statuses list + admin-managed app
settings (kill switch, Resend API key, email automations) + role column
visibility/edit settings + admin DB dump download."""
import os
import subprocess
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, ORDER_STATUSES, RoleColumnSettings, AppSetting
from auth import (
    get_current_user,
    get_current_admin_user,
    get_current_full_internal_user,
)
import app_settings


router = APIRouter()


# Default columns configuration — matches frontend COLUMNS
DEFAULT_COLUMNS = [
    'po_number', 'system_po_number', 'is_active', 'customer', 'china_orderbook_ref',
    'customer_po_number', 'direct_repeat_new', 'season', 'factory', 'terms', 'sales_person',
    'style_code', 'customer_style_code', 'description', 'colour', 'gender',
    'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
    'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
    'size_11', 'size_12', 'size_13', 'size_14',
    'total_quantity', 'trade_price', 'total_order_value',
    'order_received_date', 'order_sent_to_factory_date',
    'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
    'original_po_ex_factory', 'factory_confirmed_ex_factory',
    'fit_sample_required', 'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
    'strike_off_status', 'strike_off_received', 'strike_off_approved',
    'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
    'pps_status', 'pps_received', 'pps_sent_to_customer', 'pps_approved',
    'photo_sample_received', 'ex_factory_from_pp_approval',
    'revised_po_ex_factory', 'shipment_sample_received',
    'original_del_date_to_customer',
    'eta_to_uk', 'eta_to_customer',
    'customer_po_open_month', 'expected_dispatch_arrive_uk_month',
    'fcl_lcl', 'vessel_name', 'vessel_etd', 'vessel_eta_to_port',
    'revised_vessel_eta_to_port', 'estimated_del_to_customer',
    'status',
]

DEFAULT_SUPPLIER_HIDDEN = [
    'system_po_number', 'is_active', 'trade_price', 'total_order_value', 'order_received_date',
]

DEFAULT_SUPPLIER_EDITABLE = [
    'factory_confirmed_ex_factory', 'revised_po_ex_factory',
]


@router.get("/api/statuses")
async def get_statuses():
    """Get list of available order statuses"""
    return {"statuses": ORDER_STATUSES}


@router.get("/api/settings/app")
async def get_app_settings(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get all admin-managed app settings. Secret keys are never returned in
    plaintext — a companion `{key}_set` flag indicates whether a value exists."""
    rows = db.query(AppSetting).all()
    raw = {r.key: (r.value or '') for r in rows}
    for key, default in app_settings.DEFAULTS.items():
        raw.setdefault(key, default)
    settings = {}
    set_flags = {}
    for key, value in raw.items():
        if key in app_settings.SECRET_KEYS:
            set_flags[f'{key}_set'] = bool(value and value.strip())
            settings[key] = ''  # never echo the secret back
        else:
            settings[key] = value
    settings.update(set_flags)
    return {"settings": settings}


@router.get("/api/settings/email-automations")
async def get_email_automations(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all registered email automations and whether each is enabled."""
    out = []
    for a in app_settings.EMAIL_AUTOMATIONS:
        setting_key = app_settings.automation_setting_key(a['key'])
        out.append({
            'key': a['key'],
            'label': a['label'],
            'description': a['description'],
            'setting_key': setting_key,
            'enabled': app_settings.get_bool(db, setting_key),
        })
    return {'automations': out}


@router.put("/api/settings/app")
async def update_app_settings(
    data: dict,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Update one or more admin-managed app settings. Only keys in DEFAULTS are accepted.

    Empty-string submissions for secret keys are ignored (treated as "no change")
    so that re-saving other settings doesn't wipe a previously-set secret."""
    allowed = set(app_settings.DEFAULTS.keys())
    updated_keys = []
    for key, value in data.items():
        if key not in allowed:
            continue
        if isinstance(value, bool):
            value = 'true' if value else 'false'
        value = str(value)
        if key in app_settings.SECRET_KEYS and not value.strip():
            continue
        app_settings.set_setting(db, key, value)
        updated_keys.append(key)
    return {"success": True, "updated": updated_keys}


@router.get("/api/settings/role-columns/{role}")
async def get_role_column_settings(
    role: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get column visibility settings for a role"""
    settings = db.query(RoleColumnSettings).filter(RoleColumnSettings.role == role).all()

    if not settings:
        if role == 'supplier':
            return {
                "role": role,
                "columns": [
                    {
                        "column_key": col,
                        "is_visible": col not in DEFAULT_SUPPLIER_HIDDEN,
                        "is_editable": col in DEFAULT_SUPPLIER_EDITABLE
                    }
                    for col in DEFAULT_COLUMNS
                ]
            }
        else:
            return {
                "role": role,
                "columns": [
                    {"column_key": col, "is_visible": True, "is_editable": True}
                    for col in DEFAULT_COLUMNS
                ]
            }

    settings_dict = {s.column_key: s for s in settings}
    return {
        "role": role,
        "columns": [
            {
                "column_key": col,
                "is_visible": settings_dict[col].is_visible if col in settings_dict else True,
                "is_editable": settings_dict[col].is_editable if col in settings_dict else False
            }
            for col in DEFAULT_COLUMNS
        ]
    }


@router.put("/api/settings/role-columns/{role}")
async def update_role_column_settings(
    role: str,
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Update column visibility settings for a role (internal/admin only)"""
    columns = data.get("columns", [])

    if not columns:
        raise HTTPException(status_code=400, detail="columns array is required")

    db.query(RoleColumnSettings).filter(RoleColumnSettings.role == role).delete()

    for col_setting in columns:
        setting = RoleColumnSettings(
            role=role,
            column_key=col_setting["column_key"],
            is_visible=col_setting.get("is_visible", True),
            is_editable=col_setting.get("is_editable", False)
        )
        db.add(setting)

    db.commit()

    return {"success": True, "message": f"Updated {len(columns)} column settings for {role}"}


@router.get("/api/settings/db-dump")
async def download_db_dump(
    current_user: User = Depends(get_current_admin_user),
):
    """Stream a pg_dump of the live PostgreSQL DB to the caller as a
    downloadable .sql file. Admin only. Uses the postgresql-client
    already bundled in the backend image — no docker exec, we just run
    pg_dump against the DB using the connection details from
    DATABASE_URL. SQLite deployments (local dev default) return 400
    because pg_dump doesn't speak SQLite.
    """
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url.startswith("postgres"):
        raise HTTPException(
            status_code=400,
            detail="DB dump only works against a PostgreSQL DATABASE_URL. Local SQLite dev isn't dumpable via pg_dump.",
        )

    parsed = urlparse(database_url)
    # urlparse gives us scheme, user, password, host, port, path (db name)
    pg_env = {
        **os.environ,
        "PGHOST": parsed.hostname or "db",
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": parsed.username or "orderbook",
        "PGPASSWORD": parsed.password or "",
        "PGDATABASE": (parsed.path or "/orderbook").lstrip("/"),
    }

    # Spawn pg_dump; stream its stdout straight through to the client.
    # No intermediate file on disk — saves memory and disk contention.
    proc = subprocess.Popen(
        ["pg_dump", "--no-owner", "--no-privileges"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=pg_env,
    )

    def stream():
        assert proc.stdout is not None
        try:
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            proc.wait()
            if proc.returncode != 0:
                # We've already streamed some bytes so we can't 500 the
                # response, but at least log the pg_dump stderr so it's
                # visible in container logs for debugging.
                err = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
                print(f"pg_dump failed (rc={proc.returncode}): {err}")

    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"orderbook-prod-{ts}.sql"
    return StreamingResponse(
        stream(),
        media_type="application/sql",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Tell any intermediate proxies not to buffer — some Nginx
            # setups will otherwise sit on the whole response.
            "X-Accel-Buffering": "no",
        },
    )
