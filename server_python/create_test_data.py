import sqlite3
import os
from datetime import datetime, timedelta

# Criar diretório se não existir
db_dir = 'database'
if not os.path.exists(db_dir):
    os.makedirs(db_dir)

# Conectar ao banco da escola 1
db_path = os.path.join(db_dir, 'school_1.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Criar tabelas necessárias
cur.execute('''
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

cur.execute('''
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    event_type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    notified_guardian INTEGER DEFAULT 0
)''')

cur.execute('''
CREATE TABLE IF NOT EXISTS student_guardians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    guardian_id INTEGER,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')

# Inserir aluno de teste
cur.execute('''
INSERT INTO students (name, parent_email, phone, class_name, age)
VALUES (?, ?, ?, ?, ?)
''', ('LEANDRO PALMEIRA DE SOUZA', 'responsavel@email.com', '11999999999', '5º ANO A', 10))

student_id = cur.lastrowid
print(f"Aluno criado com ID: {student_id}")

# Criar registros de presença para janeiro de 2026
# Dias úteis com presença
current_date = datetime(2026, 1, 2)  # Quinta-feira
end_date = datetime(2026, 1, 11)  # Hoje

while current_date <= end_date:
    # Pular finais de semana
    if current_date.weekday() < 5:  # 0-4 = seg-sex
        # Registro de entrada (arrival)
        arrival_time = current_date.replace(hour=7, minute=30)
        cur.execute('''
        INSERT INTO access_logs (student_id, event_type, timestamp)
        VALUES (?, ?, ?)
        ''', (student_id, 'arrival', arrival_time.isoformat()))
        
        # Registro de saída (departure)
        departure_time = current_date.replace(hour=17, minute=0)
        cur.execute('''
        INSERT INTO access_logs (student_id, event_type, timestamp)
        VALUES (?, ?, ?)
        ''', (student_id, 'departure', departure_time.isoformat()))
        
        print(f"Presença registrada: {current_date.strftime('%d/%m/%Y')}")
    
    current_date += timedelta(days=1)

# Vincular ao responsável (assumindo guardian_id = 1)
cur.execute('''
INSERT INTO student_guardians (student_id, guardian_id)
VALUES (?, ?)
''', (student_id, 1))

conn.commit()
conn.close()

print("\n✅ Dados de teste criados com sucesso!")
print(f"- 1 aluno cadastrado")
print(f"- Presenças de 02/01 a 11/01/2026 (dias úteis)")
print(f"- Vinculado ao responsável ID 1")
