"""
Database configuration and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import os
from dotenv import load_dotenv

load_dotenv()

# Database URL from environment variable
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./orderbook.db"
)

# Create engine with appropriate settings for SQLite vs PostgreSQL
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=10,
        max_overflow=20
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency for FastAPI to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database tables
    """
    from models import Base
    Base.metadata.create_all(bind=engine)

    # Migrate: add previous_login column if it doesn't exist
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    if 'users' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('users')]
        if 'previous_login' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN previous_login TIMESTAMP"))
            print("✓ Added previous_login column to users table")

    # Migrate: add import_batch_id to purchase_orders
    if 'purchase_orders' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('purchase_orders')]
        if 'import_batch_id' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN import_batch_id VARCHAR(36)"))
            print("✓ Added import_batch_id column to purchase_orders table")

    # Migrate: add import_batch_id to date_change_history
    if 'date_change_history' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('date_change_history')]
        if 'import_batch_id' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE date_change_history ADD COLUMN import_batch_id VARCHAR(36)"))
            print("✓ Added import_batch_id column to date_change_history table")

    # Migrate: add approved_by columns to date_change_history
    if 'date_change_history' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('date_change_history')]
        if 'approved_by_id' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE date_change_history ADD COLUMN approved_by_id INTEGER REFERENCES users(id)"))
                conn.execute(text("ALTER TABLE date_change_history ADD COLUMN approved_by_username VARCHAR(50)"))
            print("✓ Added approved_by columns to date_change_history table")

    # Migrate: add rejection_reason to date_change_history
    if 'date_change_history' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('date_change_history')]
        if 'rejection_reason' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE date_change_history ADD COLUMN rejection_reason TEXT"))
            print("✓ Added rejection_reason column to date_change_history table")

    # Migrate: add tracking_reference to purchase_orders
    if 'purchase_orders' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('purchase_orders')]
        if 'tracking_reference' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN tracking_reference VARCHAR(100)"))
            print("✓ Added tracking_reference column to purchase_orders table")

    # Migrate: add date_notes JSON column to purchase_orders
    # Holds text overrides (e.g. "ASAP") for a small set of date fields
    # where the customer/factory occasionally gives free text instead of
    # a real date. Postgres = JSONB, SQLite falls back to TEXT via JSON1.
    if 'purchase_orders' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('purchase_orders')]
        if 'date_notes' not in columns:
            with engine.begin() as conn:
                dialect = engine.dialect.name
                col_type = "JSONB" if dialect == 'postgresql' else "JSON"
                conn.execute(text(f"ALTER TABLE purchase_orders ADD COLUMN date_notes {col_type}"))
            print("✓ Added date_notes column to purchase_orders table")

    # Migrate: add new CP HEADERS columns to purchase_orders (2026-03-24)
    if 'purchase_orders' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('purchase_orders')]
        new_cols = [
            ("direct_repeat_new", "VARCHAR(50)"),
            ("tech_packs_sent_to_factory", "TIMESTAMP"),
            ("specs_sent_to_factory", "TIMESTAMP"),
            ("barcodes_sent_to_factory", "TIMESTAMP"),
            ("factory_confirmed_ex_factory", "TIMESTAMP"),
            ("fit_sample_required", "VARCHAR(10)"),
            ("fit_sample_status", "VARCHAR(50)"),
            ("fit_sample_received", "TIMESTAMP"),
            ("fit_sample_approved", "TIMESTAMP"),
            ("strike_off_status", "VARCHAR(50)"),
            ("strike_off_received", "TIMESTAMP"),
            ("strike_off_approved", "TIMESTAMP"),
            ("lab_dip_status", "VARCHAR(50)"),
            ("lab_dip_received", "TIMESTAMP"),
            ("lab_dip_approved", "TIMESTAMP"),
            ("pps_status", "VARCHAR(50)"),
            ("pps_received", "TIMESTAMP"),
            ("pps_sent_to_customer", "TIMESTAMP"),
            ("pps_approved", "TIMESTAMP"),
            ("photo_sample_received", "TIMESTAMP"),
            ("ex_factory_from_pp_approval", "TIMESTAMP"),
            ("shipment_sample_received", "TIMESTAMP"),
            ("fcl_lcl", "VARCHAR(20)"),
            ("vessel_name", "VARCHAR(100)"),
            ("vessel_etd", "TIMESTAMP"),
            ("vessel_eta_to_port", "TIMESTAMP"),
            ("revised_vessel_eta_to_port", "TIMESTAMP"),
            ("estimated_del_to_customer", "TIMESTAMP"),
        ]
        added = []
        with engine.begin() as conn:
            for col_name, col_type in new_cols:
                if col_name not in columns:
                    conn.execute(text(f"ALTER TABLE purchase_orders ADD COLUMN {col_name} {col_type}"))
                    added.append(col_name)
        if added:
            print(f"✓ Added {len(added)} new CP HEADERS columns to purchase_orders")

    # Migrate: add Label sample columns to order_components (2026-07)
    # New third component type alongside Strike Off and Lab Dip.
    if 'order_components' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('order_components')]
        label_cols = [
            ("label_status", "VARCHAR(50)"),
            ("label_received", "TIMESTAMP"),
            ("label_approved", "TIMESTAMP"),
        ]
        added_label = []
        with engine.begin() as conn:
            for col_name, col_type in label_cols:
                if col_name not in columns:
                    conn.execute(text(f"ALTER TABLE order_components ADD COLUMN {col_name} {col_type}"))
                    added_label.append(col_name)
        if added_label:
            print(f"✓ Added {len(added_label)} label sample columns to order_components")

    print("✓ Database tables created successfully")
