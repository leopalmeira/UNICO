from database import init_system_db, init_school_db, get_school_db
import sqlite3
import bcrypt

# Inicializar sistema
print("Inicializando banco do sistema...")
init_system_db()

# Criar responsável
print("Criando responsável...")
sys_conn = sqlite3.connect('database/system.db')
email = 'responsavel@email.com'
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

sys_conn.execute('''
INSERT INTO guardians (email, password, name, phone)
VALUES (?, ?, ?, ?)
''', (email, hashed, 'Responsável Teste', '11999999999'))
sys_conn.commit()

guardian_id = sys_conn.execute('SELECT id FROM guardians WHERE email = ?', (email,)).fetchone()[0]
sys_conn.close()

# Inicializar banco da escola
print("Inicializando banco da escola...")
school_db = get_school_db(1)
school_db.close()

# Atualizar vínculo
print("Vinculando aluno ao responsável...")
school_conn = sqlite3.connect('database/school_1.db')
school_conn.execute('UPDATE student_guardians SET guardian_id = ? WHERE student_id = 1', (guardian_id,))
school_conn.commit()
school_conn.close()

print(f"\n✅ Tudo pronto!")
print(f"📧 Email: {email}")
print(f"🔑 Senha: {password}")
print(f"👤 Guardian ID: {guardian_id}")
print(f"\n🎯 Agora faça login no app com essas credenciais!")
