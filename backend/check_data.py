"""
Check database data
"""
import sqlite3

DB_PATH = "orderbook.db"

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Count records in each table
tables = ['users', 'purchase_orders', 'comments', 'date_change_history']
for table in tables:
    cursor.execute(f"SELECT COUNT(*) FROM {table}")
    count = cursor.fetchone()[0]
    print(f"{table}: {count} records")

conn.close()
