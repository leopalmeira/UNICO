import sqlite3
import os
import secrets
import string

# Get correct database path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'system.db')

def generate_token(length=12):
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))

print(f"Conectando ao banco: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Gerar novo token para escola ID 20
token = generate_token()
cur.execute('''
    INSERT INTO school_affiliates (parent_school_id, token, status)
    VALUES (?, ?, 'pending')
''', (20, token))

conn.commit()

print(f"\n✅ NOVO TOKEN GERADO PARA ESCOLA ID 20:")
print(f"Token: {token}")
print(f"\n📋 INSTRUÇÕES:")
print(f"1. Faça login com: futurovip2@email.com (Escola ID 21)")
print(f"2. Vá em Filiais → Vincular à Matriz")
print(f"3. Use este token: {token}")
print(f"\nEste token foi gerado pela escola ID 20, então vai funcionar!")

conn.close()
