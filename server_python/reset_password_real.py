import sqlite3
import bcrypt
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'system.db'))
print(f"Atualizando senha no banco: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)

password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

conn.execute("UPDATE guardians SET password = ? WHERE id = 20", (hashed,))
conn.commit()
conn.close()

print("✅ Senha do Fernando (ID 20) resetada para '123456' no banco real!")
