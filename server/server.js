
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initSystemDB, getSystemDB, getSchoolDB } = require('./db');
const nodemailer = require('nodemailer');
const { getWhatsAppService } = require('./whatsapp-service');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); // Added for Chat
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Serve uploads folder for chat files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const SECRET_KEY = process.env.SECRET_KEY || 'edufocus_secret_key_change_me';

// Middleware para logar todas as requisições - DEBUG
app.use((req, res, next) => {
    if (req.method === 'PUT' || req.method === 'DELETE') {
        console.log(`[DEBUG] ${req.method} ${req.originalUrl}`);
    }
    next();
});

// --- AUTO-RECONNECT WHATSAPP ON BOOT ---
async function reconnectWhatsAppSessions() {
    // WhatsApp ativado em produção
    if (process.env.NODE_ENV === 'production') {
        console.log('✅ WhatsApp ativado em produção (Render)');
        // return;  <-- Permitir execução
    }

    const authBasePath = path.join(__dirname, 'whatsapp-auth');
    if (fs.existsSync(authBasePath)) {
        const folders = fs.readdirSync(authBasePath);
        for (const folder of folders) {
            if (folder.startsWith('school-')) {
                const schoolId = folder.split('-')[1];
                console.log(`🔄 Reiniciando WhatsApp para Escola ${schoolId}...`);
                const service = getWhatsAppService(schoolId);
                await service.initialize();
            }
        }
    }
}

// Tentar importar seed opcionalmente
let seedFunc = null;
try {
    const seedModule = require('./seed');
    seedFunc = seedModule.seed;
} catch (e) {
    console.log('⚠️ Seed module not found or failed to load. Skipping automatic seeding.');
}

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origem (como apps mobile ou curl) ou qualquer origem do navegador
        // Isso resolve o problema de CORS com credentials: true
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- AUTOMATIC CLEANUP ---
// Limpar registros de presença com mais de 7 dias
function cleanupOldAttendance() {
    try {
        const db = getSystemDB();
        // Obter lista de todas as escolas
        const schools = db.prepare('SELECT id FROM schools').all();

        let totalDeleted = 0;
        schools.forEach(school => {
            const schoolDB = getSchoolDB(school.id);
            const result = schoolDB.prepare(`
                DELETE FROM attendance 
                WHERE datetime(timestamp) < datetime('now', '-7 days')
            `).run();
            totalDeleted += result.changes;
        });

        if (totalDeleted > 0) {
            console.log(`🗑️  Limpeza automática: ${totalDeleted} registros de presença removidos (>7 dias)`);
        }
    } catch (err) {
        console.error('Erro na limpeza automática:', err);
    }
}

// Executar limpeza ao iniciar o servidor
cleanupOldAttendance();

// Executar limpeza diariamente (a cada 24 horas)
setInterval(cleanupOldAttendance, 24 * 60 * 60 * 1000);


// --- AUTH ROUTES ---
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const db = getSystemDB();

    try {
        // 1. Procurar usuário
        let user = null;
        let table = '';

        // Check Super Admin
        user = db.prepare('SELECT * FROM super_admin WHERE email = ?').get(email);
        if (user) { table = 'super_admin'; }

        // Check Schools
        if (!user) {
            user = db.prepare('SELECT * FROM schools WHERE email = ?').get(email);
            if (user) { table = 'schools'; }
        }

        // Check Teachers
        if (!user) {
            user = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email);
            if (user) { table = 'teachers'; }
        }

        if (!user) {
            return res.status(404).json({ message: 'E-mail não encontrado no sistema.' });
        }

        // 2. Gerar nova senha
        const newPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Atualizar no banco
        db.prepare(`UPDATE ${table} SET password = ? WHERE id = ?`).run(hashedPassword, user.id);

        // 4. Configurar Transporter (Real ou Teste)
        let transporter;
        let isTest = false;

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });
        } else {
            // Criar conta de teste no Ethereal
            isTest = true;
            try {
                const testAccount = await nodemailer.createTestAccount();
                transporter = nodemailer.createTransport({
                    host: "smtp.ethereal.email",
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass,
                    },
                });
            } catch (etherealError) {
                console.error('Erro ao criar conta Ethereal:', etherealError);
                // Fallback final: apenas logar
                console.log('================================================');
                console.log(`[SIMULAÇÃO DE E-MAIL] Para: ${email}`);
                console.log(`Nova Senha: ${newPassword}`);
                console.log('================================================');
                return res.json({ message: 'Senha resetada. Verifique o console do servidor (Ethereal falhou).' });
            }
        }

        const mailOptions = {
            from: process.env.EMAIL_USER || '"EduFocus Support" <support@edufocus.com>',
            to: email,
            subject: 'Recuperação de Senha - EduFocus',
            text: `Olá, ${user.name || 'Usuário'}.\n\nSua senha foi redefinida com sucesso.\n\nNova Senha: ${newPassword}\n\nPor favor, faça login e altere sua senha imediatamente.`
        };

        const info = await transporter.sendMail(mailOptions);

        if (isTest) {
            console.log('Message sent: %s', info.messageId);
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
            res.json({
                message: 'Senha resetada (Modo Teste). Verifique o link abaixo.',
                previewUrl: nodemailer.getTestMessageUrl(info),
                tempPassword: newPassword
            });
        } else {
            res.json({ message: 'Nova senha enviada para seu e-mail.' });
        }

    } catch (err) {
        console.error('Erro detalhado ao resetar senha:', err);
        res.status(500).json({ message: `Erro interno: ${err.message}` });
    }
});

// Initialize DB
try {
    initSystemDB();
    console.log('Database initialized successfully');

    // Migration: Add face_descriptor if not exists
    const schools = getSystemDB().prepare('SELECT * FROM schools').all();
    for (const school of schools) {
        try {
            const schoolDB = getSchoolDB(school.id);
            const tableInfo = schoolDB.prepare("PRAGMA table_info(students)").all();
            const hasFaceDescriptor = tableInfo.some(col => col.name === 'face_descriptor');
            const hasClassName = tableInfo.some(col => col.name === 'class_name');
            const hasAge = tableInfo.some(col => col.name === 'age');

            if (!hasFaceDescriptor) {
                console.log(`Migrating DB for school ${school.name}: Adding face_descriptor`);
                schoolDB.prepare("ALTER TABLE students ADD COLUMN face_descriptor TEXT").run();
            }
            if (!hasClassName) {
                console.log(`Migrating DB for school ${school.name}: Adding class_name`);
                schoolDB.prepare("ALTER TABLE students ADD COLUMN class_name TEXT").run();
            }
            if (!hasAge) {
                console.log(`Migrating DB for school ${school.name}: Adding age`);
                schoolDB.prepare("ALTER TABLE students ADD COLUMN age INTEGER").run();
            }
        } catch (err) {
            console.error(`Error migrating school ${school.id}:`, err);
        }
    }
} catch (error) {
    console.error('Error initializing database:', error);
}

// Middleware to verify token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const db = getSystemDB();

    // Check Super Admin
    let user = db.prepare('SELECT * FROM super_admins WHERE email = ?').get(email);
    let role = 'super_admin';

    if (!user) {
        // Check Schools
        user = db.prepare('SELECT * FROM schools WHERE email = ?').get(email);
        role = 'school_admin';
    }

    if (!user) {
        // Check Teachers
        user = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email);
        role = 'teacher';
    }

    if (!user) {
        // Check Representatives
        user = db.prepare('SELECT * FROM representatives WHERE email = ?').get(email);
        role = 'representative';
    }

    if (!user) {
        // Check Technicians
        user = db.prepare('SELECT * FROM technicians WHERE email = ?').get(email);
        role = 'technician';
    }

    if (!user) {
        return res.status(400).json({ message: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role, school_id: user.school_id || user.id }, SECRET_KEY);
    res.json({ token, role, user });
});

app.post('/api/register/teacher', async (req, res) => {
    const { name, email, password, subject } = req.body;
    const db = getSystemDB();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO teachers (name, email, password, subject) VALUES (?, ?, ?, ?)').run(name, email, hashedPassword, subject);
        res.json({ message: 'Teacher registered successfully. Wait for school linkage.' });
    } catch (err) {
        res.status(400).json({ message: 'Email already exists' });
    }
});

app.post('/api/register/school', async (req, res) => {
    const { name, admin_name, email, password, address } = req.body;
    const db = getSystemDB();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const info = db.prepare('INSERT INTO schools (name, admin_name, email, password, address) VALUES (?, ?, ?, ?, ?)').run(name, admin_name, email, hashedPassword, address);
        // Initialize School DB
        getSchoolDB(info.lastInsertRowid);
        res.json({ message: 'School registered successfully.' });
    } catch (err) {
        res.status(400).json({ message: 'Email already exists' });
    }
});

// --- ATTENDANCE ROUTES (PRESENÇA) ---

// Registrar chegada do aluno
app.post('/api/attendance/arrival', authenticateToken, async (req, res) => {
    try {
        const { student_id } = req.body;
        const schoolId = req.user.school_id || req.user.id;
        const schoolDB = getSchoolDB(schoolId);
        const systemDB = getSystemDB();

        // Buscar dados do aluno
        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
        if (!student) {
            return res.status(404).json({ message: 'Aluno não encontrado' });
        }

        // Buscar nome da escola
        const school = systemDB.prepare('SELECT name FROM schools WHERE id = ?').get(schoolId);
        const schoolName = school?.name || 'Escola';

        // Registrar presença
        const timestamp = new Date().toISOString();
        schoolDB.prepare(`
            INSERT INTO attendance (student_id, timestamp, type)
            VALUES (?, ?, 'arrival')
        `).run(student_id, timestamp);

        // Enviar notificação WhatsApp
        if (student.phone) {
            const whatsappService = getWhatsAppService(schoolId);
            const result = await whatsappService.sendArrivalNotification(
                {
                    name: student.name,
                    phone: student.phone,
                    class_name: student.class_name
                },
                schoolName,
                new Date(timestamp)
            );

            if (result.success) {
                // Registrar envio no banco
                systemDB.prepare(`
                    INSERT INTO whatsapp_notifications (school_id, student_id, phone, message_type, sent_at, status)
                    VALUES (?, ?, ?, 'arrival', ?, 'sent')
                `).run(schoolId, student_id, student.phone, timestamp);
            }
        }

        res.json({
            success: true,
            message: 'Presença registrada com sucesso',
            student: student.name,
            timestamp
        });

    } catch (error) {
        console.error('Erro ao registrar presença:', error);
        res.status(500).json({ message: 'Erro ao registrar presença', error: error.message });
    }
});

// Registrar saída do aluno
app.post('/api/attendance/departure', authenticateToken, async (req, res) => {
    try {
        const { student_id } = req.body;
        const schoolId = req.user.school_id || req.user.id;
        const schoolDB = getSchoolDB(schoolId);
        const systemDB = getSystemDB();

        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
        if (!student) {
            return res.status(404).json({ message: 'Aluno não encontrado' });
        }

        const school = systemDB.prepare('SELECT name FROM schools WHERE id = ?').get(schoolId);
        const schoolName = school?.name || 'Escola';

        const timestamp = new Date().toISOString();
        schoolDB.prepare(`
            INSERT INTO attendance (student_id, timestamp, type)
            VALUES (?, ?, 'departure')
        `).run(student_id, timestamp);

        // Enviar notificação WhatsApp
        if (student.phone) {
            const whatsappService = getWhatsAppService(schoolId);
            await whatsappService.sendDepartureNotification(
                {
                    name: student.name,
                    phone: student.phone,
                    class_name: student.class_name
                },
                schoolName,
                new Date(timestamp)
            );
        }

        res.json({
            success: true,
            message: 'Saída registrada com sucesso',
            student: student.name,
            timestamp
        });

    } catch (error) {
        console.error('Erro ao registrar saída:', error);
        res.status(500).json({ message: 'Erro ao registrar saída', error: error.message });
    }
});

// Listar presença mensal de um aluno
app.get('/api/attendance/monthly/:student_id', authenticateToken, (req, res) => {
    try {
        const { student_id } = req.params;
        const { month, year } = req.query;
        const schoolId = req.user.school_id || req.user.id;
        const schoolDB = getSchoolDB(schoolId);

        // Se não especificado, usar mês/ano atual
        const targetMonth = month || (new Date().getMonth() + 1);
        const targetYear = year || new Date().getFullYear();

        const attendance = schoolDB.prepare(`
            SELECT * FROM attendance 
            WHERE student_id = ? 
            AND strftime('%m', timestamp) = ?
            AND strftime('%Y', timestamp) = ?
            ORDER BY timestamp DESC
        `).all(student_id, String(targetMonth).padStart(2, '0'), String(targetYear));

        res.json({
            student_id,
            month: targetMonth,
            year: targetYear,
            records: attendance
        });

    } catch (error) {
        console.error('Erro ao buscar presença:', error);
        res.status(500).json({ message: 'Erro ao buscar presença', error: error.message });
    }
});

// Listar presença de todos os alunos de uma turma (para o professor)
app.get('/api/attendance/class/:class_id/today', authenticateToken, (req, res) => {
    try {
        const { class_id } = req.params;
        const schoolId = req.user.school_id || req.user.id;
        const schoolDB = getSchoolDB(schoolId);

        const today = new Date().toISOString().split('T')[0];

        const attendance = schoolDB.prepare(`
            SELECT 
                s.id,
                s.name,
                s.class_name,
                a.timestamp,
                a.type
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id 
                AND date(a.timestamp) = ?
            WHERE s.class_name = ?
            ORDER BY s.name
        `).all(today, class_id);

        res.json({
            class_id,
            date: today,
            students: attendance
        });

    } catch (error) {
        console.error('Erro ao buscar presença da turma:', error);
        res.status(500).json({ message: 'Erro ao buscar presença', error: error.message });
    }
});

// ROTA LEGADA para compatibilidade com AttendanceReport antigo
app.get('/school/:schoolId/attendance', authenticateToken, (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const schoolId = req.params.schoolId || req.user.school_id || req.user.id;
        const schoolDB = getSchoolDB(schoolId);

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'startDate e endDate são obrigatórios' });
        }

        const attendance = schoolDB.prepare(`
            SELECT 
                a.*,
                s.name as student_name,
                s.class_name
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE date(a.timestamp) >= date(?)
            AND date(a.timestamp) <= date(?)
            ORDER BY a.timestamp DESC
        `).all(startDate, endDate);

        res.json(attendance);

    } catch (error) {
        console.error('Erro ao buscar presença (rota legada):', error);
        res.status(500).json({ message: 'Erro ao buscar presença', error: error.message });
    }
});


// --- SUPER ADMIN ROUTES ---

app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const db = getSystemDB();

    const schoolsCount = db.prepare('SELECT COUNT(*) as count FROM schools').get().count;
    const teachersCount = db.prepare('SELECT COUNT(*) as count FROM teachers').get().count;
    const repsCount = db.prepare('SELECT COUNT(*) as count FROM representatives').get().count;

    res.json({ schoolsCount, teachersCount, repsCount });
});

app.get('/api/admin/schools', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const db = getSystemDB();
    const schools = db.prepare('SELECT * FROM schools').all();
    res.json(schools);
});

// Excluir escola
app.delete('/api/admin/schools/:id', authenticateToken, async (req, res) => {
    try {
        // Verificar role super_admin ou superadmin (para garantir)
        if (req.user.role !== 'super_admin' && req.user.role !== 'superadmin') return res.sendStatus(403);

        const { id } = req.params;
        const db = getSystemDB();

        console.log(`🗑️ [SUPER ADMIN] Solicitada exclusão da escola ID: ${id}`);

        // FORÇAR EXCLUSÃO IGNORANDO DEPENDÊNCIAS (Solução Definitiva)
        db.pragma('foreign_keys = OFF');

        // 1. Excluir do banco do sistema
        const result = db.prepare('DELETE FROM schools WHERE id = ?').run(id);

        // Reativar FK (importante para não quebrar outras coisas na mesma conexão se houver pool, mas no better-sqlite3 a conexão é por request neste caso ou global?) 
        // No código atual: const db = getSystemDB(); cria nova conexão ou reusa?
        // Se reusa, precisa reativar. Se cria nova, morre aqui.
        // getSystemDB normalmente cria new Database().

        if (result.changes === 0) {
            console.log(`❌ Escola ${id} não encontrada no banco do sistema.`);
            return res.status(404).json({ message: 'Escola não encontrada' });
        }

        console.log(`✅ Registro da escola removido do banco do sistema.`);

        // 2. Excluir arquivo do banco de dados da escola (se existir)
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(__dirname, `../database/school_${id}.db`);

        if (fs.existsSync(dbPath)) {
            try {
                fs.unlinkSync(dbPath);
                console.log(`🗑️ Arquivo de banco de dados excluído: ${dbPath}`);
            } catch (fileErr) {
                console.error(`⚠️ Erro ao excluir arquivo do banco da escola ${id}:`, fileErr.message);
            }
        } else {
            console.log(`ℹ️ Arquivo de banco de dados não encontrado: ${dbPath}`);
        }

        res.json({ message: 'Escola excluída com sucesso' });

    } catch (err) {
        console.error('Erro ao excluir escola:', err);
        res.status(500).json({ message: 'Erro ao excluir escola' });
    }
});

app.get('/api/admin/representatives', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const db = getSystemDB();
    const reps = db.prepare('SELECT * FROM representatives').all();
    res.json(reps);
});

app.post('/api/admin/representatives', authenticateToken, async (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { name, email, commission_rate } = req.body;
    const db = getSystemDB();

    try {
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO representatives (name, email, password, commission_rate) VALUES (?, ?, ?, ?)').run(name, email, hashedPassword, commission_rate);
        res.json({ message: 'Representative created', password });
    } catch (err) {
        res.status(400).json({ message: 'Email already exists' });
    }
});

// --- TECHNICIANS ROUTES ---

app.get('/api/admin/technicians', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const db = getSystemDB();
    const technicians = db.prepare('SELECT * FROM technicians').all();
    res.json(technicians);
});

app.post('/api/admin/technicians', authenticateToken, async (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { name, email, phone } = req.body;
    const db = getSystemDB();

    try {
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO technicians (name, email, phone, password) VALUES (?, ?, ?, ?)').run(name, email, phone, hashedPassword);
        res.json({ message: 'Technician created', password });
    } catch (err) {
        res.status(400).json({ message: 'Email already exists' });
    }
});

// --- SCHOOL ROUTES ---

app.get('/api/school/teachers', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const db = getSystemDB();
    const teachers = db.prepare('SELECT * FROM teachers WHERE school_id = ?').all(req.user.id);
    res.json(teachers);
});

app.get('/api/school/search-teacher', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { email } = req.query;
    const db = getSystemDB();

    const teacher = db.prepare('SELECT id, name, email, subject, status, school_id FROM teachers WHERE email = ?').get(email);
    if (!teacher) {
        return res.status(404).json({ message: 'Professor não encontrado no sistema' });
    }

    res.json(teacher);
});

app.post('/api/school/link-teacher', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { teacher_id, class_ids } = req.body;
    const db = getSystemDB();
    const schoolDB = getSchoolDB(req.user.id);

    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacher_id);
    if (!teacher) return res.status(404).json({ message: 'Professor não encontrado' });

    if (teacher.school_id && teacher.school_id !== req.user.id) {
        return res.status(400).json({ message: 'Professor já está vinculado a outra escola' });
    }

    try {
        // 1. Link to school in system DB
        db.prepare('UPDATE teachers SET school_id = ?, status = ? WHERE id = ?')
            .run(req.user.id, 'active', teacher_id);

        // 2. Assign classes in school DB
        if (class_ids && Array.isArray(class_ids)) {
            // Clear existing assignments first (optional, but good for updates)
            schoolDB.prepare('DELETE FROM teacher_classes WHERE teacher_id = ?').run(teacher_id);

            const insert = schoolDB.prepare('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)');
            const insertMany = schoolDB.transaction((classes) => {
                for (const classId of classes) insert.run(teacher_id, classId);
            });
            insertMany(class_ids);
        }

        res.json({ message: 'Professor vinculado com sucesso' });
    } catch (error) {
        console.error('Error linking teacher:', error);
        res.status(500).json({ error: 'Erro ao vincular professor' });
    }
});

app.post('/api/school/unlink-teacher', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { teacher_id } = req.body;
    const db = getSystemDB();

    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ? AND school_id = ?').get(teacher_id, req.user.id);
    if (!teacher) {
        return res.status(404).json({ message: 'Professor não encontrado ou não pertence a esta escola' });
    }

    db.prepare('UPDATE teachers SET school_id = NULL, status = ? WHERE id = ?').run('pending', teacher_id);
    res.json({ message: 'Professor desvinculado com sucesso' });
});

