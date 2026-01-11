import sqlite3
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'school_1.db'))
print(f"Corrigindo vínculos em: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)

# Limpar vínculos errados (com ID 1)
conn.execute("DELETE FROM student_guardians WHERE student_id = 1")

# Vincular Fernando (ID 20 e 21) ao aluno Claudio Andre (ID 2)
# Verificar se já existe antes de inserir
existing_20 = conn.execute("SELECT 1 FROM student_guardians WHERE student_id = 2 AND guardian_id = 20").fetchone()
if not existing_20:
    conn.execute("INSERT INTO student_guardians (student_id, guardian_id) VALUES (2, 20)")
    print("✅ Vínculo criado: Claudio <-> Fernando (ID 20)")

existing_21 = conn.execute("SELECT 1 FROM student_guardians WHERE student_id = 2 AND guardian_id = 21").fetchone()
if not existing_21:
    conn.execute("INSERT INTO student_guardians (student_id, guardian_id) VALUES (2, 21)")
    print("✅ Vínculo criado: Claudio <-> Fernando (ID 21)")

conn.commit()

# Verificar resultados
links = conn.execute("SELECT sg.student_id, s.name, sg.guardian_id FROM student_guardians sg JOIN students s ON sg.student_id = s.id").fetchall()
print("\nVínculos Ativos:")
for l in links:
    print(f"Aluno: {l[1]} (ID {l[0]}) <-> Guardião ID {l[2]}")

conn.close()
