
import sqlite3
import os

db_path = '../database/school_21.db'

if not os.path.exists(db_path):
    print(f"Database {db_path} not found.")
    # Tenta school_1.db
    db_path = '../database/school_1.db'

print(f"Checking {db_path}...")

try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Verificar tabela
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pickup_requests'")
    if cur.fetchone():
        print("Tabela pickup_requests EXISTE.")
        # Verificar colunas
        cur.execute("PRAGMA table_info(pickup_requests)")
        columns = [info[1] for info in cur.fetchall()]
        print("Columns:", columns)
    else:
        print("Tabela pickup_requests NÃO existe. Criando...")
        cur.execute('''
            CREATE TABLE pickup_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                guardian_id INTEGER NOT NULL,
                status TEXT DEFAULT 'waiting', -- waiting, ack, completed
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                lat REAL,
                lng REAL
            )
        ''')
        conn.commit()
        print("Tabela criada com sucesso.")

    conn.close()
except Exception as e:
    print(f"Erro: {e}")
