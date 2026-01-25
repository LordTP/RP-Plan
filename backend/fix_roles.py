"""
Fix user roles - converts lowercase to uppercase
Run: python fix_roles.py
"""
import sqlite3

DB_PATH = "orderbook.db"

def fix():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Update all role values to uppercase
    cursor.execute("UPDATE users SET role = 'ADMIN' WHERE role = 'admin'")
    cursor.execute("UPDATE users SET role = 'INTERNAL' WHERE role = 'internal'")
    cursor.execute("UPDATE users SET role = 'SUPPLIER' WHERE role = 'supplier'")

    conn.commit()

    # Verify
    cursor.execute("SELECT id, username, role FROM users")
    users = cursor.fetchall()
    print(f"Fixed {len(users)} users:")
    for u in users:
        print(f"  {u[1]} -> {u[2]}")

    conn.close()
    print("\nDone! Restart the backend server.")

if __name__ == "__main__":
    fix()
