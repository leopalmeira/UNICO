from database import get_system_db
from flask import Flask
import os

app = Flask(__name__)
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database')
print(f"Caminho esperado do DB: {os.path.join(DB_DIR, 'system.db')}")

with app.app_context():
    try:
        db = get_system_db()
        cur = db.cursor()
        print("✅ Conexão bem sucedida via get_system_db()")
        
        # Listar todos os guardians
        guardians = cur.execute("SELECT id, email FROM guardians").fetchall()
        print(f"📋 Total de guardians encontrados: {len(guardians)}")
        for g in guardians:
            print(f"   ID: {g['id']}, Email: '{g['email']}'")
            
        # Verificar especificamente o Fernando
        fernando = cur.execute("SELECT * FROM guardians WHERE email = 'fernando@email.com'").fetchone()
        if fernando:
            print("✅ Fernando ENCONTRADO!")
        else:
            print("❌ Fernando NÃO ENCONTRADO!")
            
    except Exception as e:
        print(f"❌ Erro ao acessar banco: {e}")
