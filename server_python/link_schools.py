import sqlite3
import os

# Get correct database path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'system.db')

print(f"Conectando ao banco: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Vincular escola 21 à escola 20 (20 é matriz, 21 é filial)
print("\n🔗 Vinculando escolas diretamente no banco...")
print("Escola 20 (futurovip@email.com) será a MATRIZ")
print("Escola 21 (futurovip2@email.com) será a FILIAL")

# Usar o token que já existe
cur.execute('''
    UPDATE school_affiliates
    SET affiliate_school_id = 21, status = 'active'
    WHERE token = 'OO59GPTEB6P1'
''')

conn.commit()

print("\n✅ VÍNCULO CRIADO COM SUCESSO!")

# Verificar
cur.execute('''
    SELECT sa.id, sa.parent_school_id, sa.affiliate_school_id, sa.token, sa.status,
           s1.name as parent_name, s2.name as affiliate_name
    FROM school_affiliates sa
    JOIN schools s1 ON s1.id = sa.parent_school_id
    LEFT JOIN schools s2 ON s2.id = sa.affiliate_school_id
    WHERE sa.status = 'active'
''')

links = cur.fetchall()
print("\n📊 VÍNCULOS ATIVOS:")
for link in links:
    print(f"  Matriz: {link['parent_name']} (ID {link['parent_school_id']})")
    print(f"  Filial: {link['affiliate_name']} (ID {link['affiliate_school_id']})")
    print(f"  Token: {link['token']}")
    print(f"  Status: {link['status']}")
    print()

conn.close()

print("✅ Agora você pode:")
print("1. Fazer login com futurovip@email.com (Matriz)")
print("2. Ir em 'Filiais' e ver a escola futurovip2@email.com listada")
print("3. Alternar entre as escolas usando o seletor no topo")
