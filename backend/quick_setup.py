"""
Quick setup - creates an admin user
Run: python quick_setup.py
"""
import sqlite3
from passlib.context import CryptContext

DB_PATH = "orderbook.db"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def setup():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check tables exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cursor.fetchall()]
    print(f"Tables in database: {tables}")

    if 'users' not in tables:
        print("Users table doesn't exist! Database may be corrupted.")
        print("Delete orderbook.db and restart the backend server to recreate it.")
        conn.close()
        return

    # Create admin user
    username = "admin"
    email = "admin@test.com"
    password = "admin123"

    hashed = pwd_context.hash(password)

    try:
        cursor.execute("""
            INSERT INTO users (username, email, hashed_password, role, is_active, created_at)
            VALUES (?, ?, ?, 'admin', 1, datetime('now'))
        """, (username, email, hashed))
        conn.commit()
        print(f"\n✓ Admin user created!")
        print(f"  Username: {username}")
        print(f"  Password: {password}")
        print(f"  Email: {email}")
    except sqlite3.IntegrityError:
        print(f"User '{username}' already exists")

    # Also create an internal user
    try:
        cursor.execute("""
            INSERT INTO users (username, email, hashed_password, role, is_active, created_at)
            VALUES (?, ?, ?, 'internal', 1, datetime('now'))
        """, ("internal", "internal@test.com", pwd_context.hash("internal123")))
        conn.commit()
        print(f"\n✓ Internal user created!")
        print(f"  Username: internal")
        print(f"  Password: internal123")
    except sqlite3.IntegrityError:
        print(f"User 'internal' already exists")

    # List all users
    cursor.execute("SELECT id, username, role, email FROM users")
    users = cursor.fetchall()
    print(f"\nAll users ({len(users)}):")
    for u in users:
        print(f"  {u[1]} ({u[2]})")

    conn.close()

if __name__ == "__main__":
    setup()
