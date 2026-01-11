from flask import Blueprint, request, jsonify, g
from .auth import token_required
from .affiliate_helpers import get_accessible_school_id
from database import get_system_db, get_school_db
import bcrypt

school_bp = Blueprint('school', __name__)

@school_bp.route('/api/school/students', methods=['GET'])
@token_required
def get_students():
    school_id = get_accessible_school_id()
    db = get_school_db(school_id)
    cur = db.cursor()
    
    # Lógica idêntica ao Funcionário: Leitura direta da tabela
    cur.execute('SELECT * FROM students')
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
        # 1. Preparar Descritor (Lógica idêntica ao Funcionário)
        descriptor = None
        if data.get('face_descriptor'):
            import json
            d_data = data.get('face_descriptor')
            if isinstance(d_data, list):
                descriptor = json.dumps(d_data)
            else:
                descriptor = d_data

        # 2. Criar Aluno salvando TUDO na tabela students
        cur.execute('''
            INSERT INTO students (name, parent_email, phone, photo_url, class_name, age, face_descriptor)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('name'),
            data.get('parent_email'),
            data.get('phone'),
            data.get('photo_url'),
            data.get('class_name', 'Sem turma'),
            data.get('age'),
            descriptor
        ))
        student_id = cur.lastrowid
            
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
    school_id = get_accessible_school_id()
    sys_db = get_system_db()
    cur = sys_db.cursor()
    
    cur.execute('SELECT * FROM teachers WHERE school_id = ?', (school_id,))
    teachers = [dict(row) for row in cur.fetchall()]
    # Remove senhas
    for t in teachers:
        if 'password' in t: del t['password']
    
    return jsonify(teachers)

@school_bp.route('/api/school/classes', methods=['GET'])
@token_required
def get_classes():
    school_id = get_accessible_school_id()
    db = get_school_db(school_id)
    cur = db.cursor()
    cur.execute('SELECT * FROM classes')
    return jsonify([dict(row) for row in cur.fetchall()])

@school_bp.route('/api/school/classes', methods=['POST'])
@token_required
def create_class():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        db.execute('INSERT INTO classes (name) VALUES (?)', 
                   (data.get('name'),))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Erro ao criar turma: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@school_bp.route('/api/school/classes/<int:class_id>', methods=['DELETE'])
@token_required
def delete_class(class_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        cur = db.cursor()

        # Verificar se turma existe e pegar o nome
        row = cur.execute('SELECT name FROM classes WHERE id = ?', (class_id,)).fetchone()
        if not row:
            db.close()
            return jsonify({'error': 'Turma não encontrada'}), 404
        
        class_name = row['name']

        # Verificar se há alunos na turma
        student_count = cur.execute('SELECT COUNT(*) as count FROM students WHERE class_name = ?', (class_name,)).fetchone()['count']
        
        if student_count > 0:
            db.close()
            return jsonify({'error': f'Não é possível excluir: existem {student_count} alunos nesta turma.'}), 400

        # Excluir
        cur.execute('DELETE FROM classes WHERE id = ?', (class_id,))
        db.commit()
        db.close()

        return jsonify({'success': True})
    except Exception as e:
        print(f"Error deleting class: {e}")
        return jsonify({'error': str(e)}), 500

@school_bp.route('/api/school/class/<int:class_id>/students', methods=['GET'])
@token_required
def get_class_students(class_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    cur = db.cursor()
    
    # Primeiro pegar o nome da turma
    class_row = cur.execute('SELECT name FROM classes WHERE id = ?', (class_id,)).fetchone()
    if not class_row:
        return jsonify([])
    
    class_name = class_row['name']
    
    # Buscar alunos por class_name
    cur.execute('SELECT * FROM students WHERE class_name = ?', (class_name,))
    students = [dict(row) for row in cur.fetchall()]
    
    return jsonify(students)

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

@school_bp.route('/api/school/settings', methods=['GET'])
@token_required
def get_school_settings():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_system_db()
    school = db.execute('SELECT id, name, email, cnpj, latitude, longitude, address, number, zip_code FROM schools WHERE id = ?', (school_id,)).fetchone()
    return jsonify(dict(school) if school else {})

@school_bp.route('/api/school/settings', methods=['POST'])
@token_required
def update_school_settings():
    try:
        data = request.json
        print(f"DEBUG: update_school_settings payload: {data}")
        
        school_id = g.user.get('school_id') or g.user.get('id')
        db = get_system_db()

        lat = data.get('latitude')
        lng = data.get('longitude')
        address = data.get('address', '')
        number = data.get('number', '')
        zip_code = data.get('zip_code', '')

        # Fallback: Se não tem Lat/Lng, tenta calcular pelo Google no backend
        if (not lat or not lng) and address and number:
            try:
                import googlemaps
                import os
                # Usa a chave que definimos antes
                api_key = os.getenv('GOOGLE_MAPS_API_KEY', 'AIzaSyDLeiJNyO0Jghvq7Cx7bx8wbe6QNSDeeRI')
                gmaps = googlemaps.Client(key=api_key)
                
                full_address = f"{address}, {number} - {zip_code}, Brasil"
                print(f"DEBUG: Calculando coordenadas para: {full_address}")
                
                geocode_res = gmaps.geocode(full_address)
                if geocode_res:
                    loc = geocode_res[0]['geometry']['location']
                    lat = loc['lat']
                    lng = loc['lng']
                    print(f"DEBUG: Coordenadas encontradas: {lat}, {lng}")
            except Exception as e:
                print(f"ERROR: Falha no geocoding backend: {e}")

        name = data.get('name')
        cnpj = data.get('cnpj')
        email = data.get('email')
        
        # Build dynamic query based on provided fields
        update_fields = []
        params = []
        
        if name:
            update_fields.append("name = ?")
            params.append(name)
        if cnpj:
            update_fields.append("cnpj = ?")
            params.append(cnpj)
        if email:
            update_fields.append("email = ?")
            params.append(email)
            
        # Always update address fields
        update_fields.extend(["latitude = ?", "longitude = ?", "address = ?", "number = ?", "zip_code = ?"])
        params.extend([lat, lng, address, number, zip_code])
        
        # Add ID at the end
        params.append(school_id)
        
        query = f'''
            UPDATE schools 
            SET {", ".join(update_fields)}
            WHERE id = ?
        '''
        
        db.execute(query, params)
        
        db.commit()
        print("DEBUG: Dados salvos com sucesso no DB.")
        return jsonify({'success': True, 'latitude': lat, 'longitude': lng})
    except Exception as e:
        print(f"ERROR update_school_settings: {e}")
        return jsonify({'error': str(e)}), 500


# ===== ROTAS DE EVENTOS =====
@school_bp.route('/api/school/students/<int:student_id>/face', methods=['PUT'])
@token_required
def update_student_face(student_id):
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    
    descriptor = data.get('face_descriptor')
    if not descriptor:
        return jsonify({'error': 'Descritor facial ausente'}), 400

    try:
        db = get_school_db(school_id)
        
        # Atualiza tabela STUDENTS direto
        db.execute('UPDATE students SET face_descriptor = ? WHERE id = ?', (descriptor, student_id))
            
        db.commit()
        db.close()
        
        return jsonify({'success': True, 'message': 'Biometria atualizada'})
    except Exception as e:
        print(f"Erro ao salvar face: {e}")
        return jsonify({'error': 'Erro ao salvar biometria'}), 500


@school_bp.route('/api/school/events', methods=['GET'])
@token_required
def get_events():
    """Buscar todos os eventos da escola"""
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        events = db.execute('SELECT * FROM events ORDER BY event_date DESC').fetchall()
        db.close()
        return jsonify([dict(e) for e in events])
    except Exception as e:
        print(f"❌ Erro ao buscar eventos: {e}")
        return jsonify([])

@school_bp.route('/api/school/events', methods=['POST'])
@token_required
def create_event():
    """Criar novo evento"""
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        db.execute('''
            INSERT INTO events (title, description, event_date, cost, class_name, pix_key, payment_deadline, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('title'),
            data.get('description'),
            data.get('event_date'),
            data.get('cost'),
            data.get('class_name'),
            data.get('pix_key'),
            data.get('payment_deadline'),
            data.get('type', 'event')
        ))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Erro ao criar evento: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@school_bp.route('/api/school/events/<int:event_id>', methods=['PUT'])
