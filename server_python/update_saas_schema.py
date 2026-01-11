import sqlite3
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'system.db'))
print(f"Atualizando schema do banco: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)

# 1. Criar tabela de configurações globais
conn.execute('''
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
)
''')

# Definir valor padrão R$ 6.50 se não existir
existing = conn.execute("SELECT value FROM system_settings WHERE key = 'saas_default_price'").fetchone()
if not existing:
    conn.execute("INSERT INTO system_settings (key, value) VALUES ('saas_default_price', '6.50')")
    print("✅ Configuração global criada: R$ 6.50")

# 2. Adicionar coluna custom_price na tabela schools
cursor = conn.execute("PRAGMA table_info(schools)")
columns = [col[1] for col in cursor.fetchall()]

if 'custom_price' not in columns:
    conn.execute("ALTER TABLE schools ADD COLUMN custom_price REAL")
    print("✅ Coluna 'custom_price' adicionada na tabela schools")
else:
    print("ℹ️ Coluna 'custom_price' já existe")

conn.commit()
conn.close()
