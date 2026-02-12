
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



// --- AUTO-RECONNECT WHATSAPP ON BOOT ---
async function reconnectWhatsAppSessions() {
    console.log('⚠️ WhatsApp desativado conforme solicitação do usuário.');
    return;
    /*
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
    */
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

// Middleware para logar todas as requisições - DEBUG (MOVED)
app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        console.log(`[DEBUG] ${req.method} ${req.originalUrl}`);
        // Log body safely
        if (req.method === 'POST') {
            try {
                const bodyStr = JSON.stringify(req.body, null, 2);
                console.log('Body:', bodyStr ? bodyStr.substring(0, 200) : 'undefined');
            } catch (e) { console.log('Body log error:', e.message); }
        }
    }
    next();
});


// ==================== LOAD EXTERNAL ENDPOINTS ====================
// Prevenindo conflitos se já tiverem sido carregados
try {
    require('./endpoints_guardian')(app);
} catch (e) {
    console.log('Endpoints Guardian já carregados ou erro:', e.message);
}

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

// Migration: Add geolocation columns to schools table (SYSTEM DB)
try {
    const systemDB = getSystemDB();
    const tableInfo = systemDB.prepare("PRAGMA table_info(schools)").all();
    const hasLatitude = tableInfo.some(col => col.name === 'latitude');

    if (!hasLatitude) {
        console.log('Migrating system DB: Adding geolocation columns to schools');
        systemDB.prepare("ALTER TABLE schools ADD COLUMN latitude REAL").run();
        systemDB.prepare("ALTER TABLE schools ADD COLUMN longitude REAL").run();
        systemDB.prepare("ALTER TABLE schools ADD COLUMN number TEXT").run();
        systemDB.prepare("ALTER TABLE schools ADD COLUMN zip_code TEXT").run();
    }

    const hasCustomPrice = tableInfo.some(col => col.name === 'custom_price');
    if (!hasCustomPrice) {
        console.log('Migrating system DB: Adding custom_price column to schools');
        systemDB.prepare("ALTER TABLE schools ADD COLUMN custom_price REAL DEFAULT NULL").run();
    }
} catch (e) {
    console.error('Error migrating schools table:', e);
}

// Middleware to verify token
// Middleware to verify token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.warn(`[AUTH] Falha: No token provided para ${req.url}`);
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.warn(`[AUTH] Falha: Token inválido/expirado para ${req.url}. Erro: ${err.message}`);
            return res.status(403).json({ message: 'Invalid or expired token', error: err.message });
        }
        // console.log(`[AUTH] Sucesso: User ${user.email} (${user.role}) em ${req.url}`);
        req.user = user;
        next();
    });
};
// ... (omitted) ...

// Configurações da Escola (GPS e Endereço)
app.get('/api/school/settings', authenticateToken, (req, res) => {
    // Aceita school_admin ou super_admin
    console.log(`[SETTINGS] GET recebido. User: ${req.user.email}, Role: ${req.user.role}`);

    if (req.user.role !== 'school_admin' && req.user.role !== 'super_admin') {
        console.warn(`[SETTINGS] Acesso negado: Role ${req.user.role} não permitido`);
        return res.status(403).json({ error: 'Acesso negado: Apenas administradores podem acessar configurações.' });
    }

    const db = getSystemDB();
    const id = req.user.school_id || req.user.id;

    try {
        const school = db.prepare('SELECT id, name, address, number, zip_code, latitude, longitude FROM schools WHERE id = ?').get(id);
        if (!school) {
            console.warn(`[SETTINGS] Escola ID ${id} não encontrada`);
            return res.status(404).json({ error: 'Escola não encontrada' });
        }
        res.json(school);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao buscar settings' });
    }
});

// Middleware to verify guardian token
const authenticateGuardian = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }

        // Verificar se é um guardian (role pode ser 'guardian' ou verificar na tabela guardians)
        // Por enquanto, aceitar qualquer token válido para guardians
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
        // Check Inspectors
        user = db.prepare('SELECT * FROM inspectors WHERE email = ?').get(email);
        role = 'inspector';
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
    const { name, admin_name, email, password, address, number, zip_code } = req.body;
    const db = getSystemDB();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const info = db.prepare('INSERT INTO schools (name, admin_name, email, password, address, number, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, admin_name, email, hashedPassword, address, number, zip_code);
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

        // 🔔 Registrar em access_logs para notificação do Guardian App
        try {
            schoolDB.prepare(`
                INSERT INTO access_logs (student_id, event_type, timestamp, notified_guardian)
                VALUES (?, 'arrival', ?, 0)
            `).run(student_id, timestamp);
            console.log(`🔔 [ARRIVAL] Notificação registrada em access_logs para aluno ${student.name}`);
        } catch (logError) {
            console.error(`❌ [ARRIVAL] Erro ao criar access_log:`, logError.message);
        }

        // Enviar notificação WhatsApp - DESATIVADO
        /*
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
        */

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

        // 🔔 Registrar em access_logs para notificação do Guardian App
        try {
            schoolDB.prepare(`
                INSERT INTO access_logs (student_id, event_type, timestamp, notified_guardian)
                VALUES (?, 'departure', ?, 0)
            `).run(student_id, timestamp);
            console.log(`🔔 [DEPARTURE] Notificação registrada em access_logs para aluno ${student.name}`);
        } catch (logError) {
            console.error(`❌ [DEPARTURE] Erro ao criar access_log:`, logError.message);
        }

        // Enviar notificação WhatsApp - DESATIVADO
        /*
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
        */

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

// Configurações da Escola (GPS e Endereço)
app.get('/api/school/settings', authenticateToken, (req, res) => {
    // Aceita school_admin ou super_admin
    if (req.user.role !== 'school_admin' && req.user.role !== 'super_admin') return res.sendStatus(403);

    const db = getSystemDB();
    // Se for super_admin impersonating, poderia ser diferente, mas vamos assumir o próprio login da escola
    const id = req.user.school_id || req.user.id;

    try {
        const school = db.prepare('SELECT id, name, address, number, zip_code, latitude, longitude FROM schools WHERE id = ?').get(id);
        if (!school) return res.status(404).json({ error: 'Escola não encontrada' });
        res.json(school);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao buscar settings' });
    }
});

app.post('/api/school/settings', authenticateToken, (req, res) => {
    console.log('📍 [SETTINGS] POST recebido');
    console.log('📍 [SETTINGS] User:', req.user);
    console.log('📍 [SETTINGS] Body:', req.body);

    const { address, number, zip_code, latitude, longitude } = req.body;
    const db = getSystemDB();
    const id = req.user.school_id || req.user.id;

    console.log(`📍 [SETTINGS] Tentando salvar para escola ID: ${id}`);

    try {
        const school = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(id);
        if (!school) {
            console.error(`❌ [SETTINGS] Escola ID ${id} não encontrada`);
            return res.status(404).json({ error: 'Escola não encontrada' });
        }

        console.log(`📍 [SETTINGS] Escola encontrada: ${school.name}`);

        const result = db.prepare(`
            UPDATE schools 
            SET address = ?, number = ?, zip_code = ?, latitude = ?, longitude = ? 
            WHERE id = ?
        `).run(address, number, zip_code, latitude, longitude, id);

        console.log(`✅ [SETTINGS] UPDATE executado. Changes: ${result.changes}`);

        if (result.changes === 0) {
            console.warn(`⚠️ [SETTINGS] Nenhuma linha foi atualizada!`);
        }

        const updated = db.prepare('SELECT address, number, zip_code, latitude, longitude FROM schools WHERE id = ?').get(id);
        console.log(`✅ [SETTINGS] Dados salvos:`, updated);

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('❌ [SETTINGS] Erro ao salvar:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações', details: error.message });
    }
});

// --- SAAS BILLING ROUTES ---

// Helper para pegar preço padrão
function getDefaultSaasPrice() {
    const db = getSystemDB();
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'saas_default_price'").get();
    return setting ? parseFloat(setting.value) : 6.50;
}

// Endpoint para a escola visualizar sua própria fatura
app.get('/api/saas/school/billing', authenticateToken, (req, res) => {
    // Permite school_admin ou super_admin
    if (req.user.role !== 'school_admin' && req.user.role !== 'super_admin') return res.sendStatus(403);

    const schoolId = req.query.school_id || req.user.school_id || req.user.id;
    const systemDB = getSystemDB();

    try {
        // 1. Informações da Escola e Preço
        const school = systemDB.prepare("SELECT id, name, custom_price FROM schools WHERE id = ?").get(schoolId);
        if (!school) return res.status(404).json({ error: 'Escola não encontrada' });

        const defaultPrice = getDefaultSaasPrice();
        const pricePerStudent = (school.custom_price !== null && school.custom_price !== undefined)
            ? school.custom_price
            : defaultPrice;

        // 2. Contar Alunos no banco da escola
        let studentCount = 0;
        try {
            const schoolDB = getSchoolDB(schoolId);
            const result = schoolDB.prepare("SELECT COUNT(*) as count FROM students").get();
            studentCount = result ? result.count : 0;
        } catch (dbErr) {
            console.warn(`[BILLING] Erro ao acessar banco da escola ${schoolId}: ${dbErr.message}`);
            studentCount = 0;
        }

        // 3. Cálculos
        const totalAmount = studentCount * pricePerStudent;
        const today = new Date();
        const dueDate = new Date(today.getFullYear(), today.getMonth(), 5);

        const status = today.getDate() > 5 ? 'OVERDUE' : 'PENDING';

        res.json({
            school_name: school.name,
            student_count: studentCount,
            price_per_student: pricePerStudent,
            total_amount: totalAmount,
            currency: "BRL",
            due_date: dueDate.toISOString().split('T')[0],
            status: status,
            is_custom_price: school.custom_price !== null
        });

    } catch (e) {
        console.error('[BILLING] Erro:', e);
        res.status(500).json({ error: 'Erro ao calcular fatura', details: e.message });
    }
});

// Endpoint para Super Admin listar faturamento de todas as escolas
app.get('/api/saas/admin/schools', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);

    const systemDB = getSystemDB();
    const defaultPrice = getDefaultSaasPrice();

    try {
        const schools = systemDB.prepare("SELECT id, name, custom_price FROM schools").all();
        const results = schools.map(s => {
            let studentCount = 0;
            try {
                const sDB = getSchoolDB(s.id);
                const countRes = sDB.prepare("SELECT COUNT(*) as count FROM students").get();
                studentCount = countRes ? countRes.count : 0;
            } catch (e) { }

            const price = s.custom_price !== null ? s.custom_price : defaultPrice;

            return {
                id: s.id,
                name: s.name,
                student_count: studentCount,
                price_per_student: price,
                is_custom_price: s.custom_price !== null,
                current_invoice_total: studentCount * price
            };
        });

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para Super Admin buscar preço global
app.get('/api/saas/admin/config', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    res.json({ default_price: getDefaultSaasPrice() });
});

