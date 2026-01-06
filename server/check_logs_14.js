const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../database/school_14.db'));

console.log('\n--- Rows in access_logs (Last 5) ---');
const logs = db.prepare('SELECT * FROM access_logs ORDER BY id DESC LIMIT 5').all();
console.log(logs);

db.close();