@token_required
def update_event(event_id):
    """Atualizar evento existente"""
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        db.execute('''
            UPDATE events SET title=?, description=?, event_date=?, cost=?, class_name=?, pix_key=?, payment_deadline=?, type=?
            WHERE id=?
        ''', (
            data.get('title'), 
            data.get('description'), 
            data.get('event_date') or data.get('date'),
            data.get('cost'),
            data.get('class_name'),
            data.get('pix_key'),
            data.get('payment_deadline'),
            data.get('type', 'event'),
            event_id
        ))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Erro ao atualizar evento: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@school_bp.route('/api/school/events/<int:event_id>', methods=['DELETE'])
@token_required
def delete_event(event_id):
    """Deletar evento"""
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        db.execute('DELETE FROM events WHERE id = ?', (event_id,))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Erro ao deletar evento: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@school_bp.route('/api/school/events/<int:event_id>/participants', methods=['GET'])
@token_required
def get_event_participants(event_id):
    """Buscar participantes de um evento"""
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        participants = db.execute('''
            SELECT ep.*, s.name as student_name, s.class_name
            FROM event_participations ep
            JOIN students s ON ep.student_id = s.id
            WHERE ep.event_id = ?
            ORDER BY ep.created_at DESC
        ''', (event_id,)).fetchall()
        db.close()
        return jsonify([dict(p) for p in participants])
    except Exception as e:
        print(f"❌ Erro ao buscar participantes: {e}")
        return jsonify([])

