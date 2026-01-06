const Database = require('better-sqlite3');
const db = new Database(':memory:');

const nowISO = new Date().toISOString();
console.log('JS Date().toISOString():', nowISO);

db.exec("CREATE TABLE logs (timestamp TEXT)");
db.prepare("INSERT INTO logs VALUES (?)").run(nowISO);

const row = db.prepare("SELECT timestamp, datetime('now') as sql_now, datetime('now', '-15 seconds') as sql_min_15 FROM logs").get();
console.log('DB Row:', row);

const check = db.prepare("SELECT * FROM logs WHERE timestamp > datetime('now', '-15 seconds')").get();
console.log('Query Result (Expected match):', check ? 'MATCH FOUND' : 'NO MATCH');

// Test Case 2: Without 'T' and 'Z'
const nowSimple = nowISO.replace('T', ' ').replace('Z', '').split('.')[0];
console.log('\nSimple format:', nowSimple);
db.prepare("INSERT INTO logs VALUES (?)").run(nowSimple);

const check2 = db.prepare("SELECT * FROM logs WHERE timestamp = ? AND timestamp > datetime('now', '-15 seconds')").get(nowSimple);
console.log('Query Result Simple (Expected match):', check2 ? 'MATCH FOUND' : 'NO MATCH');