app.get('/api/school/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    // Join com face_descriptors para pegar os descritores
    const students = schoolDB.prepare(`
        SELECT 
            s.*,
            fd.descriptor as face_descriptor
        FROM students s
        LEFT JOIN face_descriptors fd ON s.id = fd.student_id
    `).all();

    res.json(students);
});

app.post('/api/school/students', authenticateToken, async (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, parent_email, phone, photo_url, class_name, age, face_descriptor } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log('\n\n\n🚨🚨🚨 REQUISIÇÃO RECEBIDA: CRIAR ALUNO 🚨🚨🚨');
        console.log('Dados:', {
            name,
            parent_email,
            has_photo: !!photo_url,
            has_descriptor: !!face_descriptor,
            descriptor_length: face_descriptor ? face_descriptor.length : 0
        });

        // 1. Inserir aluno na tabela students (SEM face_descriptor no campo antigo)
        const result = schoolDB.prepare(
            'INSERT INTO students (name, parent_email, phone, photo_url, class_name, age) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(name, parent_email, phone, photo_url, class_name || 'Sem turma', age);

        const studentId = result.lastInsertRowid;
        console.log(`✅ Aluno criado com ID: ${studentId}`);

        // 2. Se tem face_descriptor, salvar na tabela face_descriptors
        if (face_descriptor) {
            schoolDB.prepare(
                'INSERT INTO face_descriptors (student_id, descriptor) VALUES (?, ?)'
            ).run(studentId, face_descriptor);
            console.log(`✅ Descritor facial salvo para aluno ID: ${studentId}`);
        }

        // ==================================================================================
        // 3. AUTO-CADASTRO DE RESPONSÁVEL (SOLICITADO PELO USUÁRIO)
        // ==================================================================================
        console.log('🔍 Verificando parent_email:', parent_email);
        if (parent_email) {
            console.log('✅ parent_email existe! Iniciando processo de cadastro automático...');
            try {
                const systemDB = getSystemDB();

                // Verificar se responsável já existe no sistema global
                let guardian = systemDB.prepare('SELECT * FROM guardians WHERE email = ?').get(parent_email);
                let password = null;
                let isNewAccount = false;

                console.log('🔎 Guardian encontrado?', guardian ? 'SIM' : 'NÃO (vai criar novo)');

                if (!guardian) {
                    // Criar nova conta
                    isNewAccount = true;
                    password = Math.random().toString(36).slice(-8); // Senha aleatória de 8 chars
                    console.log('🔐 Senha gerada:', password);
                    const hashedPassword = await bcrypt.hash(password, 10);

                    const gResult = systemDB.prepare(`
                        INSERT INTO guardians (email, password, name, phone)
                        VALUES (?, ?, ?, ?)
                    `).run(parent_email, hashedPassword, `Responsável de ${name}`, phone || '');

                    guardian = { id: gResult.lastInsertRowid, email: parent_email };
                    console.log('✨ [AUTO-CADASTRO] Conta de Responsável GLOBAL criada com sucesso! ID:', guardian.id);
                }

                // Vincular Aluno ao Responsável (no DB da Escola)
                const linkExists = schoolDB.prepare('SELECT id FROM student_guardians WHERE student_id = ? AND guardian_id = ?').get(studentId, guardian.id);

                if (!linkExists) {
                    schoolDB.prepare(`
                        INSERT INTO student_guardians (student_id, guardian_id, relationship, status)
                        VALUES (?, ?, ?, 'active')
                    `).run(studentId, guardian.id, 'Responsável');
                    console.log(`🔗 Aluno vinculado automaticamente ao responsável ID ${guardian.id}`);
                }

                // ==================================================================================
                // ENVIO REAL DE EMAIL
                // ==================================================================================

                if (isNewAccount && password) {
                    // Nova conta - enviar credenciais
                    const mailOptions = {
                        from: '"EduFocus" <noreply@edufocus.com>',
                        to: parent_email,
                        subject: '🎓 Bem-vindo ao EduFocus - Suas Credenciais de Acesso',
                        html: `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <style>
                                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                                    .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
                                    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
                                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <div class="header">
                                        <h1>🎓 Bem-vindo ao EduFocus!</h1>
                                        <p>Acompanhe a chegada e saída do seu filho em tempo real</p>
                                    </div>
                                    <div class="content">
                                        <h2>Olá, Responsável!</h2>
                                        <p>Uma conta foi criada para você no <strong>EduFocus</strong> para acompanhar o aluno <strong>${name}</strong>.</p>
                                        
                                        <div class="credentials">
                                            <h3>📧 Suas Credenciais de Acesso:</h3>
                                            <p><strong>Login:</strong> ${parent_email}</p>
                                            <p><strong>Senha:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 16px;">${password}</code></p>
                                        </div>
                                        
                                        <p><strong>⚠️ IMPORTANTE:</strong> Anote ou tire uma foto desta senha! Você precisará dela para fazer login.</p>
                                        
                                        <h3>📱 Como Acessar:</h3>
                                        <ol>
                                            <li>Baixe o aplicativo EduFocus Guardian</li>
                                            <li>Faça login com o email e senha acima</li>
                                            <li>Receba notificações em tempo real quando seu filho chegar ou sair da escola!</li>
                                        </ol>
                                        
                                        <a href="http://192.168.0.11:5176/guardian-download.html" class="button">📲 Baixar Aplicativo</a>
                                        
                                        <div class="footer">
                                            <p>Este é um email automático. Por favor, não responda.</p>
                                            <p>EduFocus - Monitoramento Escolar Inteligente</p>
                                        </div>
                                    </div>
                                </div>
                            </body>
                            </html>
                        `
                    };

                    try {
                        const info = await transporter.sendMail(mailOptions);
                        console.log('\n✅ EMAIL ENVIADO COM SUCESSO!');
                        console.log('📧 Para:', parent_email);
                        console.log('🔑 Login:', parent_email);
                        console.log('🔒 Senha:', password);

                        // Se estiver usando Ethereal (teste), mostrar link de preview
                        if (info.messageId && process.env.EMAIL_USER === undefined) {
                            const previewUrl = nodemailer.getTestMessageUrl(info);
                            if (previewUrl) {
                                console.log('🔗 PREVIEW URL (Ethereal):', previewUrl);
                                console.log('   (Abra este link para ver o email)');
                            }
                        }
                    } catch (emailError) {
                        console.error('❌ Erro ao enviar email:', emailError.message);
                        // Continua mesmo se o email falhar (senha será exibida na tela)
                    }
                } else if (!isNewAccount) {
                    // Conta existente - avisar sobre novo vínculo
                    const mailOptions = {
                        from: '"EduFocus" <noreply@edufocus.com>',
                        to: parent_email,
                        subject: '🎓 Novo Aluno Vinculado - EduFocus',
                        html: `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <style>
                                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                                    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <div class="header">
                                        <h1>🎓 Novo Aluno Vinculado!</h1>
                                    </div>
                                    <div class="content">
                                        <h2>Olá!</h2>
                                        <p>O aluno <strong>${name}</strong> foi vinculado à sua conta no EduFocus.</p>
                                        <p>Agora você receberá notificações sobre a chegada e saída deste aluno.</p>
                                        <p>Use suas credenciais existentes para acessar o aplicativo.</p>
                                        <a href="http://192.168.0.11:5176/guardian-download.html" class="button">📲 Abrir Aplicativo</a>
                                    </div>
                                </div>
                            </body>
                            </html>
                        `
                    };

                    try {
                        await transporter.sendMail(mailOptions);
                        console.log('\n✅ EMAIL DE VÍNCULO ENVIADO!');
                        console.log('📧 Para:', parent_email);
                    } catch (emailError) {
                        console.error('❌ Erro ao enviar email de vínculo:', emailError.message);
                    }
                }

                return res.json({
                    message: 'Student created',
                    id: studentId,
                    guardian_login: parent_email,
                    guardian_password: password // Retornar senha gerada para exibir na tela (fallback se email falhar)
                });
            } catch (err) {
                console.error('⚠️ Erro no processo automático de responsável:', err);
                // Se der erro no email, ainda retorna sucesso do aluno, mas sem dados do pai
                return res.json({ message: 'Student created (Email failed)', id: studentId });
            }
        }

        // Sem email de responsável
        res.json({ message: 'Student created', id: studentId });
    } catch (error) {
        console.error('❌ Erro ao cadastrar aluno:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: 'Erro ao cadastrar aluno.', message: error.message });
    }
});

// Update student (for adding face descriptor to existing students)
app.put('/api/school/students/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { face_descriptor } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log(`📝 Atualizando aluno ID ${id} com descritor facial`);

        // Usar INSERT OR REPLACE para atualizar ou criar descritor
        schoolDB.prepare(`
            INSERT INTO face_descriptors (student_id, descriptor, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(student_id) 
            DO UPDATE SET descriptor = ?, updated_at = CURRENT_TIMESTAMP
        `).run(id, face_descriptor, face_descriptor);

        console.log(`✅ Aluno ID ${id} atualizado com sucesso`);
        res.json({ message: 'Student updated' });
    } catch (error) {
        console.error('❌ Erro ao atualizar aluno:', error);
        res.status(500).json({ error: 'Erro ao atualizar aluno', message: error.message });
    }
});

// Delete student (DEEP CLEAN)
app.delete('/api/school/students/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const deleteTransaction = schoolDB.transaction(() => {
            // 1. Remover histórico de presença
            schoolDB.prepare('DELETE FROM attendance WHERE student_id = ?').run(id);

            // 2. Remover biometria
            schoolDB.prepare('DELETE FROM face_descriptors WHERE student_id = ?').run(id);

            // 3. Remover dados de monitoramento e atenção
            // Verificar se tabelas existem antes para evitar erros em DBs antigos/incompletos é bom,
            // mas assumindo schema padrão:
            try { schoolDB.prepare('DELETE FROM student_attention WHERE student_id = ?').run(id); } catch (e) { }
            try { schoolDB.prepare('DELETE FROM question_responses WHERE student_id = ?').run(id); } catch (e) { }
            try { schoolDB.prepare('DELETE FROM seating_arrangements WHERE student_id = ?').run(id); } catch (e) { }
            try { schoolDB.prepare('DELETE FROM exam_results WHERE student_id = ?').run(id); } catch (e) { }
            try { schoolDB.prepare('DELETE FROM student_reports WHERE student_id = ?').run(id); } catch (e) { }
            try { schoolDB.prepare('DELETE FROM whatsapp_notifications WHERE student_id = ?').run(id); } catch (e) { }

            // 4. Remover aluno
            const result = schoolDB.prepare('DELETE FROM students WHERE id = ?').run(id);

            if (result.changes === 0) {
                throw new Error('Aluno não encontrado');
            }
        });

        deleteTransaction();
        console.log(`🗑️ Aluno ID ${id} excluído com todos os dados associados.`);
        res.json({ message: 'Aluno e todos os seus dados foram excluídos permanentemente.' });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ error: error.message || 'Erro ao excluir aluno' });
    }
});

app.get('/api/school/cameras', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);
    const cameras = schoolDB.prepare('SELECT * FROM cameras').all();
    res.json(cameras);
});

// ==================== ENDPOINTS DE FUNCIONÁRIOS ====================

// Listar funcionários da escola
app.get('/api/school/employees', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const employees = schoolDB.prepare('SELECT * FROM employees ORDER BY name').all();
        res.json(employees);
    } catch (error) {
        console.error('Erro ao listar funcionários:', error);
        res.status(500).json({ error: 'Erro ao listar funcionários' });
    }
});

// Cadastrar funcionário
app.post('/api/school/employees', authenticateToken, (req, res) => {
    console.log('🔵 ROTA /api/school/employees CHAMADA!');
    console.log('📦 Dados recebidos:', req.body);

    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, role, email, phone, photo_url, face_descriptor, employee_id, work_start_time, work_end_time } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const result = schoolDB.prepare(`
            INSERT INTO employees (name, role, email, phone, photo_url, face_descriptor, employee_id, work_start_time, work_end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, role, email, phone, photo_url, face_descriptor, employee_id, work_start_time || '08:00', work_end_time || '17:00');

        console.log(`✅ Funcionário ${name} cadastrado com ID ${result.lastInsertRowid} (Horário: ${work_start_time || '08:00'} - ${work_end_time || '17:00'})`);
        res.json({ id: result.lastInsertRowid, message: 'Funcionário cadastrado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao cadastrar funcionário:', error);
        res.status(500).json({ error: 'Erro ao cadastrar funcionário', message: error.message });
    }
});

// Atualizar funcionário
app.put('/api/school/employees/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { name, role, email, phone, photo_url, face_descriptor, employee_id, work_start_time, work_end_time } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const result = schoolDB.prepare(`
            UPDATE employees 
            SET name = ?, role = ?, email = ?, phone = ?, photo_url = ?, 
                face_descriptor = ?, employee_id = ?, work_start_time = ?, work_end_time = ?
            WHERE id = ?
        `).run(name, role, email, phone, photo_url, face_descriptor, employee_id,
            work_start_time || '08:00', work_end_time || '17:00', id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Funcionário não encontrado' });
        }

        console.log(`✅ Funcionário ${name} (ID: ${id}) atualizado`);
        res.json({ message: 'Funcionário atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar funcionário:', error);
        res.status(500).json({ error: 'Erro ao atualizar funcionário' });
    }
});

// Deletar funcionário
app.delete('/api/school/employees/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        // Deletar registros de ponto do funcionário
        schoolDB.prepare('DELETE FROM employee_attendance WHERE employee_id = ?').run(id);

        // Deletar funcionário
        const result = schoolDB.prepare('DELETE FROM employees WHERE id = ?').run(id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Funcionário não encontrado' });
        }

        console.log(`✅ Funcionário ID ${id} excluído`);
        res.json({ message: 'Funcionário excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        res.status(500).json({ error: 'Erro ao excluir funcionário' });
    }
});

// Registrar ponto de funcionário
app.post('/api/school/employee-attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { employee_id } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        // Verificar se já registrou hoje
        const today = new Date().toISOString().split('T')[0];
        const existing = schoolDB.prepare(`
            SELECT id FROM employee_attendance 
            WHERE employee_id = ? AND date(timestamp) = date(?)
        `).get(employee_id, today);

        if (existing) {
            return res.status(400).json({
                error: 'Funcionário já registrou ponto hoje',
                alreadyRegistered: true
            });
        }

        // Registrar ponto
        const result = schoolDB.prepare(`
            INSERT INTO employee_attendance (employee_id, timestamp)
            VALUES (?, datetime('now', 'localtime'))
        `).run(employee_id);

        console.log(`✅ Ponto registrado para funcionário ID ${employee_id}`);
        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Ponto registrado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao registrar ponto:', error);
        res.status(500).json({ error: 'Erro ao registrar ponto' });
    }
});

// Buscar registros de ponto de funcionários
app.get('/api/school/employee-attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { date, startDate, endDate } = req.query;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        let query = `
            SELECT 
                ea.*,
                e.name as employee_name,
                e.role as employee_role
            FROM employee_attendance ea
            JOIN employees e ON ea.employee_id = e.id
        `;

        const params = [];

        if (date) {
            query += ' WHERE date(ea.timestamp) = date(?)';
            params.push(date);
        } else if (startDate && endDate) {
            query += ' WHERE date(ea.timestamp) BETWEEN date(?) AND date(?)';
            params.push(startDate, endDate);
        }

        query += ' ORDER BY ea.timestamp DESC';

        const records = schoolDB.prepare(query).all(...params);
        res.json(records);
    } catch (error) {
        console.error('Erro ao buscar registros de ponto:', error);
        res.status(500).json({ error: 'Erro ao buscar registros' });
    }
});

// ==================== FIM DOS ENDPOINTS DE FUNCIONÁRIOS ====================

// ==================== ENDPOINTS DE PRESENÇA DE ALUNOS ====================

// Buscar registros de presença de alunos
app.get('/api/school/attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { startDate, endDate } = req.query;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        let query = `
            SELECT 
                a.*,
                s.name as student_name,
                s.class_name
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE a.type = 'entry'
        `;

        const params = [];

        if (startDate && endDate) {
            query += ' AND date(a.timestamp) BETWEEN date(?) AND date(?)';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' AND date(a.timestamp) = date(?)';
            params.push(startDate);
        }

        query += ' ORDER BY a.timestamp DESC';

        const records = schoolDB.prepare(query).all(...params);
        console.log(`📊 Retornando ${records.length} registros de presença de alunos`);
        res.json(records);
    } catch (error) {
        console.error('Erro ao buscar registros de presença:', error);
        res.status(500).json({ error: 'Erro ao buscar registros' });
    }
});

// Rota alternativa com schoolId no path (para compatibilidade)
app.get('/api/school/:schoolId/attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { startDate, endDate } = req.query;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        let query = `
            SELECT 
                a.*,
                s.name as student_name,
                s.class_name
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE a.type = 'entry'
        `;

        const params = [];

        if (startDate && endDate) {
            query += ' AND date(a.timestamp) BETWEEN date(?) AND date(?)';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' AND date(a.timestamp) = date(?)';
            params.push(startDate);
        }

        query += ' ORDER BY a.timestamp DESC';

        const records = schoolDB.prepare(query).all(...params);
        console.log(`📊 Retornando ${records.length} registros de presença de alunos`);
        res.json(records);
    } catch (error) {
        console.error('Erro ao buscar registros de presença:', error);
        res.status(500).json({ error: 'Erro ao buscar registros' });
    }
});

// ==================== FIM DOS ENDPOINTS DE PRESENÇA DE ALUNOS ====================

// Get all classes for the school
app.get('/api/school/classes', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const classes = schoolDB.prepare('SELECT * FROM classes ORDER BY name').all();
        res.json(classes);
    } catch (error) {
        console.error('Error fetching classes:', error);
        res.json([]); // Return empty array if table doesn't exist yet
    }
});


// Get students with face descriptors for recognition
app.get('/api/school/students/faces', authenticateToken, (req, res) => {
    // Allow school admin or teacher (if implemented later)
    const schoolDB = getSchoolDB(req.user.id);
    try {
        const students = schoolDB.prepare(`
            SELECT s.id, s.name, s.parent_email, s.phone, s.class_name, fd.descriptor as face_descriptor
            FROM students s
            `).all();
        // Parse descriptors
        const studentsWithFaces = students.map(s => ({
            ...s,
            face_descriptor: JSON.parse(s.face_descriptor)
        }));
        res.json(studentsWithFaces);
    } catch (error) {
        console.error('Error fetching student faces:', error);
        res.json([]);
    }
});


// --- TEACHER ROUTES ---

app.get('/api/teacher/me', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const db = getSystemDB();
    const teacher = db.prepare('SELECT id, name, email, subject, school_id, status FROM teachers WHERE id = ?').get(req.user.id);
    res.json(teacher);
});

app.get('/api/teacher/classes', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const teacher = req.user;

    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);

    // Get classes linked to this teacher from the school database
    // Assuming teacher_classes table exists in school DB as per link-teacher logic
    try {
        const classes = schoolDB.prepare(`
            SELECT c.*
        FROM classes c
            JOIN teacher_classes tc ON c.id = tc.class_id
            WHERE tc.teacher_id = ?
            `).all(teacher.id);
        res.json(classes);
    } catch (error) {
        console.error('Error fetching teacher classes:', error);
        res.json([]);
    }
});

app.get('/api/teacher/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id } = req.query;
    const teacher = req.user;

    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);

    try {
        let query = `
            SELECT s.*, fd.descriptor as face_descriptor
            FROM students s
            LEFT JOIN face_descriptors fd ON s.id = fd.student_id
            WHERE 1 = 1
            `;
        const params = [];

        let classObj = null;
        if (class_id) {
            // Get class name to filter by string if students use class_name column, 
            // OR check if we have a student_classes link. 
            // Looking at previous 'create student' logic, students have a 'class_name' text column.
            // We need to resolve class_id to class_name or update student schema to use class_id.
            // For now, let's assume looking up the class name from the ID is safer.
            classObj = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(class_id);
            if (classObj) {
                query += ` AND s.class_name = ? `;
                params.push(classObj.name);
            }
        }

        // Also verify the teacher actually teaches this class to prevent unauthorized access
        // (Skipping strict check for now for simplicity, but good practice)

        const students = schoolDB.prepare(query).all(...params);

        // Parse descriptors para reconhecimento facial
        // Enviar descritores completos para permitir reconhecimento no frontend
        const studentsSanitized = students.map(s => {
            let descriptor = s.face_descriptor;
            if (descriptor && typeof descriptor === 'string') {
                try {
                    descriptor = JSON.parse(descriptor);
                } catch (e) {
                    console.error(`Erro ao parsear descritor do aluno ${s.id}: `, e);
                    descriptor = null;
                }
            }
            return {
                ...s,
                face_descriptor: descriptor // Enviar descritor completo (array) ou null
            };
        });

        res.json(studentsSanitized);
    } catch (error) {
        console.error('Error fetching teacher students:', error);
        res.json([]);
    }
});

// Endpoint for Teachers to register student face
app.put('/api/teacher/students/:id/face', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { id } = req.params;
    const { face_descriptor } = req.body;
    const teacher = req.user;

    if (!teacher.school_id) return res.status(403).json({ message: 'Teacher not linked to any school' });

    const schoolDB = getSchoolDB(teacher.school_id);

    try {
        // Verify student belongs to this school
        const student = schoolDB.prepare('SELECT id FROM students WHERE id = ?').get(id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        console.log(`📝 Teacher ${teacher.name} updating face for Student ID ${id} `);

        // Insert or Update Descriptor
        schoolDB.prepare(`
                INSERT INTO face_descriptors(student_id, descriptor, updated_at)
        VALUES(?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(student_id) 
                DO UPDATE SET descriptor = ?, updated_at = CURRENT_TIMESTAMP
            `).run(id, face_descriptor, face_descriptor);

        console.log(`✅ Face descriptor updated for Student ID ${id} `);
        res.json({ message: 'Face descriptor updated successfully' });
    } catch (error) {
        console.error('❌ Error updating student face:', error);
        res.status(500).json({ error: 'Error updating student face', message: error.message });
    }
});

// --- REPRESENTATIVE ROUTES ---

app.get('/api/representative/schools', authenticateToken, (req, res) => {
    if (req.user.role !== 'representative') return res.sendStatus(403);
    const db = getSystemDB();

    const schools = db.prepare(`
        SELECT s.*, rs.linked_at 
        FROM schools s
        INNER JOIN representative_schools rs ON s.id = rs.school_id
        WHERE rs.representative_id = ?
            `).all(req.user.id);

    res.json(schools);
});

app.post('/api/representative/visits', authenticateToken, (req, res) => {
    if (req.user.role !== 'representative') return res.sendStatus(403);
    const { school_name, city, state, status, notes, next_steps } = req.body;
    const db = getSystemDB();

    db.prepare('INSERT INTO school_visits (representative_id, school_name, city, state, status, notes, next_steps) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.user.id, school_name, city, state, status, notes, next_steps);
    res.json({ message: 'Visit registered successfully' });
});

app.get('/api/representative/visits', authenticateToken, (req, res) => {
    if (req.user.role !== 'representative') return res.sendStatus(403);
    const db = getSystemDB();

    const visits = db.prepare('SELECT * FROM school_visits WHERE representative_id = ? ORDER BY visited_at DESC').all(req.user.id);
    res.json(visits);
});

// --- FACIAL RECOGNITION ROUTES ---

// Get all students with embeddings for facial recognition (PUBLIC - for camera recognition)
app.get('/api/school/:schoolId/students/embeddings', (req, res) => {
    try {
        const { schoolId } = req.params;
        const schoolDB = getSchoolDB(schoolId);

        // Buscar de AMBAS as fontes para compatibilidade:
        // 1. Tabela face_descriptors (novo formato)
        // 2. Coluna face_descriptor na tabela students (formato antigo)
        const students = schoolDB.prepare(`
            SELECT
        s.id,
            s.name,
            s.phone as guardian_phone,
            s.class_name,
            s.photo_url,
            COALESCE(fd.descriptor, s.face_descriptor) as face_descriptor
            FROM students s
            LEFT JOIN face_descriptors fd ON s.id = fd.student_id
            WHERE fd.descriptor IS NOT NULL OR s.face_descriptor IS NOT NULL
        `).all();

        // Parse dos descritores
        const studentsWithParsedDescriptors = students.map(s => {
            let descriptor = s.face_descriptor;

            // Ignorar se for null ou vazio
            if (!descriptor) return null;

            // Se for string, fazer parse
            if (typeof descriptor === 'string') {
                try {
                    descriptor = JSON.parse(descriptor);
                } catch (e) {
                    console.error(`Erro ao parsear descritor do aluno ${s.id}: `, e);
                    return null;
                }
            }

            // Validar que é um array de 128 elementos
            if (!Array.isArray(descriptor) || descriptor.length !== 128) {
                console.warn(`Descritor inválido para aluno ${s.name} (${s.id}): tamanho ${descriptor?.length} `);
                return null;
            }

            return {
                ...s,
                face_descriptor: descriptor
            };
        }).filter(s => s && s.face_descriptor);

        console.log(`📊 Endpoint embeddings: ${students.length} alunos com algum descritor, ${studentsWithParsedDescriptors.length} válidos`);
        res.json(studentsWithParsedDescriptors);
    } catch (error) {
        console.error('Error fetching student embeddings:', error);
        res.status(500).json({ error: 'Error fetching embeddings' });
    }
});

// Register attendance entry
app.post('/api/school/:schoolId/attendance', (req, res) => {
    try {
        const { schoolId } = req.params;
        const { student_id, type, timestamp } = req.body;
        const schoolDB = getSchoolDB(schoolId);

        // Check if there's already an entry FOR TODAY
        const todayEntry = schoolDB.prepare(`
SELECT * FROM attendance 
            WHERE student_id = ?
    AND date(timestamp) = date('now', 'localtime')
            AND type = 'entry'
            LIMIT 1
        `).get(student_id);

        if (todayEntry) {
            return res.json({
                message: 'Attendance already recorded for today',
                skipped: true,
                existing: todayEntry
            });
        }

        const result = schoolDB.prepare('INSERT INTO attendance (student_id, type) VALUES (?, ?)').run(student_id, type || 'entry');

        console.log(`✅ Presença registrada para aluno ${student_id} `);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error registering attendance:', error);
        res.status(500).json({ error: 'Error registering attendance' });
    }
});

// Get attendance report
app.get('/api/school/:schoolId/attendance', authenticateToken, (req, res) => {
    try {
        const { schoolId } = req.params;
        const { startDate, endDate, student_id } = req.query;

        console.log('📊 [ATTENDANCE] Buscando presença:', { schoolId, startDate, endDate, student_id });

        const schoolDB = getSchoolDB(schoolId);

        let query = `
            SELECT 
                a.id,
                a.student_id,
                a.type,
                MIN(a.timestamp) as timestamp,
                s.name as student_name, 
                s.class_name
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE a.type = 'entry'
    `;
        const params = [];

        if (startDate) {
            query += ` AND date(a.timestamp) >= date(?)`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND date(a.timestamp) <= date(?)`;
            params.push(endDate);
        }
        if (student_id) {
            query += ` AND a.student_id = ? `;
            params.push(student_id);
        }

        query += ` 
            GROUP BY a.student_id, date(a.timestamp)
            ORDER BY timestamp DESC
        `;

        const records = schoolDB.prepare(query).all(...params);

        console.log(`✅ [ATTENDANCE] Encontrados ${records.length} registros`);
        if (records.length > 0) {
            console.log('📋 [ATTENDANCE] Primeiros registros:', records.slice(0, 3));
        }

        res.json(records);
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching attendance:', error);
        res.status(500).json({ error: 'Error fetching attendance' });
    }
});




