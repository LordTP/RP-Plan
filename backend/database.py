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

    print("✓ Database tables created successfully")
