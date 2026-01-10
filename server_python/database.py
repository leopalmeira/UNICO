import sqlite3
import os
from flask import g

# Caminhos dos bancos de dados
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(BASE_DIR, 'database')
SYSTEM_DB_PATH = os.path.join(DB_DIR, 'system.db')

def get_system_db():
    db = getattr(g, '_system_db', None)
    if db is None:
        if not os.path.exists(DB_DIR):
            os.makedirs(DB_DIR)
        db = g._system_db = sqlite3.connect(SYSTEM_DB_PATH)
        db.row_factory = sqlite3.Row
    return db

def get_school_db(school_id):
    # Não usamos 'g' aqui para permitir múltiplas conexões diferentes se necessário, 
    # ou podemos cachear por school_id se performance for crítica.
    # Por simplicidade, abrimos nova conexão.
    db_path = os.path.join(DB_DIR, f'school_{school_id}.db')
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    # Sempre inicializar para garantir que todas as tabelas existem
    init_school_db(conn)
        
    return conn


def init_system_db():
    conn = sqlite3.connect(SYSTEM_DB_PATH)
    cur = conn.cursor()
    
    # Recriar estrutura baseada no sistema Node.js
    cur.execute('''
    CREATE TABLE IF NOT EXISTS super_admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT
    )''')
    
    cur.execute('''
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
    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        subject TEXT,
        school_id INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS guardians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        phone TEXT
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS inspectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS representatives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        commission_rate REAL
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS cameras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER,
        camera_name TEXT,
        camera_purpose TEXT,
        camera_ip TEXT,
        camera_url TEXT,
        camera_port TEXT,
        camera_username TEXT,
        camera_password TEXT,
        notes TEXT,
        status TEXT DEFAULT 'active'
    )''')


    cur.execute('''
    CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        user_type TEXT,
        user_id INTEGER,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS support_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER,
        school_id INTEGER,
        user_type TEXT,
        user_id INTEGER,
        message TEXT,
        timestamp DATETIME,
        is_internal INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(ticket_id) REFERENCES support_tickets(id)
    )''')

    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS camera_removal_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id INTEGER,
        school_id INTEGER,
        requester_type TEXT,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS whatsapp_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER,
        student_id INTEGER,
        phone TEXT,
        message_type TEXT,
        sent_at DATETIME,
        status TEXT
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS school_affiliates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_school_id INTEGER,
        affiliate_school_id INTEGER,
        token TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(parent_school_id) REFERENCES schools(id),
        FOREIGN KEY(affiliate_school_id) REFERENCES schools(id)
    )''')

    # Migração: adicionar CNPJ em escolas existentes
    try:
        cur.execute("ALTER TABLE schools ADD COLUMN cnpj TEXT")
    except:
        pass  # Coluna já existe

    conn.commit()
    conn.close()

def init_school_db(conn):
    cur = conn.cursor()
    
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
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        timestamp DATETIME,
        type TEXT,
        FOREIGN KEY(student_id) REFERENCES students(id)
    )''')
    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS teacher_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER,
        class_id INTEGER
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS teacher_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER,
        teacher_id INTEGER,
        sender_type TEXT,
        message TEXT,
        read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    
    cur.execute('''
    CREATE TABLE IF NOT EXISTS student_guardians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        guardian_id INTEGER,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS face_descriptors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        descriptor TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS pickup_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        guardian_id INTEGER,
        status TEXT DEFAULT 'waiting',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        role TEXT,
        photo_url TEXT,
        face_descriptor TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS employee_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER,
        timestamp DATETIME,
        FOREIGN KEY(employee_id) REFERENCES employees(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        event_date DATE,
        cost REAL,
        class_name TEXT,
        pix_key TEXT,
        payment_deadline DATE,
        type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS event_participations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        student_id INTEGER,
        status TEXT,
        receipt_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(event_id) REFERENCES events(id),
        FOREIGN KEY(student_id) REFERENCES students(id)
    )''')
    
    # Migrações automáticas para garantir colunas em bancos existentes
    updates = [
        "ALTER TABLE events ADD COLUMN event_date DATE",
        "ALTER TABLE events ADD COLUMN cost REAL",
        "ALTER TABLE events ADD COLUMN class_name TEXT",
        "ALTER TABLE events ADD COLUMN pix_key TEXT",
        "ALTER TABLE events ADD COLUMN payment_deadline DATE",
        "ALTER TABLE events ADD COLUMN type TEXT",
        "ALTER TABLE students ADD COLUMN face_descriptor TEXT",
        "ALTER TABLE event_participations ADD COLUMN receipt_url TEXT"
    ]
    for cmd in updates:
        try:
            cur.execute(cmd)
        except:
            pass
            
    # Garantir compatibilidade com versões antigas (se existirem colunas antigas target_type, target_id)
    # Não removemos colunas no SQLite facilmente, então deixamos lá se existirem.

    cur.execute('''
    CREATE TABLE IF NOT EXISTS event_participations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        student_id INTEGER,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY(event_id) REFERENCES events(id),
        FOREIGN KEY(student_id) REFERENCES students(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        school_id INTEGER,
        sender_type TEXT, 
        sender_id INTEGER,
        message_type TEXT DEFAULT 'text',
        content TEXT,
        file_url TEXT,
        file_name TEXT,
        read INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES students(id)
    )''')

    # Migração para garantir que a tabela exista em bancos antigos que tinham a tabela 'messages' simples
    try:
        cur.execute("ALTER TABLE chat_messages ADD COLUMN read INTEGER DEFAULT 0")
    except: pass

    conn.commit()