// --- TECHNICIAN ROUTES ---


app.get('/api/technician/orders', authenticateToken, (req, res) => {
    if (req.user.role !== 'technician') return res.sendStatus(403);
    const db = getSystemDB();

    // For now, return empty array - would need service_orders table
    res.json([]);
});

// --- SUPER ADMIN ADDITIONAL ROUTES ---

app.post('/api/admin/link-representative-school', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { representative_id, school_id } = req.body;
    const db = getSystemDB();

    try {
        db.prepare('INSERT INTO representative_schools (representative_id, school_id) VALUES (?, ?)').run(representative_id, school_id);
        res.json({ message: 'Representative linked to school successfully' });
    } catch (err) {
        res.status(400).json({ message: 'Link already exists or invalid IDs' });
    }
});

app.get('/api/admin/support-tickets', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const db = getSystemDB();

    const tickets = db.prepare(`
        SELECT st.*,
    CASE 
                WHEN st.user_type = 'school' THEN s.name
                WHEN st.user_type = 'teacher' THEN t.name
                WHEN st.user_type = 'representative' THEN r.name
                ELSE 'Unknown'
END as user_name
        FROM support_tickets st
        LEFT JOIN schools s ON st.user_type = 'school' AND st.user_id = s.id
        LEFT JOIN teachers t ON st.user_type = 'teacher' AND st.user_id = t.id
        LEFT JOIN representatives r ON st.user_type = 'representative' AND st.user_id = r.id
        ORDER BY st.created_at DESC
    `).all();

    res.json(tickets);
});

app.put('/api/admin/support-tickets/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { status } = req.body;
    const db = getSystemDB();

    db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run(status, id);
    res.json({ message: 'Ticket updated successfully' });
});

app.get('/api/admin/installation-rates', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const db = getSystemDB();

    const rates = db.prepare('SELECT * FROM installation_rates ORDER BY cameras_count').all();
    res.json(rates);
});

app.post('/api/admin/installation-rates', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { cameras_count, rate } = req.body;
    const db = getSystemDB();

    try {
        db.prepare('INSERT INTO installation_rates (cameras_count, rate) VALUES (?, ?)').run(cameras_count, rate);
        res.json({ message: 'Installation rate added successfully' });
    } catch (err) {
        res.status(400).json({ message: 'Rate for this camera count already exists' });
    }
});

app.put('/api/admin/installation-rates/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { rate } = req.body;
    const db = getSystemDB();

    db.prepare('UPDATE installation_rates SET rate = ? WHERE id = ?').run(rate, id);
    res.json({ message: 'Installation rate updated successfully' });
});

app.delete('/api/admin/installation-rates/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { id } = req.params;
    const db = getSystemDB();

    db.prepare('DELETE FROM installation_rates WHERE id = ?').run(id);
    res.json({ message: 'Installation rate deleted successfully' });
});

// --- SCHOOL ADDITIONAL ROUTES ---

// Listar turmas com contador de alunos
app.get('/api/school/classes', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const classes = schoolDB.prepare(`
            SELECT 
                c.*,
                COUNT(DISTINCT s.id) as student_count
            FROM classes c
            LEFT JOIN students s ON s.class_name = c.name
            GROUP BY c.id
            ORDER BY c.name
        `).all();

        res.json(classes);
    } catch (error) {
        console.error('Erro ao listar turmas:', error);
        res.status(500).json({ error: 'Erro ao listar turmas' });
    }
});

// Criar nova turma
app.post('/api/school/classes', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, grade } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log('📝 Criando turma:', { name, grade });

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome da turma é obrigatório' });
        }

        const result = schoolDB.prepare('INSERT INTO classes (name, grade) VALUES (?, ?)').run(name.trim(), grade || '');
        console.log(`✅ Turma criada com ID: ${result.lastInsertRowid}`);

        res.json({ message: 'Turma criada com sucesso', id: result.lastInsertRowid });
    } catch (error) {
        console.error('❌ Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro ao criar turma' });
    }
});

// Editar turma
app.put('/api/school/classes/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { name, grade } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome da turma é obrigatório' });
        }

        // Buscar nome antigo da turma
        const oldClass = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(id);

        if (!oldClass) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Atualizar turma
        schoolDB.prepare('UPDATE classes SET name = ?, grade = ? WHERE id = ?').run(name.trim(), grade || '', id);

        // Se o nome mudou, atualizar class_name dos alunos
        if (oldClass.name !== name.trim()) {
            schoolDB.prepare('UPDATE students SET class_name = ? WHERE class_name = ?').run(name.trim(), oldClass.name);
            console.log(`✅ Turma "${oldClass.name}" renomeada para "${name.trim()}" e alunos atualizados`);
        }

        res.json({ message: 'Turma atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao editar turma:', error);
        res.status(500).json({ error: 'Erro ao editar turma' });
    }
});

// Deletar turma
app.delete('/api/school/classes/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log(`🗑️ Deletando turma ID: ${id}`);
        // Buscar turma
        const classData = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(id);

        if (!classData) {
            console.log(`❌ Turma ID ${id} não encontrada`);
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        console.log(`📋 Turma encontrada: ${classData.name}`);

        // Contar alunos para informar no log
        const studentCountResult = schoolDB.prepare('SELECT COUNT(*) as count FROM students WHERE class_name = ?').get(classData.name);
        const studentCount = studentCountResult ? studentCountResult.count : 0;

        console.log(`👥 Alunos encontrados: ${studentCount}`);

        // Excluir alunos vinculados à turma (CASCADE)
        if (studentCount > 0) {
            console.log(`🗑️ Excluindo ${studentCount} aluno(s) da turma ${classData.name}...`);
            schoolDB.prepare('DELETE FROM students WHERE class_name = ?').run(classData.name);
            console.log(`✅ Alunos excluídos`);
        }

        // Remover vínculos com professores
        console.log(`🔗 Removendo vínculos com professores...`);
        schoolDB.prepare('DELETE FROM teacher_classes WHERE class_id = ?').run(id);
        console.log(`✅ Vínculos com professores removidos`);

        // Remover vínculos com câmeras (camera_classes)
        console.log(`📹 Removendo vínculos com câmeras...`);
        try {
            const cameraLinksResult = schoolDB.prepare('DELETE FROM camera_classes WHERE classroom_id = ?').run(id);
            console.log(`✅ ${cameraLinksResult.changes} vínculo(s) com câmeras removido(s)`);
        } catch (cameraError) {
            // Tabela camera_classes pode não existir em bancos antigos
            console.log(`⚠️ Tabela camera_classes não encontrada (ignorando)`);
        }

        // Deletar turma
        console.log(`🗑️ Deletando turma...`);
        const result = schoolDB.prepare('DELETE FROM classes WHERE id = ?').run(id);
        console.log(`✅ Linhas deletadas: ${result.changes}`);
        console.log(`✅ Turma "${classData.name}" deletada com sucesso${studentCount > 0 ? ` (${studentCount} aluno(s) também removido(s))` : ''}`);

        res.json({
            message: 'Turma deletada com sucesso',
            studentsDeleted: studentCount
        });
    } catch (error) {
        console.error('❌ Erro ao deletar turma:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ error: 'Erro ao deletar turma: ' + error.message });
    }
});

// Buscar alunos de uma turma específica (com schoolId na URL)
app.get('/api/school/:schoolId/class/:classId/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { classId } = req.params;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        // Buscar nome da turma pelo ID
        const classData = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);

        if (!classData) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Buscar alunos que pertencem a essa turma (por class_name)
        const students = schoolDB.prepare('SELECT * FROM students WHERE class_name = ? ORDER BY name').all(classData.name);

        console.log(`📊 Turma ${classData.name} (ID: ${classId}) tem ${students.length} alunos`);
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

// Buscar alunos de uma turma específica (sem schoolId na URL - versão simplificada)
app.get('/api/school/class/:classId/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { classId } = req.params;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log(`🔍 Buscando alunos da turma ID: ${classId}`);

        // Buscar nome da turma pelo ID
        const classData = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);

        if (!classData) {
            console.log(`❌ Turma ID ${classId} não encontrada`);
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        console.log(`📚 Turma encontrada: ${classData.name}`);

        // Buscar alunos que pertencem a essa turma (por class_name)
        const students = schoolDB.prepare('SELECT * FROM students WHERE class_name = ? ORDER BY name').all(classData.name);

        console.log(`✅ Encontrados ${students.length} alunos na turma "${classData.name}"`);
        if (students.length > 0) {
            console.log(`   Alunos: ${students.map(s => s.name).join(', ')}`);
        }

        res.json(students);
    } catch (error) {
        console.error('❌ Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

// DEBUG: Ver todas as turmas e alunos
app.get('/api/school/debug/classes-students', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const classes = schoolDB.prepare('SELECT * FROM classes').all();
        const students = schoolDB.prepare('SELECT id, name, class_name FROM students').all();

        console.log('=== DEBUG: TURMAS E ALUNOS ===');
        console.log('Turmas:', classes);
        console.log('Alunos:', students);

        res.json({ classes, students });
    } catch (error) {
        console.error('Erro no debug:', error);
        res.status(500).json({ error: 'Erro no debug' });
    }
});

// Get students (School Admin)
app.get('/api/school/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const students = schoolDB.prepare('SELECT * FROM students ORDER BY name').all();

        // Parse face_descriptor
        const studentsWithParsedDescriptors = students.map(s => {
            let descriptor = s.face_descriptor;
            if (descriptor && typeof descriptor === 'string') {
                try {
                    descriptor = JSON.parse(descriptor);
                } catch (e) {
                    descriptor = null;
                }
            }
            return { ...s, face_descriptor: descriptor };
        });

        res.json(studentsWithParsedDescriptors);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Error fetching students' });
    }
});

// Create student (School Admin)
app.post('/api/school/students', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, parent_email, phone, photo_url, class_name, age, face_descriptor } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const descriptorString = face_descriptor ? JSON.stringify(face_descriptor) : null;

        schoolDB.prepare(`
            INSERT INTO students(name, parent_email, phone, photo_url, class_name, age, face_descriptor)
VALUES(?, ?, ?, ?, ?, ?, ?)
    `).run(name, parent_email, phone, photo_url, class_name, age, descriptorString);

        res.json({ message: 'Student created successfully' });
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ error: 'Error creating student', message: error.message });
    }
});

// Update student (School Admin)
app.put('/api/school/students/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { name, parent_email, phone, photo_url, class_name, age, face_descriptor } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const descriptorString = face_descriptor ? JSON.stringify(face_descriptor) : null;

        schoolDB.prepare(`
            UPDATE students 
            SET name = ?, parent_email = ?, phone = ?, photo_url = ?, class_name = ?, age = ?, face_descriptor = ?
    WHERE id = ?
        `).run(name, parent_email, phone, photo_url, class_name, age, descriptorString, id);

        res.json({ message: 'Student updated successfully' });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: 'Error updating student', message: error.message });
    }
});

app.get('/api/teacher/me', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const db = getSystemDB();
    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.user.id);

    if (teacher && teacher.school_id) {
        const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(teacher.school_id);
        teacher.school_name = school ? school.name : 'Escola Desconhecida';
    }

    res.json(teacher);
});

app.get('/api/teacher/classes', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);

    const db = getSystemDB();
    const teacher = db.prepare('SELECT school_id FROM teachers WHERE id = ?').get(req.user.id);

    if (!teacher || !teacher.school_id) {
        return res.json([]);
    }

    const schoolDB = getSchoolDB(teacher.school_id);
    try {
        const classes = schoolDB.prepare(`
            SELECT c.*
    FROM classes c
            JOIN teacher_classes tc ON c.id = tc.class_id
            WHERE tc.teacher_id = ?
    `).all(req.user.id);
        res.json(classes);
    } catch (error) {
        console.error('Error fetching teacher classes:', error);
        res.json([]);
    }
});

// --- WHATSAPP INTEGRATION (MULTI-TENANT) ---

// Endpoint para inicializar conexão WhatsApp (School Admin ou Super Admin)
app.post('/api/whatsapp/connect', authenticateToken, async (req, res) => {
    try {
        let schoolId;

        if (req.user.role === 'school_admin') {
            schoolId = req.user.id; // School admin usa seu próprio ID
        } else if (req.user.role === 'super_admin') {
            schoolId = req.body.schoolId; // Super admin pode especificar qual escola
            if (!schoolId) {
                return res.status(400).json({ error: 'schoolId é obrigatório para Super Admin' });
            }
        } else {
            return res.sendStatus(403);
        }

        const whatsappService = getWhatsAppService(schoolId);
        await whatsappService.initialize();
        res.json({ message: 'WhatsApp inicializado. O QR Code aparecerá na tela.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao inicializar WhatsApp', message: error.message });
    }
});