@school_bp.route('/api/school/events/participations/<int:participation_id>/confirm', methods=['POST'])
@token_required
def confirm_participation(participation_id):
    """Confirmar participação de um aluno"""
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    
    try:
        db = get_school_db(school_id)
        db.execute('UPDATE event_participations SET status = ? WHERE id = ?', 
                   (data.get('status'), participation_id))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Erro ao confirmar participação: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@school_bp.route('/api/school/inspectors', methods=['GET'])
@token_required
def get_inspectors():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_system_db()
    inspectors = db.execute('SELECT id, name, email FROM inspectors WHERE school_id = ?', (school_id,)).fetchall()
    return jsonify([dict(i) for i in inspectors])

@school_bp.route('/api/school/inspectors', methods=['POST'])
@token_required
def create_inspector():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_system_db()
    
    # Hash password
    import bcrypt
    password = data.get('password')
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        db.execute('''
            INSERT INTO inspectors (school_id, name, email, password)
            VALUES (?, ?, ?, ?)
        ''', (school_id, data.get('name'), data.get('email'), hashed))
        db.commit()
        return jsonify({'success': True})
    except:
        return jsonify({'message': 'Email já em uso'}), 400

@school_bp.route('/api/school/inspectors/<int:inspector_id>', methods=['DELETE'])
@token_required
def delete_inspector(inspector_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_system_db()
    try:
        # Verificar se pertence à escola
        insp = db.execute('SELECT id FROM inspectors WHERE id = ? AND school_id = ?', (inspector_id, school_id)).fetchone()
        if not insp:
            return jsonify({'message': 'Inspetor não encontrado'}), 404
            
        db.execute('DELETE FROM inspectors WHERE id = ?', (inspector_id,))
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'message': str(e)}), 500

@school_bp.route('/api/school/geocode', methods=['POST'])
@token_required
def geocode_address():
    """Converte endereço em latitude/longitude usando Nominatim (OpenStreetMap)"""
    data = request.json
    address = data.get('address')
    
    if not address:
        return jsonify({'error': 'Endereço obrigatório'}), 400
        
    try:
        # Usar requests para chamar API do Nominatim
        import requests
        headers = {'User-Agent': 'EduFocus/1.0'}
        response = requests.get(f'https://nominatim.openstreetmap.org/search?q={address}&format=json&limit=1', headers=headers)
        
        if response.status_code == 200:
            results = response.json()
            if results:
                return jsonify({
                    'lat': results[0]['lat'],
                    'lon': results[0]['lon'],
                    'display_name': results[0]['display_name']
                })
        return jsonify({'error': 'Endereço não encontrado'}), 404
    except Exception as e:
        print(f"Erro geocoding: {e}")
        return jsonify({'error': 'Erro ao buscar endereço'}), 500

@school_bp.route('/api/school/pickups', methods=['GET'])
@token_required
def get_pickups():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    cur = db.cursor()
    
    # Busca pedidos de retirada pendentes
    cur.execute('''
        SELECT p.id, p.student_id, s.name as student_name, s.photo_url, s.class_name, 
               p.guardian_id, p.status, p.timestamp
        FROM pickup_requests p
        JOIN students s ON p.student_id = s.id
        JOIN student_guardians sg ON s.id = sg.student_id AND p.guardian_id = sg.guardian_id
        ORDER BY p.timestamp DESC LIMIT 100
    ''')
    
    # Nota: g.name vem do system.db, então precisamos fazer um join manual ou subquery se possível
    # Mas como pickup_requests tem o guardian_id, podemos buscar os nomes no system.db depois
    pickups = [dict(row) for row in cur.fetchall()]
    
    sys_db = get_system_db()
    for p in pickups:
        guardian = sys_db.execute('SELECT name FROM guardians WHERE id = ?', (p['guardian_id'],)).fetchone()
        if guardian:
            p['guardian_name'] = guardian['name']
            
    return jsonify(pickups)

