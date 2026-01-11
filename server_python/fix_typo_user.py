import sqlite3
import bcrypt
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'system.db'))
SCHOOL_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'school_1.db'))

print(f"🔧 Adicionando usuário alternativo no banco: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)

# Pegar hash da senha do ID 20
pw = conn.execute("SELECT password FROM guardians WHERE id = 20").fetchone()
if not pw:
    # Se por acaso ID 20 não existir, gera novo hash
    hashed = bcrypt.hashpw('123456'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
else:
    hashed = pw[0]

# Tentar inserir o email com ponto (se já existir, ignora)
try:
    cursor = conn.cursor()
    cursor.execute('''
    INSERT INTO guardians (email, password, name, phone)
    VALUES (?, ?, ?, ?)
    ''', ('fernando.@email.com', hashed, 'Fernando (Auto)', '11988888888'))
    new_id = cursor.lastrowid
    conn.commit()
    print(f"✅ Usuário 'fernando.@email.com' (com ponto) criado com ID: {new_id}")
    
    # Vincular ao aluno
    school_conn = sqlite3.connect(SCHOOL_DB_PATH)
    school_conn.execute("INSERT INTO student_guardians (student_id, guardian_id) VALUES (1, ?)", (new_id,))
    school_conn.commit()
    school_conn.close()
    print("✅ Vínculo criado para o usuário com ponto.")
    
except sqlite3.IntegrityError:
    print("⚠️ Usuário com ponto já existe.")

conn.close()