// Endpoint para verificar status do WhatsApp
app.get('/api/whatsapp/status', authenticateToken, (req, res) => {
    try {
        let schoolId;

        if (req.user.role === 'school_admin') {
            schoolId = req.user.id;
        } else if (req.user.role === 'super_admin') {
            schoolId = req.query.schoolId;
            if (!schoolId) {
                return res.status(400).json({ error: 'schoolId é obrigatório para Super Admin' });
            }
        } else {
            return res.sendStatus(403);
        }

        const whatsappService = getWhatsAppService(schoolId);
        res.json(whatsappService.getStatus());
    } catch (error) {
        res.json({ connected: false, message: 'WhatsApp não inicializado', qrCode: null });
    }
});

// Endpoint para desconectar WhatsApp
app.post('/api/whatsapp/disconnect', authenticateToken, async (req, res) => {
    try {
        let schoolId;

        if (req.user.role === 'school_admin') {
            schoolId = req.user.id;
        } else if (req.user.role === 'super_admin') {
            schoolId = req.body.schoolId;
            if (!schoolId) {
                return res.status(400).json({ error: 'schoolId é obrigatório para Super Admin' });
            }
        } else {
            return res.sendStatus(403);
        }

        const whatsappService = getWhatsAppService(schoolId);

        // IMPORTANTE: Parar keep-alive ANTES de desconectar
        // Caso contrário, o keep-alive reconecta automaticamente
        console.log(`🛑 Parando keep-alive da Escola ${schoolId}...`);
        whatsappService.stopKeepAlive();

        console.log(`🔌 Desconectando WhatsApp da Escola ${schoolId}...`);
        await whatsappService.disconnect();

        console.log(`✅ WhatsApp da Escola ${schoolId} desconectado com sucesso`);
        res.json({ message: 'WhatsApp desconectado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao desconectar WhatsApp:', error);
        res.status(500).json({ error: 'Erro ao desconectar WhatsApp', message: error.message });
    }
});

// Endpoint para registrar presença E enviar notificação WhatsApp
app.post('/api/attendance/register', authenticateToken, async (req, res) => {
    const { student_id, school_id, event_type } = req.body; // event_type: 'arrival' ou 'departure'

    console.log(`🔄[REGISTER] Nova requisição: Aluno ${student_id}, Escola ${school_id}, Evento ${event_type} `);

    try {
        const schoolDB = getSchoolDB(school_id);

        // Buscar dados do aluno
        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(student_id);

        if (!student) {
            console.error(`❌[REGISTER] Aluno ${student_id} não encontrado`);
            return res.status(404).json({ error: 'Aluno não encontrado' });
        }
        console.log(`👤[REGISTER] Aluno encontrado: ${student.name}, Tel: ${student.phone} `);

        // 🔔 NOTIFICAR APP GUARDIAN (Toda vez que reconhecer)
        try {
            const timestampNow = new Date().toISOString();
            schoolDB.prepare(`
                INSERT INTO access_logs(student_id, event_type, timestamp, notified_guardian)
                VALUES(?, ?, ?, 0)
            `).run(student_id, event_type, timestampNow);
            console.log(`🔔[REGISTER] Notificação salva para o Guardian`);
        } catch (logError) {
            console.error(`❌[REGISTER] Erro ao criar access_log:`, logError.message);
        }

        // ✅ VERIFICAR SE JÁ REGISTROU HOJE (SISTEMA OFICIAL DE PRESENÇA)
        const todayStr = new Date().toISOString().split('T')[0];
        const typeToCheck = event_type === 'departure' ? 'exit' : 'entry';

        const existingEntry = schoolDB.prepare(`
            SELECT * FROM attendance 
            WHERE student_id = ? AND type = ? AND date(timestamp) = date(?)
        `).get(student_id, typeToCheck, todayStr);

        if (existingEntry) {
            console.log(`ℹ️[REGISTER] Aluno já registrado hoje às ${new Date(existingEntry.timestamp).toLocaleTimeString('pt-BR')}`);
            console.log(`⏭️[REGISTER] Ignorando registro duplicado. WhatsApp NÃO será enviado.`);

            return res.json({
                success: true,
                message: `${typeToCheck === 'entry' ? 'Entrada' : 'Saída'} já registrada hoje`,
                student: student.name,
                timestamp: existingEntry.timestamp,
                alreadyRegistered: true,
                whatsapp: { success: false, error: 'Já registrado hoje' }
            });
        }

        // Registrar presença APENAS se NÃO existe hoje
        const timestamp = new Date().toISOString();
        const type = event_type === 'departure' ? 'exit' : 'entry';

        schoolDB.prepare(`
            INSERT INTO attendance(student_id, timestamp, type)
            VALUES(?, ?, ?)
        `).run(student_id, timestamp, type);

        console.log(`💾[REGISTER] ✅ PRIMEIRA detecção hoje! Presença registrada: ${type} às ${new Date().toLocaleTimeString('pt-BR')}`);

        // 🔔 REGISTRAR NA TABELA access_logs PARA NOTIFICAÇÕES DO GUARDIAN
        try {
            schoolDB.prepare(`
                INSERT INTO access_logs(student_id, event_type, timestamp, notified_guardian)
                VALUES(?, ?, ?, 0)
            `).run(student_id, event_type, timestamp);
            console.log(`🔔[REGISTER] ✅ Registro criado em access_logs para notificação do Guardian`);
        } catch (logError) {
            console.error(`❌[REGISTER] Erro ao criar access_log:`, logError.message);
        }

        // Buscar nome da escola
        const db = getSystemDB();
        const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(school_id);
        const schoolName = school ? school.name : 'Escola';

        // Obter serviço de WhatsApp para esta escola
        const whatsappService = getWhatsAppService(school_id);
        const wsStatus = whatsappService ? whatsappService.getStatus() : { connected: false };
        console.log(`📱[REGISTER] WhatsApp Status: Conectado = ${wsStatus.connected}, ServiceIsConnected = ${whatsappService?.isConnected} `);

        // Enviar notificação WhatsApp se conectado e aluno tiver telefone
        let whatsappResult = null;
        if (whatsappService && (whatsappService.isConnected || wsStatus.connected) && student.phone) {
            // ✅ VERIFICAR SE JÁ FOI ENVIADA NOTIFICAÇÃO HOJE
            const notifType = event_type === 'departure' ? 'departure' : 'arrival';
            const todayStr = new Date().toISOString().split('T')[0];
            const existingNotif = schoolDB.prepare(`
                SELECT * FROM whatsapp_notifications 
                WHERE student_id = ? 
                AND notification_type = ? 
                AND date(sent_at) = date(?)
                AND success = 1
            `).get(student_id, notifType, todayStr);

            if (existingNotif) {
                const sentTime = new Date(existingNotif.sent_at).toLocaleTimeString('pt-BR');
                console.log(`⚠️ [REGISTER] Notificação ${notifType} já enviada hoje às ${sentTime}`);
                whatsappResult = { success: false, error: `Já enviada às ${sentTime}`, alreadySent: true };
            } else {
                console.log(`📨 [REGISTER] Tentando enviar mensagem...`);
                console.log(`📨 [REGISTER] Tipo: ${notifType}, Aluno: ${student.name}, Telefone: ${student.phone}`);

                if (event_type === 'departure') {
                    whatsappResult = await whatsappService.sendDepartureNotification(student, schoolName);
                } else {
                    whatsappResult = await whatsappService.sendArrivalNotification(student, schoolName);
                }
                console.log(`📬 [REGISTER] Resultado envio:`, whatsappResult);

                // ✅ REGISTRAR NOTIFICAÇÃO
                if (whatsappResult && whatsappResult.success) {
                    schoolDB.prepare(`
                        INSERT INTO whatsapp_notifications (student_id, notification_type, phone, success)
                        VALUES (?, ?, ?, 1)
                    `).run(student_id, notifType, student.phone);
                    console.log(`✅ [REGISTER] Notificação ${notifType} registrada`);
                } else {
                    console.error(`❌ [REGISTER] Falha no envio:`, whatsappResult?.error || 'Erro desconhecido');
                }
            }
        } else {
            const reasons = [];
            if (!whatsappService) reasons.push('WhatsApp Service não existe');
            if (whatsappService && !whatsappService.isConnected && !wsStatus.connected) reasons.push('WhatsApp desconectado');
            if (!student.phone) reasons.push('Aluno sem telefone');
            console.warn(`⚠️ [REGISTER] Não enviando mensagem. Motivos: ${reasons.join(', ')}`);
        }

        res.json({
            success: true,
            message: 'Presença registrada',
            student: student.name,
            timestamp,
            whatsapp: whatsappResult || { success: false, error: 'WhatsApp não conectado ou telefone não cadastrado' }
        });

    } catch (error) {
        console.error('❌ [REGISTER] Erro interno:', error);
        res.status(500).json({ error: 'Erro ao registrar presença' });
    }
});



// Endpoint para notificação manual via WhatsApp (Botão Verde) - LOGS ADICIONADOS
app.post('/api/school/notify-parent', authenticateToken, async (req, res) => {
    const { student_id, school_id } = req.body;
    console.log(`🚀[NOTIFY - MANUAL] Iniciando para aluno ${student_id}, escola ${school_id} `);

    try {
        const schoolDB = getSchoolDB(school_id);
        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(student_id);

        if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });
        if (!student.phone) {
            console.error('❌ [NOTIFY-MANUAL] Aluno sem telefone');
            return res.status(400).json({ error: 'Aluno sem telefone cadastrado' });
        }

        // ✅ VERIFICAR SE JÁ FOI ENVIADA NOTIFICAÇÃO HOJE
        const today = new Date().toISOString().split('T')[0];
        const existingNotification = schoolDB.prepare(`
            SELECT * FROM whatsapp_notifications 
            WHERE student_id = ? 
            AND notification_type = 'arrival' 
            AND date(sent_at) = date(?)
            AND success = 1
        `).get(student_id, today);

        if (existingNotification) {
            const sentTime = new Date(existingNotification.sent_at).toLocaleTimeString('pt-BR');
            console.log(`⚠️ [NOTIFY-MANUAL] Notificação já enviada hoje às ${sentTime}`);
            return res.status(400).json({
                error: `Notificação já enviada hoje às ${sentTime}`,
                alreadySent: true,
                sentAt: existingNotification.sent_at
            });
        }

        const whatsappService = getWhatsAppService(school_id);
        const wsStatus = whatsappService ? whatsappService.getStatus() : { connected: false };

        if (!whatsappService || !wsStatus.connected) {
            console.error('❌ [NOTIFY-MANUAL] WhatsApp Service desconectado');
            return res.status(400).json({ error: 'WhatsApp desconectado. Conecte no menu WhatsApp.' });
        }

        const db = getSystemDB();
        const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(school_id);
        const schoolName = school ? school.name : 'Escola';

        console.log(`✉️ [NOTIFY-MANUAL] Enviando mensagem...`);
        const result = await whatsappService.sendArrivalNotification(student, schoolName);
        console.log(`📤 [NOTIFY-MANUAL] Resultado:`, result);

        // ✅ REGISTRAR NOTIFICAÇÃO ENVIADA
        if (result.success) {
            schoolDB.prepare(`
                INSERT INTO whatsapp_notifications (student_id, notification_type, phone, success)
                VALUES (?, 'arrival', ?, 1)
            `).run(student_id, student.phone);

            console.log(`✅ [NOTIFY-MANUAL] Notificação registrada no banco`);
            res.json({ success: true, message: 'Notificação enviada com sucesso!' });
        } else {
            // Registrar falha também para histórico
            schoolDB.prepare(`
                INSERT INTO whatsapp_notifications (student_id, notification_type, phone, success)
                VALUES (?, 'arrival', ?, 0)
            `).run(student_id, student.phone);

            res.status(500).json({ error: 'Falha ao enviar: ' + result.error });
        }
    } catch (error) {
        console.error('Erro notificação manual:', error);
        res.status(500).json({ error: 'Erro interno ao processar notificação' });
    }
});

// Endpoint para testar envio de mensagem WhatsApp (Admin Test)
app.post('/api/admin/whatsapp/test', authenticateToken, async (req, res) => {
    if (req.user.role !== 'super_admin' && req.user.role !== 'school_admin') return res.sendStatus(403);
    const { student_id, school_id } = req.body;

    try {
        const whatsappService = getWhatsAppService(school_id);
        const wsStatus = whatsappService ? whatsappService.getStatus() : { connected: false };

        if (!whatsappService || !wsStatus.connected) {
            return res.status(400).json({ error: 'WhatsApp não conectado' });
        }

        const schoolDB = getSchoolDB(school_id);
        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
        if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });

        const db = getSystemDB();
        const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(school_id);
        const schoolName = school ? school.name : 'Escola';

        const result = await whatsappService.sendArrivalNotification(student, schoolName);

        res.json({
            success: result.success,
            message: result.success ? 'Mensagem de teste enviada' : 'Falha ao enviar mensagem',
            details: result
        });

    } catch (error) {
        res.status(500).json({ error: 'Erro ao enviar mensagem de teste', message: error.message });
    }
});

// ==================== ENDPOINTS DE GERENCIAMENTO DE PROFESSORES ====================

// Listar professores da escola com suas turmas
app.get('/school/:schoolId/teachers', authenticateToken, async (req, res) => {
    try {
        const { schoolId } = req.params;
        const systemDB = getSystemDB();
        const schoolDB = getSchoolDB(schoolId);

        // Buscar professores vinculados à escola
        const teachers = systemDB.prepare(`
            SELECT id, name, email, subject, status
            FROM teachers
            WHERE school_id = ?
        `).all(schoolId);

        // Para cada professor, buscar as turmas vinculadas
        const teachersWithClasses = teachers.map(teacher => {
            const classes = schoolDB.prepare(`
                SELECT c.name
                FROM teacher_classes tc
                JOIN classes c ON tc.class_id = c.id
                WHERE tc.teacher_id = ?
            `).all(teacher.id);

            return {
                ...teacher,
                classes: classes.map(c => c.name)
            };
        });

        res.json(teachersWithClasses);
    } catch (error) {
        console.error('Erro ao listar professores:', error);
        res.status(500).json({ error: 'Erro ao listar professores' });
    }
});

// Vincular professor à turma
app.post('/school/:schoolId/teacher/:teacherId/link-class', authenticateToken, async (req, res) => {
    try {
        const { schoolId, teacherId } = req.params;
        const { class_id } = req.body;
        const schoolDB = getSchoolDB(schoolId);

        // Verificar se já existe vínculo
        const existing = schoolDB.prepare(`
            SELECT id FROM teacher_classes
            WHERE teacher_id = ? AND class_id = ?
        `).get(teacherId, class_id);

        if (existing) {
            return res.status(400).json({ error: 'Professor já vinculado a esta turma' });
        }

        // Criar vínculo
        schoolDB.prepare(`
            INSERT INTO teacher_classes (teacher_id, class_id)
            VALUES (?, ?)
        `).run(teacherId, class_id);

        res.json({ message: 'Professor vinculado à turma com sucesso' });
    } catch (error) {
        console.error('Erro ao vincular professor:', error);
        res.status(500).json({ error: 'Erro ao vincular professor à turma' });
    }
});

// Obter métricas do professor
app.get('/school/:schoolId/teacher/:teacherId/metrics', authenticateToken, async (req, res) => {
    try {
        const { schoolId, teacherId } = req.params;
        const schoolDB = getSchoolDB(schoolId);

        // Total de turmas
        const totalClasses = schoolDB.prepare(`
            SELECT COUNT(*) as count
            FROM teacher_classes
            WHERE teacher_id = ?
        `).get(teacherId)?.count || 0;

        // Total de alunos (soma de alunos de todas as turmas do professor)
        const totalStudents = schoolDB.prepare(`
            SELECT COUNT(DISTINCT s.id) as count
            FROM students s
            JOIN classes c ON s.class_name = c.name
            JOIN teacher_classes tc ON tc.class_id = c.id
            WHERE tc.teacher_id = ?
        `).get(teacherId)?.count || 0;

        // Total de sessões de monitoramento
        const totalSessions = schoolDB.prepare(`
            SELECT COUNT(*) as count
            FROM monitoring_sessions
            WHERE teacher_id = ?
        `).get(teacherId)?.count || 0;

        // Total de questões criadas
        const totalQuestions = schoolDB.prepare(`
            SELECT COUNT(*) as count
            FROM questions
            WHERE teacher_id = ?
        `).get(teacherId)?.count || 0;

        // Desempenho por turma
        const classPerformance = schoolDB.prepare(`
            SELECT 
                c.name as className,
                COUNT(DISTINCT s.id) as studentCount,
                AVG(sa.attention_level) as avgAttention,
                AVG(sa.focus_level) as avgFocus
            FROM classes c
            JOIN teacher_classes tc ON tc.class_id = c.id
            LEFT JOIN students s ON s.class_name = c.name
            LEFT JOIN student_attention sa ON sa.student_id = s.id
            WHERE tc.teacher_id = ?
            GROUP BY c.id, c.name
        `).all(teacherId);

        res.json({
            totalClasses,
            totalStudents,
            totalSessions,
            totalQuestions,
            classPerformance
        });
    } catch (error) {
        console.error('Erro ao obter métricas:', error);
        res.status(500).json({ error: 'Erro ao obter métricas do professor' });
    }
});



