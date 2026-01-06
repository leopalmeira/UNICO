from flask import Blueprint, request, jsonify, g
from .auth import token_required
from database import get_system_db, get_school_db
import bcrypt

school_bp = Blueprint('school', __name__)

@school_bp.route('/api/school/students', methods=['GET'])
@token_required
def get_students():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    cur = db.cursor()
    
    # Busca alunos e seus descritores faciais se houver
    # Python sqlite3 row factory retorna rows que podem ser convertidos para dict
    cur.execute('''
        SELECT s.*, fd.descriptor as face_descriptor
        FROM students s
        LEFT JOIN face_descriptors fd ON s.id = fd.student_id
    ''')
    students = [dict(row) for row in cur.fetchall()]
    return jsonify(students)

@school_bp.route('/api/school/students', methods=['POST'])
@token_required
def create_student():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    cur = db.cursor()
    
    try:
        # 1. Criar Aluno
        cur.execute('''
            INSERT INTO students (name, parent_email, phone, photo_url, class_name, age)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            data.get('name'),
            data.get('parent_email'),
            data.get('phone'),
            data.get('photo_url'),
            data.get('class_name', 'Sem turma'),
            data.get('age')
        ))
        student_id = cur.lastrowid
        
        # 2. Salvar Descritor Facial
        if data.get('face_descriptor'):
            # Convert array/list to string if needed, depending on how JS sends it
            # Usually JS sends an array, we might want to store as JSON string or blob
            import json
            descriptor = data.get('face_descriptor')
            if isinstance(descriptor, list):
                descriptor = json.dumps(descriptor)
                
            cur.execute('''
                INSERT INTO face_descriptors (student_id, descriptor)
                VALUES (?, ?)
            ''', (student_id, descriptor))
            
        # 3. Criar/Vincular Responsável Global (System DB)
        parent_email = data.get('parent_email')
        if parent_email:
            sys_db = get_system_db()
            sys_cur = sys_db.cursor()
            
            sys_cur.execute('SELECT * FROM guardians WHERE email = ?', (parent_email,))
            guardian = sys_cur.fetchone()
            
            guardian_id = None
            if not guardian:
                # Criar novo responsável
                import random
                password = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
                hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                
                sys_cur.execute('''
                    INSERT INTO guardians (email, password, name, phone)
                    VALUES (?, ?, ?, ?)
                ''', (parent_email, hashed, f"Responsável de {data.get('name')}", data.get('phone') or ''))
                guardian_id = sys_cur.lastrowid
                sys_db.commit()
                print(f"Created global guardian {guardian_id} with password {password}")
            else:
                guardian_id = guardian['id']
                
            # Vincular na tabela da escola
            cur.execute('''
                INSERT INTO student_guardians (student_id, guardian_id)
                VALUES (?, ?)
            ''', (student_id, guardian_id))
            
        db.commit()
        return jsonify({'message': 'Aluno criado com sucesso', 'id': student_id})
        
    except Exception as e:
        print(f"Error creating student: {e}")
        return jsonify({'message': 'Erro ao criar aluno', 'error': str(e)}), 500

@school_bp.route('/api/school/teachers', methods=['GET'])
@token_required
def get_teachers():
    # Professores ficam no DB do Sistema, mas filtrados por school_id
    school_id = g.user.get('school_id') or g.user.get('id')
    sys_db = get_system_db()
    cur = sys_db.cursor()
    
    cur.execute('SELECT * FROM teachers WHERE school_id = ?', (school_id,))
    teachers = [dict(row) for row in cur.fetchall()]
    # Remove senhas
    for t in teachers:
        if 'password' in t: del t['password']
        

@school_bp.route('/api/school/classes', methods=['GET'])
@token_required
def get_classes():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    cur = db.cursor()
    cur.execute('SELECT * FROM classes')
    return jsonify([dict(row) for row in cur.fetchall()])

@school_bp.route('/api/school/classes', methods=['POST'])
@token_required
def create_class():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    db.execute('INSERT INTO classes (name, description) VALUES (?, ?)', 
               (data.get('name'), data.get('description')))
    db.commit()
    return jsonify({'success': True})

@school_bp.route('/api/school/teachers', methods=['POST'])
@token_required
def create_teacher():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    sys_db = get_system_db()
    
    # Check if teacher exists globally
    existing = sys_db.execute('SELECT * FROM teachers WHERE email = ?', (data.get('email'),)).fetchone()
    if existing:
        return jsonify({'message': 'Email já cadastrado'}), 400
        
    import random
    password = ''.join(random.choices('0123456789', k=6))
    
    sys_db.execute('''
        INSERT INTO teachers (name, email, password, subject, school_id, status)
        VALUES (?, ?, ?, ?, ?, 'active')
    ''', (data.get('name'), data.get('email'), password, data.get('subject'), school_id))
    sys_db.commit()
    
    return jsonify({'success': True, 'password': password})
