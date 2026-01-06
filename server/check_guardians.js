const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../database/school_14.db'));

console.log('--- Schema student_guardians ---');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='student_guardians'").get();
console.log(schema ? schema.sql : 'Table not found');

console.log('\n--- Rows in student_guardians ---');
const rows = db.prepare('SELECT * FROM student_guardians').all();
console.log(rows);

console.log('\n--- Rows in access_logs (Last 5) ---');
const logs = db.prepare('SELECT * FROM access_logs ORDER BY id DESC LIMIT 5').all();
console.log(logs);

db.close();