// Enviar mensagem
app.post('/messages/send', authenticateToken, async (req, res) => {
    try {
        const { from_user_type, from_user_id, to_user_type, to_user_id, message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Mensagem não pode estar vazia' });
        }

        const systemDB = getSystemDB();

        // Salvar mensagem no banco
        const result = systemDB.prepare(`
            INSERT INTO messages (from_user_type, from_user_id, to_user_type, to_user_id, message, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(from_user_type, from_user_id, to_user_type, to_user_id, message.trim());

        console.log(`📨 Mensagem enviada de ${from_user_type}:${from_user_id} para ${to_user_type}:${to_user_id}`);

        res.json({
            message: 'Mensagem enviada com sucesso',
            id: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

// ==================== FIM DOS ENDPOINTS DE PROFESSORES ====================



// ==================== ENDPOINTS DE GERENCIAMENTO DE TURMAS ====================

// Listar alunos de uma turma
app.get('/school/:schoolId/class/:classId/students', authenticateToken, async (req, res) => {
    try {
        const { schoolId, classId } = req.params;
        const schoolDB = getSchoolDB(schoolId);

        // Buscar nome da turma
        const classInfo = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);

        if (!classInfo) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Buscar alunos da turma
        const students = schoolDB.prepare(`
            SELECT id, name, age, photo_url, parent_email, phone
            FROM students
            WHERE class_name = ?
            ORDER BY name
        `).all(classInfo.name);

        res.json(students);
    } catch (error) {
        console.error('Erro ao listar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao listar alunos' });
    }
});

// Buscar frequência do aluno (para o App do Responsável)
app.get('/api/guardian/student-attendance', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const { schoolId, studentId, month, year } = req.query;

    if (!schoolId || !studentId) {
        return res.status(400).json({ error: 'School ID and Student ID are required' });
    }

    try {
        const schoolDB = getSchoolDB(schoolId);

        // 1. Verificar se o guardian tem vínculo com este aluno
        const link = schoolDB.prepare(`
            SELECT id FROM student_guardians 
            WHERE student_id = ? AND guardian_id = ? AND status = 'active'
        `).get(studentId, guardianId);

        if (!link) {
            return res.status(403).json({ error: 'Acesso negado. Você não tem vínculo ativo com este aluno nesta escola.' });
        }

        // 2. Buscar frequência
        let query = `SELECT * FROM attendance WHERE student_id = ?`;
        const params = [studentId];

        if (month && year) {
            // SQLite strftime para filtrar por mês/ano
            // month deve ser '01', '02', ..., '12'
            // year deve ser '2025', etc.
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const endDate = `${year}-${String(month).padStart(2, '0')}-31`; // Simplificação, SQLite date function lida com dias excedentes se usar date()

            // Melhor usar BETWEEN com datas completas
            // Mas vamos usar strftime como no resto do codigo se houver padrao, 
            // ou date(). Vamos usar date range simples.
            query += ` AND date(timestamp) BETWEEN date(?) AND date(?)`;
            params.push(startDate, endDate);
        }

        query += ` ORDER BY timestamp DESC`;

        const records = schoolDB.prepare(query).all(...params);
        res.json(records);

    } catch (error) {
        console.error('Erro ao buscar frequência para responsible:', error);
        res.status(500).json({ error: 'Erro ao buscar dados de frequência' });
    }
});

// Listar professores de uma turma
app.get('/school/:schoolId/class/:classId/teachers', authenticateToken, async (req, res) => {
    try {
        const { schoolId, classId } = req.params;
        const systemDB = getSystemDB();
        const schoolDB = getSchoolDB(schoolId);

        // Buscar professores vinculados à turma
        const teachers = schoolDB.prepare(`
            SELECT t.id, t.name, t.email, t.subject
            FROM teachers t
            JOIN teacher_classes tc ON tc.teacher_id = t.id
            WHERE tc.class_id = ? AND t.school_id = ?
        `).all(classId, schoolId);

        res.json(teachers);
    } catch (error) {
        console.error('Erro ao listar professores da turma:', error);
        res.status(500).json({ error: 'Erro ao listar professores' });
    }
});

// Obter estatísticas da turma
app.get('/school/:schoolId/class/:classId/stats', authenticateToken, async (req, res) => {
    try {
        const { schoolId, classId } = req.params;
        const schoolDB = getSchoolDB(schoolId);

        // Buscar nome da turma
        const classInfo = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);

        if (!classInfo) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Total de alunos
        const totalStudents = schoolDB.prepare(`
            SELECT COUNT(*) as count
            FROM students
            WHERE class_name = ?
        `).get(classInfo.name)?.count || 0;

        // Total de professores
        const totalTeachers = schoolDB.prepare(`
            SELECT COUNT(*) as count
            FROM teacher_classes
            WHERE class_id = ?
        `).get(classId)?.count || 0;

        // Presença média (últimos 30 dias)
        const avgAttendance = schoolDB.prepare(`
            SELECT 
                (COUNT(DISTINCT CASE WHEN a.type = 'entry' THEN a.student_id END) * 100.0 / 
                NULLIF(COUNT(DISTINCT s.id), 0)) as attendance
            FROM students s
            LEFT JOIN attendance a ON a.student_id = s.id 
                AND date(a.timestamp) >= date('now', '-30 days')
            WHERE s.class_name = ?
        `).get(classInfo.name)?.attendance || 0;

        // Desempenho médio (atenção)
        const avgPerformance = schoolDB.prepare(`
            SELECT AVG(sa.attention_level) as performance
            FROM students s
            LEFT JOIN student_attention sa ON sa.student_id = s.id
            WHERE s.class_name = ?
        `).get(classInfo.name)?.performance || 0;

        res.json({
            totalStudents,
            totalTeachers,
            avgAttendance,
            avgPerformance,
            recentActivity: [
                `${totalStudents} alunos matriculados`,
                `${totalTeachers} professor(es) lecionando`,
                `Presença média de ${avgAttendance.toFixed(1)}% nos últimos 30 dias`
            ]
        });
    } catch (error) {
        console.error('Erro ao obter estatísticas da turma:', error);
        res.status(500).json({ error: 'Erro ao obter estatísticas' });
    }
});

// Excluir turma
app.delete('/school/:schoolId/class/:classId', authenticateToken, async (req, res) => {
    try {
        const { schoolId, classId } = req.params;
        const schoolDB = getSchoolDB(schoolId);

        // Verificar se a turma existe
        const classInfo = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);

        if (!classInfo) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Contar alunos para informar no log
        const studentsCount = schoolDB.prepare(`
            SELECT COUNT(*) as count
            FROM students
            WHERE class_name = ?
        `).get(classInfo.name)?.count || 0;

        // Excluir alunos vinculados à turma (CASCADE)
        if (studentsCount > 0) {
            console.log(`🗑️ Excluindo ${studentsCount} aluno(s) da turma ${classInfo.name}...`);
            schoolDB.prepare('DELETE FROM students WHERE class_name = ?').run(classInfo.name);
        }

        // Remover vínculos com professores
        schoolDB.prepare('DELETE FROM teacher_classes WHERE class_id = ?').run(classId);

        // Remover vínculos com câmeras (camera_classes)
        try {
            const cameraLinksResult = schoolDB.prepare('DELETE FROM camera_classes WHERE classroom_id = ?').run(classId);
            console.log(`📹 ${cameraLinksResult.changes} vínculo(s) com câmeras removido(s)`);
        } catch (cameraError) {
            // Tabela camera_classes pode não existir em bancos antigos
            console.log(`⚠️ Tabela camera_classes não encontrada (ignorando)`);
        }

        // Excluir turma
        const result = schoolDB.prepare('DELETE FROM classes WHERE id = ?').run(classId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        console.log(`✅ Turma ${classInfo.name} (ID: ${classId}) excluída com sucesso${studentsCount > 0 ? ` (${studentsCount} aluno(s) também removido(s))` : ''}`);
        res.json({
            message: 'Turma excluída com sucesso',
            studentsDeleted: studentsCount
        });
    } catch (error) {
        console.error('Erro ao excluir turma:', error);
        res.status(500).json({ error: 'Erro ao excluir turma' });
    }
});

// ==================== FIM DOS ENDPOINTS DE TURMAS ====================

// ==================== ENDPOINTS DE TICKETS DE SUPORTE ====================

app.post('/api/support/tickets', authenticateToken, async (req, res) => {
    try {
        console.log('📝 Tentando criar ticket:', req.body);
        const { user_type, user_id, title, category, message, priority } = req.body;

        if (!title || !message) {
            console.error('❌ Título ou mensagem faltando');
            return res.status(400).json({ error: 'Título e mensagem são obrigatórios' });
        }

        const systemDB = getSystemDB();

        // Criar ticket
        const ticketResult = systemDB.prepare(`
            INSERT INTO support_tickets (user_type, user_id, title, category, priority, status)
            VALUES (?, ?, ?, ?, ?, 'open')
        `).run(user_type, user_id, title, category || 'geral', priority || 'normal');

        const ticketId = ticketResult.lastInsertRowid;
        console.log('✅ Ticket inserido, ID:', ticketId);

        // Adicionar primeira mensagem
        systemDB.prepare(`
            INSERT INTO ticket_messages (ticket_id, user_type, user_id, message)
            VALUES (?, ?, ?, ?)
        `).run(ticketId, user_type, user_id, message);

        console.log(`🎫 Novo ticket criado com sucesso: #${ticketId}`);

        res.json({
            success: true,
            ticketId,
            message: 'Ticket criado com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro CRÍTICO ao criar ticket:', error);
        res.status(500).json({ error: 'Erro ao criar ticket: ' + error.message });
    }
});

// Obter detalhes do ticket com todas as mensagens
app.get('/api/support/tickets/:ticketId/messages', authenticateToken, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const systemDB = getSystemDB();

        // Buscar ticket
        const ticket = systemDB.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }

        // Buscar mensagens
        const messages = systemDB.prepare(`
            SELECT * FROM ticket_messages
            WHERE ticket_id = ?
            ORDER BY created_at ASC
        `).all(ticketId);

        res.json({
            ticket,
            messages
        });
    } catch (error) {
        console.error('Erro ao buscar mensagens do ticket:', error);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

// Listar tickets do usuário
app.get('/api/support/tickets/:userType/:userId', authenticateToken, async (req, res) => {
    try {
        const { userType, userId } = req.params;
        const { status } = req.query;

        const systemDB = getSystemDB();

        let query = `
            SELECT 
                t.*,
                (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
                (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_at
            FROM support_tickets t
            WHERE t.user_type = ? AND t.user_id = ?
        `;

        const params = [userType, userId];

        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }

        query += ' ORDER BY t.created_at DESC';

        const tickets = systemDB.prepare(query).all(...params);

        res.json(tickets);
    } catch (error) {
        console.error('Erro ao listar tickets:', error);
        res.status(500).json({ error: 'Erro ao listar tickets' });
    }
});

// Adicionar mensagem ao ticket
app.post('/api/support/tickets/:ticketId/messages', authenticateToken, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { user_type, user_id, message, is_internal } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Mensagem não pode estar vazia' });
        }

        const systemDB = getSystemDB();

        // Verificar se ticket existe
        const ticket = systemDB.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }

        // Adicionar mensagem
        systemDB.prepare(`
            INSERT INTO ticket_messages (ticket_id, user_type, user_id, message, is_internal)
            VALUES (?, ?, ?, ?, ?)
        `).run(ticketId, user_type, user_id, message.trim(), is_internal || 0);

        // Atualizar data de atualização do ticket
        systemDB.prepare(`
            UPDATE support_tickets
            SET updated_at = CURRENT_TIMESTAMP,
                status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
            WHERE id = ?
        `).run(ticketId);

        console.log(`💬 Nova mensagem no ticket #${ticketId}`);

        res.json({ success: true, message: 'Mensagem adicionada' });
    } catch (error) {
        console.error('Erro ao adicionar mensagem:', error);
        res.status(500).json({ error: 'Erro ao adicionar mensagem' });
    }
});

// Atualizar status do ticket
app.patch('/api/support/tickets/:ticketId/status', authenticateToken, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status, resolved_by } = req.body;

        const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Status inválido' });
        }

        const systemDB = getSystemDB();

        const updateData = {
            status,
            updated_at: new Date().toISOString()
        };

        if (status === 'resolved' || status === 'closed') {
            updateData.closed_at = new Date().toISOString();
            if (resolved_by) {
                updateData.resolved_by = resolved_by;
            }
        }

        systemDB.prepare(`
            UPDATE support_tickets
            SET status = ?,
                updated_at = ?,
                closed_at = ?,
                resolved_by = ?
            WHERE id = ?
        `).run(status, updateData.updated_at, updateData.closed_at || null, updateData.resolved_by || null, ticketId);

        console.log(`🔄 Ticket #${ticketId} atualizado para: ${status}`);

        res.json({ success: true, message: 'Status atualizado' });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});

// Excluir ticket (apenas se resolvido e confirmado)
app.delete('/api/support/tickets/:ticketId', authenticateToken, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const systemDB = getSystemDB();

        // Verificar se ticket está resolvido
        const ticket = systemDB.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket não encontrado' });
        }

        if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
            return res.status(400).json({ error: 'Apenas tickets resolvidos podem ser excluídos' });
        }

        // Excluir mensagens primeiro (CASCADE deve fazer isso automaticamente, mas garantindo)
        systemDB.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(ticketId);

        // Excluir ticket
        systemDB.prepare('DELETE FROM support_tickets WHERE id = ?').run(ticketId);

        console.log(`🗑️ Ticket #${ticketId} excluído`);

        res.json({ success: true, message: 'Ticket excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir ticket:', error);
        res.status(500).json({ error: 'Erro ao excluir ticket' });
    }
});

// Listar todos os tickets (para Super Admin)
app.get('/api/support/tickets/all', authenticateToken, async (req, res) => {
    try {
        const { status, user_type } = req.query;
        const systemDB = getSystemDB();

        let query = `
            SELECT 
                t.*,
                (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
                (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
            FROM support_tickets t
            WHERE 1=1
        `;

        const params = [];

        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }

        if (user_type) {
            query += ' AND t.user_type = ?';
            params.push(user_type);
        }

        query += ' ORDER BY t.updated_at DESC';

        const tickets = systemDB.prepare(query).all(...params);

        res.json(tickets);
    } catch (error) {
        console.error('Erro ao listar todos os tickets:', error);
        res.status(500).json({ error: 'Erro ao listar tickets' });
    }
});

// ==================== FIM DOS ENDPOINTS DE TICKETS ====================

// ==================== ENDPOINTS DE ENQUETES E MONITORAMENTO AVANÇADO ====================

// Criar enquete
app.post('/api/teacher/polls', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { class_id, question, optionA, optionB, optionC, optionD, correct_answer } = req.body;
        const schoolDB = getSchoolDB(req.user.school_id);

        const result = schoolDB.prepare(`
            INSERT INTO polls (teacher_id, class_id, question, option_a, option_b, option_c, option_d, correct_answer, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(req.user.id, class_id, question, optionA, optionB, optionC, optionD, correct_answer);

        res.json({ success: true, pollId: result.lastInsertRowid });
    } catch (error) {
        console.error('Erro ao criar enquete:', error);
        res.status(500).json({ error: 'Erro ao criar enquete' });
    }
});

// Registrar resposta de enquete
app.post('/api/teacher/polls/:pollId/responses', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { pollId } = req.params;
        const { responses } = req.body; // Array de { studentId, answer, isCorrect }
        const schoolDB = getSchoolDB(req.user.school_id);

        const insert = schoolDB.prepare(`
            INSERT INTO poll_responses (poll_id, student_id, answer, is_correct, timestamp)
            VALUES (?, ?, ?, ?, datetime('now'))
        `);

        const transaction = schoolDB.transaction((responseList) => {
            for (const r of responseList) {
                insert.run(pollId, r.studentId, r.answer, r.isCorrect ? 1 : 0);
            }
        });

        transaction(responses);
        res.json({ success: true, message: 'Respostas registradas' });
    } catch (error) {
        console.error('Erro ao registrar respostas:', error);
        res.status(500).json({ error: 'Erro ao registrar respostas' });
    }
});

// Obter histórico de enquetes
app.get('/api/teacher/polls/history', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { class_id } = req.query;
        const schoolDB = getSchoolDB(req.user.school_id);

        const polls = schoolDB.prepare(`
            SELECT p.*, 
                   COUNT(pr.id) as total_responses,
                   SUM(CASE WHEN pr.is_correct = 1 THEN 1 ELSE 0 END) as correct_responses
            FROM polls p
            LEFT JOIN poll_responses pr ON p.id = pr.poll_id
            WHERE p.teacher_id = ? AND p.class_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `).all(req.user.id, class_id);

        res.json(polls);
    } catch (error) {
        console.error('Erro ao buscar histórico de enquetes:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

// Registrar emoção detectada
app.post('/api/teacher/emotions', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { student_id, emotion, confidence } = req.body;
        const schoolDB = getSchoolDB(req.user.school_id);

        schoolDB.prepare(`
            INSERT INTO emotion_logs (student_id, emotion, confidence, detected_at)
            VALUES (?, ?, ?, datetime('now'))
        `).run(student_id, emotion, confidence || 1.0);

        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar emoção:', error);
        res.status(500).json({ error: 'Erro ao registrar emoção' });
    }
});

// Registrar possível distúrbio comportamental
app.post('/api/teacher/disorders', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { student_id, disorder_type, severity, notes } = req.body;
        const schoolDB = getSchoolDB(req.user.school_id);

        schoolDB.prepare(`
            INSERT INTO behavioral_alerts (student_id, alert_type, severity, notes, detected_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).run(student_id, disorder_type, severity || 'medium', notes || '');

        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar alerta comportamental:', error);
        res.status(500).json({ error: 'Erro ao registrar alerta' });
    }
});

// Salvar arranjo de carteiras
app.post('/api/teacher/seating', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { class_id, arrangement } = req.body; // arrangement = array de { studentId, position }
        const schoolDB = getSchoolDB(req.user.school_id);

        // Limpar arranjo anterior
        schoolDB.prepare('DELETE FROM seating_arrangements WHERE class_id = ?').run(class_id);

        // Inserir novo arranjo
        const insert = schoolDB.prepare(`
            INSERT INTO seating_arrangements (class_id, student_id, position, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `);

        const transaction = schoolDB.transaction((seats) => {
            for (const seat of seats) {
                insert.run(class_id, seat.studentId, seat.position);
            }
        });

        transaction(arrangement);
        res.json({ success: true, message: 'Arranjo de carteiras salvo' });
    } catch (error) {
        console.error('Erro ao salvar arranjo de carteiras:', error);
        res.status(500).json({ error: 'Erro ao salvar arranjo' });
    }
});

// Obter relatório completo de um aluno
app.get('/api/teacher/student/:studentId/report', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { studentId } = req.params;
        const schoolDB = getSchoolDB(req.user.school_id);

        // Informações básicas
        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(studentId);

        // Histórico de emoções (últimas 50)
        const emotions = schoolDB.prepare(`
            SELECT emotion, confidence, detected_at
            FROM emotion_logs
            WHERE student_id = ?
            ORDER BY detected_at DESC
            LIMIT 50
        `).all(studentId);

        // Alertas comportamentais
        const alerts = schoolDB.prepare(`
            SELECT alert_type, severity, notes, detected_at
            FROM behavioral_alerts
            WHERE student_id = ?
            ORDER BY detected_at DESC
            LIMIT 20
        `).all(studentId);

        // Respostas de enquetes
        const pollResponses = schoolDB.prepare(`
            SELECT pr.*, p.question, p.option_a, p.option_b, p.option_c, p.option_d, p.correct_answer
            FROM poll_responses pr
            JOIN polls p ON pr.poll_id = p.id
            WHERE pr.student_id = ?
            ORDER BY pr.timestamp DESC
            LIMIT 30
        `).all(studentId);

        // Nível de atenção médio (últimos 7 dias)
        const avgAttention = schoolDB.prepare(`
            SELECT AVG(attention_level) as avg_attention
            FROM student_attention
            WHERE student_id = ? AND timestamp >= datetime('now', '-7 days')
        `).get(studentId);

        res.json({
            student,
            emotions,
            alerts,
            pollResponses,
            avgAttention: avgAttention?.avg_attention || 0
        });
    } catch (error) {
        console.error('Erro ao gerar relatório do aluno:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

// ==================== FIM DOS ENDPOINTS DE MONITORAMENTO AVANÇADO ====================

// Obter dados de atenção da turma
app.get('/api/teacher/class/:classId/attention-data', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { classId } = req.params;
        const schoolDB = getSchoolDB(req.user.school_id);

        const classInfo = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);
        if (!classInfo) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Buscar dados de atenção dos últimos 7 dias
        const attentionData = schoolDB.prepare(`
            SELECT 
                s.id as student_id,
                s.name as student_name,
                AVG(sa.attention_level) as avg_attention,
                AVG(sa.focus_level) as avg_focus,
                COUNT(sa.id) as data_points
            FROM students s
            LEFT JOIN student_attention sa ON s.id = sa.student_id 
                AND sa.timestamp >= datetime('now', '-7 days')
            WHERE s.class_name = ?
            GROUP BY s.id, s.name
        `).all(classInfo.name);

        res.json(attentionData);
    } catch (error) {
        console.error('Erro ao buscar dados de atenção:', error);
        res.status(500).json({ error: 'Erro ao buscar dados de atenção' });
    }
});

// Obter emoções atuais da turma
app.get('/api/teacher/class/:classId/current-emotions', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { classId } = req.params;
        const schoolDB = getSchoolDB(req.user.school_id);

        const classInfo = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);
        if (!classInfo) {
            return res.status(404).json({ error: 'Turma não encontrada' });
        }

        // Buscar última emoção detectada para cada aluno
        const emotions = schoolDB.prepare(`
            SELECT 
                el.student_id,
                el.emotion,
                el.confidence,
                el.detected_at
            FROM emotion_logs el
            INNER JOIN (
                SELECT student_id, MAX(detected_at) as max_date
                FROM emotion_logs
                GROUP BY student_id
            ) latest ON el.student_id = latest.student_id AND el.detected_at = latest.max_date
            INNER JOIN students s ON el.student_id = s.id
            WHERE s.class_name = ?
        `).all(classInfo.name);

        // Converter para objeto { studentId: emotion }
        const emotionsMap = {};
        emotions.forEach(e => {
            emotionsMap[e.student_id] = e.emotion;
        });

        res.json(emotionsMap);
    } catch (error) {
        console.error('Erro ao buscar emoções atuais:', error);
        res.status(500).json({ error: 'Erro ao buscar emoções' });
    }
});

// Obter última mudança de carteiras
app.get('/api/teacher/class/:classId/last-seating-change', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { classId } = req.params;
        const schoolDB = getSchoolDB(req.user.school_id);

        const lastChange = schoolDB.prepare(`
            SELECT MAX(created_at) as last_change
            FROM seating_arrangements_new
            WHERE class_id = ?
        `).get(classId);

        res.json(lastChange);
    } catch (error) {
        console.error('Erro ao buscar última mudança de carteiras:', error);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
});

// ============================================
// ENDPOINTS DO TÉCNICO - CONFIGURAÇÃO DE CÂMERAS
// ============================================

// Listar todas as escolas - COM LOGS DETALHADOS
app.get('/api/technician/schools', authenticateToken, (req, res) => {
    console.log('═══════════════════════════════════════');
    console.log('ENDPOINT CHAMADO: /api/technician/schools');
    console.log('Usuário:', req.user?.email);

    try {
        console.log('1. Obtendo banco de dados...');
        const db = getSystemDB();
        console.log('✅ Banco obtido');

        console.log('2. Executando query...');
        const schools = db.prepare('SELECT * FROM schools ORDER BY name').all();
        console.log('✅ Query executada');
        console.log('Escolas encontradas:', schools.length);

        if (schools.length > 0) {
            console.log('Primeira escola:', schools[0].name);
        }

        console.log('3. Enviando resposta...');
        res.json(schools);
        console.log('✅ Resposta enviada');
        console.log('═══════════════════════════════════════\n');
    } catch (err) {
        console.error('❌❌❌ ERRO DETALHADO ❌❌❌');
        console.error('Mensagem:', err.message);
        console.error('Stack:', err.stack);
        console.error('═══════════════════════════════════════\n');
        res.status(500).json({ message: 'Erro ao buscar escolas' });
    }
});


