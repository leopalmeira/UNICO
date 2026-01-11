
import sqlite3
import os

# Root dir is parent of server_python
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'school_1.db')

def init_tables():
    print(f"Connecting to {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("Creating student_grades...")
    cur.execute('CREATE TABLE IF NOT EXISTS student_grades (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, subject TEXT, value REAL, term TEXT, teacher_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_id) REFERENCES students(id))')
    
    print("Creating student_reports...")
    cur.execute('CREATE TABLE IF NOT EXISTS student_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, teacher_id INTEGER, title TEXT, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_id) REFERENCES students(id))')

    conn.commit()
    conn.close()
    print("Tables created successfully.")

if __name__ == '__main__':
    init_tables()
