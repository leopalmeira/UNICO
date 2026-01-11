import sqlite3

conn = sqlite3.connect('database/system.db')
conn.row_factory = sqlite3.Row

guardians = conn.execute('SELECT id, email, name FROM guardians').fetchall()
print('Responsáveis cadastrados:')
for g in guardians:
    print(f'  ID {g["id"]}: {g["email"]} - {g["name"]}')

conn.close()