// Endpoint para Super Admin atualizar preço global
app.post('/api/saas/admin/config', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { default_price } = req.body;

    if (default_price === undefined) return res.status(400).json({ error: 'Preço necessário' });

    try {
        const db = getSystemDB();
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('saas_default_price', ?)").run(String(default_price));
        res.json({ success: true, new_default_price: default_price });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para Super Admin atualizar preço customizado de uma escola
app.put('/api/saas/admin/school/:school_id/price', authenticateToken, (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const { school_id } = req.params;
    const { custom_price } = req.body; // Pode ser null para resetar

    try {
        const db = getSystemDB();
        db.prepare("UPDATE schools SET custom_price = ? WHERE id = ?").run(custom_price, school_id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA DE PICKUPS (INSPETOR/ESCOLA) ---
app.get('/api/school/pickups', authenticateToken, (req, res) => {
    // Permite acesso para school_admin, teacher (se necessário) e outros roles da escola
    const schoolId = req.user.school_id || req.user.id;
    const schoolDB = getSchoolDB(schoolId);
    const systemDB = getSystemDB();

    try {
        // Verificar tabela
        try { schoolDB.prepare("SELECT id FROM pickups LIMIT 1").get(); }
        catch (e) { return res.json([]); } // Tabela ainda não criada ou vazia

        // Retiradas de hoje (últimas 24h para garantir)
        const pickups = schoolDB.prepare(`
            SELECT 
                p.*,
                s.name as student_name,
                s.photo_url,
                s.class_name
            FROM pickups p
            JOIN students s ON p.student_id = s.id
            WHERE date(p.timestamp) = date('now', 'localtime')
            ORDER BY p.timestamp DESC
        `).all();

        // Enriquecer com nomes dos guardians (estão no SystemDB)
        if (pickups.length > 0) {
            const guardianIds = [...new Set(pickups.map(p => p.guardian_id))];
            // SQLite `WHERE IN (...)` precisa de placeholders
            const placeholders = guardianIds.map(() => '?').join(',');
            const guardians = systemDB.prepare(`SELECT id, name FROM guardians WHERE id IN (${placeholders})`).all(...guardianIds);

            const guardianMap = {};
            guardians.forEach(g => guardianMap[g.id] = g.name);

            pickups.forEach(p => {
                p.guardian_name = guardianMap[p.guardian_id] || 'Responsável';
            });
        }

        res.json(pickups);
    } catch (error) {
        console.error('Erro ao listar pickups:', error);
        res.status(500).json({ error: 'Erro de servidor' });
    }
});



app.post('/api/school/pickups/:id/status', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'calling', 'completed'
    const schoolId = req.user.school_id || req.user.id;
    const schoolDB = getSchoolDB(schoolId);

    try {
        schoolDB.prepare('UPDATE pickups SET status = ? WHERE id = ?').run(status, id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});

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

    // Get all students
    const students = schoolDB.prepare('SELECT * FROM students').all();

    // Get all face descriptors grouped by student
    const allDescriptors = schoolDB.prepare('SELECT student_id, descriptor, angle FROM face_descriptors ORDER BY student_id').all();
    const descriptorMap = {};
    for (const fd of allDescriptors) {
        if (!descriptorMap[fd.student_id]) descriptorMap[fd.student_id] = [];
        descriptorMap[fd.student_id].push({ descriptor: fd.descriptor, angle: fd.angle });
    }

    // Attach descriptors to students (use first descriptor as face_descriptor for backward compat)
    const result = students.map(s => ({
        ...s,
        face_descriptor: descriptorMap[s.id]?.[0]?.descriptor || null,
        face_descriptors: descriptorMap[s.id] || [],
        face_descriptor_count: descriptorMap[s.id]?.length || 0
    }));

    res.json(result);
});

app.post('/api/school/students', authenticateToken, async (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, parent_email, phone, photo_url, class_name, age, face_descriptor } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log('\n📝 Cadastrando aluno:', { name, parent_email, phone, class_name });

        // 1. Inserir aluno na tabela students (SEM face_descriptor no campo antigo)
        const result = schoolDB.prepare(
            'INSERT INTO students (name, parent_email, phone, photo_url, class_name, age) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(name, parent_email, phone, photo_url, class_name || 'Sem turma', age);

        const studentId = result.lastInsertRowid;
        console.log(`✅ Aluno criado com ID: ${studentId}`);

        // 2. Se tem face_descriptor(s), salvar na tabela face_descriptors
        const face_descriptors = req.body.face_descriptors; // Array of {descriptor, angle}
        if (face_descriptors && Array.isArray(face_descriptors) && face_descriptors.length > 0) {
            // Multi-angle mode
            const insertStmt = schoolDB.prepare('INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)');
            for (const fd of face_descriptors) {
                insertStmt.run(studentId, fd.descriptor, fd.angle || 'front');
            }
            console.log(`✅ ${face_descriptors.length} descritores faciais salvos para aluno ID: ${studentId}`);
        } else if (face_descriptor) {
            // Single descriptor mode (backward compat)
            schoolDB.prepare(
                'INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)'
            ).run(studentId, face_descriptor, 'front');
            console.log(`✅ Descritor facial salvo para aluno ID: ${studentId}`);
        }

        // ==================================================================================
        // 3. VÍNCULO AUTOMÁTICO SE RESPONSÁVEL JÁ EXISTIR
        // ==================================================================================
        console.log('🔍 Verificando parent_email:', parent_email);
        let guardianMessage = '';

        if (parent_email) {
            try {
                const systemDB = getSystemDB();
                // Verificar se responsável já existe
                const guardian = systemDB.prepare('SELECT id, email, name FROM guardians WHERE email = ?').get(parent_email);

                if (guardian) {
                    console.log('✅ Responsável encontrado no sistema! Criando vínculo automático...');

                    const linkExists = schoolDB.prepare('SELECT id FROM student_guardians WHERE student_id = ? AND guardian_id = ?').get(studentId, guardian.id);

                    if (!linkExists) {
                        schoolDB.prepare(`
                            INSERT INTO student_guardians (student_id, guardian_id, relationship, status)
                            VALUES (?, ?, ?, 'active')
                        `).run(studentId, guardian.id, 'Responsável');
                        console.log(`🔗 Aluno vinculado automaticamente ao responsável ID ${guardian.id}`);
                        guardianMessage = `Aluno vinculado automaticamente ao responsável: ${guardian.name}`;
                    } else {
                        guardianMessage = `Aluno já estava vinculado a este responsável.`;
                    }
                } else {
                    console.log('ℹ️ Responsável não tem conta no sistema. O email foi salvo no cadastro do aluno.');
                    guardianMessage = 'Responsável ainda não cadastrado. Peça para ele se cadastrar com o email informado.';
                }

            } catch (err) {
                console.error('❌ Erro no processo de vínculo automático (não crítico):', err);
            }
        }

        res.json({
            message: 'Student created successfully',
            id: studentId,
            guardian_login: parent_email,
            guardian_info: guardianMessage
        });

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
    const { face_descriptor, face_descriptors } = req.body;
    const schoolDB = getSchoolDB(req.user.id);

    try {
        console.log(`📝 Atualizando aluno ID ${id} com descritor(es) facial(is)`);

        // Delete existing descriptors first
        schoolDB.prepare('DELETE FROM face_descriptors WHERE student_id = ?').run(id);

        if (face_descriptors && Array.isArray(face_descriptors) && face_descriptors.length > 0) {
            // Multi-angle mode
            const insertStmt = schoolDB.prepare('INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)');
            for (const fd of face_descriptors) {
                insertStmt.run(id, fd.descriptor || fd, fd.angle || 'front');
            }
            console.log(`✅ ${face_descriptors.length} descritores salvos para aluno ID: ${id}`);
        } else if (face_descriptor) {
            // Single descriptor (backward compat)
            schoolDB.prepare(
                'INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)'
            ).run(id, face_descriptor, 'front');
            console.log(`✅ 1 descritor salvo para aluno ID: ${id}`);
        }

        res.json({ message: 'Student updated' });
    } catch (error) {
        console.error('❌ Erro ao atualizar aluno:', error);
        res.status(500).json({ error: 'Erro ao atualizar aluno', message: error.message });
    }
});

// Delete student (DEEP CLEAN)
app.delete('/api/school/students/:id', (req, res, next) => {
    console.log('[DEBUG] DELETE /students/:id headers:', req.headers);
    next();
}, authenticateToken, (req, res) => {
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

    // Câmeras são armazenadas no banco system, não no banco da escola
    const db = getSystemDB();
    const schoolId = req.user.id;

    try {
        const cameras = db.prepare('SELECT * FROM cameras WHERE school_id = ?').all(schoolId);
        console.log(`📹 [CAMERAS] Escola ${schoolId} tem ${cameras.length} câmera(s) cadastrada(s)`);
        res.json(cameras);
    } catch (err) {
        console.error('Erro ao buscar câmeras:', err);
        res.json([]); // Retorna array vazio se tabela não existir
    }
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
    const schoolDB = getSchoolDB(req.user.id);
    try {
        // Get all students
        const students = schoolDB.prepare('SELECT s.id, s.name, s.parent_email, s.phone, s.class_name FROM students s').all();

        // Get all face descriptors
        const allDescriptors = schoolDB.prepare('SELECT student_id, descriptor, angle FROM face_descriptors ORDER BY student_id').all();
        const descriptorMap = {};
        for (const fd of allDescriptors) {
            if (!descriptorMap[fd.student_id]) descriptorMap[fd.student_id] = [];
            try {
                descriptorMap[fd.student_id].push({
                    descriptor: JSON.parse(fd.descriptor),
                    angle: fd.angle
                });
            } catch (e) { }
        }

        const result = students.map(s => ({
            ...s,
            face_descriptor: descriptorMap[s.id]?.[0]?.descriptor || null,
            face_descriptors: descriptorMap[s.id] || [],
            face_descriptor_count: descriptorMap[s.id]?.length || 0
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching student faces:', error);
        res.json([]);
    }
});


// --- INSPECTOR ROUTES ---

// List Inspectors for the School
app.get('/api/school/inspectors', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const db = getSystemDB();
    try {
        // Inspectors are in systemDB with school_id
        const inspectors = db.prepare('SELECT id, name, email FROM inspectors WHERE school_id = ?').all(req.user.id);
        res.json(inspectors);
    } catch (e) {
        console.error('Erro ao listar inspetores:', e);
        res.json([]);
    }
});

// Create Inspector
app.post('/api/school/inspectors', authenticateToken, async (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { name, email, password } = req.body;
    const db = getSystemDB();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO inspectors (name, email, password, school_id) VALUES (?, ?, ?, ?)').run(name, email, hashedPassword, req.user.id);
        res.json({ success: true });
    } catch (e) {
        console.error('Erro ao criar inspetor:', e);
        if (e.message.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Email já cadastrado.' });
        }
        res.status(500).json({ error: 'Erro ao criar inspetor.' });
    }
});

// Delete Inspector
app.delete('/api/school/inspectors/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'school_admin') return res.sendStatus(403);
    const { id } = req.params;
    const db = getSystemDB();
    try {
        db.prepare('DELETE FROM inspectors WHERE id = ? AND school_id = ?').run(id, req.user.id);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao excluir.' });
    }
});


// --- PICKUP ROUTES (For Inspectors) ---

app.get('/api/school/pickups', authenticateToken, (req, res) => {
    // School Admin, Inspector, Teacher
    if (!['school_admin', 'inspector', 'teacher'].includes(req.user.role)) return res.sendStatus(403);

    // Admin ID = School ID. Others have school_id property.
    const schoolId = req.user.school_id || req.user.id;
    const db = getSchoolDB(schoolId);
    const systemDB = getSystemDB();

    try {
        // Table pickups might not exist if created recently? No, it's in db.js
        const pickups = db.prepare(`
            SELECT p.*, s.name as student_name, s.class_name, s.photo_url
            FROM pickups p
            JOIN students s ON p.student_id = s.id
            WHERE date(p.timestamp) = date('now', 'localtime')
            ORDER BY p.timestamp DESC
        `).all();

        // Enriquecer com nome do guardian
        const enriched = pickups.map(p => {
            const g = systemDB.prepare('SELECT name FROM guardians WHERE id = ?').get(p.guardian_id);
            return { ...p, guardian_name: g ? g.name : 'Responsável' };
        });

        res.json(enriched);
    } catch (e) {
        console.error('Erro get pickups:', e);
        res.json([]);
    }
});

app.post('/api/school/pickups/:id/status', authenticateToken, (req, res) => {
    if (!['school_admin', 'inspector', 'teacher'].includes(req.user.role)) return res.sendStatus(403);
    const schoolId = req.user.school_id || req.user.id;
    const { status } = req.body;
    const db = getSchoolDB(schoolId);
    const systemDB = getSystemDB();

    try {
        // Update the pickup status
        db.prepare('UPDATE pickups SET status = ? WHERE id = ?').run(status, req.params.id);

        // If status is 'calling', notify the guardian
        if (status === 'calling') {
            // Get pickup details to find guardian and student
            const pickup = db.prepare(`
                SELECT p.*, s.name as student_name 
                FROM pickups p 
                JOIN students s ON p.student_id = s.id 
                WHERE p.id = ?
            `).get(req.params.id);

            if (pickup) {
                console.log(`📢 [Pickup] Notificando Guardian ${pickup.guardian_id} - Aluno ${pickup.student_name} está sendo chamado!`);

                // Create notification table if not exists
                db.exec(`
                    CREATE TABLE IF NOT EXISTS pickup_notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        pickup_id INTEGER NOT NULL,
                        guardian_id INTEGER NOT NULL,
                        student_name TEXT,
                        notification_type TEXT DEFAULT 'calling',
                        read_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Insert notification
                db.prepare(`
                    INSERT INTO pickup_notifications (pickup_id, guardian_id, student_name, notification_type)
                    VALUES (?, ?, ?, 'calling')
                `).run(pickup.id, pickup.guardian_id, pickup.student_name);

                console.log(`✅ [Pickup] Notificação criada para Guardian ${pickup.guardian_id}`);
            }
        }

        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});



// --- TEACHER ROUTES ---

app.get('/api/teacher/me', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const db = getSystemDB();
    const teacher = db.prepare('SELECT id, name, email, subject, school_id, status FROM teachers WHERE id = ?').get(req.user.id);

    if (teacher && teacher.school_id) {
        const school = db.prepare('SELECT name FROM schools WHERE id = ?').get(teacher.school_id);
        teacher.school_name = school ? school.name : 'Escola Desconhecida';
    }

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
    const { face_descriptor, face_descriptors } = req.body;
    const teacher = req.user;

    if (!teacher.school_id) return res.status(403).json({ message: 'Teacher not linked to any school' });

    const schoolDB = getSchoolDB(teacher.school_id);

    try {
        // Verify student belongs to this school
        const student = schoolDB.prepare('SELECT id FROM students WHERE id = ?').get(id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        console.log(`📝 Teacher ${teacher.name} updating face for Student ID ${id}`);

        // Delete existing descriptors
        schoolDB.prepare('DELETE FROM face_descriptors WHERE student_id = ?').run(id);

        if (face_descriptors && Array.isArray(face_descriptors) && face_descriptors.length > 0) {
            // Multi-angle mode
            const insertStmt = schoolDB.prepare('INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)');
            for (const fd of face_descriptors) {
                insertStmt.run(id, fd.descriptor || fd, fd.angle || 'front');
            }
            console.log(`✅ ${face_descriptors.length} face descriptors saved for Student ID ${id}`);
        } else if (face_descriptor) {
            // Single descriptor (backward compat)
            schoolDB.prepare(
                'INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)'
            ).run(id, face_descriptor, 'front');
            console.log(`✅ 1 face descriptor saved for Student ID ${id}`);
        }

        res.json({ message: 'Face descriptor updated successfully' });
    } catch (error) {
        console.error('❌ Error updating student face:', error);
        res.status(500).json({ error: 'Error updating student face', message: error.message });
    }
});

// --- TEACHER SESSION & ATTENTION SYSTEM ---

// Migration: Create tables needed for teacher session/attention system
function migrateTeacherSessionTables(schoolDB) {
    try {
        schoolDB.exec(`
            CREATE TABLE IF NOT EXISTS class_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                topic TEXT DEFAULT '',
                mode TEXT DEFAULT 'expositiva',
                started_at TEXT DEFAULT (datetime('now','localtime')),
                ended_at TEXT,
                status TEXT DEFAULT 'active'
            );
            CREATE TABLE IF NOT EXISTS attention_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                teacher_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                level TEXT NOT NULL,
                notes TEXT DEFAULT '',
                checked_at TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (session_id) REFERENCES class_sessions(id)
            );
            CREATE TABLE IF NOT EXISTS lesson_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                topic TEXT NOT NULL,
                objectives TEXT DEFAULT '',
                content TEXT DEFAULT '',
                resources TEXT DEFAULT '',
                planned_date TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS weekly_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                week_start TEXT NOT NULL,
                week_end TEXT NOT NULL,
                summary TEXT DEFAULT '',
                avg_attention TEXT DEFAULT 'bom',
                total_sessions INTEGER DEFAULT 0,
                total_checks INTEGER DEFAULT 0,
                highlights TEXT DEFAULT '',
                concerns TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS teacher_polls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                session_id INTEGER,
                question TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT DEFAULT '',
                option_d TEXT DEFAULT '',
                correct_answer TEXT,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS poll_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                poll_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                student_name TEXT,
                answer TEXT,
                is_correct INTEGER DEFAULT 0,
                responded_at TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (poll_id) REFERENCES teacher_polls(id)
            );
        `);
    } catch (e) {
        // Tables already exist, ignore
    }
}

// Start a class session
app.post('/api/teacher/session/start', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id, subject, topic, mode } = req.body;
    const teacher = req.user;

    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });
    if (!class_id || !subject) return res.status(400).json({ error: 'class_id e subject são obrigatórios' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        // End any existing active sessions for this teacher
        schoolDB.prepare(`
            UPDATE class_sessions SET status = 'ended', ended_at = datetime('now','localtime')
            WHERE teacher_id = ? AND status = 'active'
        `).run(teacher.id);

        const result = schoolDB.prepare(`
            INSERT INTO class_sessions (teacher_id, class_id, subject, topic, mode)
            VALUES (?, ?, ?, ?, ?)
        `).run(teacher.id, class_id, subject, topic || '', mode || 'expositiva');

        console.log(`🎓 [SESSION] Professor ${teacher.id} iniciou sessão: ${subject} - ${mode}`);

        res.json({
            success: true,
            session_id: result.lastInsertRowid,
            message: 'Sessão iniciada com sucesso'
        });
    } catch (error) {
        console.error('❌ [SESSION] Erro ao iniciar sessão:', error);
        res.status(500).json({ error: 'Erro ao iniciar sessão', details: error.message });
    }
});

// End a class session
app.post('/api/teacher/session/end', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { session_id } = req.body;
    const teacher = req.user;

    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        const query = session_id
            ? `UPDATE class_sessions SET status = 'ended', ended_at = datetime('now','localtime') WHERE id = ? AND teacher_id = ?`
            : `UPDATE class_sessions SET status = 'ended', ended_at = datetime('now','localtime') WHERE teacher_id = ? AND status = 'active'`;

        const params = session_id ? [session_id, teacher.id] : [teacher.id];
        const result = schoolDB.prepare(query).run(...params);

        console.log(`🔴 [SESSION] Professor ${teacher.id} encerrou sessão`);
        res.json({ success: true, changes: result.changes });
    } catch (error) {
        console.error('❌ [SESSION] Erro ao encerrar sessão:', error);
        res.status(500).json({ error: 'Erro ao encerrar sessão' });
    }
});

// Get active session
app.get('/api/teacher/session/active', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const teacher = req.user;
    if (!teacher.school_id) return res.json(null);

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        const session = schoolDB.prepare(`
            SELECT * FROM class_sessions WHERE teacher_id = ? AND status = 'active' LIMIT 1
        `).get(teacher.id);
        res.json(session || null);
    } catch (error) {
        res.json(null);
    }
});

// Submit attention check (Quick Check)
app.post('/api/teacher/attention-check', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { session_id, class_id, subject, level, notes } = req.body;
    const teacher = req.user;

    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });
    if (!level) return res.status(400).json({ error: 'level é obrigatório (excelente, bom, regular, ruim)' });

    const validLevels = ['excelente', 'bom', 'regular', 'ruim'];
    if (!validLevels.includes(level)) {
        return res.status(400).json({ error: `level deve ser: ${validLevels.join(', ')}` });
    }

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        // If no session_id, find the active one
        let activeSession = session_id
            ? schoolDB.prepare('SELECT * FROM class_sessions WHERE id = ? AND teacher_id = ?').get(session_id, teacher.id)
            : schoolDB.prepare('SELECT * FROM class_sessions WHERE teacher_id = ? AND status = ? LIMIT 1').get(teacher.id, 'active');

        const sessId = activeSession?.id || 0;
        const classId = class_id || activeSession?.class_id;
        const subj = subject || activeSession?.subject || 'Geral';

        const result = schoolDB.prepare(`
            INSERT INTO attention_checks (session_id, teacher_id, class_id, subject, level, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(sessId, teacher.id, classId, subj, level, notes || '');

        const levelEmoji = { excelente: '🟢', bom: '🟡', regular: '🟠', ruim: '🔴' };
        console.log(`${levelEmoji[level]} [ATTENTION] Professor ${teacher.id}: ${level} - ${subj}`);

        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: `Avaliação "${level}" registrada`
        });
    } catch (error) {
        console.error('❌ [ATTENTION] Erro ao registrar avaliação:', error);
        res.status(500).json({ error: 'Erro ao registrar avaliação' });
    }
});

// Get attention history for a class
app.get('/api/teacher/attention-history', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id, days } = req.query;
    const teacher = req.user;
    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        const daysBack = parseInt(days) || 30;
        let query = `
            SELECT ac.*, cs.mode, cs.topic as session_topic
            FROM attention_checks ac
            LEFT JOIN class_sessions cs ON ac.session_id = cs.id
            WHERE ac.teacher_id = ?
        `;
        const params = [teacher.id];

        if (class_id) {
            query += ` AND ac.class_id = ?`;
            params.push(class_id);
        }

        query += ` AND ac.checked_at >= datetime('now', '-${daysBack} days', 'localtime')`;
        query += ` ORDER BY ac.checked_at DESC LIMIT 100`;

        const checks = schoolDB.prepare(query).all(...params);
        res.json(checks);
    } catch (error) {
        console.error('❌ [ATTENTION] Erro ao buscar histórico:', error);
        res.json([]);
    }
});

// Get today's attention summary for dashboard
app.get('/api/teacher/attention-summary', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id } = req.query;
    const teacher = req.user;
    if (!teacher.school_id) return res.json({ total: 0, counts: {}, average: 'N/A' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        let query = `
            SELECT level, COUNT(*) as count
            FROM attention_checks
            WHERE teacher_id = ?
            AND date(checked_at) = date('now','localtime')
        `;
        const params = [teacher.id];

        if (class_id) {
            query += ` AND class_id = ?`;
            params.push(class_id);
        }
        query += ` GROUP BY level`;

        const rows = schoolDB.prepare(query).all(...params);
        const counts = { excelente: 0, bom: 0, regular: 0, ruim: 0 };
        let total = 0;
        rows.forEach(r => { counts[r.level] = r.count; total += r.count; });

        // Calculate weighted average
        const weights = { excelente: 4, bom: 3, regular: 2, ruim: 1 };
        let weightedSum = 0;
        Object.entries(counts).forEach(([level, count]) => {
            weightedSum += weights[level] * count;
        });
        const avgScore = total > 0 ? weightedSum / total : 0;
        let average = 'N/A';
        if (total > 0) {
            if (avgScore >= 3.5) average = 'excelente';
            else if (avgScore >= 2.5) average = 'bom';
            else if (avgScore >= 1.5) average = 'regular';
            else average = 'ruim';
        }

        // Get session count for today
        let sessQuery = `SELECT COUNT(*) as count FROM class_sessions WHERE teacher_id = ? AND date(started_at) = date('now','localtime')`;
        const sessParams = [teacher.id];
        if (class_id) { sessQuery += ` AND class_id = ?`; sessParams.push(class_id); }
        const sessCount = schoolDB.prepare(sessQuery).get(...sessParams);

        res.json({
            total,
            counts,
            average,
            avgScore: Math.round(avgScore * 10) / 10,
            sessions_today: sessCount?.count || 0
        });
    } catch (error) {
        console.error('❌ [ATTENTION] Erro ao gerar sumário:', error);
        res.json({ total: 0, counts: {}, average: 'N/A' });
    }
});

