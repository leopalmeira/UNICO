import sqlite3
import os

# Get correct database path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'system.db')

print(f"Conectando ao banco: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("\n=== ESCOLAS CADASTRADAS ===")
cur.execute('SELECT id, name, email FROM schools')
schools = cur.fetchall()
for s in schools:
    print(f"ID: {s['id']}, Nome: {s['name']}, Email: {s['email']}")

print("\n=== TOKENS DE AFILIAÇÃO ===")
cur.execute('SELECT id, parent_school_id, affiliate_school_id, token, status FROM school_affiliates')
tokens = cur.fetchall()
for t in tokens:
    print(f"Token: {t['token']}, Matriz: {t['parent_school_id']}, Filial: {t['affiliate_school_id']}, Status: {t['status']}")

conn.close()
