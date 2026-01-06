const { initSystemDB, getSystemDB, getSchoolDB } = require('./server/db');
const bcrypt = require('bcryptjs');

// Inicializar DBs
initSystemDB();

const systemDB = getSystemDB();

console.log('🌱 Iniciando Seed de Teste para Guardian App...');

// 1. Criar Escola de Teste
let school = systemDB.prepare("SELECT * FROM schools WHERE email = 'escola_teste@edufocus.com'").get();

if (!school) {
    const hashedPassword = bcrypt.hashSync('123456', 10);
    const info = systemDB.prepare(`
        INSERT INTO schools (name, admin_name, email, password, address, status)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('Escola Modelo EduFocus', 'Diretor Teste', 'escola_teste@edufocus.com', hashedPassword, 'Rua Teste, 123', 'active');

    school = { id: info.lastInsertRowid, name: 'Escola Modelo EduFocus' };
    console.log(`✅ Escola criada: ${school.name} (ID: ${school.id})`);
} else {
    console.log(`ℹ️ Escola já existe: ${school.name} (ID: ${school.id})`);
}

// 2. Criar Dados na Escola (Turma e Aluno)
const schoolDB = getSchoolDB(school.id);

// Criar Turma
let turma = schoolDB.prepare("SELECT * FROM students WHERE class_name = '1º Ano A'").get();
// Nota: A tabela 'classes' existe, mas o sistema atual parece basear turmas no campo 'class_name' dos alunos em alguns pontos.
// Mas vamos garantir na tabela classes também se existir
try {
    schoolDB.prepare("INSERT OR IGNORE INTO classes (name, grade) VALUES ('1º Ano A', '1º Ano')").run();
} catch (e) { }

// Criar Aluno
let student = schoolDB.prepare("SELECT * FROM students WHERE name = 'Joãozinho Teste'").get();

if (!student) {
    const info = schoolDB.prepare(`
        INSERT INTO students (name, parent_email, phone, class_name, age, photo_url)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('Joãozinho Teste', 'teste@email.com', '11999999999', '1º Ano A', 7, 'https://cdn-icons-png.flaticon.com/512/2922/2922510.png');
    console.log(`✅ Aluno criado: Joãozinho Teste (ID: ${info.lastInsertRowid}) na turma 1º Ano A`);
} else {
    console.log(`ℹ️ Aluno já existe: Joãozinho Teste`);
}

console.log('🏁 Seed concluído!');
process.exit(0);