// Get session history
app.get('/api/teacher/sessions', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id, limit } = req.query;
    const teacher = req.user;
    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        let query = `SELECT * FROM class_sessions WHERE teacher_id = ?`;
        const params = [teacher.id];
        if (class_id) { query += ` AND class_id = ?`; params.push(class_id); }
        query += ` ORDER BY started_at DESC LIMIT ?`;
        params.push(parseInt(limit) || 20);

        const sessions = schoolDB.prepare(query).all(...params);
        res.json(sessions);
    } catch (error) {
        res.json([]);
    }
});

// --- LESSON PLANS ---

app.post('/api/teacher/lesson-plans', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id, subject, topic, objectives, content, resources, planned_date } = req.body;
    const teacher = req.user;
    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        const result = schoolDB.prepare(`
            INSERT INTO lesson_plans (teacher_id, class_id, subject, topic, objectives, content, resources, planned_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(teacher.id, class_id, subject, topic, objectives || '', content || '', resources || '', planned_date || new Date().toISOString().split('T')[0]);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('❌ [LESSON] Erro ao salvar plano:', error);
        res.status(500).json({ error: 'Erro ao salvar plano de aula' });
    }
});

app.get('/api/teacher/lesson-plans', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id } = req.query;
    const teacher = req.user;
    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        let query = `SELECT * FROM lesson_plans WHERE teacher_id = ?`;
        const params = [teacher.id];
        if (class_id) { query += ` AND class_id = ?`; params.push(class_id); }
        query += ` ORDER BY planned_date DESC LIMIT 50`;

        res.json(schoolDB.prepare(query).all(...params));
    } catch (error) {
        res.json([]);
    }
});

app.put('/api/teacher/lesson-plans/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { id } = req.params;
    const { subject, topic, objectives, content, resources, planned_date, status } = req.body;
    const teacher = req.user;
    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);

    try {
        schoolDB.prepare(`
            UPDATE lesson_plans SET subject = ?, topic = ?, objectives = ?, content = ?, resources = ?, planned_date = ?, status = ?
            WHERE id = ? AND teacher_id = ?
        `).run(subject, topic, objectives || '', content || '', resources || '', planned_date, status || 'pending', id, teacher.id);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar plano' });
    }
});

app.delete('/api/teacher/lesson-plans/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { id } = req.params;
    const teacher = req.user;
    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);

    try {
        schoolDB.prepare('DELETE FROM lesson_plans WHERE id = ? AND teacher_id = ?').run(id, teacher.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao deletar plano' });
    }
});

// --- WEEKLY REPORTS ---

app.post('/api/teacher/weekly-report', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id, subject, week_start, week_end, summary, highlights, concerns } = req.body;
    const teacher = req.user;
    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        // Auto-calculate from attention checks for this week
        const checks = schoolDB.prepare(`
            SELECT level, COUNT(*) as count FROM attention_checks
            WHERE teacher_id = ? AND class_id = ? AND subject = ?
            AND date(checked_at) >= date(?) AND date(checked_at) <= date(?)
            GROUP BY level
        `).all(teacher.id, class_id, subject, week_start, week_end);

        const counts = { excelente: 0, bom: 0, regular: 0, ruim: 0 };
        let total = 0;
        checks.forEach(r => { counts[r.level] = r.count; total += r.count; });

        const weights = { excelente: 4, bom: 3, regular: 2, ruim: 1 };
        let weightedSum = 0;
        Object.entries(counts).forEach(([level, count]) => { weightedSum += weights[level] * count; });
        const avgScore = total > 0 ? weightedSum / total : 0;
        let avg_attention = 'bom';
        if (total > 0) {
            if (avgScore >= 3.5) avg_attention = 'excelente';
            else if (avgScore >= 2.5) avg_attention = 'bom';
            else if (avgScore >= 1.5) avg_attention = 'regular';
            else avg_attention = 'ruim';
        }

        const sessCount = schoolDB.prepare(`
            SELECT COUNT(*) as count FROM class_sessions
            WHERE teacher_id = ? AND class_id = ?
            AND date(started_at) >= date(?) AND date(started_at) <= date(?)
        `).get(teacher.id, class_id, week_start, week_end);

        const result = schoolDB.prepare(`
            INSERT INTO weekly_reports (teacher_id, class_id, subject, week_start, week_end, summary, avg_attention, total_sessions, total_checks, highlights, concerns)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(teacher.id, class_id, subject, week_start, week_end, summary || '', avg_attention, sessCount?.count || 0, total, highlights || '', concerns || '');

        res.json({ success: true, id: result.lastInsertRowid, avg_attention, total_checks: total });
    } catch (error) {
        console.error('❌ [REPORT] Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório semanal' });
    }
});

