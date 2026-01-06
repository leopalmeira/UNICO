const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../database/school_14.db'));
const count = db.prepare('SELECT count(*) as c FROM students').get();
console.log(`Alunos restantes: ${count.c}`);
db.close();