// Listar salas/turmas de uma escola
app.get('/api/technician/schools/:schoolId/classrooms', authenticateToken, (req, res) => {
    try {
        const { schoolId } = req.params;
        console.log('📚 [TECHNICIAN] Buscando turmas da escola:', schoolId);
        console.log('👤 [TECHNICIAN] Usuário:', req.user.email, 'Role:', req.user.role);

        const schoolDB = getSchoolDB(schoolId);
        const classrooms = schoolDB.prepare('SELECT id, name FROM classes ORDER BY name').all();

        console.log(`✅ [TECHNICIAN] Encontradas ${classrooms.length} turmas`);
        if (classrooms.length > 0) {
            console.log('📋 [TECHNICIAN] Primeiras turmas:', classrooms.slice(0, 3));
        }

        res.json(classrooms);
    } catch (err) {
        console.error('❌ [TECHNICIAN] Erro ao buscar turmas:', err);
        res.status(500).json({ message: 'Erro ao buscar turmas' });
    }
});

// Criar nova turma para uma escola
app.post('/api/technician/schools/:schoolId/classrooms', authenticateToken, (req, res) => {
    try {
        const { schoolId } = req.params;
        const { name, capacity } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Nome é obrigatório' });
        }

        const schoolDB = getSchoolDB(schoolId);

        // Verificar se turma já existe
        const existing = schoolDB.prepare('SELECT id FROM classes WHERE name = ?').get(name);
        if (existing) {
            return res.status(400).json({ message: 'Já existe uma turma com este nome' });
        }

        // Criar turma
        const result = schoolDB.prepare(`
            INSERT INTO classes (name)
            VALUES (?)
        `).run(name);

        console.log(`📚 Turma "${name}" criada na escola ${schoolId} (ID: ${result.lastInsertRowid})`);

        res.json({
            message: 'Turma criada com sucesso',
            classroom: {
                id: result.lastInsertRowid,
                name,
                capacity
            }
        });
    } catch (err) {
        console.error('Erro ao criar turma:', err);
        res.status(500).json({ message: 'Erro ao criar turma' });
    }
});

// Listar câmeras
app.get('/api/technician/cameras', authenticateToken, (req, res) => {
    try {
        const db = getSystemDB();

        // Criar tabela se não existir
        db.prepare(`
            CREATE TABLE IF NOT EXISTS cameras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                school_id INTEGER NOT NULL,
                classroom_id INTEGER NOT NULL,
                camera_name TEXT NOT NULL,
                camera_type TEXT DEFAULT 'IP',
                camera_purpose TEXT DEFAULT 'classroom',
                camera_ip TEXT,
                camera_url TEXT NOT NULL,
                camera_port INTEGER DEFAULT 80,
                camera_username TEXT,
                camera_password TEXT,
                status TEXT DEFAULT 'active',
                notes TEXT,
                installed_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        const cameras = db.prepare(`
            SELECT 
                c.*,
                s.name as school_name
            FROM cameras c
            LEFT JOIN schools s ON c.school_id = s.id
            ORDER BY c.created_at DESC
        `).all();

        // Para cada câmera, buscar turmas vinculadas
        const camerasWithDetails = cameras.map(camera => {
            try {
                const schoolDB = getSchoolDB(camera.school_id);

                // Buscar turmas vinculadas via camera_classes
                let classroomNames = [];
                if (camera.camera_purpose === 'classroom') {
                    const assignedClasses = db.prepare(`
                        SELECT classroom_id FROM camera_classes WHERE camera_id = ?
                    `).all(camera.id);

                    if (assignedClasses.length > 0) {
                        classroomNames = assignedClasses.map(ac => {
                            const classroom = schoolDB.prepare('SELECT name FROM classrooms WHERE id = ?').get(ac.classroom_id);
                            return classroom ? classroom.name : null;
                        }).filter(name => name !== null);
                    } else if (camera.classroom_id && camera.classroom_id !== 0) {
                        // Fallback para câmeras antigas (sem camera_classes)
                        const classroom = schoolDB.prepare('SELECT name FROM classrooms WHERE id = ?').get(camera.classroom_id);
                        if (classroom) classroomNames.push(classroom.name);
                    }
                }

                return {
                    ...camera,
                    classroom_names: classroomNames.join(', ') || (camera.camera_purpose === 'entrance' ? 'Entrada da Escola' : 'N/A')
                };
            } catch (err) {
                return {
                    ...camera,
                    classroom_names: 'N/A'
                };
            }
        });

        res.json(camerasWithDetails);
    } catch (err) {
        console.error('Erro ao buscar câmeras:', err);
        res.status(500).json({ message: 'Erro ao buscar câmeras' });
    }
});

// Cadastrar nova câmera
app.post('/api/technician/cameras', authenticateToken, async (req, res) => {
    const {
        school_id,
        classroom_id, // Deprecated - manter para compatibilidade
        assigned_classes, // NOVO: Array de IDs de turmas
        camera_name,
        camera_type,
        camera_purpose, // NOVO: 'entrance' ou 'classroom'
        camera_ip,
        camera_url,
        camera_port,
        camera_username,
        camera_password,
        notes
    } = req.body;

    // Validação básica
    if (!school_id || !camera_name || !camera_url) {
        return res.status(400).json({ message: 'Dados obrigatórios faltando (school_id, camera_name, camera_url)' });
    }

    // Validar finalidade da câmera
    const purpose = camera_purpose || 'classroom';
    if (purpose === 'classroom' && (!assigned_classes || assigned_classes.length === 0)) {
        return res.status(400).json({ message: 'Câmeras de sala de aula precisam de turmas vinculadas' });
    }

    try {
        const db = getSystemDB();

        // Criar tabela se não existir
        db.prepare(`
            CREATE TABLE IF NOT EXISTS cameras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                school_id INTEGER NOT NULL,
                classroom_id INTEGER NOT NULL,
                camera_name TEXT NOT NULL,
                camera_type TEXT DEFAULT 'IP',
                camera_purpose TEXT DEFAULT 'classroom',
                camera_ip TEXT,
                camera_url TEXT NOT NULL,
                camera_port INTEGER DEFAULT 80,
                camera_username TEXT,
                camera_password TEXT,
                status TEXT DEFAULT 'active',
                notes TEXT,
                installed_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        // Criptografar senha se fornecida
        let encryptedPassword = null;
        if (camera_password) {
            encryptedPassword = await bcrypt.hash(camera_password, 10);
        }

        // Para câmeras de entrada, usar classroom_id = 0 (não vinculada)
        const firstClassroomId = purpose === 'entrance' ? 0 : (assigned_classes && assigned_classes.length > 0 ? assigned_classes[0] : classroom_id);

        const result = db.prepare(`
            INSERT INTO cameras (
                school_id, classroom_id, camera_name, camera_type, camera_purpose,
                camera_ip, camera_url, camera_port,
                camera_username, camera_password,
                notes, installed_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `).run(
            school_id,
            firstClassroomId,
            camera_name,
            camera_type || 'IP',
            purpose,
            camera_ip || null,
            camera_url,
            camera_port || 80,
            camera_username || null,
            encryptedPassword,
            notes || null,
            req.user.id
        );

        const cameraId = result.lastInsertRowid;

        // Inserir relacionamento com turmas (se sala de aula)
        if (purpose === 'classroom' && assigned_classes && assigned_classes.length > 0) {
            const stmt = db.prepare(`
                INSERT INTO camera_classes (camera_id, classroom_id)
                VALUES (?, ?)
            `);

            for (const classroomId of assigned_classes) {
                try {
                    stmt.run(cameraId, classroomId);
                } catch (err) {
                    // Ignorar duplicatas
                    if (!err.message.includes('UNIQUE constraint')) {
                        throw err;
                    }
                }
            }
        }

        console.log(`📹 Câmera ${camera_name} cadastrada (ID: ${cameraId}, Finalidade: ${purpose})`);

        res.json({
            message: 'Câmera configurada com sucesso',
            cameraId: cameraId
        });
    } catch (err) {
        console.error('Erro ao criar câmera:', err);
        res.status(500).json({ message: 'Erro ao criar câmera' });
    }
});

// Testar conexão com câmera
app.post('/api/technician/cameras/test', authenticateToken, async (req, res) => {
    const { camera_url, camera_type } = req.body;

    if (!camera_url) {
        return res.status(400).json({ message: 'URL da câmera é obrigatória' });
    }

    try {
        const axios = require('axios');

        try {
            const response = await axios.get(camera_url, {
                timeout: 5000,
                validateStatus: () => true
            });

            if (response.status === 200 || response.status === 401) {
                res.json({
                    success: true,
                    message: '✅ Conexão bem-sucedida! Câmera está respondendo.'
                });
            } else {
                res.json({
                    success: false,
                    message: `⚠️ Câmera respondeu com status ${response.status}`
                });
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                res.json({
                    success: false,
                    message: '❌ Conexão recusada. Verifique IP e porta.'
                });
            } else if (error.code === 'ETIMEDOUT') {
                res.json({
                    success: false,
                    message: '❌ Tempo esgotado. Câmera não responde.'
                });
            } else {
                res.json({
                    success: false,
                    message: `❌ Erro: ${error.message}`
                });
            }
        }
    } catch (err) {
        console.error('Erro ao testar câmera:', err);
        res.status(500).json({
            success: false,
            message: 'Erro ao testar conexão'
        });
    }
});

// Deletar câmera - BLOQUEADO (apenas Super Admin pode aprovar remoção)
app.delete('/api/technician/cameras/:id', authenticateToken, (req, res) => {
    return res.status(403).json({
        message: '🔒 Apenas Super Admin pode remover câmeras. Use "Solicitar Remoção".'
    });
});

// Solicitar remoção de câmera (Técnico ou Escola)
app.post('/api/technician/cameras/:id/request-removal', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const db = getSystemDB();

        // Verificar se câmera existe
        const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(id);
        if (!camera) {
            return res.status(404).json({ message: 'Câmera não encontrada' });
        }

        // Determinar tipo de solicitante
        const requesterType = req.user.role === 'technician' ? 'technician' : 'school';

        // Criar solicitação
        db.prepare(`
            INSERT INTO camera_removal_requests 
            (camera_id, requester_type, requester_id, reason, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(id, requesterType, req.user.id, reason || 'Sem motivo especificado');

        console.log(`📝 Solicitação de remoção criada para câmera ${id} por ${requesterType} ${req.user.id}`);

        res.json({
            message: '✅ Solicitação enviada! Aguarde aprovação do Super Admin.'
        });
    } catch (err) {
        console.error('Erro ao solicitar remoção:', err);
        res.status(500).json({ message: 'Erro ao solicitar remoção' });
    }
});

// Escola solicita remoção de câmera
app.post('/api/school/cameras/:id/request-removal', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const db = getSystemDB();

        // Verificar se câmera pertence à escola
        const camera = db.prepare('SELECT * FROM cameras WHERE id = ? AND school_id = ?').get(id, req.user.school_id);
        if (!camera) {
            return res.status(404).json({ message: 'Câmera não encontrada ou não pertence a esta escola' });
        }

        // Criar solicitação
        db.prepare(`
            INSERT INTO camera_removal_requests 
            (camera_id, requester_type, requester_id, reason, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(id, 'school', req.user.school_id, reason || 'Sem motivo especificado');

        console.log(`📝 Solicitação de remoção criada para câmera ${id} pela escola ${req.user.school_id}`);

        res.json({
            message: '✅ Solicitação enviada! Aguarde aprovação do Super Admin.'
        });
    } catch (err) {
        console.error('Erro ao solicitar remoção:', err);
        res.status(500).json({ message: 'Erro ao solicitar remoção' });
    }
});

// Listar câmeras da escola (para dashboard da escola)
app.get('/api/school/cameras', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'school') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const db = getSystemDB();
        const cameras = db.prepare(`
            SELECT 
                c.*,
                s.name as school_name
            FROM cameras c
            LEFT JOIN schools s ON c.school_id = s.id
            WHERE c.school_id = ?
            ORDER BY c.created_at DESC
        `).all(req.user.school_id);

        // Para cada câmera, buscar turmas vinculadas
        const camerasWithDetails = cameras.map(camera => {
            try {
                const schoolDB = getSchoolDB(camera.school_id);

                let classroomNames = [];
                if (camera.camera_purpose === 'classroom') {
                    const assignedClasses = db.prepare(`
                        SELECT classroom_id FROM camera_classes WHERE camera_id = ?
                    `).all(camera.id);

                    if (assignedClasses.length > 0) {
                        classroomNames = assignedClasses.map(ac => {
                            const classroom = schoolDB.prepare('SELECT name FROM classrooms WHERE id = ?').get(ac.classroom_id);
                            return classroom ? classroom.name : null;
                        }).filter(name => name !== null);
                    }
                }

                return {
                    ...camera,
                    classroom_names: classroomNames.join(', ') || (camera.camera_purpose === 'entrance' ? 'Entrada da Escola' : 'N/A')
                };
            } catch (err) {
                return {
                    ...camera,
                    classroom_names: 'N/A'
                };
            }
        });

        res.json(camerasWithDetails);
    } catch (err) {
        console.error('Erro ao buscar câmeras da escola:', err);
        res.status(500).json({ message: 'Erro ao buscar câmeras' });
    }
});

// Listar solicitações de remoção (Super Admin)
app.get('/api/admin/camera-removal-requests', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const db = getSystemDB();
        const requests = db.prepare(`
            SELECT 
                r.*,
                c.camera_name,
                c.school_id,
                c.camera_purpose,
                s.name as school_name
            FROM camera_removal_requests r
            JOIN cameras c ON r.camera_id = c.id
            JOIN schools s ON c.school_id = s.id
            WHERE r.status = 'pending'
            ORDER BY r.requested_at DESC
        `).all();

        res.json(requests);
    } catch (err) {
        console.error('Erro ao listar solicitações:', err);
        res.status(500).json({ message: 'Erro ao listar solicitações' });
    }
});

// Aprovar remoção de câmera (Super Admin)
app.post('/api/admin/camera-removal-requests/:id/approve', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const { id } = req.params;
        const db = getSystemDB();

        // Buscar solicitação
        const request = db.prepare('SELECT * FROM camera_removal_requests WHERE id = ?').get(id);
        if (!request) {
            return res.status(404).json({ message: 'Solicitação não encontrada' });
        }

        // Deletar câmera e relacionamentos
        db.prepare('DELETE FROM camera_classes WHERE camera_id = ?').run(request.camera_id);
        db.prepare('DELETE FROM cameras WHERE id = ?').run(request.camera_id);

        // Atualizar solicitação
        db.prepare(`
            UPDATE camera_removal_requests 
            SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(req.user.id, id);

        console.log(`✅ Câmera ${request.camera_id} removida pelo Super Admin ${req.user.id}`);

        res.json({ message: '✅ Câmera removida com sucesso' });
    } catch (err) {
        console.error('Erro ao aprovar remoção:', err);
        res.status(500).json({ message: 'Erro ao aprovar remoção' });
    }
});

// Rejeitar remoção de câmera (Super Admin)
app.post('/api/admin/camera-removal-requests/:id/reject', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const { id } = req.params;
        const db = getSystemDB();

        // Buscar solicitação
        const request = db.prepare('SELECT * FROM camera_removal_requests WHERE id = ?').get(id);
        if (!request) {
            return res.status(404).json({ message: 'Solicitação não encontrada' });
        }

        // Atualizar solicitação para rejeitada
        db.prepare(`
            UPDATE camera_removal_requests 
            SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(req.user.id, id);

        console.log(`❌ Solicitação ${id} rejeitada pelo Super Admin ${req.user.id}`);

        res.json({ message: '❌ Solicitação rejeitada e arquivada' });
    } catch (err) {
        console.error('Erro ao rejeitar remoção:', err);
        res.status(500).json({ message: 'Erro ao rejeitar remoção' });
    }
});

// Obter câmera de uma turma (para o professor)
app.get('/api/teacher/classroom/:id/camera', authenticateToken, (req, res) => {
    try {
        const db = getSystemDB();
        const camera = db.prepare(`
            SELECT id, camera_name, camera_url, camera_type, status
            FROM cameras
            WHERE classroom_id = ? AND school_id = ? AND status = 'active'
            LIMIT 1
        `).get(req.params.id, req.user.school_id);

        if (!camera) {
            return res.status(404).json({
                message: 'Câmera não configurada para esta sala'
            });
        }

        res.json(camera);
    } catch (err) {
        console.error('Erro ao buscar câmera:', err);
        res.status(500).json({ message: 'Erro ao buscar câmera' });
    }
});

/**
 * Reconecta todas as sessões WhatsApp e inicia keep-alive
 */
async function reconnectWhatsAppSessions() {
    console.log('🔄 Reconectando sessões WhatsApp para todas as escolas...');

    const db = getSystemDB();
    const schools = db.prepare('SELECT id FROM schools').all();

    for (const school of schools) {
        try {
            console.log(`📱 Inicializando WhatsApp para Escola ${school.id}...`);
            const whatsappService = getWhatsAppService(school.id);
            await whatsappService.initialize();

            // Iniciar keep-alive para manter sempre conectado
            whatsappService.startKeepAlive();

        } catch (error) {
            console.error(`❌ Erro ao inicializar WhatsApp para Escola ${school.id}:`, error.message);
        }
    }

    console.log('✅ Reconexão WhatsApp concluída para todas as escolas');
}


// ============================================================================
// ATTENDANCE ENDPOINT - REGISTRO DE PRESENÇA COM WHATSAPP AUTOMÁTICO
// ============================================================================
/**
 * Este é o endpoint MAIS IMPORTANTE do sistema de notificações!
 * 
 * Quando a câmera detecta um aluno chegando na escola:
 * 1. Registra a presença no banco de dados
 * 2. Envia WhatsApp AUTOMATICAMENTE para o responsável
 * 
 * CHAMADO POR: AttendancePanel.jsx quando câmera reconhece aluno
 */

/**
 * POST /api/attendance/arrival
 * Registra chegada do aluno e envia notificação WhatsApp
 * 
 * BODY: { student_id: number }
 * 
 * PROCESSO:
 * 1. Busca dados do aluno
 * 2. Verifica se já registrou entrada hoje (evita duplicatas)
 * 3. Registra presença no banco
 * 4. ENVIA WHATSAPP para o responsável
 */