@school_bp.route('/api/school/pickups/<int:request_id>/status', methods=['POST'])
@token_required
def update_pickup_status(request_id):
    data = request.json
    status = data.get('status')
    school_id = g.user.get('school_id') or g.user.get('id')
    
    db = get_school_db(school_id)
    db.execute('UPDATE pickup_requests SET status = ? WHERE id = ?', (status, request_id))
    
    # Notificar responsável se status relevante
    if status in ['released', 'calling', 'approved', 'confirmed']:
        row = db.execute('SELECT student_id FROM pickup_requests WHERE id = ?', (request_id,)).fetchone()
        if row:
            db.execute('INSERT INTO access_logs (student_id, event_type, notified_guardian) VALUES (?, ?, 0)',
                       (row['student_id'], f'pickup_{status}'))

    db.commit()
    
    return jsonify({'success': True})

# ====== STUDENT CRUD ======
@school_bp.route('/api/school/students/<int:student_id>', methods=['PUT'])
@token_required
def update_student(student_id):
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    
    try:
        db.execute('''
            UPDATE students SET name=?, parent_email=?, phone=?, photo_url=?, class_name=?, age=?
            WHERE id=?
        ''', (data.get('name'), data.get('parent_email'), data.get('phone'), 
              data.get('photo_url'), data.get('class_name'), data.get('age'), student_id))
        
        # Atualizar descritor facial se fornecido
        if data.get('face_descriptor'):
            import json
            descriptor = data.get('face_descriptor')
            if isinstance(descriptor, list):
                descriptor = json.dumps(descriptor)
            db.execute('DELETE FROM face_descriptors WHERE student_id = ?', (student_id,))
            db.execute('INSERT INTO face_descriptors (student_id, descriptor) VALUES (?, ?)', (student_id, descriptor))
        
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@school_bp.route('/api/school/students/<int:student_id>', methods=['DELETE'])
@token_required
def delete_student(student_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    db.execute('DELETE FROM face_descriptors WHERE student_id = ?', (student_id,))
    db.execute('DELETE FROM student_guardians WHERE student_id = ?', (student_id,))
    db.execute('DELETE FROM students WHERE id = ?', (student_id,))
    db.commit()
    return jsonify({'success': True})

# ====== EMPLOYEES ======
@school_bp.route('/api/school/employees', methods=['GET'])
@token_required
def get_employees():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    employees = db.execute('SELECT * FROM employees').fetchall()
    return jsonify([dict(e) for e in employees])

@school_bp.route('/api/school/employees', methods=['POST'])
@token_required
def create_employee():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    
    # Gerar senha aleatória
    import random
    import string
    password_plain = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    hashed = bcrypt.hashpw(password_plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    email = data.get('email')
    
    guardian_id = None
    if email:
        sys_db = get_system_db()
        # Verificar se email já existe
        existing = sys_db.execute('SELECT id FROM guardians WHERE email = ?', (email,)).fetchone()
        
        if existing:
            guardian_id = existing['id']
            # Opcional: Atualizar role se necessário, ou manter.
            # Se for guardian também, ok. Ele terá multiplos papeis ou o sistema validará por contexto.
            # Aqui vamos forçar update da role se estiver nulo? Não, melhor adicionar.
            # Por simplicidade, assumimos que ele ganha acesso.
        else:
            sys_db.execute('''
                INSERT INTO guardians (name, email, password, phone, role)
                VALUES (?, ?, ?, ?, 'employee')
            ''', (data.get('name'), email, hashed, data.get('phone'),))
            guardian_id = sys_db.execute('SELECT last_insert_rowid()').fetchone()[0]
            sys_db.commit()
    
    db = get_school_db(school_id)
    db.execute('''
        INSERT INTO employees (name, role, photo_url, face_descriptor, email, phone, employee_id, work_start_time, work_end_time, guardian_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('name'), 
        data.get('role'), 
        data.get('photo_url'), 
        data.get('face_descriptor'),
        data.get('email'),
        data.get('phone'),
        data.get('employee_id'),
        data.get('work_start_time'),
        data.get('work_end_time'),
        guardian_id
    ))
    db.commit()
    
    # Retornar senha para exibir ao admin
    return jsonify({
        'success': True, 
        'generated_password': password_plain if not existing else None,
        'message': 'Funcionário cadastrado. Senha gerada.' if not existing else 'Funcionário cadastrado. Associado a conta existente.'
    })

@school_bp.route('/api/school/employees/<int:emp_id>', methods=['PUT'])
@token_required
def update_employee(emp_id):
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    
    # Atualizar dados locais
    db.execute('''
        UPDATE employees SET name=?, role=?, photo_url=?, face_descriptor=?, 
                             email=?, phone=?, employee_id=?, work_start_time=?, work_end_time=?
        WHERE id=?
    ''', (
        data.get('name'), 
        data.get('role'), 
        data.get('photo_url'), 
        data.get('face_descriptor'),
        data.get('email'),
        data.get('phone'),
        data.get('employee_id'),
        data.get('work_start_time'),
        data.get('work_end_time'),
        emp_id
    ))
    db.commit()
    
    # Tentar atualizar/criar login no sistema
    emp = db.execute('SELECT guardian_id FROM employees WHERE id = ?', (emp_id,)).fetchone()
    guardian_id = emp['guardian_id']
    email = data.get('email')
    new_password = None
    
    reset_password = data.get('reset_password')
    
    if email:
        try:
            sys_db = get_system_db()
            import random
            import string
            
            if guardian_id:
                sys_db.execute('UPDATE guardians SET email=?, phone=?, name=? WHERE id=?', 
                              (email, data.get('phone'), data.get('name'), guardian_id))
                
                if reset_password:
                    new_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
                    hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                    sys_db.execute('UPDATE guardians SET password=? WHERE id=?', (hashed, guardian_id))
                
                sys_db.commit()
            else:
                # Criar login para func antigo (se não tinha)
                # Check email existence
                exist = sys_db.execute('SELECT id FROM guardians WHERE email=?', (email,)).fetchone()
                if exist:
                    guardian_id = exist['id']
                    # Se pediu reset, reseta do existente
                    if reset_password:
                        new_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
                        hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                        sys_db.execute('UPDATE guardians SET password=? WHERE id=?', (hashed, guardian_id))
                    
                    # GARANTIR que a role seja employee (caso fosse guardian simples antes)
                    sys_db.execute("UPDATE guardians SET role='employee' WHERE id=?", (guardian_id,))
                    sys_db.commit()
                else:
                    new_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
                    hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                    sys_db.execute('INSERT INTO guardians (name, email, password, phone, role) VALUES (?, ?, ?, ?, "employee")',
                                  (data.get('name'), email, hashed, data.get('phone')))
                    guardian_id = sys_db.execute('SELECT last_insert_rowid()').fetchone()[0]
                    sys_db.commit()
                
                # Vincular
                db.execute('UPDATE employees SET guardian_id=? WHERE id=?', (guardian_id, emp_id))
                db.commit()
        except Exception as e:
            print(f"Erro update login func: {e}")
            pass

    return jsonify({
        'success': True,
        'message': 'Funcionário atualizado.' + (f' Senha de acesso gerada: {new_password}' if new_password else '')
    })

@school_bp.route('/api/school/employees/<int:emp_id>', methods=['DELETE'])
@token_required
def delete_employee(emp_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    db.execute('DELETE FROM employees WHERE id = ?', (emp_id,))
    db.commit()
    return jsonify({'success': True})

# ====== CAMERAS ======
@school_bp.route('/api/school/cameras', methods=['GET'])
@token_required
def get_cameras():
    school_id = g.user.get('school_id') or g.user.get('id')
    sys_db = get_system_db()
    cameras = sys_db.execute('SELECT * FROM cameras WHERE school_id = ?', (school_id,)).fetchall()
    return jsonify([dict(c) for c in cameras])

@school_bp.route('/api/school/cameras/<int:camera_id>/request-removal', methods=['POST'])
@token_required
def request_camera_removal(camera_id):
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    sys_db = get_system_db()
    sys_db.execute('''
        INSERT INTO removal_requests (camera_id, requester_type, requester_id, reason)
        VALUES (?, 'school', ?, ?)
    ''', (camera_id, school_id, data.get('reason', '')))
    sys_db.commit()
    return jsonify({'success': True})

# ====== EVENTS ======


# ====== CHAT ======
@school_bp.route('/api/school/chat/<int:student_id>/messages', methods=['GET'])
@token_required
def get_chat_messages(student_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    
    # Busca mensagens da nova tabela chat_messages
    messages = db.execute('''
        SELECT * FROM chat_messages WHERE student_id = ? ORDER BY timestamp ASC
    ''', (student_id,)).fetchall()
    
    return jsonify([dict(m) for m in messages])

@school_bp.route('/api/school/chat/<int:student_id>/messages', methods=['POST'])
@token_required
def send_chat_message(student_id):
    school_id = g.user.get('school_id') or g.user.get('id')
    
    # Check text or file - suporte a form data e json
    if request.is_json:
        data = request.json
        text = data.get('content') or data.get('text')
        msg_type = data.get('type', 'text')
        file = None
    else:
        text = request.form.get('content')
        msg_type = request.form.get('type', 'text')
        file = request.files.get('file')
    
    db = get_school_db(school_id)
    try:
        file_url = None
        file_name = None
        
        if file:
            import os
            import uuid
            ext = os.path.splitext(file.filename)[1]
            filename = f"chat_school_{uuid.uuid4()}{ext}"
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            uploads_dir = os.path.join(base_dir, 'static', 'uploads')
            if not os.path.exists(uploads_dir): os.makedirs(uploads_dir)
            
            save_path = os.path.join(uploads_dir, filename)
            file.save(save_path)
            file_url = f"/static/uploads/{filename}"
            file_name = file.filename

        db.execute('''
            INSERT INTO chat_messages (student_id, school_id, sender_type, sender_id, message_type, content, file_url, file_name, timestamp)
            VALUES (?, ?, 'school', ?, ?, ?, ?, ?, datetime('now'))
        ''', (student_id, school_id, school_id, msg_type, text, file_url, file_name))
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Erro chat POST school: {e}")
        return jsonify({'error': str(e)}), 500

@school_bp.route('/api/school/chat/broadcast', methods=['POST'])
@token_required
def broadcast_message():
    school_id = g.user.get('school_id') or g.user.get('id')
    
    # Handle both JSON and FormData
    if request.is_json:
        data = request.json
        text = data.get('text') or data.get('content')
        class_id = data.get('classId')
        file = None
    else:
        text = request.form.get('text') or request.form.get('content')
        class_id = request.form.get('classId')
        file = request.files.get('file')

    msg_type = 'text'
    file_url = None
    file_name = None

    if file:
        import os, uuid
        try:
            ext = os.path.splitext(file.filename)[1]
            filename = f"broadcast_{uuid.uuid4()}{ext}"
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            uploads_dir = os.path.join(base_dir, 'static', 'uploads')
            if not os.path.exists(uploads_dir): os.makedirs(uploads_dir)
            save_path = os.path.join(uploads_dir, filename)
            file.save(save_path)
            file_url = f"/static/uploads/{filename}"
            file_name = file.filename
            msg_type = 'file'
        except Exception as e:
            print(f"Error saving file in broadcast: {e}")

    db = get_school_db(school_id)
    
    students_to_send = []
    if class_id:
        try:
            c = db.execute("SELECT name FROM classes WHERE id = ?", (class_id,)).fetchone()
            if c:
                students_to_send = db.execute("SELECT id FROM students WHERE class_name = ?", (c['name'],)).fetchall()
        except:
            pass
    else:
        students_to_send = db.execute("SELECT id FROM students").fetchall()

    count = 0
    for s in students_to_send:
        try:
            db.execute('''
                INSERT INTO chat_messages (student_id, school_id, sender_type, sender_id, message_type, content, file_url, file_name, timestamp)
                VALUES (?, ?, 'school', ?, ?, ?, ?, ?, datetime('now'))
            ''', (s['id'], school_id, school_id, msg_type, text or '', file_url, file_name))
            count += 1
        except Exception as e:
            print(f"Error sending broadcast to student {s['id']}: {e}")

    db.commit()
    return jsonify({'success': True, 'count': count})

# ====== SUPPORT ======
@school_bp.route('/api/school/support', methods=['POST'])
@token_required
def send_support_message():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    sys_db = get_system_db()
    sys_db.execute('''
        INSERT INTO support_messages (school_id, message, timestamp)
        VALUES (?, ?, datetime('now'))
    ''', (school_id, data.get('message')))
    sys_db.commit()
    return jsonify({'success': True})

# ====== MESSAGES ======
@school_bp.route('/api/messages/send', methods=['POST'])
@token_required
def send_message_generic():
    data = request.json
    # Frontend sends: from_user_type, from_user_id, to_user_type, to_user_id, message
    
    from_type = data.get('from_user_type')
    to_type = data.get('to_user_type')
    msg = data.get('message')
    
    # 1. School -> Teacher
    if from_type == 'school_admin' and to_type == 'teacher':
        school_id = data.get('from_user_id')
        teacher_id = data.get('to_user_id')
        
        # Security:
        current_school = g.user.get('school_id') or g.user.get('id')
        role = g.user.get('role')
        
        if role != 'super_admin' and str(current_school) != str(school_id):
             return jsonify({'error': 'Unauthorized'}), 403
             
        db = get_school_db(school_id)
        db.execute('''
            INSERT INTO teacher_messages (school_id, teacher_id, sender_type, message)
            VALUES (?, ?, 'school', ?)
        ''', (school_id, teacher_id, msg))
        db.commit()
        return jsonify({'success': True})
        
    # 2. Teacher -> School
    if from_type == 'teacher' and to_type == 'school_admin':
        teacher_id = data.get('from_user_id')
        school_id = data.get('to_user_id')
        
        # Security:
        current_teacher = g.user.get('id')
        current_school = g.user.get('school_id')
        
        # Se for teacher, o ID deve bater e a escola também
        # (Assumindo que o token do teacher tem school_id)
        if str(current_teacher) != str(teacher_id):
             return jsonify({'error': 'Unauthorized: Teacher ID mismatch'}), 403
             
        # Se school_id não bater com o do token?
        if current_school and str(current_school) != str(school_id):
             return jsonify({'error': 'Unauthorized: School ID mismatch'}), 403
             
        db = get_school_db(school_id)
        db.execute('''
            INSERT INTO teacher_messages (school_id, teacher_id, sender_type, message)
            VALUES (?, ?, 'teacher', ?)
        ''', (school_id, teacher_id, msg))
        db.commit()
        return jsonify({'success': True})

    return jsonify({'error': 'Message type not supported'}), 400

@school_bp.route('/api/messages/school-teacher-chat', methods=['GET'])
@token_required
def get_school_teacher_chat():
    teacher_id = request.args.get('teacher_id')
    school_id = g.user.get('school_id') or g.user.get('id')
    
    if not teacher_id:
        return jsonify([])
        
    db = get_school_db(school_id)
    rows = db.execute('''
        SELECT * FROM teacher_messages 
        WHERE teacher_id = ?
        ORDER BY created_at ASC
    ''', (teacher_id,)).fetchall()
    return jsonify([dict(r) for r in rows])

# ====== TEACHER LINKING ======
@school_bp.route('/api/school/search-teacher', methods=['GET'])
@token_required
def search_teacher():
    email = request.args.get('email', '')
    sys_db = get_system_db()
    teacher = sys_db.execute('SELECT id, name, email, subject FROM teachers WHERE email = ?', (email,)).fetchone()
    if teacher:
        return jsonify(dict(teacher))
    return jsonify(None)

@school_bp.route('/api/school/link-teacher', methods=['POST'])
@token_required
def link_teacher():
    data = request.json
    school_id = g.user.get('school_id') or g.user.get('id')
    teacher_id = data.get('teacher_id')
    class_ids = data.get('class_ids', [])
    
    sys_db = get_system_db()
    sys_db.execute('UPDATE teachers SET school_id = ?, status = ? WHERE id = ?', (school_id, 'active', teacher_id))
    sys_db.commit()
    
    # Vincular turmas se fornecidas
    if class_ids:
        db = get_school_db(school_id)
        # Limpar vínculos anteriores
        db.execute('DELETE FROM teacher_classes WHERE teacher_id = ?', (teacher_id,))
        # Adicionar novos vínculos
        for class_id in class_ids:
            db.execute('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', (teacher_id, class_id))
        db.commit()
        db.close()
    
    return jsonify({'success': True})

@school_bp.route('/api/school/unlink-teacher', methods=['POST'])
@token_required
def unlink_teacher():
    data = request.json
    teacher_id = data.get('teacher_id')
    sys_db.execute('UPDATE teachers SET school_id = NULL, status = ? WHERE id = ?', ('inactive', teacher_id))
    sys_db.commit()
    return jsonify({'success': True})


@school_bp.route('/api/school/<int:school_id>/teacher/<int:teacher_id>/link-class', methods=['POST'])
@token_required
def link_teacher_to_class(school_id, teacher_id):
    # Validar se o usuário logado tem permissão para essa escola
    current_school_id = g.user.get('school_id') or g.user.get('id')
    
    # Se for superadmin pode passar, se não, verifica ID
    if g.user.get('role') != 'super_admin' and str(current_school_id) != str(school_id):
         return jsonify({'message': 'Acesso negado'}), 403

    data = request.json
    class_id = data.get('class_id')
    
    if not class_id:
        return jsonify({'message': 'Turma não informada'}), 400

    db = get_school_db(school_id)
    # Verificar se já existe vínculo
    existing = db.execute('SELECT id FROM teacher_classes WHERE teacher_id = ? AND class_id = ?', (teacher_id, class_id)).fetchone()
    if existing:
         return jsonify({'message': 'Professor já vinculado a esta turma'}), 400
         
    db.execute('INSERT INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', (teacher_id, class_id))
    db.commit()
    
    return jsonify({'success': True})

# ====== EMPLOYEE ATTENDANCE ======
@school_bp.route('/api/school/employee-attendance', methods=['POST'])
@token_required
def register_employee_attendance():
    data = request.json
    employee_id = data.get('employee_id')
    school_id = g.user.get('school_id') or g.user.get('id')
    
    if not employee_id: 
        return jsonify({'message': 'ID do funcionário obrigatório'}), 400
        
    db = get_school_db(school_id)
    # Verificar se funcionário existe
    emp = db.execute('SELECT name, role FROM employees WHERE id = ?', (employee_id,)).fetchone()
    if not emp:
         return jsonify({'message': 'Funcionário não encontrado'}), 404
         
    import datetime
    timestamp = datetime.datetime.now().isoformat()
    db.execute('INSERT INTO employee_attendance (employee_id, timestamp) VALUES (?, ?)', (employee_id, timestamp))
    db.commit()
    return jsonify({'success': True, 'timestamp': timestamp})

@school_bp.route('/api/school/employee-attendance', methods=['GET'])
@token_required
def get_employee_attendance():
    school_id = g.user.get('school_id') or g.user.get('id')
    db = get_school_db(school_id)
    
    date_filter = request.args.get('date')
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    
    query = '''
        SELECT ea.*, e.name as employee_name, e.role as employee_role, e.employee_id as matricula
        FROM employee_attendance ea
        JOIN employees e ON ea.employee_id = e.id
        WHERE 1=1
    '''
    params = []
    
    if date_filter:
        query += " AND date(ea.timestamp) = ?"
        params.append(date_filter)
    
    if start_date and end_date:
        query += " AND date(ea.timestamp) BETWEEN ? AND ?"
        params.append(start_date)
        params.append(end_date)
        
    query += " ORDER BY ea.timestamp DESC"
    
    try:
        records = db.execute(query, params).fetchall()
        return jsonify([dict(r) for r in records])
    except Exception as e:
        print(f"Erro employee-attendance: {e}")
        return jsonify([])

# ==========================================
# ROTAS DE FREQUÊNCIA DE ALUNOS (PAINEL ESCOLA)
# ==========================================
@school_bp.route('/api/school/<int:school_id>/attendance', methods=['GET'])
@school_bp.route('/api/school/attendance', methods=['GET'])
@token_required
def get_school_attendance(school_id=None):
    if not school_id:
        school_id = g.user.get('school_id') or g.user.get('id')
    
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    
    try:
        db = get_school_db(school_id)
        
        # Se start e end são iguais (ex carregando hoje), usar LIKE para simplificar e evitar problemas de hora
        if start_date and end_date and start_date == end_date:
             query = '''
                SELECT a.id, a.student_id, a.timestamp, a.type, 
                       s.name as student_name, s.class_name, s.photo_url
                FROM attendance a
                JOIN students s ON a.student_id = s.id
                WHERE a.timestamp LIKE ?
                ORDER BY a.timestamp DESC
             '''
             # start_date geralmente é YYYY-MM-DD
             params = [f"{start_date}%"]
        else:
            query = '''
                SELECT a.id, a.student_id, a.timestamp, a.type, 
                       s.name as student_name, s.class_name, s.photo_url
                FROM attendance a
                JOIN students s ON a.student_id = s.id
                WHERE 1=1
            '''
            params = []
            
            if start_date:
                query += " AND a.timestamp >= ?"
                params.append(start_date)
            
            if end_date:
                if len(end_date) == 10:
                     end_date += 'T23:59:59'
                query += " AND a.timestamp <= ?"
                params.append(end_date + 'Z') # Z para garantir UTC se necessário
                
            query += " ORDER BY a.timestamp DESC"

        rows = db.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        print(f"Erro em get_school_attendance: {e}")
        return jsonify([])

# Fim do arquivo (Duplicatas removidas)

