from app import app
from database import get_system_db, get_school_db
import sqlite3

def migrate():
    print("Migrating chat_messages tables...")
    with app.app_context():
        try:
            sys_db = get_system_db()
            schools = sys_db.execute('SELECT id FROM schools').fetchall()
            
            for s in schools:
                school_id = s['id']
                print(f"Checking School {school_id}...")
                try:
                    db = get_school_db(school_id)
                    try:
                        db.execute('ALTER TABLE chat_messages ADD COLUMN is_read_by_guardian INTEGER DEFAULT 0')
                        print(f"  -> Added is_read_by_guardian to School {school_id}")
                    except sqlite3.OperationalError as e:
                        if 'duplicate column' in str(e):
                            print(f"  -> Column 'is_read_by_guardian' already exists in School {school_id}")
                        else:
                            print(f"  -> Error altering table: {e}")
                    
                    try:
                        db.execute('ALTER TABLE chat_messages ADD COLUMN is_read_by_school INTEGER DEFAULT 0')
                        print(f"  -> Added is_read_by_school to School {school_id}")
                    except sqlite3.OperationalError as e:
                        if 'duplicate column' in str(e):
                            print(f"  -> Column 'is_read_by_school' already exists in School {school_id}")
                        else:
                            pass
                    
                    db.commit()
                    db.close()
                except Exception as e:
                    print(f"Failed to access School {school_id}: {e}")
        except Exception as e:
            print(f"System DB Error: {e}")

if __name__ == '__main__':
    migrate()
