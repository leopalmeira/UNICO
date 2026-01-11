import sqlite3
import bcrypt
import os

# Caminho correto do banco (um nível acima de server_python)
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) # server_python
PROJECT_ROOT = os.path.dirname(BASE_DIR) # edufocus1-main
DB_PATH = os.path.join(PROJECT_ROOT, 'database', 'system.db')
SCHOOL_DB_PATH = os.path.join(PROJECT_ROOT, 'database', 'school_1.db')

print(f"🔧 Corrigindo banco em: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)

# Deletar Fernandos incorretos (com ponto)
conn.execute("DELETE FROM guardians WHERE email LIKE 'fernando%'")

# Criar Fernando correto
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

cursor = conn.cursor()
cursor.execute('''
INSERT INTO guardians (email, password, name, phone)
VALUES (?, ?, ?, ?)
''', ('fernando@email.com', hashed, 'Fernando', '11988888888'))
new_id = cursor.lastrowid

conn.commit()
conn.close()

print(f"✅ Usuário 'fernando@email.com' criado com ID: {new_id}")

# Vincular ao aluno no banco da escola
print(f"🔧 Atualizando vínculo em: {SCHOOL_DB_PATH}")
school_conn = sqlite3.connect(SCHOOL_DB_PATH)
school_conn.execute("DELETE FROM student_guardians WHERE guardian_id IN (SELECT id FROM guardians WHERE email LIKE 'fernando%')") # Limpar vínculos antigos (se possível)
# Como não temos acesso cross-database aqui fácil, vamos assumir que queremos vincular o ID novo ao aluno 1
school_conn.execute("DELETE FROM student_guardians WHERE student_id = 1")
school_conn.execute("INSERT INTO student_guardians (student_id, guardian_id) VALUES (1, ?)", (new_id,))
school_conn.commit()
school_conn.close()

print("✅ Vínculo atualizado com sucesso!")
print("🚀 TENTE FAZER LOGIN AGORA!")
