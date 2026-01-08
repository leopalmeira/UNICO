import sqlite3
import os

DB_FILE = 'school_1.db'

if not os.path.exists(DB_FILE):
    print(f"{DB_FILE} not found.")
else:
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        
        print(f"--- CONTENT OF {DB_FILE} ---")
        
        print("\n[TABLE: teacher_classes]")
        rows = conn.execute("SELECT * FROM teacher_classes").fetchall()
        if not rows:
            print("  (Empty)")
        for r in rows:
            print(f"  {dict(r)}")

        print("\n[TABLE: classes]")
        rows = conn.execute("SELECT id, name FROM classes").fetchall()
        for r in rows:
            print(f"  {dict(r)}")

        conn.close()
    except Exception as e:
        print(f"Error reading DB: {e}")