app.get('/api/teacher/weekly-reports', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id } = req.query;
    const teacher = req.user;
    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        let query = `SELECT * FROM weekly_reports WHERE teacher_id = ?`;
        const params = [teacher.id];
        if (class_id) { query += ` AND class_id = ?`; params.push(class_id); }
        query += ` ORDER BY week_end DESC LIMIT 20`;

        res.json(schoolDB.prepare(query).all(...params));
    } catch (error) {
        res.json([]);
    }
});

// --- POLLS (Manual, no camera) ---

app.post('/api/teacher/polls/create', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id, session_id, question, option_a, option_b, option_c, option_d, correct_answer } = req.body;
    const teacher = req.user;
    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        const result = schoolDB.prepare(`
            INSERT INTO teacher_polls (teacher_id, class_id, session_id, question, option_a, option_b, option_c, option_d, correct_answer)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(teacher.id, class_id, session_id || null, question, option_a, option_b, option_c || '', option_d || '', correct_answer || '');

        res.json({ success: true, poll_id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar enquete' });
    }
});

app.post('/api/teacher/polls/:id/submit-responses', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { id } = req.params;
    const { responses } = req.body; // [{student_id, student_name, answer, is_correct}]
    const teacher = req.user;
    if (!teacher.school_id) return res.status(403).json({ error: 'Professor sem escola vinculada' });

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        const insert = schoolDB.prepare(`
            INSERT INTO poll_responses (poll_id, student_id, student_name, answer, is_correct)
            VALUES (?, ?, ?, ?, ?)
        `);

        const insertMany = schoolDB.transaction((items) => {
            for (const r of items) {
                insert.run(id, r.student_id, r.student_name || '', r.answer, r.is_correct ? 1 : 0);
            }
        });

        insertMany(responses || []);
        res.json({ success: true, count: (responses || []).length });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao registrar respostas' });
    }
});

app.get('/api/teacher/polls/history', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { class_id } = req.query;
    const teacher = req.user;
    if (!teacher.school_id) return res.json([]);

    const schoolDB = getSchoolDB(teacher.school_id);
    migrateTeacherSessionTables(schoolDB);

    try {
        let query = `SELECT * FROM teacher_polls WHERE teacher_id = ?`;
        const params = [teacher.id];
        if (class_id) { query += ` AND class_id = ?`; params.push(class_id); }
        query += ` ORDER BY created_at DESC LIMIT 50`;

        const polls = schoolDB.prepare(query).all(...params);

        // Attach response counts
        for (const poll of polls) {
            const stats = schoolDB.prepare(`
                SELECT COUNT(*) as total, SUM(is_correct) as correct FROM poll_responses WHERE poll_id = ?
            `).get(poll.id);
            poll.total_responses = stats?.total || 0;
            poll.correct_responses = stats?.correct || 0;
        }

        res.json(polls);
    } catch (error) {
        res.json([]);
    }
});

// --- GUARDIAN: Class Attention Data (for PWA) ---
// Returns a SINGLE daily summary = weighted average of ALL teachers' quick checks

app.get('/api/guardian/class-attention/:school_id/:class_name', (req, res) => {
    const { school_id, class_name } = req.params;
    const { date: queryDate } = req.query; // optional: ?date=2026-02-12

    try {
        const schoolDB = getSchoolDB(school_id);
        migrateTeacherSessionTables(schoolDB);

        const classObj = schoolDB.prepare('SELECT id FROM classes WHERE name = ?').get(class_name);
        if (!classObj) return res.json({ class_name, date: new Date().toISOString().split('T')[0], overall_level: 'N/A', score: 0, total_checks: 0, teachers_count: 0, subjects_today: [] });

        const targetDate = queryDate || "date('now','localtime')";
        const dateClause = queryDate ? `date(ac.checked_at) = date('${queryDate}')` : `date(ac.checked_at) = date('now','localtime')`;

        // Get ALL attention checks from ALL teachers for this class today
        const checks = schoolDB.prepare(`
            SELECT ac.level, COUNT(*) as count
            FROM attention_checks ac
            WHERE ac.class_id = ? AND ${dateClause}
            GROUP BY ac.level
        `).all(classObj.id);

        const counts = { excelente: 0, bom: 0, regular: 0, ruim: 0 };
        let total = 0;
        checks.forEach(r => { counts[r.level] = r.count; total += r.count; });

        // Weighted average across ALL teachers
        const weights = { excelente: 4, bom: 3, regular: 2, ruim: 1 };
        let weightedSum = 0;
        Object.entries(counts).forEach(([level, count]) => { weightedSum += weights[level] * count; });
        const avgScore = total > 0 ? weightedSum / total : 0;

        let overall_level = 'N/A';
        if (total > 0) {
            if (avgScore >= 3.5) overall_level = 'excelente';
            else if (avgScore >= 2.5) overall_level = 'bom';
            else if (avgScore >= 1.5) overall_level = 'regular';
            else overall_level = 'ruim';
        }

        // Get distinct teachers+subjects that contributed today
        const systemDB = getSystemDB();
        const contributors = schoolDB.prepare(`
            SELECT DISTINCT ac.teacher_id, ac.subject
            FROM attention_checks ac
            WHERE ac.class_id = ? AND ${dateClause}
        `).all(classObj.id);

        const subjects_today = contributors.map(c => {
            const t = systemDB.prepare('SELECT name FROM teachers WHERE id = ?').get(c.teacher_id);
            return { teacher: t?.name || 'Professor', subject: c.subject };
        });

        // Last 7 days history for trend
        const history = schoolDB.prepare(`
            SELECT date(ac.checked_at) as day, ac.level, COUNT(*) as count
            FROM attention_checks ac
            WHERE ac.class_id = ? AND ac.checked_at >= datetime('now', '-7 days', 'localtime')
            GROUP BY day, ac.level
            ORDER BY day ASC
        `).all(classObj.id);

        const dailyHistory = {};
        history.forEach(h => {
            if (!dailyHistory[h.day]) dailyHistory[h.day] = { excelente: 0, bom: 0, regular: 0, ruim: 0, total: 0 };
            dailyHistory[h.day][h.level] = h.count;
            dailyHistory[h.day].total += h.count;
        });

        const trend = Object.entries(dailyHistory).map(([day, d]) => {
            let ws = 0;
            Object.entries(d).forEach(([l, c]) => { if (weights[l]) ws += weights[l] * c; });
            const sc = d.total > 0 ? Math.round((ws / d.total) * 10) / 10 : 0;
            return { date: day, score: sc, total_checks: d.total };
        });

        res.json({
            class_name,
            date: new Date().toISOString().split('T')[0],
            overall_level,
            score: Math.round(avgScore * 10) / 10,
            total_checks: total,
            counts,
            teachers_count: new Set(contributors.map(c => c.teacher_id)).size,
            subjects_today,
            trend
        });
    } catch (error) {
        console.error('❌ [GUARDIAN-ATTENTION] Erro:', error);
        res.json({ class_name, date: new Date().toISOString().split('T')[0], overall_level: 'N/A', score: 0, total_checks: 0, teachers_count: 0, subjects_today: [], trend: [] });
    }
});

// Guardian: Get weekly reports for a class
app.get('/api/guardian/weekly-reports/:school_id/:class_name', (req, res) => {
    const { school_id, class_name } = req.params;

    try {
        const schoolDB = getSchoolDB(school_id);
        migrateTeacherSessionTables(schoolDB);
        const systemDB = getSystemDB();

        const classObj = schoolDB.prepare('SELECT id FROM classes WHERE name = ?').get(class_name);
        if (!classObj) return res.json([]);

        const reports = schoolDB.prepare(`
            SELECT * FROM weekly_reports WHERE class_id = ? ORDER BY week_end DESC LIMIT 10
        `).all(classObj.id);

        // Enrich with teacher names
        for (const r of reports) {
            const t = systemDB.prepare('SELECT name FROM teachers WHERE id = ?').get(r.teacher_id);
            r.teacher_name = t?.name || 'Professor';
        }

        res.json(reports);
    } catch (error) {
        console.error('❌ [GUARDIAN-REPORTS] Erro:', error);
        res.json([]);
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
// Now returns MULTIPLE descriptors per student for multi-angle matching
app.get('/api/school/:schoolId/students/embeddings', (req, res) => {
    try {
        const { schoolId } = req.params;
        const schoolDB = getSchoolDB(schoolId);

        // Get all students
        const students = schoolDB.prepare(`
            SELECT s.id, s.name, s.phone as guardian_phone, s.class_name, s.photo_url, s.face_descriptor as legacy_descriptor
            FROM students s
        `).all();

        // Get ALL face descriptors (multiple per student)
        const allDescriptors = schoolDB.prepare('SELECT student_id, descriptor, angle FROM face_descriptors').all();
        const descriptorMap = {};
        for (const fd of allDescriptors) {
            if (!descriptorMap[fd.student_id]) descriptorMap[fd.student_id] = [];
            try {
                const parsed = typeof fd.descriptor === 'string' ? JSON.parse(fd.descriptor) : fd.descriptor;
                if (Array.isArray(parsed) && parsed.length === 128) {
                    descriptorMap[fd.student_id].push(parsed);
                }
            } catch (e) {
                console.error(`Erro ao parsear descritor do aluno ${fd.student_id}:`, e);
            }
        }

        // Build result with multiple descriptors per student
        const result = students.map(s => {
            let descriptors = descriptorMap[s.id] || [];

            // Fallback: check legacy column
            if (descriptors.length === 0 && s.legacy_descriptor) {
                try {
                    const parsed = typeof s.legacy_descriptor === 'string' ? JSON.parse(s.legacy_descriptor) : s.legacy_descriptor;
                    if (Array.isArray(parsed) && parsed.length === 128) {
                        descriptors = [parsed];
                    }
                } catch (e) { }
            }

            if (descriptors.length === 0) return null;

            return {
                id: s.id,
                name: s.name,
                guardian_phone: s.guardian_phone,
                class_name: s.class_name,
                photo_url: s.photo_url,
                face_descriptor: descriptors[0], // backward compat: first descriptor
                face_descriptors: descriptors,    // ALL descriptors for multi-angle
                descriptor_count: descriptors.length
            };
        }).filter(s => s !== null);

        console.log(`📊 Endpoint embeddings: ${result.length} alunos com descritores (multi-angle)`);
        result.forEach(s => console.log(`   👤 ${s.name}: ${s.descriptor_count} ângulo(s)`));
        res.json(result);
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
        const studentsSanitized = students.map(s => {
            let descriptor = s.face_descriptor;
            if (descriptor && typeof descriptor === 'string') {
                try { descriptor = JSON.parse(descriptor); } catch (e) { descriptor = null; }
            }
            return {
                ...s,
                face_descriptor: descriptor
            };
        });

        res.json(studentsSanitized);
    } catch (error) {
        console.error('Erro ao buscar estudantes:', error);
        res.status(500).json({ error: 'Erro ao buscar estudantes' });
    }
});

// Mensagens do professor (Comunicado Escola <-> Professor)
app.get('/api/teacher/messages', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const db = getSystemDB();

        // Buscar mensagens onde o professor é destinatário ou remetente
        const messages = db.prepare(`
            SELECT * FROM messages 
            WHERE (to_user_id = ? AND to_user_type = 'teacher')
               OR (from_user_id = ? AND from_user_type = 'teacher')
            ORDER BY created_at DESC
        `).all(req.user.id, req.user.id);

        res.json(messages);
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

app.put('/api/teacher/messages/:id/read', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'teacher') return res.sendStatus(403);
        const { id } = req.params;
        const db = getSystemDB();

        db.prepare('UPDATE messages SET read_status = 1 WHERE id = ? AND to_user_id = ? AND to_user_type = "teacher"')
            .run(id, req.user.id);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao marcar mensagem como lida' });
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

// Rota duplicada removida (consolidada em 1650)

// Rota duplicada removida (consolidada em 1650)

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

// Buscar frequência do aluno (para o App do Responsável) - CORRIGIDO: busca de attendance + access_logs
app.get('/api/guardian/student-attendance', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const { schoolId, studentId, month, year } = req.query;

    if (!schoolId || !studentId) {
        return res.status(400).json({ error: 'School ID and Student ID are required' });
    }

    console.log(`📊 [GUARDIAN-ATTENDANCE] Buscando: Student=${studentId}, School=${schoolId}, Guardian=${guardianId}, ${month}/${year}`);

    try {
        const schoolDB = getSchoolDB(schoolId);

        // 1. Verificar se o guardian tem vínculo com este aluno
        let link = null;
        try {
            link = schoolDB.prepare(`
                SELECT id FROM student_guardians 
                WHERE student_id = ? AND guardian_id = ? AND status = 'active'
            `).get(studentId, guardianId);
        } catch (linkError) {
            console.warn(`⚠️ [GUARDIAN-ATTENDANCE] Erro ao verificar vínculo (tabela pode não existir):`, linkError.message);
            // Continuar mesmo sem verificação de vínculo para não bloquear o calendário
        }

        // Preparar filtro de data
        let dateFilter = '';
        const params = [studentId];

        if (month && year) {
            const m = String(month).padStart(2, '0');
            const y = String(year);
            const startDate = `${y}-${m}-01`;
            const endDate = `${y}-${m}-31`;
            dateFilter = ` AND date(timestamp) BETWEEN date(?) AND date(?)`;
            params.push(startDate, endDate);
        }

        // 2. Buscar da tabela ATTENDANCE
        let attendanceRecords = [];
        try {
            const attendanceQuery = `
                SELECT a.timestamp, a.type, s.photo_url 
                FROM attendance a
                LEFT JOIN students s ON a.student_id = s.id
                WHERE a.student_id = ?${dateFilter}
                ORDER BY a.timestamp DESC
            `;
            attendanceRecords = schoolDB.prepare(attendanceQuery).all(...params);
            console.log(`📊 [GUARDIAN-ATTENDANCE] Tabela attendance: ${attendanceRecords.length} registros`);
        } catch (e) {
            console.log('⚠️ Erro ao buscar de attendance:', e.message);
        }

        // 3. Buscar também da tabela ACCESS_LOGS (fallback)
        let accessLogRecords = [];
        try {
            const accessLogQuery = `
                SELECT al.timestamp, al.event_type as type, s.photo_url 
                FROM access_logs al
                LEFT JOIN students s ON al.student_id = s.id
                WHERE al.student_id = ?${dateFilter}
                ORDER BY al.timestamp DESC
            `;
            accessLogRecords = schoolDB.prepare(accessLogQuery).all(...params);
            console.log(`📊 [GUARDIAN-ATTENDANCE] Tabela access_logs: ${accessLogRecords.length} registros`);
        } catch (e) {
            console.log('⚠️ Erro ao buscar de access_logs:', e.message);
        }

        // 4. Combinar registros únicos por dia (prioriza o primeiro registro de cada dia)
        const uniqueDays = new Map();

        [...attendanceRecords, ...accessLogRecords].forEach(record => {
            if (!record.timestamp) return;
            // Normalizar timestamp para extrair a data (YYYY-MM-DD)
            const day = record.timestamp.replace('T', ' ').split(' ')[0];
            if (!uniqueDays.has(day)) {
                uniqueDays.set(day, record);
            }
        });

        const combinedRecords = Array.from(uniqueDays.values());
        console.log(`📊 [GUARDIAN-ATTENDANCE] Total combinado: ${combinedRecords.length} dias únicos`);

        if (combinedRecords.length > 0) {
            console.log(`📊 [GUARDIAN-ATTENDANCE] Primeiro registro:`, combinedRecords[0]);
        }

        res.json(combinedRecords);

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

        // Remover vínculos com professores
        schoolDB.prepare('DELETE FROM teacher_classes WHERE class_id = ?').run(classId);

        // Excluir alunos vinculados à turma (Precisa ser deep clean para evitar FK constraints)
        // Primeiro buscar IDs dos alunos para limpar tabelas relacionadas
        const students = schoolDB.prepare('SELECT id FROM students WHERE class_name = ?').all(classInfo.name);

        if (students.length > 0) {
            console.log(`🗑️ Excluindo ${students.length} aluno(s) da turma ${classInfo.name}...`);
            const studentIds = students.map(s => s.id);
            const placeholders = studentIds.map(() => '?').join(',');

            // Limpar dependências dos alunos (attendance, face_descriptors, etc.)
            // Assumindo que o banco pode não ter CASCADE configurado ou ativo em todos os lugares
            schoolDB.prepare(`DELETE FROM attendance WHERE student_id IN (${placeholders})`).run(...studentIds);
            schoolDB.prepare(`DELETE FROM face_descriptors WHERE student_id IN (${placeholders})`).run(...studentIds);
            schoolDB.prepare(`DELETE FROM student_guardians WHERE student_id IN (${placeholders})`).run(...studentIds);
            try { schoolDB.prepare(`DELETE FROM student_attention WHERE student_id IN (${placeholders})`).run(...studentIds); } catch (e) { }
            try { schoolDB.prepare(`DELETE FROM question_responses WHERE student_id IN (${placeholders})`).run(...studentIds); } catch (e) { }
            try { schoolDB.prepare(`DELETE FROM exam_results WHERE student_id IN (${placeholders})`).run(...studentIds); } catch (e) { }

            // Finalmente deletar os alunos
            schoolDB.prepare('DELETE FROM students WHERE class_name = ?').run(classInfo.name);
        }

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
        const { class_id, question, option1, option2, option3, option4, correct_answer } = req.body;
        const schoolDB = getSchoolDB(req.user.school_id);

        const result = schoolDB.prepare(`
            INSERT INTO polls (teacher_id, class_id, question, option_a, option_b, option_c, option_d, correct_answer, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(req.user.id, class_id, question, option1 || '', option2 || '', option3 || '', option4 || '', correct_answer);

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
            FROM seating_arrangements
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

        const CameraMonitorService = require('./services/CameraMonitorService');
        const monitorStatus = CameraMonitorService.getAllStatuses();

        const cameras = db.prepare(`
            SELECT 
                c.*,
                s.name as school_name,
                t.name as technician_name
            FROM cameras c
            LEFT JOIN schools s ON c.school_id = s.id
            LEFT JOIN technicians t ON c.installed_by = t.id
            ORDER BY c.created_at DESC
        `).all();

        // Para cada câmera, buscar turmas vinculadas e status de monitoramento
        const camerasWithDetails = cameras.map(camera => {
            try {
                // Status do Monitoramento SERVER-SIDE
                const realTimeStatus = monitorStatus[camera.id];
                const isMonitoring = realTimeStatus && realTimeStatus.status === 'connected';

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

                const classroomDisplay = classroomNames.length > 0
                    ? classroomNames.join(', ')
                    : (camera.camera_purpose === 'entrance' ? 'Entrada da Escola' : 'N/A');

                return {
                    ...camera,
                    classroom_names: classroomDisplay,
                    monitoring_status: isMonitoring ? 'active' : 'inactive',
                    monitoring_since: isMonitoring ? realTimeStatus.online_since : null,
                    technician_name: camera.technician_name || 'Desconhecido'
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
    // Permitir Admin da Escola cadastrar suas próprias câmeras
    if (!['technician', 'school_admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Acesso negado: Apenas técnicos ou administradores podem cadastrar câmeras.' });
    }
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

    console.log('📸 [DEBUG CAMERAS] Recebendo requisição de cadastro:', {
        school_id,
        camera_name,
        camera_purpose,
        user: req.user.id
    });

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
        // Garante que seja número
        let safeClassID = 0;
        if (purpose === 'classroom') {
            if (assigned_classes && assigned_classes.length > 0) {
                safeClassID = parseInt(assigned_classes[0], 10) || 0;
            } else if (classroom_id) {
                safeClassID = parseInt(classroom_id, 10) || 0;
            }
        }

        const safeSchoolID = parseInt(school_id, 10);

        const result = db.prepare(`
            INSERT INTO cameras (
                school_id, classroom_id, camera_name, camera_type, camera_purpose,
                camera_ip, camera_url, camera_port,
                camera_username, camera_password,
                notes, installed_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `).run(
            safeSchoolID,
            safeClassID,
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
        console.log(`✅ [DEBUG CAMERAS] Câmera inserida com sucesso. ID: ${cameraId}, School: ${school_id}, Nome: ${camera_name}`);

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

        // 🔔 Registrar em access_logs para notificação do Guardian App
        try {
            schoolDB.prepare(`
                INSERT INTO access_logs (student_id, event_type, timestamp, notified_guardian)
                VALUES (?, 'arrival', ?, 0)
            `).run(student_id, timestamp);
            console.log(`🔔 [ARRIVAL-V2] Notificação registrada em access_logs para aluno ${student.name}`);
        } catch (logError) {
            console.error(`❌ [ARRIVAL-V2] Erro ao criar access_log:`, logError.message);
        }

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
// Registro de Guardian
app.post('/api/guardian/register', async (req, res) => {
    const { email, password, name, phone } = req.body;
    const db = getSystemDB();

    try {
        // Verificar se email já existe como guardian
        const existing = db.prepare('SELECT * FROM guardians WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        // ==================================================================================
        // VALIDAÇÃO: Email deve estar pré-cadastrado como parent_email em algum aluno
        // ==================================================================================
        const schools = db.prepare('SELECT id, name FROM schools').all();
        let emailFoundInSchool = false;

        for (const school of schools) {
            try {
                const schoolDB = getSchoolDB(school.id);
                const studentWithEmail = schoolDB.prepare(
                    'SELECT id FROM students WHERE parent_email = ? LIMIT 1'
                ).get(email);
                if (studentWithEmail) {
                    emailFoundInSchool = true;
                    break;
                }
            } catch (e) {
                // Ignora erro se DB da escola não existir
            }
        }

        if (!emailFoundInSchool) {
            return res.status(403).json({
                error: 'Email não autorizado. Este email não está pré-cadastrado em nenhuma escola. Peça à escola para cadastrar seu email como responsável do aluno.'
            });
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Inserir guardian
        const result = db.prepare(`
            INSERT INTO guardians (email, password, name, phone)
            VALUES (?, ?, ?, ?)
        `).run(email, hashedPassword, name, phone);

        const guardianId = result.lastInsertRowid;
        console.log(`✅ Guardian cadastrado: ${name} (${email}) - ID: ${guardianId}`);

        // ==================================================================================
        // AUTO-VÍNCULO: Procurar alunos em todas as escolas com este email de responsável
        // ==================================================================================
        try {
            console.log('🔄 Iniciando varredura de alunos pré-cadastrados para este email...');
            const schools = db.prepare('SELECT id, name FROM schools').all();
            let linkedCount = 0;

            for (const school of schools) {
                try {
                    const schoolDB = getSchoolDB(school.id);

                    // Buscar alunos com este parent_email e SEM vínculo com este guardian (para evitar dup)
                    // Na verdade, basta buscar alunos e tentar inserir ignorando erro ou checando antes.
                    const students = schoolDB.prepare('SELECT id, name FROM students WHERE parent_email = ?').all(email);

                    for (const student of students) {
                        try {
                            const linkResult = schoolDB.prepare(`
                                INSERT INTO student_guardians (student_id, guardian_id, relationship, status)
                                SELECT ?, ?, ?, ?
                                WHERE NOT EXISTS (
                                    SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?
                                )
                            `).run(student.id, guardianId, 'Responsável', 'active', student.id, guardianId);

                            if (linkResult.changes > 0) {
                                console.log(`🔗 Vínculo Automático: Aluno ${student.name} (Escola ${school.name}) -> Guardian ${name}`);
                                linkedCount++;
                            }
                        } catch (linkErr) {
                            console.error(`❌ Erro ao vincular aluno ${student.id} na escola ${school.id}:`, linkErr.message);
                        }
                    }
                } catch (schoolErr) {
                    // Ignora erro se DB da escola não abrir ou tabela não existir
                }
            }
            console.log(`✨ Processo de auto-vínculo concluído. ${linkedCount} alunos vinculados.`);

        } catch (autoLinkErr) {
            console.error('⚠️ Erro não vital no auto-vínculo:', autoLinkErr);
        }

        // Gerar token JWT
        const token = jwt.sign(
            { id: guardianId, role: 'guardian', email },
            SECRET_KEY,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: guardianId,
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
    console.log(`🔐 [LOGIN ATTEMPT] Email: ${email}`);

    const db = getSystemDB();

    try {
        const guardian = db.prepare('SELECT * FROM guardians WHERE email = ?').get(email);

        if (!guardian) {
            console.log(`❌ [LOGIN FAILED] Guardian não encontrado: ${email}`);
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        console.log(`✅ [LOGIN] Guardian encontrado: ${guardian.name}, Hash: ${guardian.password.substring(0, 10)}...`);

        const validPassword = await bcrypt.compare(password, guardian.password);
        if (!validPassword) {
            console.log(`❌ [LOGIN FAILED] Senha incorreta para: ${email}`);
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
    console.log(`📚 [GUARDIAN-CLASSES] Buscando turmas da escola ${schoolId}`);

    try {
        // Validar schoolId
        if (!schoolId || isNaN(parseInt(schoolId))) {
            console.error(`❌ [GUARDIAN-CLASSES] schoolId inválido: ${schoolId}`);
            return res.status(400).json({ error: 'ID da escola inválido' });
        }

        let schoolDB;
        try {
            schoolDB = getSchoolDB(schoolId);
        } catch (dbError) {
            console.error(`❌ [GUARDIAN-CLASSES] Erro ao abrir banco da escola ${schoolId}:`, dbError.message);
            return res.status(404).json({ error: 'Escola não encontrada' });
        }

        // BUSCAR TURMAS (Students e Classes)
        let classes = [];
        try {
            // 1. Tentar buscar da tabela CLASSES (Cadastro oficial)
            const classesTableExists = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classes'").get();
            if (classesTableExists) {
                const classesFromTable = schoolDB.prepare("SELECT name FROM classes WHERE name IS NOT NULL AND name != '' ORDER BY name").all();
                classesFromTable.forEach(c => {
                    if (c.name) classes.push({ name: c.name });
                });
            }

            // 2. Tentar buscar da tabela STUDENTS (Turmas ativas em uso) - complementar
            const studentsTableExists = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='students'").get();

            if (studentsTableExists) {
                const classesFromStudents = schoolDB.prepare(`
                    SELECT DISTINCT class_name as name 
                    FROM students 
                    WHERE class_name IS NOT NULL AND class_name != "" 
                `).all();

                classesFromStudents.forEach(c => {
                    // Adicionar se já não existir (evitar duplicatas)
                    if (c.name && !classes.find(existing => existing.name === c.name)) {
                        classes.push({ name: c.name });
                    }
                });
            }

            // Ordenar alfabeticamente
            classes.sort((a, b) => a.name.toString().localeCompare(b.name.toString()));

        } catch (e) {
            console.log('📚 [GUARDIAN-CLASSES] Erro ao buscar turmas:', e.message);
        }

        console.log(`📚 [GUARDIAN-CLASSES] Total de turmas com alunos: ${classes.length}`);

        if (classes.length === 0) {
            console.log(`📚 [GUARDIAN-CLASSES] Nenhuma turma com alunos encontrada para escola ${schoolId}`);
        }

        res.json(classes);
    } catch (error) {
        console.error('❌ [GUARDIAN-CLASSES] Erro inesperado:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: 'Erro ao listar turmas: ' + error.message });
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
    console.log('📎 [Link Student] Body recebido:', req.body);
    console.log('📎 [Link Student] Guardian ID:', req.user.id);

    const { school_id, student_id } = req.body; // Aceita snake_case do frontend
    const guardianId = req.user.id;
    const db = getSystemDB();

    // Compatibilidade com camelCase se necessário
    const finalSchoolId = school_id || req.body.schoolId;
    const finalStudentId = student_id || req.body.studentId;

    console.log('📎 [Link Student] School ID:', finalSchoolId);
    console.log('📎 [Link Student] Student ID:', finalStudentId);

    if (!finalSchoolId || !finalStudentId) {
        console.log('❌ [Link Student] Dados incompletos!');
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    try {
        // Buscar aluno no banco da escola para confirmar existência
        const schoolDB = getSchoolDB(finalSchoolId);

        // GARANTIR QUE A TABELA EXISTE
        try {
            schoolDB.prepare(`
                CREATE TABLE IF NOT EXISTS student_guardians (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL,
                    guardian_id INTEGER NOT NULL,
                    relationship TEXT DEFAULT 'Responsável',
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(student_id, guardian_id)
                )
            `).run();
        } catch (tableError) {
            console.error('Erro ao criar tabela student_guardians:', tableError);
        }
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
            console.log('✅ [Link Student] Aluno já vinculado anteriormente. Retornando sucesso para fluxo.');
            return res.json({
                success: true,
                message: 'Aluno vinculado com sucesso!',
                alreadyLinked: true
            });
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

// Rota movida para o final (linha 6050+) para incluir unread_messages e logs extras.


// Solicitação de Pickup (Guardian)
app.post('/api/guardian/pickup', authenticateGuardian, (req, res) => {
    const { student_id, school_id, remote_authorization } = req.body;
    const guardianId = req.user.id;

    console.log(`🚗 [Pickup] Solicitado por Guardian ${guardianId} para Aluno ${student_id} na Escola ${school_id}`);

    try {
        const schoolDB = getSchoolDB(school_id);

        // Inserir pickup
        schoolDB.prepare(`
            INSERT INTO pickups (student_id, guardian_id, status, remote_authorization, timestamp)
            VALUES (?, ?, 'waiting', ?, datetime('now', 'localtime'))
        `).run(student_id, guardianId, remote_authorization ? 1 : 0);

        // Log para redundância
        try {
            schoolDB.prepare(`
                INSERT INTO access_logs (student_id, event_type, notified_guardian)
                VALUES (?, 'pickup_request', 1)
            `).run(student_id);
        } catch (e) { }

        res.json({ success: true, message: 'Solicitação enviada!' });
    } catch (error) {
        console.error('❌ Erro no pickup:', error);
        res.status(500).json({ error: 'Erro ao processar solicitação.', details: error.message });
    }
});

// Atualizar FCM token do guardian (para notificações push)

// GET Pickup Notifications for Guardian (when inspector calls the student)
app.get('/api/guardian/pickup-notifications', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const db = getSystemDB();

    try {
        // Get all schools
        const schools = db.prepare('SELECT id FROM schools').all();
        const notifications = [];

        schools.forEach(school => {
            try {
                const schoolDB = getSchoolDB(school.id);

                // Check if table exists
                const tableExists = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pickup_notifications'").get();

                if (tableExists) {
                    // Get unread notifications for this guardian
                    const notifs = schoolDB.prepare(`
                        SELECT * FROM pickup_notifications 
                        WHERE guardian_id = ? AND read_at IS NULL
                        ORDER BY created_at DESC
                        LIMIT 5
                    `).all(guardianId);

                    notifs.forEach(n => {
                        notifications.push({
                            ...n,
                            school_id: school.id
                        });
                    });
                }
            } catch (e) {
                // Ignore errors for individual schools
            }
        });

        res.json(notifications);
    } catch (error) {
        console.error('Erro ao buscar notificações de pickup:', error);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

// Mark pickup notification as read
app.post('/api/guardian/pickup-notifications/:id/read', authenticateGuardian, (req, res) => {
    const { school_id } = req.body;
    const notificationId = req.params.id;

    try {
        const schoolDB = getSchoolDB(school_id);
        schoolDB.prepare('UPDATE pickup_notifications SET read_at = datetime("now", "localtime") WHERE id = ?').run(notificationId);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao marcar notificação como lida:', error);
        res.status(500).json({ error: 'Erro' });
    }
});
// Get active pickup status for guardian's students (to show calling animation)
app.get('/api/guardian/active-pickups', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const db = getSystemDB();

    try {
        const schools = db.prepare('SELECT id FROM schools').all();
        const activePickups = [];

        schools.forEach(school => {
            try {
                const schoolDB = getSchoolDB(school.id);

                // Get pickups that are in 'calling' status for this guardian
                const pickups = schoolDB.prepare(`
                    SELECT p.*, s.name as student_name, s.class_name
                    FROM pickups p
                    JOIN students s ON p.student_id = s.id
                    WHERE p.guardian_id = ? 
                    AND p.status = 'calling'
                    AND date(p.timestamp) = date('now', 'localtime')
                `).all(guardianId);

                pickups.forEach(p => {
                    activePickups.push({
                        ...p,
                        school_id: school.id
                    });
                });
            } catch (e) {
                // Ignore
            }
        });

        res.json(activePickups);
    } catch (error) {
        console.error('Erro ao buscar pickups ativos:', error);
        res.status(500).json({ error: 'Erro' });
    }
});

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

        // Marcar como lidas
        try {
            schoolDB.prepare("UPDATE messages SET read_at = DATETIME('now', 'localtime') WHERE student_id = ? AND sender_type = 'school' AND read_at IS NULL").run(studentId);
        } catch (e) { }

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
    const { classId, type } = req.body;
    let { content } = req.body;
    if (!content && req.body.text) content = req.body.text;
    if (classId) content = `[Transmissão] ${content || ''}`;
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

        // Enriquecer com dados do aluno diretamente
        const result = participants.map(p => {
            let displayStudentName = 'Desconhecido';
            let displayClassName = '-';

            try {
                if (p.student_id) {
                    const student = db.prepare('SELECT name, class_name FROM students WHERE id = ?').get(p.student_id);
                    if (student) {
                        displayStudentName = student.name;
                        displayClassName = student.class_name;
                    }
                }
            } catch (err) { }

            return {
                ...p,
                student_name: displayStudentName,
                class_name: displayClassName || '-',
                receipt_url: p.payment_proof_url,
                created_at: p.confirmed_at
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

// ALIAS: O frontend PWA chama /school-events
app.get('/api/guardian/school-events', authenticateGuardian, (req, res) => {
    // Mesma lógica de /api/guardian/events
    const guardianId = req.user.id;
    const db = getSystemDB();
    try {
        const schools = db.prepare('SELECT id, name FROM schools').all();
        let allEvents = [];

        for (const school of schools) {
            try {
                const schoolDB = getSchoolDB(school.id);
                let hasLink = false;
                let myClasses = [];

                try {
                    let linkCheck = schoolDB.prepare("SELECT 1 FROM student_guardians WHERE guardian_id = ? AND status = 'active'").get(guardianId);
                    if (!linkCheck) {
                        // Fallback: try converting ID type (Number <-> String) to match DB
                        const altId = (typeof guardianId === 'number') ? String(guardianId) : Number(guardianId);
                        if (altId && !isNaN(altId)) {
                            linkCheck = schoolDB.prepare("SELECT 1 FROM student_guardians WHERE guardian_id = ? AND status = 'active'").get(altId);
                        }
                    }
                    hasLink = !!linkCheck;

                    if (hasLink) {
                        myClasses = schoolDB.prepare(`
                            SELECT DISTINCT s.class_name 
                            FROM students s
                            JOIN student_guardians sg ON s.id = sg.student_id
                            WHERE sg.guardian_id = ? AND sg.status = 'active'
                        `).all(guardianId).map(r => r.class_name).filter(c => c);
                    }
                } catch (e) { }

                // FIX: Security Check - Only fetch events if guardian DOES have students in this school
                if (!hasLink) continue;

                // Busca eventos se a tabela existir
                const tableCheck = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
                if (tableCheck) {
                    let query = 'SELECT * FROM events WHERE class_name IS NULL';
                    const params = [];

                    if (hasLink && myClasses.length > 0) {
                        query += ` OR class_name IN (${myClasses.map(() => '?').join(',')})`;
                        params.push(...myClasses);
                    }

                    query += ' ORDER BY created_at DESC LIMIT 20';
                    const events = schoolDB.prepare(query).all(...params);

                    events.forEach(e => {
                        let confirmCount = 0;
                        try {
                            // Check table existence first just in case
                            const ccCheck = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event_confirmations'").get();
                            if (ccCheck) {
                                confirmCount = schoolDB.prepare('SELECT COUNT(*) as count FROM event_confirmations WHERE event_id = ?').get(e.id).count;
                            }
                        } catch (err) { }

                        allEvents.push({
                            id: e.id,
                            title: e.title,
                            description: e.description,
                            date: e.event_date,
                            cost: e.cost,
                            pix_key: e.pix_key,
                            payment_deadline: e.payment_deadline,
                            school_name: school.name,
                            schoolId: school.id,
                            school_id: school.id, // Compatibility
                            type: e.type || 'event',
                            confirmation_count: confirmCount
                        });
                    });
                }
            } catch (e) {
                // console.log('Erro na escola (school-events)', school.id, e.message);
            }
        }

        allEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // RETORNO PLANO (ARRAY) se frontend esperar array, ou OBJETO se esperar { events: [] }
        // Pelo log de erro "Cannot read properties of undefined (reading 'some')", o frontend pode estar recebendo objeto mas tratando como array.
        // O código anterior retornava { events: [] }. O frontend PWA (linhas 2000+) faz .map direto?
        // Verificando index.html (não visível aqui mas pela experiência):
        // Se o frontend faz `data.events.forEach` então ok retornar objeto.
        // Se faz `data.forEach` então precisa ser array.
        // O endpoint original /api/guardian/events retornava array (linha 5325).
        // A correção anterior mudou para objeto { events: [] } na linha 5465.
        // Vou retornar ARRAY direto para garantir compatibilidade com o original.
        res.json(allEvents);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
});

// POST: Confirm event participation / Upload Receipt
const uploadConfirm = multer({ dest: 'uploads/' });
app.post('/api/guardian/school-events/:schoolId/:eventId/confirm', authenticateGuardian, uploadConfirm.single('receipt'), (req, res) => {
    const { schoolId, eventId } = req.params;
    const guardianId = req.user.id;

    try {
        const db = getSchoolDB(schoolId);

        // 1. Valida Vínculo (com fallback)
        let linkCheck = db.prepare("SELECT 1 FROM student_guardians WHERE guardian_id = ? AND status = 'active'").get(guardianId);
        if (!linkCheck) {
            const altId = (typeof guardianId === 'number') ? String(guardianId) : Number(guardianId);
            if (!isNaN(altId)) linkCheck = db.prepare("SELECT 1 FROM student_guardians WHERE guardian_id = ? AND status = 'active'").get(altId);
        }
        if (!linkCheck) return res.status(403).json({ error: 'Sem vínculo ativo.' });

        // 2. Busca Evento e Alunos
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

        // Pega alunos do responsável
        let students = [];

        if (event.class_name) {
            students = db.prepare(`SELECT s.id FROM students s JOIN student_guardians sg ON s.id = sg.student_id WHERE sg.guardian_id = ? AND s.class_name = ?`).all(guardianId, event.class_name);
            if (students.length === 0) {
                const altId = (typeof guardianId === 'number') ? String(guardianId) : Number(guardianId);
                if (!isNaN(altId)) students = db.prepare(`SELECT s.id FROM students s JOIN student_guardians sg ON s.id = sg.student_id WHERE sg.guardian_id = ? AND s.class_name = ?`).all(altId, event.class_name);
            }
        } else {
            students = db.prepare(`SELECT s.id FROM students s JOIN student_guardians sg ON s.id = sg.student_id WHERE sg.guardian_id = ?`).all(guardianId);
            if (students.length === 0) {
                const altId = (typeof guardianId === 'number') ? String(guardianId) : Number(guardianId);
                if (!isNaN(altId)) students = db.prepare(`SELECT s.id FROM students s JOIN student_guardians sg ON s.id = sg.student_id WHERE sg.guardian_id = ?`).all(altId);
            }
        }

        if (students.length === 0) return res.status(400).json({ error: 'Nenhum aluno elegível encontrado.' });

        // 3. Persistência
        const receiptUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const now = new Date().toISOString();

        // Check if table exists (just to fail gracefully if schema issue)
        const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event_participations'").get();
        if (!tableCheck) return res.status(500).json({ error: 'Tabela de participações não encontrada.' });

        const insertStmt = db.prepare("INSERT INTO event_participations (event_id, student_id, status, payment_proof_url, confirmed_at) VALUES (?, ?, ?, ?, ?)");
        const updateStmt = db.prepare("UPDATE event_participations SET status = ?, payment_proof_url = COALESCE(?, payment_proof_url), confirmed_at = ? WHERE id = ?");
        const checkStmt = db.prepare("SELECT id, payment_proof_url, status FROM event_participations WHERE event_id = ? AND student_id = ?");

        const transaction = db.transaction(() => {
            for (const student of students) {
                const existing = checkStmt.get(eventId, student.id);

                let newStatus = 'confirmed';
                if (receiptUrl) newStatus = 'pending_review';
                else if (existing && existing.payment_proof_url) newStatus = 'pending_review';
                else if (existing && existing.status === 'paid') newStatus = 'paid';

                if (existing) {
                    updateStmt.run(newStatus, receiptUrl, now, existing.id);
                } else {
                    insertStmt.run(eventId, student.id, newStatus, receiptUrl, now);
                }
            }
        });
        transaction();

        res.json({ success: true, message: 'Sucesso', status: 'ok' });

    } catch (e) {
        console.error('Confirm error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 13. GUARDIAN: Faturas (Financeiro)
app.get('/api/guardian/invoices', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const db = getSystemDB();
    try {
        const schools = db.prepare('SELECT id, name FROM schools').all();
        let allInvoices = [];

        for (const school of schools) {
            try {
                const schoolDB = getSchoolDB(school.id);

                // Verificar vínculo
                const students = schoolDB.prepare(`
                    SELECT s.id, s.name 
                    FROM students s
                    JOIN student_guardians sg ON s.id = sg.student_id
                    WHERE sg.guardian_id = ? AND sg.status = 'active'
                `).all(guardianId);

                if (students.length === 0) continue;

                // Verificar se tabela invoices existe
                const tableCheck = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'").get();
                if (!tableCheck) {
                    // Criar tabela se não existir (Auto-migration)
                    schoolDB.exec(`
                        CREATE TABLE IF NOT EXISTS invoices (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            student_id INTEGER,
                            description TEXT,
                            amount REAL,
                            due_date DATE,
                            status TEXT DEFAULT 'pending',
                            payment_url TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                    continue; // Recém criada, vazia
                }

                // Buscar faturas dos alunos
                const studentIds = students.map(s => s.id);
                if (studentIds.length > 0) {
                    const placeholders = studentIds.map(() => '?').join(',');
                    const invoices = schoolDB.prepare(`
                        SELECT * FROM invoices 
                        WHERE student_id IN (${placeholders})
                        ORDER BY due_date ASC
                    `).all(...studentIds);

                    invoices.forEach(inv => {
                        const student = students.find(s => s.id === inv.student_id);
                        allInvoices.push({
                            ...inv,
                            school_name: school.name,
                            student_name: student ? student.name : 'Aluno'
                        });
                    });
                }
            } catch (e) {
                console.error('Erro ao buscar faturas escola ' + school.id, e);
            }
        }

        res.json({ invoices: allInvoices });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao buscar faturas' });
    }
}); // End of /api/guardian/invoices

// ==================== GUARDIAN ACADEMIC ENDPOINTS ====================
// Serve data from school_db read-only for guardian
// NOTA: Endpoint /api/guardian/student-attendance foi movido para linha ~3028 (consolidado)


function safeJsonParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
}

// 15. GUARDIAN: Grades (Notas)
app.get('/api/guardian/grades', authenticateGuardian, (req, res) => {
    const { schoolId, studentId } = req.query;
    if (!schoolId || !studentId) return res.json([]);

    try {
        const schoolDB = getSchoolDB(schoolId);
        const systemDB = getSystemDB();

        // Verificar tabelas
        const hasExams = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exam_results'").get();
        if (!hasExams) return res.json([]);

        // Buscar notas
        const results = schoolDB.prepare(`
            SELECT r.score, r.graded_at, e.title, e.total_points, e.teacher_id, e.created_at
            FROM exam_results r
            JOIN exams e ON r.exam_id = e.id
            WHERE r.student_id = ?
            ORDER BY r.graded_at DESC
        `).all(studentId);

        // Buscar professores para saber a matéria
        const teacherIds = [...new Set(results.map(r => r.teacher_id).filter(id => id))];
        let teachersMap = {};

        if (teacherIds.length > 0) {
            const placeholders = teacherIds.map(() => '?').join(',');
            try {
                const teachers = systemDB.prepare(`SELECT id, name, subject FROM teachers WHERE id IN (${placeholders})`).all(...teacherIds);
                teachers.forEach(t => teachersMap[t.id] = t);
            } catch (err) { console.error('Erro ao buscar teachers:', err.message); }
        }

        const grades = results.map(r => {
            const t = teachersMap[r.teacher_id] || {};
            return {
                title: r.title,
                score: r.score,
                total: r.total_points,
                date: r.graded_at || r.created_at,
                subject: t.subject || 'Geral',
                teacher: t.name || ''
            };
        });

        res.json(grades);
    } catch (e) {
        console.error('Erro grades:', e);
        res.json([]);
    }
});

// 16. GUARDIAN: Reports (Relatórios)
app.get('/api/guardian/reports', authenticateGuardian, (req, res) => {
    const { schoolId, studentId } = req.query;
    if (!schoolId || !studentId) return res.json([]);

    try {
        const schoolDB = getSchoolDB(schoolId);
        const hasReports = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='student_reports'").get();
        if (!hasReports) return res.json([]);

        const reports = schoolDB.prepare(`
            SELECT * FROM student_reports WHERE student_id = ? ORDER BY created_at DESC
        `).all(studentId);

        const parsed = reports.map(r => ({
            ...r,
            subjects_performance: safeJsonParse(r.subjects_performance)
        }));

        res.json(parsed);
    } catch (e) {
        console.error('Erro reports:', e);
        res.json([]);
    }
});


// 17. GUARDIAN: Search Schools (Busca Escolas para Vínculo)
app.get('/api/guardian/schools', (req, res) => {
    const { search } = req.query;
    if (!search || search.length < 3) return res.json([]);

    const db = getSystemDB();
    try {
        const schools = db.prepare(`
            SELECT id, name, city, state, 'https://placehold.co/100' as logo_url 
            FROM schools 
            WHERE name LIKE ? OR city LIKE ?
            LIMIT 5
        `).all(`%${search}%`, `%${search}%`);
        res.json(schools);
    } catch (e) {
        console.error('Erro ao buscar escolas:', e);
        res.status(500).json({ error: 'Erro busca escolas' });
    }
});

// 18. GUARDIAN: Link Student (Vincular Filho)
app.post('/api/guardian/link-student', authenticateGuardian, (req, res) => {
    const { school_id, student_id } = req.body;
    const guardianId = req.user.id;

    console.log(`🔗 [LINK] Guardian ${guardianId} tentando vincular Student ${student_id} na School ${school_id}`);

    try {
        const schoolDB = getSchoolDB(school_id);

        // Verificar se aluno existe
        const student = schoolDB.prepare('SELECT id FROM students WHERE id = ?').get(student_id);
        if (!student) return res.status(404).json({ success: false, message: 'Aluno não encontrado' });

        // Verificar se já existe vínculo
        const existing = schoolDB.prepare('SELECT id FROM student_guardians WHERE student_id = ? AND guardian_id = ?').get(student_id, guardianId);
        if (existing) return res.status(400).json({ success: false, message: 'Já vinculado' });

        // Criar vínculo
        schoolDB.prepare(`
            INSERT INTO student_guardians (student_id, guardian_id, status, linked_at) 
            VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
        `).run(student_id, guardianId);

        console.log(`✅ [LINK] Sucesso!`);
        res.json({ success: true, message: 'Vinculado com sucesso' });

    } catch (error) {
        console.error('Erro ao vincular:', error);
        res.status(500).json({ success: false, message: 'Erro ao vincular' });
    }
});




// 19. GUARDIAN: SSE Events Stream (Notificações em Tempo Real)
app.get('/api/guardian/events-stream', (req, res) => {
    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Enviar ping inicial
    res.write(`data: ${JSON.stringify({ type: 'ping', message: 'Connected' })}\n\n`);

    // Manter conexão viva com heartbeat
    const keepAlive = setInterval(() => {
        res.write(`: keep-alive\n\n`);
    }, 15000); // 15s

    // Quando o cliente desconectar
    req.on('close', () => {
        clearInterval(keepAlive);
        res.end();
    });
});

// ==================== GUARDIAN AUTH ROUTES ====================

// POST /api/guardian/register
app.post('/api/guardian/register', async (req, res) => {
    try {
        const { email, password, name, phone } = req.body;
        const db = getSystemDB();

        if (!email || !password || !name) return res.status(400).json({ error: 'Dados incompletos' });

        const existing = db.prepare('SELECT id FROM guardians WHERE email = ?').get(email);
        if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

        // VALIDAÇÃO: Email deve estar pré-cadastrado como parent_email em algum aluno
        const schools = db.prepare('SELECT id FROM schools').all();
        let emailAuthorized = false;
        for (const school of schools) {
            try {
                const schoolDB = getSchoolDB(school.id);
                const found = schoolDB.prepare('SELECT id FROM students WHERE parent_email = ? LIMIT 1').get(email);
                if (found) { emailAuthorized = true; break; }
            } catch (e) { }
        }
        if (!emailAuthorized) {
            return res.status(403).json({ error: 'Email não autorizado. Este email não está pré-cadastrado em nenhuma escola. Peça à escola para cadastrar seu email como responsável do aluno.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = db.prepare(`
            INSERT INTO guardians (email, password, name, phone) VALUES (?, ?, ?, ?)
        `).run(email, hashedPassword, name, phone || '');

        const token = jwt.sign({ id: result.lastInsertRowid, email }, SECRET_KEY, { expiresIn: '30d' });

        res.status(201).json({
            success: true,
            message: 'Cadastro realizado',
            data: { guardian: { id: result.lastInsertRowid, email, name }, token }
        });
    } catch (error) {
        console.error('Erro no registro guardian:', error);
        res.status(500).json({ error: 'Erro interno no cadastro' });
    }
});

// POST /api/guardian/login
app.post('/api/guardian/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getSystemDB();

        console.log(`🔐 [LOGIN GUARDIAN] Tentativa: ${email}`);

        const guardian = db.prepare('SELECT * FROM guardians WHERE email = ?').get(email);

        if (!guardian) {
            console.log('❌ Usuário não encontrado');
            return res.status(401).json({ error: 'Email não cadastrado' });
        }

        const valid = await bcrypt.compare(password, guardian.password);
        if (!valid) {
            console.log('❌ Senha incorreta');
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        const token = jwt.sign({ id: guardian.id, email: guardian.email }, SECRET_KEY, { expiresIn: '30d' });

        console.log('✅ Login Sucesso:', guardian.id);

        res.json({
            success: true,
            data: {
                guardian: {
                    id: guardian.id,
                    email: guardian.email,
                    name: guardian.name,
                    phone: guardian.phone,
                    photo_url: guardian.photo_url || null
                },
                token
            }
        });
    } catch (error) {
        console.error('Erro login guardian:', error);
        res.status(500).json({ error: 'Erro interno no login' });
    }
});

// ==================== END GUARDIAN AUTH ====================



// ==================== SSE NOTIFICATIONS ====================


// Middleware de Autenticação para Guardiões (Já definido acima)
// const authenticateGuardian = ...


app.get('/api/guardian/events', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const db = getSystemDB();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    const interval = setInterval(() => {
        try {
            const schools = db.prepare('SELECT id, name FROM schools').all();
            schools.forEach(school => {
                try {
                    const schoolDB = getSchoolDB(school.id);
                    // Check if table exists to avoid crash
                    const check = schoolDB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='access_logs'").get();
                    if (!check) return;

                    const notifs = schoolDB.prepare(`
                        SELECT al.id, al.student_id, s.name as student_name, s.class_name, al.event_type, al.timestamp
                        FROM access_logs al
                        JOIN students s ON al.student_id = s.id
                        JOIN student_guardians sg ON s.id = sg.student_id
                        WHERE sg.guardian_id = ? AND al.notified_guardian = 0
                    `).all(guardianId);

                    if (notifs.length > 0) {
                        notifs.forEach(n => {
                            res.write(`data: ${JSON.stringify({ type: 'notification', data: { ...n, school_name: school.name } })}\n\n`);
                            // Mark as notified to avoid loop
                            schoolDB.prepare('UPDATE access_logs SET notified_guardian = 1 WHERE id = ?').run(n.id);
                        });
                    }
                } catch (e) { }
            });
        } catch (e) { console.error('SSE Error:', e.message); }
    }, 3000);

    req.on('close', () => {
        clearInterval(interval);
    });
});


app.get('/api/guardian/my-students', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;

    const systemDB = getSystemDB();

    try {
        console.log(`📚 [MY-STUDENTS] Guardian ${guardianId} solicitou lista de alunos`);

        // Buscar todas as escolas
        const schools = systemDB.prepare('SELECT id, name, address, number, zip_code, latitude, longitude FROM schools').all();
        let allStudents = [];

        for (const school of schools) {
            try {
                const schoolDB = getSchoolDB(school.id);

                // Buscar alunos vinculados a este guardian nesta escola
                const students = schoolDB.prepare(`
                    SELECT 
                        s.id,
                        s.name,
                        s.class_name,
                        s.photo_url,
                        s.age
                    FROM students s
                    JOIN student_guardians sg ON s.id = sg.student_id
                    WHERE sg.guardian_id = ? AND sg.status = 'active'
                `).all(guardianId);

                // Adicionar informações da escola a cada aluno e contar mensagens não lidas
                students.forEach(student => {
                    let unreadCount = 0;
                    let faceDescCount = 0;
                    try {
                        const unread = schoolDB.prepare("SELECT COUNT(*) as count FROM messages WHERE student_id = ? AND sender_type = 'school' AND read_at IS NULL").get(student.id);
                        unreadCount = unread ? unread.count : 0;
                    } catch (e) {
                        console.error(`[DEBUG-CHAT] Erro ao contar mensagens: ${e.message}`);
                    }

                    try {
                        const faceCount = schoolDB.prepare("SELECT COUNT(*) as count FROM face_descriptors WHERE student_id = ?").get(student.id);
                        faceDescCount = faceCount ? faceCount.count : 0;
                    } catch (e) { }

                    allStudents.push({
                        ...student,
                        school_id: school.id,
                        school_name: school.name,
                        school_address: school.address,
                        school_number: school.number,
                        school_zip_code: school.zip_code,
                        school_latitude: school.latitude,
                        school_longitude: school.longitude,
                        unread_messages: Number(unreadCount),
                        face_descriptor_count: Number(faceDescCount)
                    });
                });

            } catch (e) {
                console.error(`Erro ao buscar alunos da escola ${school.id}:`, e.message);
            }
        }

        console.log(`✅ [MY-STUDENTS] Retornando ${allStudents.length} alunos`);
        res.json({ students: allStudents });

    } catch (e) {
        console.error('[MY-STUDENTS] Erro:', e);
        res.status(500).json({ error: 'Erro ao buscar alunos', details: e.message });
    }
});

// =================================================================
// GUARDIAN: Multi-angle face registration from PWA
// =================================================================
app.post('/api/guardian/student/:studentId/face-descriptors', authenticateGuardian, (req, res) => {
    const guardianId = req.user.id;
    const { studentId } = req.params;
    const { school_id, descriptors, front_photo } = req.body;
    // descriptors = [{ descriptor: "[...]", angle: "front" }, { descriptor: "[...]", angle: "left" }, ...]

    if (!school_id || !descriptors || !Array.isArray(descriptors) || descriptors.length === 0) {
        return res.status(400).json({ error: 'Dados incompletos. Envie school_id e descriptors (array).' });
    }

    if (descriptors.length < 3) {
        return res.status(400).json({ error: 'Mínimo de 3 ângulos necessários para cadastro biométrico.' });
    }

    try {
        const schoolDB = getSchoolDB(school_id);

        // Verify guardian has link to this student
        const link = schoolDB.prepare(
            'SELECT id FROM student_guardians WHERE student_id = ? AND guardian_id = ? AND status = ?'
        ).get(studentId, guardianId, 'active');

        if (!link) {
            return res.status(403).json({ error: 'Você não tem vínculo com este aluno.' });
        }

        // Verify student exists
        const student = schoolDB.prepare('SELECT id, name FROM students WHERE id = ?').get(studentId);
        if (!student) {
            return res.status(404).json({ error: 'Aluno não encontrado.' });
        }

        // Delete existing descriptors and save new multi-angle ones
        schoolDB.prepare('DELETE FROM face_descriptors WHERE student_id = ?').run(studentId);

        const insertStmt = schoolDB.prepare(
            'INSERT INTO face_descriptors (student_id, descriptor, angle) VALUES (?, ?, ?)'
        );

        let savedCount = 0;
        for (const fd of descriptors) {
            try {
                // Validate descriptor is a valid 128-element array
                const desc = typeof fd.descriptor === 'string' ? JSON.parse(fd.descriptor) : fd.descriptor;
                if (!Array.isArray(desc) || desc.length !== 128) {
                    console.warn(`⚠️ Descritor inválido (${desc?.length} dims) - ignorando`);
                    continue;
                }
                insertStmt.run(studentId, JSON.stringify(desc), fd.angle || 'unknown');
                savedCount++;
            } catch (parseErr) {
                console.error('Erro ao processar descritor:', parseErr.message);
            }
        }

        console.log(`✅ [GUARDIAN FACE] ${savedCount} descritores multi-ângulo salvos para aluno ${student.name} (ID: ${studentId})`);

        // Salvar foto frontal como photo_url do aluno (aparece no painel da escola)
        if (front_photo && front_photo.startsWith('data:image')) {
            schoolDB.prepare('UPDATE students SET photo_url = ? WHERE id = ?').run(front_photo, studentId);
            console.log(`📸 [GUARDIAN FACE] Foto frontal salva como photo_url para aluno ${student.name}`);
        }

        res.json({
            success: true,
            message: `${savedCount} ângulo(s) de biometria facial salvo(s) com sucesso!`,
            saved_count: savedCount,
            student_name: student.name
        });

    } catch (error) {
        console.error('❌ Erro ao salvar descritores do guardian:', error);
        res.status(500).json({ error: 'Erro ao salvar biometria facial', message: error.message });
    }
});



// ==================== TEACHER ROUTES ====================

// POST /api/teacher/grades - Lançar Nota Simplificada
app.post('/api/teacher/grades', async (req, res) => {
    try {
        const { studentId, subject, score, period, schoolId } = req.body;

        // Validação básica
        if (!studentId || score === undefined) return res.status(400).json({ error: 'Dados incompletos' });

        // Identificar escola
        const targetSchoolId = schoolId || req.body.school_id;
        if (!targetSchoolId) return res.status(400).json({ error: 'ID da escola necessário' });

        const schoolDB = getSchoolDB(targetSchoolId);

        // Verificar se student existe
        const student = schoolDB.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
        if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });

        // Criar exame (Avaliação)
        const title = `${period || 'Nota'} - ${subject || 'Geral'}`;
        const userId = 1; // Default teacher ID (Sistema)

        // Inserir Exame
        const stmtExam = schoolDB.prepare(`
            INSERT INTO exams (teacher_id, title, total_points, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `);
        const resultExam = stmtExam.run(userId, title, 10);
        const examId = resultExam.lastInsertRowid;

        // Inserir Resultado
        const stmtResult = schoolDB.prepare(`
            INSERT INTO exam_results (exam_id, student_id, score, graded_at)
            VALUES (?, ?, ?, datetime('now'))
        `);
        stmtResult.run(examId, studentId, score);

        res.json({ success: true, message: 'Nota salva com sucesso' });

    } catch (e) {
        console.error('Erro ao salvar nota:', e);
        res.status(500).json({ error: 'Erro interno: ' + e.message });
    }
});

// ==================== SERVIR FRONTEND (PRODUÇÃO) ====================
// Serve os arquivos estáticos do Admin Panel (Pasta client/dist)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Qualquer rota que não comece com /api retorna o index.html do React
// COMENTADO: Incompatível com Express v5
/*
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
*/

// Rota raiz: Painel de Monitoramento de Câmeras (Status Page)
app.get('/', (req, res) => {
    try {
        const db = getSystemDB();

        // Buscar câmeras e info da escola
        let cameras = [];
        try {
            cameras = db.prepare(`
                SELECT c.camera_name, c.status as db_status, c.camera_purpose, s.name as school_name, c.id, c.camera_url
                FROM cameras c
                LEFT JOIN schools s ON c.school_id = s.id
                ORDER BY c.created_at DESC
            `).all();
        } catch (e) {
            console.error("Erro ao buscar câmeras para monitor:", e);
        }

        const CameraMonitorService = require('./services/CameraMonitorService');
        const monitorStatus = CameraMonitorService.getAllStatuses();

        const camerasHtml = cameras.map(cam => {
            const isMonitored = monitorStatus[cam.id]?.status === 'connected';
            const statusColor = isMonitored ? '#10b981' : (cam.db_status === 'active' ? '#f59e0b' : '#ef4444');
            const statusText = isMonitored ? 'ATIVO (IA Processando)' : (cam.db_status === 'active' ? 'Cadastrado (Aguardando Conexão)' : 'Desativado');
            const statusIcon = isMonitored ? '🟢' : (cam.db_status === 'active' ? '🟠' : '🔴');

            return `
                <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 15px; border-left: 6px solid ${statusColor}; transition: transform 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <div style="font-weight: 700; font-size: 1.25em; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                                <span>📷</span> ${cam.camera_name}
                            </div>
                            <div style="color: #6b7280; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                                <span>🏫</span> ${cam.school_name || 'Escola Não Identificada'}
                            </div>
                            <div style="color: #9ca3af; font-size: 0.9em; margin-top: 4px;">
                                🎯 Finalidade: <span style="background: #e5e7eb; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8em; text-transform: uppercase;">${cam.camera_purpose}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: ${statusColor}; font-weight: 700; font-size: 0.95em; display: flex; align-items: center; gap: 6px; justify-content: flex-end;">
                                ${statusIcon} ${statusText}
                            </div>
                            ${isMonitored ? `<div style="font-size: 0.8em; color: #10b981; margin-top: 4px;">Online desde: ${new Date(monitorStatus[cam.id].online_since).toLocaleTimeString()}</div>` : ''}
                             <div style="font-size: 0.75em; color: #d1d5db; margin-top: 8px; font-family: monospace;">ID: ${cam.id}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>EduFocus Monitor</title>
                <meta http-equiv="refresh" content="10"> <!-- Auto refresh a cada 10s -->
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; line-height: 1.6; }
                    .header { background: #4f46e5; color: white; padding: 2rem 1rem; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 2rem; }
                    .header h1 { margin: 0; font-size: 2rem; }
                    .header p { margin: 0.5rem 0 0; opacity: 0.9; }
                    .container { max-width: 900px; margin: 0 auto; padding: 0 1rem; }
                    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
                    .stat-card { background: white; padding: 1.5rem; border-radius: 12px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                    .stat-value { font-size: 2.5rem; font-weight: 800; line-height: 1; margin-bottom: 0.5rem; }
                    .stat-label { font-size: 0.875rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
                    .footer { text-align: center; margin-top: 3rem; margin-bottom: 2rem; color: #9ca3af; font-size: 0.875rem; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🚀 EduFocus Monitor Server</h1>
                    <p>Status em Tempo Real do Sistema de Visão Computacional</p>
                </div>

                <div class="container">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-value" style="color: #4f46e5;">${cameras.length}</div>
                            <div class="stat-label">Câmeras Cadastradas</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" style="color: #10b981;">
                                ${Object.keys(monitorStatus).length}
                            </div>
                            <div class="stat-label">IA Ativa Agora</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" style="color: #f59e0b;">
                                ${cameras.filter(c => c.db_status === 'active' && !monitorStatus[c.id]).length}
                            </div>
                            <div class="stat-label">Aguardando Conexão</div>
                        </div>
                    </div>

                    ${camerasHtml || '<div style="background: white; padding: 40px; border-radius: 12px; text-align:center; color:#6b7280;">Nenhuma câmera cadastrada no sistema ainda.</div>'}

                </div>

                <div class="footer">
                    Servidor Rodando • Atualizado em: ${new Date().toLocaleString('pt-BR')} <br>
                    Desenvolvido por EduFocus AI Team
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error(err);
        res.status(500).send(`
            <div style="padding: 50px; text-align: center; font-family: sans-serif;">
                <h1 style="color: #ef4444;">Erro no Monitor</h1>
                <p>Ocorreu um erro ao carregar o status do sistema.</p>
                <code style="background: #eee; padding: 10px; border-radius: 4px;">${err.message}</code>
            </div>
        `);
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

    // 3. Iniciar Serviço de Monitoramento de Câmeras (Backend Centralizado)
    try {
        const CameraMonitorService = require('./services/CameraMonitorService');
        CameraMonitorService.start();
    } catch (err) {
        console.error('❌ Erro ao iniciar CameraMonitorService:', err);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT} `);
    });
};

startServer();
