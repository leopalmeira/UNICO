const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../database');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR);
}

const systemDBPath = path.join(DB_DIR, 'system.db');
const systemDB = new Database(systemDBPath);

// Initialize System DB with ALL tables
function initSystemDB() {
  systemDB.exec(`
    -- Super Admins
    CREATE TABLE IF NOT EXISTS super_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Schools
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      address TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Teachers (Global pool)
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      subject TEXT,
      school_id INTEGER DEFAULT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    -- Representatives
    CREATE TABLE IF NOT EXISTS representatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      commission_rate REAL DEFAULT 10.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Technicians
    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Installation Rates (for technicians)
    CREATE TABLE IF NOT EXISTS installation_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cameras_count INTEGER NOT NULL UNIQUE,
      rate REAL NOT NULL
    );

    -- School Visits (for representatives)
    CREATE TABLE IF NOT EXISTS school_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_id INTEGER NOT NULL,
      school_name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      status TEXT,
      notes TEXT,
      next_steps TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (representative_id) REFERENCES representatives(id)
    );

    -- Representative Schools (schools linked to representatives)
    CREATE TABLE IF NOT EXISTS representative_schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_id INTEGER NOT NULL,
      school_id INTEGER NOT NULL,
      linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (representative_id) REFERENCES representatives(id),
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    -- Support Tickets (atualizado)
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT,
      category TEXT DEFAULT 'geral',
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      resolved_by INTEGER,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ticket Messages
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    );

    -- Messages (for school-teacher communication)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_type TEXT NOT NULL,
      from_user_id INTEGER NOT NULL,
      to_user_type TEXT NOT NULL,
      to_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      read_status INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Guardians/Responsáveis (Global)
    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      fcm_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default installation rates if not exists
  const ratesCount = systemDB.prepare('SELECT COUNT(*) as count FROM installation_rates').get().count;
  if (ratesCount === 0) {
    systemDB.prepare('INSERT INTO installation_rates (cameras_count, rate) VALUES (?, ?)').run(3, 250);
    systemDB.prepare('INSERT INTO installation_rates (cameras_count, rate) VALUES (?, ?)').run(4, 310);
    systemDB.prepare('INSERT INTO installation_rates (cameras_count, rate) VALUES (?, ?)').run(5, 380);
  }
}

function getSystemDB() {
  return systemDB;
}

// Initialize School-specific DB
function getSchoolDB(schoolId) {
  const dbPath = path.join(DB_DIR, `school_${schoolId}.db`);
  const db = new Database(dbPath);

  db.exec(`
    -- Classes/Turmas
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Teacher-Class Assignment
    CREATE TABLE IF NOT EXISTS teacher_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    -- Students
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_email TEXT,
      phone TEXT,
      photo_url TEXT,
      class_name TEXT,
      age INTEGER,
      face_descriptor TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Face Descriptors (separate table for better performance)
    CREATE TABLE IF NOT EXISTS face_descriptors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL UNIQUE,
      descriptor TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Cameras
    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_name TEXT,
      ip TEXT,
      url TEXT,
      class_id INTEGER,
      status TEXT DEFAULT 'offline',
      installed_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    -- Monitoring Sessions
    CREATE TABLE IF NOT EXISTS monitoring_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    -- Student Attention Data
    CREATE TABLE IF NOT EXISTS student_attention (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      attention_level REAL,
      focus_level REAL,
      distraction_level REAL,
      emotions TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (session_id) REFERENCES monitoring_sessions(id)
    );

    -- Interactive Questions
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Question Responses (student answers)
    CREATE TABLE IF NOT EXISTS question_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      is_correct INTEGER DEFAULT 0,
      responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Seating Arrangements
    CREATE TABLE IF NOT EXISTS seating_arrangements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      position_x INTEGER,
      position_y INTEGER,
      period_start DATE,
      period_end DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Exams/Provas
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      total_points REAL NOT NULL,
      answer_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Exam Results
    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      score REAL,
      answers TEXT,
      graded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exams(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Student Reports (15-day reports)
    CREATE TABLE IF NOT EXISTS student_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      avg_attention REAL,
      avg_focus REAL,
      avg_distraction REAL,
      subjects_performance TEXT,
      recommendations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Attendance (facial recognition entry/exit)
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('entry', 'exit')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- WhatsApp Notifications Log (para evitar duplicatas)
    CREATE TABLE IF NOT EXISTS whatsapp_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      notification_type TEXT NOT NULL CHECK(notification_type IN ('arrival', 'departure')),
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      phone TEXT,
      success INTEGER DEFAULT 1,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Index para busca rápida de notificações do dia
    CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_date 
    ON whatsapp_notifications(student_id, notification_type, date(sent_at));

    -- Polls/Enquetes
    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );

    -- Poll Responses
    CREATE TABLE IF NOT EXISTS poll_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      is_correct INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (poll_id) REFERENCES polls(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Emotion Logs (6 emoções básicas)
    CREATE TABLE IF NOT EXISTS emotion_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      emotion TEXT NOT NULL CHECK(emotion IN ('feliz', 'triste', 'raiva', 'medo', 'surpresa', 'nojo', 'neutro')),
      confidence REAL DEFAULT 1.0,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Behavioral Alerts (possíveis distúrbios)
    CREATE TABLE IF NOT EXISTS behavioral_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high')),
      notes TEXT,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Seating Arrangements Update (adicionar campo position)
    CREATE TABLE IF NOT EXISTS seating_arrangements_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      position INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- Employees (Funcionários)
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      photo_url TEXT,
      face_descriptor TEXT,
      work_start_time TEXT DEFAULT '08:00',
      work_end_time TEXT DEFAULT '17:00',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Employee Attendance (Ponto Biométrico)
    CREATE TABLE IF NOT EXISTS employee_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    -- Student Guardians (Vínculo Aluno-Responsável)
    CREATE TABLE IF NOT EXISTS student_guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      guardian_id INTEGER NOT NULL,
      relationship TEXT DEFAULT 'Responsável',
      status TEXT DEFAULT 'active',
      linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Access Logs para Notificações do App (Guardian)
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      notified_guardian INTEGER DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- Índices para melhor performance
    CREATE INDEX IF NOT EXISTS idx_employee_attendance_date 
    ON employee_attendance(date(timestamp));
    
    CREATE INDEX IF NOT EXISTS idx_employee_attendance_employee 
    ON employee_attendance(employee_id);

    CREATE INDEX IF NOT EXISTS idx_student_guardians_student
    ON student_guardians(student_id);

    CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian
    ON student_guardians(guardian_id);

    CREATE INDEX IF NOT EXISTS idx_access_logs_notified
    ON access_logs(notified_guardian);

    -- Tabela de Mensagens (Chat Responsável <-> Escola)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_type TEXT CHECK( sender_type IN ('school','guardian') ) NOT NULL,
      sender_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      content TEXT,
      message_type TEXT DEFAULT 'text', -- text, audio, image, file
      file_url TEXT,
      file_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_student
    ON messages(student_id);

    CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at);

    -- Tabela de Eventos e Avisos
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATETIME, -- Data do evento
      cost REAL, -- Custo
      type TEXT DEFAULT 'event', -- 'event' ou 'notice'
      class_name TEXT, -- Turma específica ou NULL para todas
      pix_key TEXT, -- Chave Pix para pagamento
      payment_deadline DATE, -- Data limite para pagamento
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Participação em Eventos (Confirmação/Pagamento)
    CREATE TABLE IF NOT EXISTS event_participations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, confirmed, paid
      payment_proof_url TEXT,
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);

  return db;
}

module.exports = {
  initSystemDB,
  getSystemDB,
  getSchoolDB
};
