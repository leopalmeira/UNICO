import sqlite3
import bcrypt

# Conectar ao banco do sistema
sys_conn = sqlite3.connect('database/system.db')

# Criar responsável Fernando
email = 'fernando@email.com'
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

sys_conn.execute('''
INSERT OR REPLACE INTO guardians (id, email, password, name, phone)
VALUES (2, ?, ?, ?, ?)
''', (email, hashed, 'Fernando', '11988888888'))

sys_conn.commit()

# Vincular ao mesmo aluno (LEANDRO)
school_conn = sqlite3.connect('database/school_1.db')
school_conn.execute('''
INSERT INTO student_guardians (student_id, guardian_id)
VALUES (1, 2)
''')
school_conn.commit()
school_conn.close()
sys_conn.close()

print("✅ Responsável Fernando criado!")
print(f"📧 Email: {email}")
print(f"🔑 Senha: {password}")
print(f"👤 Aluno vinculado: LEANDRO PALMEIRA DE SOUZA")
