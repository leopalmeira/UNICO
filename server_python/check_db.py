import sqlite3
import os

db_path = 'database/system.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print('Tabelas no system.db:', [t[0] for t in tables])
    conn.close()
else:
    print('system.db não existe')
