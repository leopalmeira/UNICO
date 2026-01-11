
import sqlite3

email_target = "leandro2703palmeira@gmail.com"

print(f"--- Diagnóstico de Usuario: {email_target} ---")
try:
    conn = sqlite3.connect('../database/system.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("SELECT * FROM guardians WHERE email = ?", (email_target,))
    user = cur.fetchone()
    
    if user:
        print(f"✅ Encontrado na tabela 'guardians'")
        print(f"   ID: {user['id']}")
        # Checar colunas
        keys = user.keys()
        print(f"   Colunas: {keys}")
        if 'role' in keys:
            print(f"   Role: '{user['role']}'")
        else:
            print("   ⚠️ Coluna 'role' NÃO EXISTE no resultado.")
    else:
        print("❌ NÃO encontrado na tabela 'guardians'")
    
    conn.close()

except Exception as e:
    print(f"Erro fatal: {e}")
