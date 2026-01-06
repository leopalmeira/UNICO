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
    
    # Inicializa se não existir
    new_db = False
    if not os.path.exists(db_path):
        new_db = True
        
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    if new_db:
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
        address TEXT,
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
        user_type TEXT,
        user_id INTEGER,
        message TEXT,
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

    conn.commit()
