import sqlite3
import os
from database import BASE_DIR

def check_link():
    db_path = os.path.join(BASE_DIR, 'database', 'system.db')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    print("--- SCHOOLS ---")
    schools = cur.execute("SELECT id, name, email FROM schools").fetchall()
    for s in schools:
        print(s)
        
    print("\n--- AFFILIATES ---")
    affs = cur.execute("SELECT * FROM school_affiliates").fetchall()
    for a in affs:
        print(a)
        
    print("\n--- SIMULATION ---")
    user_school_id = 20 # Matriz
    requested_school_id = 21 # Filial
    
    cur.execute('''
        SELECT id FROM school_affiliates
        WHERE ((parent_school_id = ? AND affiliate_school_id = ?)
           OR (parent_school_id = ? AND affiliate_school_id = ?))
           AND status = 'active'
    ''', (user_school_id, requested_school_id, requested_school_id, user_school_id))
    
    match = cur.fetchone()
    print(f"Checking Access (User={user_school_id}, Req={requested_school_id}): {'GRANTED' if match else 'DENIED'}")

if __name__ == "__main__":
    check_link()
