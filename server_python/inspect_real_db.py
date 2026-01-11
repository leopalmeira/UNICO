import sqlite3
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'system.db'))
print(f"Lendo banco: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print('Tabelas:', [t[0] for t in tables])

if 'guardians' in [t[0] for t in tables]:
    print("Tabela guardians existe!")
    count = conn.execute("SELECT COUNT(*) FROM guardians").fetchone()[0]
    print(f"Total guardians: {count}")
    
    # Listar
    all_g = conn.execute("SELECT id, email FROM guardians").fetchall()
    for g in all_g:
        print(f"  - {g[1]} (ID: {g[0]})")
else:
    print("❌ Tabela guardians NÃO existe!")

conn.close()
