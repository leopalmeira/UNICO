import sqlite3
import bcrypt

conn = sqlite3.connect('database/system.db')

# Deletar Fernando antigo se existir
conn.execute('DELETE FROM guardians WHERE email = ?', ('fernando@email.com',))

# Criar Fernando com email correto
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

conn.execute('''
INSERT INTO guardians (email, password, name, phone)
VALUES (?, ?, ?, ?)
''', ('fernando@email.com', hashed, 'Fernando', '11988888888'))

conn.commit()

# Vincular ao aluno
school_conn = sqlite3.connect('database/school_1.db')
fernando_id = conn.execute('SELECT id FROM guardians WHERE email = ?', ('fernando@email.com',)).fetchone()[0]

# Verificar se já existe vínculo
existing = school_conn.execute('SELECT 1 FROM student_guardians WHERE student_id = 1 AND guardian_id = ?', (fernando_id,)).fetchone()
if not existing:
    school_conn.execute('INSERT INTO student_guardians (student_id, guardian_id) VALUES (1, ?)', (fernando_id,))
    school_conn.commit()

school_conn.close()
conn.close()

print("✅ Fernando criado com sucesso!")
print(f"📧 Email: fernando@email.com")
print(f"🔑 Senha: 123456")
print(f"👤 ID: {fernando_id}")
