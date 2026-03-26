"""
Database migration script - run this to add missing columns
Usage: python migrate_db.py
"""
import sqlite3
import os

DB_PATH = "orderbook.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found. It will be created when you start the server.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check existing columns in comments table
    cursor.execute("PRAGMA table_info(comments)")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Current comments columns: {columns}")

    # Add missing columns
    if 'read_by_internal' not in columns:
        print("Adding read_by_internal column...")
        cursor.execute("ALTER TABLE comments ADD COLUMN read_by_internal BOOLEAN DEFAULT 0")

    if 'read_by_supplier' not in columns:
        print("Adding read_by_supplier column...")
        cursor.execute("ALTER TABLE comments ADD COLUMN read_by_supplier BOOLEAN DEFAULT 0")

    # Create comment_reads table for per-user read tracking
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comment_reads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            read_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Check if index exists before creating
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_comment_reads_lookup'")
    if not cursor.fetchone():
        cursor.execute("CREATE UNIQUE INDEX ix_comment_reads_lookup ON comment_reads(comment_id, user_id)")
    print("comment_reads table ready")

    conn.commit()

    # Show users
    cursor.execute("SELECT id, username, role, email FROM users")
    users = cursor.fetchall()
    print(f"\nUsers in database: {len(users)}")
    for u in users:
        print(f"  ID={u[0]}: {u[1]} ({u[2]}) - {u[3]}")

    conn.close()
    print("\nMigration complete!")

if __name__ == "__main__":
    migrate()
