
import sqlite3
import glob

# Encontrar todos os bancos de escola
db_files = glob.glob('../database/school_*.db')

print(f"Encontrados {len(db_files)} bancos de escola.")

for db_path in db_files:
    print(f"Atualizando {db_path}...")
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        # Verificar colunas existentes
        cur.execute("PRAGMA table_info(employees)")
        columns = [info[1] for info in cur.fetchall()]
        
        new_columns = {
            'email': 'TEXT',
            'phone': 'TEXT',
            'employee_id': 'TEXT',
            'work_start_time': 'TEXT',
            'work_end_time': 'TEXT',
            'guardian_id': 'INTEGER' # ID do usuário no sistema global
        }
        
        for col, type_ in new_columns.items():
            if col not in columns:
                print(f"  Adicionando coluna {col}...")
                cur.execute(f"ALTER TABLE employees ADD COLUMN {col} {type_}")
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"  Erro em {db_path}: {e}")

# Verificar tabela guardians no sistema
print("Verificando tabela guardians no sistema...")
try:
    conn = sqlite3.connect('../database/system.db')
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(guardians)")
    columns = [info[1] for info in cur.fetchall()]
    
    if 'role' not in columns:
        print("  Adicionando coluna role em guardians...")
        cur.execute("ALTER TABLE guardians ADD COLUMN role TEXT DEFAULT 'guardian'")
    
    conn.commit()
    conn.close()
except Exception as e:
    print(f"  Erro no sistema: {e}")
