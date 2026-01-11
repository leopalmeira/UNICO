import sqlite3
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database', 'school_1.db'))
print(f"Lendo banco da escola: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)

print("\n--- Alunos ---")
students = conn.execute("SELECT id, name, class_id FROM students").fetchall()
for s in students:
    print(f"ID {s[0]}: {s[1]} (Turma {s[2]})")

print("\n--- Vínculos (student_guardians) ---")
try:
    links = conn.execute("SELECT student_id, guardian_id FROM student_guardians").fetchall()
    for l in links:
        print(f"Aluno {l[0]} <-> Guardião {l[1]}")
except Exception as e:
    print(f"Erro ao ler vínculos: {e}")

conn.close()
