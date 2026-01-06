const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../database/system.db'));

const email = 'leandro2703palmeira@gmail.com';
const guardian = db.prepare('SELECT * FROM guardians WHERE email = ?').get(email);

console.log('Guardian found:', guardian);
db.close();
