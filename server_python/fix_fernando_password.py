import sqlite3
import bcrypt

# Conectar ao banco
conn = sqlite3.connect('database/system.db')

# Atualizar senha do Fernando
password = '123456'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

conn.execute('UPDATE guardians SET password = ? WHERE email = ?', (hashed, 'fernando@email.com'))
conn.commit()

# Verificar
guardian = conn.execute('SELECT id, email, name, password FROM guardians WHERE email = ?', ('fernando@email.com',)).fetchone()
print(f"✅ Senha atualizada para Fernando!")
print(f"Email: {guardian[1]}")
print(f"Hash: {guardian[3][:50]}...")

# Testar senha
if bcrypt.checkpw(password.encode('utf-8'), guardian[3].encode('utf-8')):
    print("✅ Senha verificada com sucesso!")
else:
    print("❌ Erro na verificação da senha")

conn.close()
