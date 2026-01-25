"""
Create a user - run this if you need to add a new user
Usage: python create_user.py
"""
import sqlite3
from passlib.context import CryptContext

DB_PATH = "orderbook.db"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_user():
    print("Create a new user")
    print("-" * 30)

    username = input("Username: ").strip()
    email = input("Email: ").strip()
    password = input("Password: ").strip()
    print("Role options: admin, internal, supplier")
    role = input("Role: ").strip().lower()

    if role not in ['admin', 'internal', 'supplier']:
        print("Invalid role!")
        return

    factory_name = None
    if role == 'supplier':
        factory_name = input("Factory name: ").strip()

    # Hash password
    hashed = pwd_context.hash(password)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO users (username, email, hashed_password, role, factory_name, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        """, (username, email, hashed, role, factory_name))
        conn.commit()
        print(f"\nUser '{username}' created successfully!")
    except sqlite3.IntegrityError as e:
        print(f"\nError: {e}")
        print("Username or email may already exist.")
    finally:
        conn.close()

if __name__ == "__main__":
    create_user()
