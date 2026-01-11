import sqlite3
import bcrypt
import os
from datetime import datetime, timedelta

# Criar diretório
os.makedirs('database', exist_ok=True)

# ===== CRIAR BANCO DO SISTEMA =====
print("1. Criando banco do sistema...")
sys_conn = sqlite3.connect('database/system.db')
sys_cur = sys_conn.cursor()

sys_cur.execute('''
CREATE TABLE IF NOT EXISTS guardians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')

sys_cur.execute('''
CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    admin_name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    cnpj TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')

# Criar escola de teste
sys_cur.execute('''
INSERT OR IGNORE INTO schools (id, name, email, password)
VALUES (1, 'Escola Teste', 'escola@email.com', '123456')
''')

# Criar responsável
email = 'responsavel@email.com'
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

sys_cur.execute('''
INSERT OR REPLACE INTO guardians (id, email, password, name, phone)
VALUES (1, ?, ?, ?, ?)
''', (email, hashed, 'Responsável Teste', '11999999999'))

sys_conn.commit()
sys_conn.close()

print("✅ Sistema criado!")

# ===== CRIAR BANCO DA ESCOLA =====
print("\n2. Criando banco da escola...")
school_conn = sqlite3.connect('database/school_1.db')
school_cur = school_conn.cursor()

school_cur.execute('''
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    parent_email TEXT,
    phone TEXT,
    photo_url TEXT,
    class_name TEXT,
    age INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')

school_cur.execute('''
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    event_type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    notified_guardian INTEGER DEFAULT 0
)''')

school_cur.execute('''
CREATE TABLE IF NOT EXISTS student_guardians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    guardian_id INTEGER,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')

# Inserir aluno
school_cur.execute('''
INSERT OR REPLACE INTO students (id, name, parent_email, phone, class_name, age)
VALUES (1, ?, ?, ?, ?, ?)
''', ('LEANDRO PALMEIRA DE SOUZA', email, '11999999999', '5º ANO A', 10))

# Limpar registros antigos
school_cur.execute('DELETE FROM access_logs')
school_cur.execute('DELETE FROM student_guardians')

# Criar registros de presença (apenas dias úteis de janeiro/2026)
current_date = datetime(2026, 1, 2)  # Quinta
end_date = datetime(2026, 1, 10)  # Sexta

presencas = 0
while current_date <= end_date:
    if current_date.weekday() < 5:  # Seg-Sex
        arrival = current_date.replace(hour=7, minute=30)
        school_cur.execute('''
        INSERT INTO access_logs (student_id, event_type, timestamp)
        VALUES (1, 'arrival', ?)
        ''', (arrival.isoformat(),))
        presencas += 1
    current_date += timedelta(days=1)

# Vincular ao responsável
school_cur.execute('''
INSERT INTO student_guardians (student_id, guardian_id)
VALUES (1, 1)
''')

school_conn.commit()
school_conn.close()

print(f"✅ Escola criada com {presencas} presenças!")

print("\n" + "="*50)
print("🎉 DADOS DE TESTE CRIADOS COM SUCESSO!")
print("="*50)
print(f"\n📧 Email: {email}")
print(f"🔑 Senha: {password}")
print(f"👤 Aluno: LEANDRO PALMEIRA DE SOUZA")
print(f"📅 Presenças: {presencas} dias (02/01 a 10/01/2026)")
print(f"\n🌐 Acesse: http://localhost:3001")
print("="*50)