app.post('/api/attendance/arrival', authenticateToken, async (req, res) => {
    // Apenas school_admin pode registrar presença
    if (req.user.role !== 'school_admin') {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    const { student_id } = req.body;
    const schoolId = req.user.id;

    // Validação
    if (!student_id) {
        return res.status(400).json({ error: 'student_id é obrigatório' });
    }

    try {
        console.log(`📥 Registrando chegada do aluno ${student_id} na Escola ${schoolId}`);

        const schoolDB = getSchoolDB(schoolId);

        // 1. BUSCAR DADOS DO ALUNO
        const student = schoolDB.prepare(`
            SELECT * FROM students WHERE id = ?
        `).get(student_id);

        if (!student) {
            console.log(`❌ Aluno ${student_id} não encontrado`);
            return res.status(404).json({ error: 'Aluno não encontrado' });
        }

        console.log(`👤 Aluno encontrado: ${student.name}`);

        // 2. VERIFICAR SE JÁ REGISTROU ENTRADA HOJE
        const today = new Date().toISOString().split('T')[0];
        const existingEntry = schoolDB.prepare(`
            SELECT * FROM attendance 
            WHERE student_id = ? 
            AND date(timestamp) = date('now', 'localtime')
            AND type = 'entry'
        `).get(student_id);

        if (existingEntry) {
            console.log(`⚠️ Aluno ${student.name} já registrou entrada hoje`);
            return res.json({
                success: true,
                message: 'Entrada já registrada hoje',
                duplicate: true
            });
        }

        // 3. REGISTRAR PRESENÇA NO BANCO
        const timestamp = new Date().toISOString();
        schoolDB.prepare(`
            INSERT INTO attendance (student_id, timestamp, type)
            VALUES (?, ?, 'entry')
        `).run(student_id, timestamp);

        console.log(`✅ Presença registrada para ${student.name}`);

        // 4. ENVIAR WHATSAPP AUTOMATICAMENTE
        try {
            await sendWhatsAppArrivalNotification(schoolId, student, timestamp);
        } catch (whatsappError) {
            // Não falhar a requisição se WhatsApp der erro
            console.error('⚠️ Erro ao enviar WhatsApp (presença foi registrada):', whatsappError.message);
        }

        // 5. RETORNAR SUCESSO
        res.json({
            success: true,
            message: 'Presença registrada e notificação enviada',
            student: {
                id: student.id,
                name: student.name,
                class_name: student.class_name
            },
            timestamp
        });

    } catch (error) {
        console.error('❌ Erro ao registrar presença:', error);
        res.status(500).json({
            error: 'Erro ao registrar presença: ' + error.message
        });
    }
});

/**
 * FUNÇÃO AUXILIAR: Envia notificação WhatsApp de chegada
 * 
 * @param {number} schoolId - ID da escola
 * @param {object} student - Dados do aluno
 * @param {string} timestamp - Horário da chegada
 */
async function sendWhatsAppArrivalNotification(schoolId, student, timestamp) {
    console.log(`📱 Preparando envio WhatsApp para ${student.name}...`);

    // 1. OBTER SERVIÇO WHATSAPP DA ESCOLA
    const whatsappService = getWhatsAppService(schoolId);

    // 2. VERIFICAR SE ESTÁ CONECTADO
    if (!whatsappService.isConnected) {
        console.log(`⚠️ WhatsApp não conectado para Escola ${schoolId}`);
        throw new Error('WhatsApp não conectado');
    }

    // 3. VERIFICAR SE ALUNO TEM TELEFONE
    if (!student.phone) {
        console.log(`⚠️ Aluno ${student.name} não tem telefone cadastrado`);
        throw new Error('Aluno sem telefone cadastrado');
    }

    // 4. FORMATAR NÚMERO WHATSAPP
    // Remove caracteres especiais e adiciona @s.whatsapp.net
    let phoneNumber = student.phone.replace(/\D/g, ''); // Remove tudo que não é número

    // Se não tem código do país, adiciona 55 (Brasil)
    if (!phoneNumber.startsWith('55')) {
        phoneNumber = '55' + phoneNumber;
    }

    const whatsappNumber = phoneNumber + '@s.whatsapp.net';
    console.log(`📞 Número formatado: ${whatsappNumber}`);

    // 5. MONTAR MENSAGEM
    const arrivalTime = new Date(timestamp);
    const timeStr = arrivalTime.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const dateStr = arrivalTime.toLocaleDateString('pt-BR');

    const message = `
🎓 *EduFocus - Notificação de Chegada*

Olá! Seu filho(a) *${student.name}* chegou à escola com segurança.

📅 Data: ${dateStr}
🕐 Horário: ${timeStr}
${student.class_name ? `📚 Turma: ${student.class_name}` : ''}

Tenha um ótimo dia! 😊
    `.trim();

    // 6. ENVIAR MENSAGEM
    console.log(`📤 Enviando mensagem para ${whatsappNumber}...`);
    await whatsappService.sendMessage(whatsappNumber, message);
    console.log(`✅ WhatsApp enviado com sucesso para ${student.name}!`);
}

// ============================================================================
// FIM DO ENDPOINT DE PRESENÇA
// ============================================================================

// ============================================================================
// WHATSAPP ENDPOINTS - GERENCIAMENTO DE CONEXÃO
// ============================================================================
/**
 * Estes endpoints permitem que a escola gerencie sua conexão WhatsApp
 * para envio automático de notificações aos pais.
 * 
 * FLUXO:
 * 1. POST /api/whatsapp/connect - Inicia conexão e gera QR Code
 * 2. GET /api/whatsapp/status - Verifica status e pega QR Code
 * 3. POST /api/whatsapp/disconnect - Desconecta WhatsApp
 */

/**
 * GET /api/whatsapp/status
 * Verifica o status da conexão WhatsApp da escola
 * 
 * RETORNA:
 * {
 *   connected: boolean,
 *   message: string,
 *   qrCode: string|null
 * }
 */
app.get('/api/whatsapp/status', authenticateToken, (req, res) => {
    // Apenas school_admin pode acessar
    if (req.user.role !== 'school_admin') {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
        const schoolId = req.user.id;
        console.log(`📊 Verificando status WhatsApp para Escola ${schoolId}`);

        // Obter instância do serviço WhatsApp
        const whatsappService = getWhatsAppService(schoolId);

        // Retornar status atual
        const status = {
            connected: whatsappService.isConnected,
            message: whatsappService.isConnected
                ? 'WhatsApp conectado e pronto para enviar notificações'
                : whatsappService.qrCode
                    ? 'Aguardando escaneamento do QR Code'
                    : 'WhatsApp desconectado',
            qrCode: whatsappService.qrCode
        };

        console.log(`✅ Status: ${status.connected ? 'Conectado' : 'Desconectado'}`);
        res.json(status);

    } catch (error) {
        console.error('❌ Erro ao verificar status WhatsApp:', error);
        res.status(500).json({
            error: 'Erro ao verificar status',
            connected: false,
            message: 'Erro ao verificar status: ' + error.message,
            qrCode: null
        });
    }
});

/**
 * POST /api/whatsapp/connect
 * Inicia a conexão com WhatsApp e gera QR Code
 * 
 * PROCESSO:
 * 1. Cria instância do WhatsAppService para a escola
 * 2. Inicializa conexão (gera QR Code)
 * 3. QR Code fica disponível em /api/whatsapp/status
 * 4. Quando usuário escaneia, conexão é estabelecida
 */
app.post('/api/whatsapp/connect', authenticateToken, async (req, res) => {
    // Apenas school_admin pode conectar
    if (req.user.role !== 'school_admin') {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
        const schoolId = req.user.id;
        console.log(`🔌 Iniciando conexão WhatsApp para Escola ${schoolId}`);

        // Obter ou criar instância do serviço
        const whatsappService = getWhatsAppService(schoolId);

        // Se já está conectado, retornar sucesso
        if (whatsappService.isConnected) {
            console.log(`✅ WhatsApp já conectado para Escola ${schoolId}`);
            return res.json({
                success: true,
                message: 'WhatsApp já está conectado',
                connected: true
            });
        }

        // Inicializar conexão (isso vai gerar o QR Code)
        await whatsappService.initialize();

        console.log(`✅ Conexão WhatsApp iniciada para Escola ${schoolId}`);
        res.json({
            success: true,
            message: 'Conexão iniciada. Escaneie o QR Code que aparecerá na tela.',
            connected: false
        });

    } catch (error) {
        console.error('❌ Erro ao conectar WhatsApp:', error);
        res.status(500).json({
            error: 'Erro ao conectar WhatsApp: ' + error.message
        });
    }
});

/**
 * POST /api/whatsapp/disconnect
 * Desconecta o WhatsApp da escola
 * 
 * IMPORTANTE:
 * - Para o envio de notificações automáticas
 * - Remove a sessão salva
 * - Requer nova conexão via QR Code
 */
app.post('/api/whatsapp/disconnect', authenticateToken, async (req, res) => {
    // Apenas school_admin pode desconectar
    if (req.user.role !== 'school_admin') {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
        const schoolId = req.user.id;
        console.log(`🔌 Desconectando WhatsApp para Escola ${schoolId}`);

        // Obter instância do serviço
        const whatsappService = getWhatsAppService(schoolId);

        // Se não está conectado, retornar sucesso mesmo assim
        if (!whatsappService.isConnected && !whatsappService.sock) {
            console.log(`ℹ️ WhatsApp já estava desconectado para Escola ${schoolId}`);
            return res.json({
                success: true,
                message: 'WhatsApp já estava desconectado'
            });
        }

        // Desconectar
        await whatsappService.disconnect();

        console.log(`✅ WhatsApp desconectado com sucesso para Escola ${schoolId}`);
        res.json({
            success: true,
            message: 'WhatsApp desconectado com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro ao desconectar WhatsApp:', error);
        res.status(500).json({
            error: 'Erro ao desconectar WhatsApp: ' + error.message
        });
    }
});

// ============================================================================
// FIM DOS ENDPOINTS WHATSAPP
// ============================================================================

// ==================== ENDPOINTS DE FUNCIONÁRIOS ====================

// Listar funcionários da escola
app.get('/api/school/employees', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const schoolDB = getSchoolDB(req.user.id);

    try {
        const employees = schoolDB.prepare('SELECT * FROM employees ORDER BY name').all();
        res.json(employees);
    } catch (error) {
        console.error('Erro ao listar funcionários:', error);
        res.status(500).json({ error: 'Erro ao listar funcionários' });
    }
});

// Cadastrar funcionário
app.post('/api/school/employees', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, role, email, phone, employee_id, photo_url, face_descriptor, work_start_time, work_end_time } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    console.log('📝 Tentando cadastrar funcionário:', { name, role, employee_id, work_start_time, work_end_time, hasPhoto: !!photo_url, hasDescriptor: !!face_descriptor });

    // Validação básica
    if (!name || !role) {
        console.error('❌ Campos obrigatórios faltando');
        return res.status(400).json({ error: 'Nome e cargo são obrigatórios' });
    }

    try {
        const result = schoolDB.prepare(`
            INSERT INTO employees (name, role, email, phone, employee_id, photo_url, face_descriptor, work_start_time, work_end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, role, email || null, phone || null, employee_id || null, photo_url || null, face_descriptor || null, work_start_time || '08:00', work_end_time || '17:00');

        console.log(`✅ Funcionário ${name} cadastrado com ID ${result.lastInsertRowid} (Horário: ${work_start_time || '08:00'} - ${work_end_time || '17:00'})`);
        res.json({ id: result.lastInsertRowid, message: 'Funcionário cadastrado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao cadastrar funcionário:', error.message);
        res.status(500).json({ error: 'Erro ao cadastrar funcionário: ' + error.message });
    }
});

// Atualizar funcionário
app.put('/api/school/employees/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const { name, role, email, phone, employee_id, photo_url, face_descriptor, work_start_time, work_end_time } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    console.log(`🔄 Atualizando funcionário ID ${id}:`, { name, role, work_start_time, work_end_time });

    // Validação básica
    if (!name || !role) {
        console.error('❌ Campos obrigatórios faltando');
        return res.status(400).json({ error: 'Nome e cargo são obrigatórios' });
    }

    try {
        const result = schoolDB.prepare(`
            UPDATE employees 
            SET name = ?, role = ?, email = ?, phone = ?, employee_id = ?, 
                photo_url = ?, face_descriptor = ?, work_start_time = ?, work_end_time = ?
            WHERE id = ?
        `).run(name, role, email || null, phone || null, employee_id || null,
            photo_url || null, face_descriptor || null,
            work_start_time || '08:00', work_end_time || '17:00', id);

        if (result.changes === 0) {
            console.error(`❌ Funcionário ID ${id} não encontrado`);
            return res.status(404).json({ error: 'Funcionário não encontrado' });
        }

        console.log(`✅ Funcionário ${name} (ID: ${id}) atualizado com sucesso`);
        res.json({ message: 'Funcionário atualizado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao atualizar funcionário:', error.message);
        res.status(500).json({ error: 'Erro ao atualizar funcionário: ' + error.message });
    }
});

// Deletar funcionário
app.delete('/api/school/employees/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        // Deletar registros de ponto do funcionário
        schoolDB.prepare('DELETE FROM employee_attendance WHERE employee_id = ?').run(id);

        // Deletar funcionário
        const result = schoolDB.prepare('DELETE FROM employees WHERE id = ?').run(id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Funcionário não encontrado' });
        }

        console.log(`✅ Funcionário ID ${id} excluído`);
        res.json({ message: 'Funcionário excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        res.status(500).json({ error: 'Erro ao excluir funcionário' });
    }
});

// Registrar ponto de funcionário
app.post('/api/school/employee-attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { employee_id } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        // Verificar se já registrou hoje
        const today = new Date().toISOString().split('T')[0];
        const existing = schoolDB.prepare(`
            SELECT id FROM employee_attendance 
            WHERE employee_id = ? AND date(timestamp) = date(?)
        `).get(employee_id, today);

        if (existing) {
            return res.status(400).json({
                error: 'Funcionário já registrou ponto hoje',
                alreadyRegistered: true
            });
        }

        // Registrar ponto
        const result = schoolDB.prepare(`
            INSERT INTO employee_attendance (employee_id, timestamp)
            VALUES (?, datetime('now', 'localtime'))
        `).run(employee_id);

        console.log(`✅ Ponto registrado para funcionário ID ${employee_id}`);
        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Ponto registrado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao registrar ponto:', error);
        res.status(500).json({ error: 'Erro ao registrar ponto' });
    }
});

// Buscar registros de frequência de ALUNOS
app.get('/api/school/attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin' && req.user.role !== 'receptionist') return res.sendStatus(403);

    const schoolId = req.user.id;
    const { startDate, endDate } = req.query;
    const schoolDB = getSchoolDB(schoolId);

    try {
        let query = `
            SELECT a.*, s.name as student_name, s.class_name 
            FROM attendance a
            JOIN students s ON a.student_id = s.id
        `;
        const params = [];

        if (startDate && endDate) {
            query += ` WHERE date(a.timestamp) BETWEEN date(?) AND date(?)`;
            params.push(startDate, endDate);
        } else {
            query += ` WHERE date(a.timestamp) = date('now', 'localtime')`;
        }

        query += ` ORDER BY a.timestamp DESC`;

        const records = schoolDB.prepare(query).all(...params);
        res.json(records);
    } catch (error) {
        console.error('Erro ao buscar frequência de alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
});

// Buscar registros de ponto de funcionários
app.get('/api/school/employee-attendance', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { date, startDate, endDate } = req.query;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        let query = `
            SELECT 
                ea.*,
                e.name as employee_name,
                e.role as employee_role
            FROM employee_attendance ea
            JOIN employees e ON ea.employee_id = e.id
        `;

        const params = [];

        if (date) {
            query += ' WHERE date(ea.timestamp) = date(?)';
            params.push(date);
        } else if (startDate && endDate) {
            query += ' WHERE date(ea.timestamp) BETWEEN date(?) AND date(?)';
            params.push(startDate, endDate);
        }

        query += ' ORDER BY ea.timestamp DESC';

        const records = schoolDB.prepare(query).all(...params);
        res.json(records);
    } catch (error) {
        console.error('Erro ao buscar registros de ponto:', error);
        res.status(500).json({ error: 'Erro ao buscar registros' });
    }
});

// ==================== FIM DOS ENDPOINTS DE FUNCIONÁRIOS ====================

// ==================== ENDPOINTS DE GUARDIANS (RESPONSÁVEIS) ====================

// Registro de Guardian
app.post('/api/guardian/register', async (req, res) => {
    const { email, password, name, phone } = req.body;
    const db = getSystemDB();

    try {
        // Verificar se email já existe
        const existing = db.prepare('SELECT * FROM guardians WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Inserir guardian
        const result = db.prepare(`
            INSERT INTO guardians (email, password, name, phone)
            VALUES (?, ?, ?, ?)
        `).run(email, hashedPassword, name, phone);

        // Gerar token JWT
        const token = jwt.sign(
            { id: result.lastInsertRowid, role: 'guardian', email },
            SECRET_KEY,
            { expiresIn: '30d' }
        );

        console.log(`✅ Guardian cadastrado: ${name} (${email})`);

        res.json({
            token,
            user: {
                id: result.lastInsertRowid,
                email,
                name,
                phone,
                role: 'guardian'
            }
        });
    } catch (error) {
        console.error('Erro ao registrar guardian:', error);
        res.status(500).json({ error: 'Erro ao registrar' });
    }
});

// Login de Guardian
app.post('/api/guardian/login', async (req, res) => {
    const { email, password } = req.body;
    const db = getSystemDB();

    try {
        const guardian = db.prepare('SELECT * FROM guardians WHERE email = ?').get(email);

        if (!guardian) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        const validPassword = await bcrypt.compare(password, guardian.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { id: guardian.id, role: 'guardian', email: guardian.email },
            SECRET_KEY,
            { expiresIn: '30d' }
        );

        console.log(`✅ Guardian login: ${guardian.name} (${guardian.email})`);

        res.json({
            token,
            user: {
                id: guardian.id,
                email: guardian.email,
                name: guardian.name,
                phone: guardian.phone,
                role: 'guardian'
            }
        });
    } catch (error) {
        console.error('Erro no login de guardian:', error);
        res.status(500).json({ error: 'Erro no login' });
    }
});

// Middleware de autenticação para guardians
function authenticateGuardian(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.sendStatus(401);

    const token = authHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'guardian') return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Listar todas as escolas (para dropdown no app)
app.get('/api/guardian/schools', (req, res) => {
    const db = getSystemDB();
    const { search } = req.query;
    try {
        let query = 'SELECT id, name FROM schools WHERE status = ?';
        const params = ['active'];

        if (search) {
            query += ' AND name LIKE ?';
            params.push(`%${search}%`);
        }

        const schools = db.prepare(query).all(...params);
        res.json(schools);
    } catch (error) {
        console.error('Erro ao listar escolas:', error);
        res.status(500).json({ error: 'Erro ao listar escolas' });
    }
});

// Listar turmas de uma escola específica
app.get('/api/guardian/schools/:schoolId/classes', authenticateGuardian, (req, res) => {
    const { schoolId } = req.params;
    try {
        const schoolDB = getSchoolDB(schoolId);
        // Buscar turmas que têm alunos
        const classes = schoolDB.prepare('SELECT DISTINCT class_name as name FROM students WHERE class_name IS NOT NULL ORDER BY class_name').all();
        res.json(classes);
    } catch (error) {
        console.error('Erro ao listar turmas:', error);
        res.status(500).json({ error: 'Erro ao listar turmas' });
    }
});

// Buscar aluno por nome e (opcionalmente) turma para confirmação visual
app.get('/api/guardian/schools/:schoolId/students/search', authenticateGuardian, (req, res) => {
    const { schoolId } = req.params;
    const { name, className } = req.query;

    try {
        const schoolDB = getSchoolDB(schoolId);
        let query = 'SELECT id, name, class_name, photo_url FROM students WHERE 1=1';
        const params = [];

        if (name) {
            query += ' AND name LIKE ?';
            params.push(`%${name}%`);
        }

        if (className) {
            query += ' AND class_name = ?';
            params.push(className);
        }

        query += ' LIMIT 5'; // Limitar resultados para segurança/performance

        const students = schoolDB.prepare(query).all(...params);
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
});

// Vincular aluno (AUTOMÁTICO - sem aprovação da escola)
app.post('/api/guardian/link-student', authenticateGuardian, async (req, res) => {
    const { school_id, student_id } = req.body; // Aceita snake_case do frontend
    const guardianId = req.user.id;
    const db = getSystemDB();

    // Compatibilidade com camelCase se necessário
    const finalSchoolId = school_id || req.body.schoolId;
    const finalStudentId = student_id || req.body.studentId;

    if (!finalSchoolId || !finalStudentId) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    try {
        // Buscar aluno no banco da escola para confirmar existência
        const schoolDB = getSchoolDB(finalSchoolId);
        const student = schoolDB.prepare('SELECT * FROM students WHERE id = ?').get(finalStudentId);

        if (!student) {
            return res.status(404).json({
                error: 'Aluno não encontrado',
                message: 'Verifique se o aluno selecionado ainda existe.'
            });
        }

        // Verificar se já existe vínculo
        const linkExists = schoolDB.prepare(`
            SELECT id FROM student_guardians 
            WHERE student_id = ? AND guardian_id = ?
        `).get(finalStudentId, guardianId);

        if (linkExists) {
            return res.status(400).json({ error: 'Aluno já vinculado' });
        }

        // Criar vínculo
        schoolDB.prepare(`
            INSERT INTO student_guardians (student_id, guardian_id, relationship, status)
            VALUES (?, ?, ?, ?)
        `).run(finalStudentId, guardianId, 'Responsável', 'active');

        console.log(`✅ Vínculo criado: Guardian ${guardianId} -> Aluno ${student.name}`);

        res.json({ success: true, message: 'Vínculo criado com sucesso!' });

    } catch (error) {
        console.error('Erro ao vincular aluno:', error);
        res.status(500).json({ error: 'Erro interno ao vincular aluno' });
    }
});

// Listar alunos vinculados do guardian
app.get('/api/guardian/my-students', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const db = getSystemDB();

    try {
        // Buscar todas as escolas
        const schools = db.prepare('SELECT id, name FROM schools').all();
        const allStudents = [];

        schools.forEach(school => {
            const schoolDB = getSchoolDB(school.id);

            // Buscar alunos vinculados nesta escola
            const students = schoolDB.prepare(`
                SELECT 
                    s.*,
                    sg.linked_at,
                    sg.relationship
                FROM students s
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ? AND sg.status = 'active'
            `).all(guardianId);

            students.forEach(student => {
                allStudents.push({
                    ...student,
                    schoolId: school.id,
                    schoolName: school.name
                });
            });
        });

        res.json(allStudents);
    } catch (error) {
        console.error('Erro ao listar alunos:', error);
        res.status(500).json({ error: 'Erro ao listar alunos' });
    }
});

// Atualizar FCM token do guardian (para notificações push)
app.post('/api/guardian/update-fcm-token', authenticateGuardian, (req, res) => {
    const { fcmToken } = req.body;
    const guardianId = req.user.id;
    const db = getSystemDB();

    try {
        db.prepare('UPDATE guardians SET fcm_token = ? WHERE id = ?').run(fcmToken, guardianId);
        console.log(`✅ FCM token atualizado para Guardian ${guardianId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao atualizar FCM token:', error);
        res.status(500).json({ error: 'Erro ao atualizar token' });
    }
});

// Verificar novas notificações (Polling)
app.get('/api/guardian/check-notifications', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const db = getSystemDB();

    try {
        const schools = db.prepare('SELECT id, name FROM schools').all();
        let notification = null;

        // Verificar cada escola por novas presenças nos últimos 15 segundos
        for (const school of schools) {
            const schoolDB = getSchoolDB(school.id);

            // Buscar alunos deste guardian nesta escola
            const students = schoolDB.prepare(`
                SELECT s.id, s.name, s.class_name, s.photo_url, sc.linked_at
                FROM students s
                JOIN student_guardians sc ON s.id = sc.student_id
                WHERE sc.guardian_id = ? AND sc.status = 'active'
            `).all(guardianId);

            if (students.length === 0) continue;
            // Para cada aluno, verificar presença recente não notificada
            for (const student of students) {
                // Presença recente não notificada
                const presence = schoolDB.prepare(`
                    SELECT * FROM access_logs
                    WHERE student_id = ?
                    AND notified_guardian = 0
                    ORDER BY timestamp DESC
                    LIMIT 1
                `).get(student.id);

                if (presence) {
                    notification = {
                        id: presence.id, // ID Obrigatório para marcar como lida se precisar, ou tracking
                        student_name: student.name,
                        studentName: student.name,
                        class_name: student.class_name,
                        className: student.class_name,
                        school_name: school.name,
                        schoolName: school.name,
                        timestamp: presence.timestamp,
                        event_type: presence.event_type || presence.type, // Tenta event_type (correto no access_logs), fallback para type
                        type: presence.event_type || presence.type,
                        photo_url: student.photo_url,
                        photoUrl: student.photo_url
                    };

                    // Marcar como notificado no banco para não enviar novamente
                    schoolDB.prepare('UPDATE access_logs SET notified_guardian = 1 WHERE id = ?').run(presence.id);

                    console.log('Notificação enviada e marcada como entregue:', notification);
                    break;
                }
            }
            if (notification) break;
        }

        res.json({ notification });
    } catch (error) {
        console.error('Erro ao verificar notificações:', error);
        res.status(500).json({ error: 'Erro ao verificar notificações' });
    }
});

