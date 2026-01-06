const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/system.db');
const sysDB = new Database(dbPath);
const schools = sysDB.prepare('SELECT id, name FROM schools').all();

schools.forEach(school => {
    const sDbPath = path.join(__dirname, `../database/school_${school.id}.db`);
    if (fs.existsSync(sDbPath)) {
        try {
            const db = new Database(sDbPath);
            const count = db.prepare('SELECT count(*) as c FROM student_guardians').get();
            console.log(`[ID ${school.id}] ${school.name}: ${count.c} links guardian-student`);
            if (count.c > 0) {
                const rows = db.prepare('SELECT * FROM student_guardians').all();
                console.log(rows);
            }
            db.close();
        } catch (e) { console.log(`Error checking school ${school.id}:`, e.message); }
    }
});

sysDB.close();
