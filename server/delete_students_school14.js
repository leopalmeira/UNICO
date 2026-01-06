const Database = require('better-sqlite3');
const path = require('path');

const SCHOOL_ID = 14;
const DB_PATH = path.join(__dirname, `../database/school_${SCHOOL_ID}.db`);

if (!require('fs').existsSync(DB_PATH)) {
    console.error(`❌ Banco de dados da escola ${SCHOOL_ID} não encontrado em ${DB_PATH}`);
    process.exit(1);
}

const db = new Database(DB_PATH);

try {
    console.log(`🔌 Conectado ao banco da escola ${SCHOOL_ID} (escola123)`);

    // Listar tabelas para debug
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('📊 Tabelas encontradas:', tables.map(t => t.name).join(', '));

    // Desabilitar Foreign Keys temporariamente para permitir a limpeza (CUIDADO: Gera orfãos se não limpar tudo)
    db.pragma('foreign_keys = OFF');

    // 1. Limpar tabelas dependentes conhecidas
    const tablesToClean = ['student_guardians', 'access_logs', 'attendance', 'event_participations', 'messages', 'grades', 'enrollments'];

    tablesToClean.forEach(table => {
        try {
            const info = db.prepare(`DELETE FROM ${table}`).run();
            console.log(`✅ ${table}: ${info.changes} registros removidos.`);
        } catch (e) {
            // Ignora se tabela não existir
        }
    });

    // 2. Deletar Alunos
    const delStudents = db.prepare('DELETE FROM students').run();
    console.log(`✅ ${delStudents.changes} alunos excluídos.`);

    console.log('🏁 Limpeza concluída para escola123!');

} catch (error) {
    console.error('❌ Erro ao excluir alunos:', error);
} finally {
    db.close();
}