// ==================== ENDPOINTS UNIFICADOS DO APP GUARDIAN ====================
// require('./endpoints_guardian')(app); // [REVERTIDO: Voltando para arquitetura separada]

// ==================== FIM DOS ENDPOINTS DE GUARDIANS ====================

// --- CONFIGURAÇÃO MULTER PARA CHAT ---
const chatStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads/chat');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Sanitizar nome do arquivo para evitar caracteres problematicos
        const originalNameSafe = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const ext = path.extname(originalNameSafe);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
});
const chatUpload = multer({ storage: chatStorage });

// --- ROTAS DE CHAT (MENSAGENS) ---

// 1. GUARDIAN: Listar Mensagens
app.get('/api/guardian/chat/:studentId/messages', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const { studentId } = req.params;
    const { schoolId } = req.query;

    if (!schoolId) return res.status(400).json({ error: 'School ID is required' });

    try {
        const schoolDB = getSchoolDB(schoolId);

        // Verificar permissão
        const permission = schoolDB.prepare(`
            SELECT id FROM student_guardians 
            WHERE guardian_id = ? AND student_id = ? AND status = 'active'
        `).get(guardianId, studentId);

        if (!permission) return res.sendStatus(403);

        const messages = schoolDB.prepare(`
            SELECT * FROM messages WHERE student_id = ? ORDER BY created_at ASC
        `).all(studentId);

        res.json(messages);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

// 2. GUARDIAN: Enviar Mensagem
app.post('/api/guardian/chat/:studentId/messages', authenticateGuardian, chatUpload.single('file'), (req, res) => {
    const guardianId = req.user.id;
    const { studentId } = req.params;
    const { schoolId, content, type } = req.body;

    if (!schoolId) return res.status(400).json({ error: 'School ID required' });

    try {
        const schoolDB = getSchoolDB(schoolId);

        // Verificar permissão
        const permission = schoolDB.prepare(`
            SELECT id FROM student_guardians 
            WHERE guardian_id = ? AND student_id = ? AND status = 'active'
        `).get(guardianId, studentId);

        if (!permission) return res.sendStatus(403);

        const fileUrl = req.file ? `/uploads/chat/${req.file.filename}` : null;
        const fileName = req.file ? req.file.originalname : null;
        let msgType = type || 'text';

        if (req.file) {
            // Se for audio (blob), geralmente não tem extensão direito, mas o multer trata.
            // Checar mimetype
            if (req.file.mimetype.startsWith('audio/')) msgType = 'audio';
            else if (req.file.mimetype.startsWith('image/')) msgType = 'image';
            else msgType = 'file';
        }

        const result = schoolDB.prepare(`
            INSERT INTO messages (sender_type, sender_id, student_id, content, message_type, file_url, file_name)
            VALUES ('guardian', ?, ?, ?, ?, ?, ?)
        `).run(guardianId, studentId, content || '', msgType, fileUrl, fileName);

        res.json({ success: true, id: result.lastInsertRowid, fileUrl, fileName, messageType: msgType });
    } catch (e) {
        console.error('Erro ao enviar mensagem (Guardian):', e);
        res.status(500).json({ error: 'Erro ao enviar' });
    }
});

// 3. SCHOOL: Listar Mensagens
app.get('/api/school/chat/:studentId/messages', authenticateToken, (req, res) => {
    if (!['school_admin', 'teacher', 'receptionist'].includes(req.user.role)) return res.sendStatus(403);

    const schoolId = req.user.id;
    const { studentId } = req.params;
    const schoolDB = getSchoolDB(schoolId);

    try {
        const messages = schoolDB.prepare(`
            SELECT * FROM messages WHERE student_id = ? ORDER BY created_at ASC
        `).all(studentId);
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

// 4. SCHOOL: Enviar Mensagem
app.post('/api/school/chat/:studentId/messages', authenticateToken, chatUpload.single('file'), (req, res) => {
    if (!['school_admin', 'teacher', 'receptionist'].includes(req.user.role)) return res.sendStatus(403);

    const schoolId = req.user.id;
    const { studentId } = req.params;
    const { content, type } = req.body;
    const schoolDB = getSchoolDB(schoolId);

    try {
        const fileUrl = req.file ? `/uploads/chat/${req.file.filename}` : null;
        const fileName = req.file ? req.file.originalname : null;
        let msgType = type || 'text';

        if (req.file) {
            if (req.file.mimetype.startsWith('audio/')) msgType = 'audio';
            else if (req.file.mimetype.startsWith('image/')) msgType = 'image';
            else msgType = 'file';
        }

        const result = schoolDB.prepare(`
            INSERT INTO messages (sender_type, sender_id, student_id, content, message_type, file_url, file_name)
            VALUES ('school', ?, ?, ?, ?, ?, ?)
        `).run(schoolId, studentId, content || '', msgType, fileUrl, fileName);

        res.json({ success: true, id: result.lastInsertRowid, fileUrl, fileName, messageType: msgType });
    } catch (e) {
        console.error('Erro ao enviar mensagem (School):', e);
        res.status(500).json({ error: 'Erro ao enviar' });
    }
});

// 5. SCHOOL: Enviar Mensagem Coletiva (Broadcast)
app.post('/api/school/chat/broadcast', authenticateToken, chatUpload.single('file'), (req, res) => {
    if (!['school_admin', 'teacher', 'receptionist'].includes(req.user.role)) return res.sendStatus(403);

    const schoolId = req.user.id;
    const { classId, content, type } = req.body;
    const schoolDB = getSchoolDB(schoolId);

    try {
        const cls = schoolDB.prepare('SELECT name FROM classes WHERE id = ?').get(classId);
        if (!cls) return res.status(404).json({ error: 'Turma não encontrada' });

        const studentsInClass = schoolDB.prepare('SELECT id FROM students WHERE class_name = ?').all(cls.name);

        const fileUrl = req.file ? `/uploads/chat/${req.file.filename}` : null;
        const fileName = req.file ? req.file.originalname : null;
        let msgType = type || 'text';

        if (req.file) {
            if (req.file.mimetype.startsWith('audio/')) msgType = 'audio';
            else if (req.file.mimetype.startsWith('image/')) msgType = 'image';
            else msgType = 'file';
        }

        const insert = schoolDB.prepare(`
            INSERT INTO messages (sender_type, sender_id, student_id, content, message_type, file_url, file_name)
            VALUES ('school', ?, ?, ?, ?, ?, ?)
        `);

        const transaction = schoolDB.transaction((students) => {
            for (const s of students) {
                insert.run(schoolId, s.id, content || '', msgType, fileUrl, fileName);
            }
        });

        transaction(studentsInClass);

        res.json({ success: true, count: studentsInClass.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao enviar broadcast' });
    }
});

// 6. SCHOOL: Eventos (Criar)
// 6. SCHOOL: Eventos (Criar)
app.post('/api/school/events', authenticateToken, (req, res) => {
    if (!['school_admin', 'teacher', 'receptionist'].includes(req.user.role)) return res.sendStatus(403);
    const schoolId = req.user.id;
    const { title, description, event_date, cost, type, class_name, pix_key, payment_deadline } = req.body;
    const db = getSchoolDB(schoolId);
    try {
        const stmt = db.prepare('INSERT INTO events (title, description, event_date, cost, type, class_name, pix_key, payment_deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(title, description, event_date, cost, type || 'event', class_name || null, pix_key || null, payment_deadline || null);
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// 7. SCHOOL: Eventos (Listar - Admin)
app.get('/api/school/events', authenticateToken, (req, res) => {
    const schoolId = req.user.id;
    const db = getSchoolDB(schoolId);
    try {
        const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
        res.json(events);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. SCHOOL: Eventos (Deletar)
app.delete('/api/school/events/:id', authenticateToken, (req, res) => {
    if (!['school_admin', 'teacher', 'receptionist'].includes(req.user.role)) return res.sendStatus(403);
    const schoolId = req.user.id;
    const db = getSchoolDB(schoolId);
    try {
        db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8.5. SCHOOL: Eventos (Editar)
app.put('/api/school/events/:id', authenticateToken, (req, res) => {
    console.log('PUT /api/school/events/:id chamado');
    console.log('User:', req.user);
    console.log('Params:', req.params);
    console.log('Body:', req.body);

    if (!['school_admin', 'teacher', 'receptionist'].includes(req.user.role)) {
        console.log('Acesso negado - role:', req.user.role);
        return res.sendStatus(403);
    }
    const schoolId = req.user.id;
    const { title, description, event_date, cost, class_name, pix_key, payment_deadline } = req.body;
    const db = getSchoolDB(schoolId);
    try {
        // Tentar adicionar coluna payment_deadline se não existir
        try {
            db.exec('ALTER TABLE events ADD COLUMN payment_deadline DATE');
            console.log('Coluna payment_deadline adicionada');
        } catch (e) { /* Coluna já existe, ignorar */ }

        console.log('Executando UPDATE para evento ID:', req.params.id);
        db.prepare(`
            UPDATE events 
            SET title = ?, description = ?, event_date = ?, cost = ?, class_name = ?, pix_key = ?, payment_deadline = ?
            WHERE id = ?
        `).run(title, description, event_date, cost || null, class_name || null, pix_key || null, payment_deadline || null, req.params.id);
        console.log('Evento atualizado com sucesso!');
        res.json({ success: true });
    } catch (e) {
        console.error('Erro ao atualizar evento:', e);
        res.status(500).json({ error: e.message });
    }
});

// 9. GUARDIAN: Listar Eventos
app.get('/api/guardian/events', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    console.log('GET /api/guardian/events - guardianId:', guardianId);
    const db = getSystemDB();
    try {
        const schools = db.prepare('SELECT id, name FROM schools').all();
        console.log('Escolas encontradas:', schools.length);
        let allEvents = [];

        for (const school of schools) {
            try {
                const schoolDB = getSchoolDB(school.id);

                // Verificar se student_guardians existe e se tem vínculo
                let hasLink = false;
                let myClasses = [];

                try {
                    const linkCheck = schoolDB.prepare('SELECT 1 FROM student_guardians WHERE guardian_id = ? AND status = "active"').get(guardianId);
                    hasLink = !!linkCheck;

                    if (hasLink) {
                        myClasses = schoolDB.prepare(`
                            SELECT DISTINCT s.class_name 
                            FROM students s
                            JOIN student_guardians sg ON s.id = sg.student_id
                            WHERE sg.guardian_id = ? AND sg.status = 'active'
                        `).all(guardianId).map(r => r.class_name).filter(c => c);
                    }
                } catch (e) {
                    // Tabela student_guardians não existe - buscar todos eventos globais
                    console.log('Tabela student_guardians não existe na escola', school.id);
                }

                // Buscar eventos: Se tem vínculo, filtra por turma. Senão, busca globais
                let query = 'SELECT * FROM events WHERE class_name IS NULL';
                const params = [];

                if (hasLink && myClasses.length > 0) {
                    query += ` OR class_name IN (${myClasses.map(() => '?').join(',')})`;
                    params.push(...myClasses);
                }

                query += ' ORDER BY created_at DESC LIMIT 20';

                const events = schoolDB.prepare(query).all(...params);
                console.log(`Escola ${school.name}: ${events.length} eventos encontrados`);

                events.forEach(e => {
                    e.school_name = school.name;
                    e.schoolId = school.id;
                    e.source = 'school_event';
                    allEvents.push(e);
                });

            } catch (e) {
                console.log('Erro na escola', school.id, ':', e.message);
            }
        }

        allEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        console.log('Total de eventos retornados:', allEvents.length);
        res.json(allEvents);

    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

// 10. SCHOOL: Participantes do Evento
app.get('/api/school/events/:id/participants', authenticateToken, (req, res) => {
    const schoolId = req.user.id;
    const db = getSchoolDB(schoolId);
    const systemDB = getSystemDB();
    try {
        const participants = db.prepare(`
            SELECT * FROM event_participations WHERE event_id = ?
        `).all(req.params.id);

        // Enriquecer com dados dos alunos vinculados ao guardian
        const result = participants.map(p => {
            let displayStudentName = 'Desconhecido';
            let displayClassName = '-';

            if (p.guardian_id) {
                // 1. Buscar nome do Responsável (Fallback)
                const guardian = systemDB.prepare('SELECT name FROM guardians WHERE id = ?').get(p.guardian_id);
                const guardianName = guardian ? guardian.name : 'Responsável';

                // 2. Buscar Alunos vinculados a este responsável nesta escola
                const students = db.prepare(`
                    SELECT s.name, s.class_name 
                    FROM students s
                    JOIN student_guardians sg ON s.id = sg.student_id
                    WHERE sg.guardian_id = ? AND sg.status = 'active'
                `).all(p.guardian_id);

                if (students && students.length > 0) {
                    displayStudentName = students.map(s => s.name).join(', ');
                    displayClassName = students.map(s => s.class_name).join(', ');
                } else {
                    displayStudentName = `${guardianName} (Resp. sem aluno vinculado)`;
                }
            }

            return {
                ...p,
                student_name: displayStudentName,
                class_name: displayClassName,
                confirmed_at: p.created_at
            };
        });

        res.json(result);
    } catch (e) {
        console.error('Erro ao buscar participantes:', e);
        res.status(500).json({ error: e.message });
    }
});

// 11. SCHOOL: Confirmar Participação
app.post('/api/school/events/participations/:id/confirm', authenticateToken, (req, res) => {
    const schoolId = req.user.id;
    const { status } = req.body; // 'confirmed', 'paid'
    const db = getSchoolDB(schoolId);
    try {
        db.prepare('UPDATE event_participations SET status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 12. GUARDIAN: Participar em Evento (SIMPLIFICADO)
app.post('/api/guardian/events/:id/participate', authenticateGuardian, (req, res) => {
    try {
        const guardianId = req.user.id;
        const eventId = req.params.id;
        const { schoolId, action } = req.body;

        console.log('[PARTICIPATE] Recebido:', { guardianId, eventId, schoolId, action });

        if (!schoolId) {
            return res.status(400).json({ error: 'schoolId é obrigatório' });
        }

        const db = getSchoolDB(schoolId);

        // Recriar tabela sem constraint de student_id
        try {
            // Tentar dropar tabela antiga (que tinha student_id NOT NULL)
            db.exec('DROP TABLE IF EXISTS event_participations_old');
            db.exec('ALTER TABLE event_participations RENAME TO event_participations_old');
            db.exec(`
                CREATE TABLE event_participations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id INTEGER NOT NULL,
                    guardian_id INTEGER,
                    status TEXT DEFAULT 'interested',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            db.exec('INSERT INTO event_participations (id, event_id, guardian_id, status, created_at) SELECT id, event_id, guardian_id, status, created_at FROM event_participations_old WHERE guardian_id IS NOT NULL');
            db.exec('DROP TABLE event_participations_old');
            console.log('[PARTICIPATE] Tabela migrada com sucesso');
        } catch (e) {
            // Se falhar, criar nova tabela
            db.exec(`
                CREATE TABLE IF NOT EXISTS event_participations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id INTEGER NOT NULL,
                    guardian_id INTEGER,
                    status TEXT DEFAULT 'interested',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        // Determinar status
        let status = 'interested';
        if (action === 'inform_payment') status = 'paid';
        if (action === 'confirm_presence') status = 'confirmed';

        // Verificar se já existe participação deste guardian neste evento
        let existing = null;
        try {
            existing = db.prepare('SELECT id FROM event_participations WHERE event_id = ? AND guardian_id = ?').get(eventId, guardianId);
        } catch (e) {
            // Se a coluna guardian_id não existir, busca por event_id apenas
            existing = db.prepare('SELECT id FROM event_participations WHERE event_id = ?').get(eventId);
        }

        if (existing) {
            db.prepare('UPDATE event_participations SET status = ? WHERE id = ?').run(status, existing.id);
        } else {
            db.prepare('INSERT INTO event_participations (event_id, guardian_id, status) VALUES (?, ?, ?)').run(eventId, guardianId, status);
        }

        console.log('[PARTICIPATE] Sucesso!');
        res.json({ success: true, message: 'Participação confirmada!' });
    } catch (e) {
        console.error('[PARTICIPATE] Erro:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ==================== SERVIR FRONTEND (PRODUÇÃO) ====================
// Serve os arquivos estáticos do Admin Panel (Pasta client/dist)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Qualquer rota que não comece com /api retorna o index.html do React
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint da API não encontrado' });
    }
    // Verifica se o arquivo existe antes de enviar
    const indexPath = path.join(__dirname, '../client/dist/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend build not found. Run "npm run build" in client folder.');
    }
});

const startServer = async () => {
    // 1. Run Seed if available
    if (seedFunc) {
        try {
            await seedFunc();
        } catch (err) {
            console.error('Erro ao executar seed:', err);
        }
    }

    // 2. Auto-reconnect WhatsApp sessions
    try {
        await reconnectWhatsAppSessions();
    } catch (err) {
        console.error('Erro ao reconectar sessões WhatsApp:', err);
    }

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} `);
    });
};

startServer();
