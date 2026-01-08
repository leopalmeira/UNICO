import sqlite3
import os

# Assume we are in server_python
INITIAL_CWD = os.getcwd()
PROJECT_ROOT = os.path.dirname(INITIAL_CWD) # edufocus1-main
DB_DIR = os.path.join(PROJECT_ROOT, 'database')
SYSTEM_DB = os.path.join(DB_DIR, 'system.db')

print(f"Looking for DBs in: {DB_DIR}")

def check():
    if not os.path.exists(SYSTEM_DB):
        print(f"❌ System DB not found at {SYSTEM_DB}")
        # Try finding anywhere
        return

    conn = sqlite3.connect(SYSTEM_DB)
    conn.row_factory = sqlite3.Row
    
    print("\n--- TEACHERS (Jonas) ---")
    teachers = conn.execute("SELECT id, name, email, school_id FROM teachers WHERE name LIKE '%jonas%'").fetchall()
    
    if not teachers:
        print("❌ Teacher Jonas not found in system.db")
    
    for t in teachers:
        t_dict = dict(t)
        print(f"Teacher: {t_dict}")
        school_id = t['school_id']
        teacher_id = t['id']
        
        if school_id:
            s_db_path = os.path.join(DB_DIR, f"school_{school_id}.db")
            if os.path.exists(s_db_path):
                print(f"Checking School DB: {s_db_path}")
                s_conn = sqlite3.connect(s_db_path)
                s_conn.row_factory = sqlite3.Row
                
                # Check table existence
                try:
                    count = s_conn.execute("SELECT count(*) FROM teacher_classes").fetchone()[0]
                    print(f"Table teacher_classes exists. Total rows: {count}")
                except Exception as e:
                    print(f"❌ Table teacher_classes DOES NOT EXIST: {e}")
                    s_conn.close()
                    continue

                print(f"--- TEACHER_CLASSES (Teacher {teacher_id}) ---")
                links = s_conn.execute("SELECT * FROM teacher_classes WHERE teacher_id = ?", (teacher_id,)).fetchall()
                if not links:
                    print(f"❌ No classes linked to teacher {teacher_id} in school_{school_id}.db")
                else:
                    for l in links:
                        print(f"✅ LINK FOUND: class_id={l['class_id']}")
                        # Check class name
                        c = s_conn.execute("SELECT name FROM classes WHERE id = ?", (l['class_id'],)).fetchone()
                        if c:
                             print(f"   -> Class Name: {c['name']}")
                    
                s_conn.close()
            else:
                print(f"❌ School DB not found: {s_db_path}")
        else:
            print("❌ Teacher has no school_id.")

    conn.close()

if __name__ == '__main__':
    check()
