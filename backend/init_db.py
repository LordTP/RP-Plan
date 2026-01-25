"""
Initialization script - Run this ONCE to setup the database and create initial admin user
"""
import sys
sys.path.append('.')

from database import init_db, SessionLocal
from models import User, UserRole
from auth import get_password_hash

def create_initial_admin():
    """Create the first admin user"""
    db = SessionLocal()
    
    try:
        # Check if any users exist
        existing_users = db.query(User).count()
        
        if existing_users > 0:
            print("⚠️  Users already exist in database. Skipping admin creation.")
            return
        
        print("Creating initial admin user...")
        
        # Create admin user
        admin = User(
            username="admin",
            email="admin@truePathgroup.com",
            hashed_password=get_password_hash("admin123"),  # CHANGE THIS!
            role=UserRole.ADMIN,
            is_active=True
        )
        
        db.add(admin)
        
        # Create sample internal user
        internal = User(
            username="thomas",
            email="thomas@truepathgroup.com",
            hashed_password=get_password_hash("thomas123"),
            role=UserRole.INTERNAL,
            is_active=True
        )
        
        db.add(internal)
        
        # Create sample supplier user
        supplier = User(
            username="factory1",
            email="factory@supplier.com",
            hashed_password=get_password_hash("factory123"),
            role=UserRole.SUPPLIER,
            factory_name="Sample Factory",
            is_active=True
        )
        
        db.add(supplier)
        
        db.commit()
        
        print("✅ Initial users created successfully!")
        print("\n📋 Login Credentials:")
        print("─" * 50)
        print("ADMIN User:")
        print("  Username: admin")
        print("  Password: admin123")
        print("  Role: admin (full access)")
        print()
        print("INTERNAL User:")
        print("  Username: thomas")
        print("  Password: thomas123")
        print("  Role: internal (full access)")
        print()
        print("SUPPLIER User:")
        print("  Username: factory1")
        print("  Password: factory123")
        print("  Role: supplier (limited to their factory)")
        print("─" * 50)
        print("\n⚠️  IMPORTANT: Change these passwords after first login!")
        
    except Exception as e:
        print(f"❌ Error creating users: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("🚀 Initializing China Orderbook Portal Database...")
    print()
    
    # Initialize database tables
    init_db()
    
    # Create initial admin user
    create_initial_admin()
    
    print("\n✅ Initialization complete!")
    print("🎯 Next steps:")
    print("   1. Start the API server: python main.py")
    print("   2. Login with credentials above")
    print("   3. Create additional users as needed")
    print("   4. Import your Excel data via /api/excel/import")
