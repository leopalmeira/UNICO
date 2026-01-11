import sqlite3
import bcrypt

# Criar responsável no sistema
sys_conn = sqlite3.connect('database/system.db')
sys_cur = sys_conn.cursor()

# Criar responsável
email = 'responsavel@email.com'
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

sys_cur.execute('''
INSERT OR IGNORE INTO guardians (email, password, name, phone)
VALUES (?, ?, ?, ?)
''', (email, hashed, 'Responsável Teste', '11999999999'))

sys_conn.commit()

# Pegar ID do responsável
guardian = sys_cur.execute('SELECT id FROM guardians WHERE email = ?', (email,)).fetchone()
guardian_id = guardian[0]

sys_conn.close()

# Atualizar vínculo no banco da escola
school_conn = sqlite3.connect('database/school_1.db')
school_cur = school_conn.cursor()

# Atualizar vínculo
school_cur.execute('DELETE FROM student_guardians')
school_cur.execute('''
INSERT INTO student_guardians (student_id, guardian_id)
VALUES (?, ?)
''', (1, guardian_id))

school_conn.commit()
school_conn.close()

print(f"✅ Responsável criado!")
print(f"   Email: {email}")
print(f"   Senha: {password}")
print(f"   ID: {guardian_id}")
print(f"   Aluno vinculado: LEANDRO PALMEIRA DE SOUZA")
