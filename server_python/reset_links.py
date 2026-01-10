import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'system.db')

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute('UPDATE school_affiliates SET status = "removed"')
conn.commit()
conn.close()
print('✅ Todos os vínculos foram removidos. Agora você pode testar do zero!')
