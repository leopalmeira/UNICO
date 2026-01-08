import sqlite3
import os

# server_python is cwd
INITIAL_CWD = os.getcwd()
PROJECT_ROOT = os.path.dirname(INITIAL_CWD) # edufocus1-main
DB_PATH = os.path.join(PROJECT_ROOT, 'database', 'school_20.db')

def force():
    print(f"Connecting to {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("❌ DB not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # 1. Get classes
    classes = conn.execute("SELECT id, name FROM classes").fetchall()
    if not classes:
        print("❌ No classes found in this school.")
        conn.close()
        return
        
    print("Classes found:")
    for c in classes:
        print(f"ID: {c['id']}, Name: {c['name']}")
        
    first_class_id = classes[0]['id']
    teacher_id = 6 # Jonas (from previous check)
    
    print(f"Attempting to link Teacher {teacher_id} to Class {first_class_id}...")
    
    try:
        # Check if exists
        exists = conn.execute("SELECT 1 FROM teacher_classes WHERE teacher_id = ? AND class_id = ?", (teacher_id, first_class_id)).fetchone()
        if exists:
            print("Link already exists.")
        else:
            conn.execute("INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)", (teacher_id, first_class_id))
            conn.commit()
            print("✅ Link inserted successfully!")
    except Exception as e:
        print(f"❌ Error inserting link: {e}")
        
    # Verify
    links = conn.execute("SELECT * FROM teacher_classes WHERE teacher_id = ?", (teacher_id,)).fetchall()
    print("Current links for Jonas:")
    for l in links: print(dict(l))
    
    conn.close()

if __name__ == '__main__':
    force()
