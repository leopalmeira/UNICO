from flask import Blueprint, request, jsonify, g, Response
from .auth import token_required, SECRET_KEY
from database import get_system_db, get_school_db, SYSTEM_DB_PATH
import json
import time
import bcrypt
import datetime
import jwt
import sqlite3

guardian_bp = Blueprint('guardian', __name__)

@guardian_bp.route('/api/guardian/login', methods=['POST'])
@guardian_bp.route('/api/guardian/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    db = get_system_db()
    cur = db.cursor()
    
    # Debug: mostrar todos os guardians
    all_guardians = cur.execute('SELECT id, email FROM guardians').fetchall()
    print(f"🔍 Total de guardians no banco: {len(all_guardians)}")
    for g in all_guardians:
        print(f"   - ID {g['id']}: {g['email']}")
    
    cur.execute('SELECT * FROM guardians WHERE email = ?', (email,))
    guardian = cur.fetchone()
    
    if not guardian:
        print(f"❌ Guardian não encontrado: {email}")
        return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401
    
    print(f"✅ Guardian encontrado: {guardian['email']}")
    print(f"🔑 Hash armazenado: {guardian['password'][:50]}...")
    
    valid = False
    try:
        if guardian['password'].startswith('$2'):
            print(f"🔐 Verificando com bcrypt...")
            if bcrypt.checkpw(password.encode('utf-8'), guardian['password'].encode('utf-8')):
                valid = True
                print(f"✅ Senha bcrypt válida!")
            else:
                print(f"❌ Senha bcrypt inválida!")
        else:
            print(f"🔐 Verificando senha plain text...")
            if password == guardian['password']:
                valid = True
                print(f"✅ Senha plain válida!")
            else:
                print(f"❌ Senha plain inválida!")
    except Exception as e:
        print(f"❌ Erro na verificação: {e}")
        valid = False
        
    if not valid:
        print(f"❌ Autenticação falhou para {email}")
        return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401
        
    token = jwt.encode({
        'id': guardian['id'],
        'email': guardian['email'],
        'role': guardian.get('role', 'guardian'),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30)
    }, SECRET_KEY, algorithm='HS256')
    
    return jsonify({
        'success': True,
        'data': {
            'guardian': {
                'id': guardian['id'],
                'email': guardian['email'],
                'name': guardian['name'],
                'phone': guardian['phone']
            },
            'token': token
        }
    })

@guardian_bp.route('/api/guardian/register', methods=['POST'])
@guardian_bp.route('/api/guardian/auth/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    name = data.get('name')
    phone = data.get('phone', '')
    
    if not email or not password or not name:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
        
    db = get_system_db()
    cur = db.cursor()
    
    # Verificar se já existe
    cur.execute('SELECT 1 FROM guardians WHERE email = ?', (email,))
    if cur.fetchone():
        return jsonify({'success': False, 'message': 'Email já cadastrado'}), 409
        
    # Hash password
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        cur.execute('''
            INSERT INTO guardians (email, password, name, phone)
            VALUES (?, ?, ?, ?)
        ''', (email, hashed_password, name, phone))
        db.commit()
        
        # Obter o ID inserido
        guardian_id = cur.lastrowid
        
        token = jwt.encode({
            'id': guardian_id,
            'email': email,
            'role': 'guardian',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30)
        }, SECRET_KEY, algorithm='HS256')
        
        return jsonify({
            'success': True,
            'data': {
                'guardian': {'id': guardian_id, 'email': email, 'name': name},
                'token': token
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao cadastrar: {str(e)}'}), 500

@guardian_bp.route('/api/guardian/students', methods=['GET'])
@token_required
def get_students():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    
    schools_cur = sys_db.cursor()
    # Adicionado latitude e longitude
    schools_cur.execute('SELECT id, name, latitude, longitude FROM schools')
    schools = schools_cur.fetchall()
    
    all_students = []
    
    for school in schools:
        school_db = None
        try:
            school_db = get_school_db(school['id'])
            cur = school_db.cursor()
            
            cur.execute('''
                SELECT s.id, s.name, s.photo_url, s.class_name, sg.linked_at
                FROM students s
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
            ''', (guardian_id,))
            
            rows = cur.fetchall()
            for row in rows:
                student_data = dict(row)
                student_data['school_id'] = school['id']
                student_data['school_name'] = school['name']
                student_data['latitude'] = school['latitude']
                student_data['longitude'] = school['longitude']
                all_students.append(student_data)
                
        except Exception as e:
            continue
        finally:
            if school_db: school_db.close()
            
    return jsonify({'success': True, 'data': {'students': all_students}})

@guardian_bp.route('/api/guardian/pickup', methods=['POST'])
@token_required
def request_pickup():
    guardian_id = g.user.get('id')
    data = request.json
    student_id = data.get('student_id')
    school_id = data.get('school_id')
    
    if not student_id or not school_id:
        return jsonify({'success': False, 'message': 'IDs ausentes'}), 400
        
    school_db = None
    try:
        school_db = get_school_db(school_id)
        cur = school_db.cursor()
        
        # Verificar se o guardian tem permissão para este aluno
        cur.execute('SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?', (student_id, guardian_id))
        if not cur.fetchone():
            return jsonify({'success': False, 'message': 'Sem permissão para este aluno'}), 403
            
        # Registrar o pedido de retirada
        cur.execute('''
            INSERT INTO pickup_requests (student_id, guardian_id, status)
            VALUES (?, ?, 'waiting')
        ''', (student_id, guardian_id))
        school_db.commit()
        
        return jsonify({'success': True, 'message': 'Pedido de retirada enviado!'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro: {str(e)}'}), 500
    finally:
        if school_db: school_db.close()

@guardian_bp.route('/api/guardian/check-notifications', methods=['GET'])
@token_required
def check_notifications():
    """Endpoint de polling para verificar novas notificações"""
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    
    schools_cur = sys_db.cursor()
    schools_cur.execute('SELECT id, name FROM schools')
    schools = schools_cur.fetchall()
    
    notification = None
    
    for school in schools:
        school_db = None
        try:
            school_db = get_school_db(school['id'])
            cur = school_db.cursor()
            
            # Buscar apenas notificações não lidas
            cur.execute('''
                SELECT al.id, al.student_id, s.name as student_name, s.photo_url, al.event_type, al.timestamp
                FROM access_logs al
                JOIN students s ON al.student_id = s.id
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ? AND al.notified_guardian = 0
                ORDER BY al.timestamp DESC LIMIT 1
            ''', (guardian_id,))
            
            row = cur.fetchone()
            if row:
                notification = dict(row)
                notification['school_id'] = school['id']
                notification['school_name'] = school['name']
                
                # Marcar como notificado
                cur.execute('UPDATE access_logs SET notified_guardian = 1 WHERE id = ?', (notification['id'],))
                school_db.commit()
                break  # Retorna apenas uma notificação por vez
                
        except Exception as e:
            continue
        finally:
            if school_db: school_db.close()
    
    return jsonify({'notification': notification})

@guardian_bp.route('/api/guardian/notifications', methods=['GET'])
@token_required
def get_notifications():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    
    schools_cur = sys_db.cursor()
    schools_cur.execute('SELECT id, name FROM schools')
    schools = schools_cur.fetchall()
    
    all_notifs = []
    
    for school in schools:
        school_db = None
        try:
            school_db = get_school_db(school['id'])
            cur = school_db.cursor()
            
            # Mostra histórico (sem filtro de notified_guardian)
            cur.execute('''
                SELECT al.id, al.student_id, s.name as student_name, al.event_type, al.timestamp
                FROM access_logs al
                JOIN students s ON al.student_id = s.id
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
                ORDER BY al.timestamp DESC LIMIT 20
            ''', (guardian_id,))
            
            rows = cur.fetchall()
            for row in rows:
                n = dict(row)
                n['school_id'] = school['id']
                n['school_name'] = school['name']
                n['read'] = False 
                all_notifs.append(n)
        except:
            continue
        finally:
            if school_db: school_db.close()
            
    return jsonify({'success': True, 'data': {'notifications': all_notifs}})

@guardian_bp.route('/api/guardian/events')
def events():
    token = request.args.get('token')
    if not token and 'Authorization' in request.headers:
        token = request.headers['Authorization'].split(' ')[1]
        
    if not token:
        return jsonify({'message': 'Token missing'}), 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        guardian_id = data['id']
    except:
        return jsonify({'message': 'Invalid token'}), 403

    def generate():
        yield f"data: {json.dumps({'type': 'connected'})}\n\n"
        
        while True:
            try:
                # Conexão manual para threads/generators
                sys_db = sqlite3.connect(SYSTEM_DB_PATH)
                sys_db.row_factory = sqlite3.Row
                schools = sys_db.execute('SELECT id, name FROM schools').fetchall()
                sys_db.close()
                
                for school in schools:
                    school_db = None
                    try:
                        school_db = get_school_db(school['id'])
                        
                        # Apenas não notificados para SSE
                        rows = school_db.execute('''
                            SELECT al.id, al.student_id, s.name as student_name, al.event_type, al.timestamp
                            FROM access_logs al
                            JOIN students s ON al.student_id = s.id
                            JOIN student_guardians sg ON s.id = sg.student_id
                            WHERE sg.guardian_id = ? AND al.notified_guardian = 0
                        ''', (guardian_id,)).fetchall()
                        
                        if rows:
                            # Marcar como notificado
                            ids = [str(dict(r)['id']) for r in rows]
                            if ids:
                                school_db.execute(f"UPDATE access_logs SET notified_guardian = 1 WHERE id IN ({','.join(ids)})")
                                school_db.commit()

                        for row in rows:
                            n = dict(row)
                            n['school_name'] = school['name']
                            yield f"data: {json.dumps({'type': 'notification', 'data': n})}\n\n"
                            
                    except Exception as e:
                        pass
                    finally:
                        if school_db:
                            try:
                                school_db.close()
                            except:
                                pass
                                
            except Exception as e:
                pass
            
            time.sleep(3)
            
    return Response(generate(), mimetype='text/event-stream')

@guardian_bp.route('/api/guardian/events-stream')
def events_stream():
    """
    Server-Sent Events (SSE) para eventos escolares em tempo real.
    Substitui o polling por uma conexão persistente.
    """
    token = request.args.get('token')
    if not token and 'Authorization' in request.headers:
        token = request.headers['Authorization'].split(' ')[1]
        
    if not token:
        return jsonify({'message': 'Token missing'}), 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        guardian_id = data['id']
    except:
        return jsonify({'message': 'Invalid token'}), 403

    def generate():
        # Enviar confirmação de conexão
        yield f"data: {json.dumps({'type': 'connected'})}\n\n"
        
        last_event_count = 0
        
        while True:
            try:
                # Buscar eventos atualizados
                sys_db = sqlite3.connect(SYSTEM_DB_PATH)
                sys_db.row_factory = sqlite3.Row
                schools = sys_db.execute('SELECT id FROM schools').fetchall()
                
                all_schools = set()
                all_students = []
                
                # Buscar alunos vinculados
                for school_row in schools:
                    school_id = school_row['id']
                    try:
                        school_db = get_school_db(school_id)
                        students = school_db.execute('''
                            SELECT s.id, s.name, s.class_name 
                            FROM students s
                            JOIN student_guardians sg ON s.id = sg.student_id
                            WHERE sg.guardian_id = ?
                        ''', (guardian_id,)).fetchall()
                        
                        if students:
                            all_schools.add(school_id)
                            for s in students:
                                all_students.append({
                                    'id': s['id'],
                                    'class_name': s['class_name'],
                                    'school_id': school_id
                                })
                        school_db.close()
                    except:
                        continue
                
                # Check Notifications
                for school_id in all_schools:
                    try:
                        school_db = get_school_db(school_id)
                        notifs = school_db.execute('''
                            SELECT al.id, al.student_id, s.name as student_name, al.event_type 
                            FROM access_logs al
                            JOIN students s ON al.student_id = s.id
                            JOIN student_guardians sg ON s.id = sg.student_id
                            WHERE sg.guardian_id = ? AND al.notified_guardian = 0
                        ''', (guardian_id,)).fetchall()
                        if notifs:
                            ids_to_update = [str(n['id']) for n in notifs]
                            school_db.execute(f"UPDATE access_logs SET notified_guardian = 1 WHERE id IN ({','.join(ids_to_update)})")
                            school_db.commit()
                            for n in notifs:
                                yield f"data: {json.dumps({'type': 'notification', 'data': dict(n)})}\n\n"
                        school_db.close()
                    except: pass

                # Buscar eventos
                all_events = []
                for school_id in all_schools:
                    try:
                        school_db = get_school_db(school_id)
                        school_info = sys_db.execute('SELECT name FROM schools WHERE id = ?', (school_id,)).fetchone()
                        school_name = school_info['name'] if school_info else f'Escola {school_id}'
                        
                        events = school_db.execute('SELECT * FROM events ORDER BY event_date ASC').fetchall()
                        
                        for event in events:
                            event_dict = dict(event)
                            event_dict['school_id'] = school_id
                            event_dict['school_name'] = school_name
                            
                            # Filtrar eventos relevantes
                            is_relevant = False
                            if not event_dict.get('class_name'):
                                is_relevant = True
                            else:
                                for student in all_students:
                                    if student['school_id'] == school_id and student['class_name'] == event_dict.get('class_name'):
                                        is_relevant = True
                                        break
                            
                            if is_relevant:
                                all_events.append(event_dict)
                        
                        school_db.close()
                    except:
                        continue
                
                sys_db.close()
                
                # Enviar eventos se houver mudança
                current_count = len(all_events)
                if current_count != last_event_count:
                    all_events.sort(key=lambda x: x.get('event_date', '9999-12-31'))
                    yield f"data: {json.dumps({'type': 'events', 'data': all_events})}\n\n"
                    last_event_count = current_count
                
            except Exception as e:
                print(f"Erro no SSE de eventos: {e}")
            
            time.sleep(5)  # Verificar a cada 5 segundos
            
    return Response(generate(), mimetype='text/event-stream')

@guardian_bp.route('/api/guardian/schools', methods=['GET'])
def search_schools():
    # Endpoint público para busca de escolas (não requer autenticação)
    search = request.args.get('search', '')
    db = get_system_db()
    if search:
        schools = db.execute('SELECT id, name FROM schools WHERE name LIKE ?', (f'%{search}%',)).fetchall()
    else:
        schools = db.execute('SELECT id, name FROM schools').fetchall()
    return jsonify([dict(s) for s in schools])


@guardian_bp.route('/api/guardian/schools/<int:school_id>/classes', methods=['GET'])
def get_school_classes(school_id):
    # Endpoint público para listar turmas
    school_db = None
    try:
        school_db = get_school_db(school_id)
        classes = school_db.execute('SELECT id, name FROM classes ORDER BY name').fetchall()
        return jsonify([dict(c) for c in classes])
    except Exception as e:
        return jsonify([])
    finally:
        if school_db: school_db.close()

@guardian_bp.route('/api/guardian/schools/<int:school_id>/students/search', methods=['GET'])
def search_students(school_id):
    # Endpoint público para buscar alunos
    name = request.args.get('name', '')
    class_name = request.args.get('className', '')
    
    school_db = None
    try:
        school_db = get_school_db(school_id)
        query = 'SELECT id, name, photo_url, class_name FROM students WHERE 1=1'
        params = []
        
        if name:
            query += ' AND name LIKE ?'
            params.append(f'%{name}%')
        if class_name:
            query += ' AND class_name = ?'
            params.append(class_name)
            
        students = school_db.execute(query, params).fetchall()
        return jsonify([dict(s) for s in students])
    except Exception as e:
        return jsonify([])
    finally:
        if school_db: school_db.close()

@guardian_bp.route('/api/guardian/student-attendance', methods=['GET'])
@token_required
def get_student_attendance():
    school_id = request.args.get('schoolId')
    student_id = request.args.get('studentId')
    month_arg = request.args.get('month')
    year_arg = request.args.get('year')
    
    # Se não informar mês/ano, usa o mês atual
    if not month_arg or not year_arg:
        from datetime import datetime
        now = datetime.now()
        month = now.month
        year = now.year
    else:
        month = int(month_arg)
        year = int(year_arg)
    
    if not (school_id and student_id):
        return jsonify([])
        
    try:
        m_str = f"{month:02d}"
        y_str = str(year)
        
        school_db = None
        try:
            school_db = get_school_db(school_id)
            
            # Buscar de access_logs (que tem event_type: arrival, departure)
            like_pattern = f"{y_str}-{m_str}-%"
            
            rows = school_db.execute('''
                SELECT timestamp, event_type as type FROM access_logs 
                WHERE student_id = ? AND timestamp LIKE ?
            ''', (student_id, like_pattern)).fetchall()
            
            return jsonify([dict(r) for r in rows])
        finally:
            if school_db: school_db.close()
            
    except Exception as e:
        print(f"Erro attendance: {e}")
        return jsonify([])

@guardian_bp.route('/api/guardian/school-events', methods=['GET'])
@token_required
def get_school_events():
    """
    Retorna todos os eventos das escolas onde o responsável tem filhos matriculados.
    Filtra eventos por turma do aluno ou eventos gerais.
    """
    guardian_id = g.user.get('id')
    
    try:
        # Buscar todas as escolas onde o responsável tem filhos
        sys_db = get_system_db()
        
        # Buscar todos os alunos vinculados ao responsável
        all_schools = set()
        all_students = []
        
        # Procurar em todas as escolas (brute force, mas funcional)
        schools = sys_db.execute('SELECT id FROM schools').fetchall()
        
        for school_row in schools:
            school_id = school_row['id']
            try:
                school_db = get_school_db(school_id)
                students = school_db.execute('''
                    SELECT s.id, s.name, s.class_name 
                    FROM students s
                    JOIN student_guardians sg ON s.id = sg.student_id
                    WHERE sg.guardian_id = ?
                ''', (guardian_id,)).fetchall()
                
                if students:
                    all_schools.add(school_id)
                    for s in students:
                        all_students.append({
                            'id': s['id'],
                            'name': s['name'],
                            'class_name': s['class_name'],
                            'school_id': school_id
                        })
                school_db.close()
            except Exception as e:
                print(f"Erro ao verificar escola {school_id}: {e}")
                continue
        
        if not all_schools:
            return jsonify({'success': True, 'events': []})
        
        # Buscar eventos de todas as escolas
        all_events = []
        
        for school_id in all_schools:
            try:
                school_db = get_school_db(school_id)
                
                # Buscar nome da escola
                school_info = sys_db.execute('SELECT name FROM schools WHERE id = ?', (school_id,)).fetchone()
                school_name = school_info['name'] if school_info else f'Escola {school_id}'
                
                # Buscar todos os eventos
                events = school_db.execute('''
                    SELECT * FROM events 
                    ORDER BY event_date ASC
                ''').fetchall()
                
                # Filtrar eventos relevantes para os alunos deste responsável
                for event in events:
                    event_dict = dict(event)
                    event_dict['school_id'] = school_id
                    event_dict['school_name'] = school_name
                    
                    # Verificar se o evento é relevante
                    is_relevant = False
                    
                    # Eventos sem turma específica são para todos
                    if not event_dict.get('class_name'):
                        is_relevant = True
                    else:
                        # Verificar se algum aluno está na turma do evento
                        for student in all_students:
                            if student['school_id'] == school_id and student['class_name'] == event_dict.get('class_name'):
                                is_relevant = True
                                break
                    
                    if is_relevant:
                        all_events.append(event_dict)
                
                school_db.close()
            except Exception as e:
                print(f"Erro ao buscar eventos da escola {school_id}: {e}")
                continue
        
        # Ordenar eventos por data
        all_events.sort(key=lambda x: x.get('event_date', '9999-12-31'))
        
        print(f"✅ Retornando {len(all_events)} eventos para responsável {guardian_id}")
        return jsonify({'success': True, 'events': all_events})
        
    except Exception as e:
        print(f"❌ Erro em get_school_events: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'events': [], 'error': str(e)})

@guardian_bp.route('/api/guardian/link-student', methods=['POST'])
@token_required
def link_student():
    data = request.json
    school_id = data.get('school_id')
    student_id = data.get('student_id')
    guardian_id = g.user.get('id')
    
    if not school_id or not student_id:
        return jsonify({'message': 'Dados incompletos'}), 400
        
    school_db = None
    try:
        school_db = get_school_db(school_id)
        
        # Verificar se já existe vínculo
        existing = school_db.execute('SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?', 
                                    (student_id, guardian_id)).fetchone()
        if existing:
            return jsonify({'message': 'Já vinculado'}), 400
            
        school_db.execute('INSERT INTO student_guardians (student_id, guardian_id) VALUES (?, ?)', 
                          (student_id, guardian_id))
        school_db.commit()
        
        return jsonify({'success': True, 'message': 'Vinculado com sucesso'})
    except Exception as e:
        return jsonify({'message': f'Erro ao vincular: {str(e)}'}), 500
    finally:
        if school_db: school_db.close()


@guardian_bp.route('/api/guardian/school-events/<int:school_id>/<int:event_id>/confirm', methods=['POST'])
@token_required
def confirm_event_participation(school_id, event_id):
    guardian_id = g.user.get('id')
    school_db = None
    try:
        school_db = get_school_db(school_id)
        
        # Verificar existência do event
        event = school_db.execute('SELECT * FROM events WHERE id = ?', (event_id,)).fetchone()
        if not event:
            return jsonify({'message': 'Evento não encontrado'}), 404
            
        # Buscar alunos do responsável nesta escola
        my_students = school_db.execute('''
            SELECT s.id, s.class_name FROM students s
            JOIN student_guardians sg ON s.id = sg.student_id
            WHERE sg.guardian_id = ?
        ''', (guardian_id,)).fetchall()
        
        if not my_students:
             return jsonify({'message': 'Nenhum aluno vinculado nesta escola'}), 400
             
        students_to_confirm = []
        
        # Determinar alvo do evento e checar match com alunos
        keys = event.keys()
        target_type = event['target_type'] if 'target_type' in keys else 'all'
        target_id = event['target_id'] if 'target_id' in keys else None
        event_class_name = event['class_name'] if 'class_name' in keys else None
        
        target_class_name_resolved = None
        if event_class_name:
            target_class_name_resolved = event_class_name
        elif target_type == 'class' and target_id:
            try:
                cls = school_db.execute('SELECT name FROM classes WHERE id = ?', (target_id,)).fetchone()
                if cls: target_class_name_resolved = cls['name']
            except: pass
            
        for s in my_students:
            match = False
            if target_type == 'school' or target_type == 'all' or (target_type == 'class' and not target_class_name_resolved):
                match = True
            elif target_type == 'class' and target_class_name_resolved:
                if s['class_name'] == target_class_name_resolved:
                    match = True
            
            if match:
                students_to_confirm.append(s['id'])
                
        if not students_to_confirm and my_students:
             for s in my_students: students_to_confirm.append(s['id'])
             
        # Upload de Comprovante (Se houver)
        receipt_url = None
        if 'receipt' in request.files:
            file = request.files['receipt']
            if file and file.filename:
                import os
                from werkzeug.utils import secure_filename
                
                # Garantir diretório
                UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads', 'receipts')
                if not os.path.exists(UPLOAD_FOLDER):
                    os.makedirs(UPLOAD_FOLDER)
                    
                filename = secure_filename(f"{school_id}_{event_id}_{guardian_id}_{file.filename}")
                file_path = os.path.join(UPLOAD_FOLDER, filename)
                file.save(file_path)
                
                # URL para acesso frontend (ajustar conforme configuração de static files)
                # Assumindo uma rota generica /uploads ou servindo static
                receipt_url = f"/uploads/receipts/{filename}"
             
        # Persistir confirmação
        for sid in students_to_confirm:
            try:
                exists = school_db.execute('SELECT id FROM event_participations WHERE event_id = ? AND student_id = ?', (event_id, sid)).fetchone()
                if exists:
                    if receipt_url:
                        school_db.execute("UPDATE event_participations SET status = 'confirmed', receipt_url = ? WHERE id = ?", (receipt_url, exists['id']))
                    else:
                        school_db.execute("UPDATE event_participations SET status = 'confirmed' WHERE id = ?", (exists['id'],))
                else:
                    school_db.execute("INSERT INTO event_participations (event_id, student_id, status, receipt_url) VALUES (?, ?, 'confirmed', ?)", (event_id, sid, receipt_url))
            except Exception as ex:
                print(f"Erro ao inserir participacao: {ex}")
                pass
                
        school_db.commit()
        return jsonify({'success': True, 'count': len(students_to_confirm)})
        
    except Exception as e:
        print(f"Erro confirmacao rota: {e}")
        return jsonify({'message': str(e)}), 500
    finally:
        if school_db: school_db.close()

# ====== CHAT SYSTEM (Guardian Side) ======

@guardian_bp.route('/api/guardian/chat/<int:student_id>/messages', methods=['GET'])
@token_required
def get_chat_messages(student_id):
    school_id = request.args.get('schoolId')
    guardian_id = g.user.get('id')
    
    if not school_id:
        return jsonify({'message': 'School ID required'}), 400
        
    school_db = None
    try:
        school_db = get_school_db(school_id)
        
        # Verificar se tem permissão (é pai desse aluno)
        perm = school_db.execute('SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_id = ?', 
                                (student_id, guardian_id)).fetchone()
        if not perm:
            return jsonify({'message': 'Unauthorized'}), 403
            
        cur = school_db.execute('''
            SELECT * FROM chat_messages 
            WHERE student_id = ? AND school_id = ?
            ORDER BY timestamp ASC
        ''', (student_id, school_id))
        
        msgs = [dict(m) for m in cur.fetchall()]
        


        return jsonify(msgs)
    except Exception as e:
        print(f"Erro chat GET: {e}")
        return jsonify([])
    finally:
        if school_db: school_db.close()

@guardian_bp.route('/api/guardian/chat/<int:student_id>/messages', methods=['POST'])
@token_required
def send_chat_message(student_id):
    guardian_id = g.user.get('id')
    
    # Check text or file
    text = request.form.get('content')
    msg_type = request.form.get('type', 'text')
    school_id = request.form.get('schoolId')
    file = request.files.get('file')
    
    if not school_id:
        return jsonify({'message': 'School ID is required'}), 400
        
    school_db = None
    try:
        school_db = get_school_db(school_id)
        
        file_url = None
        file_name = None
        
        if file:
            # Salvar arquivo (implementação simplificada, salvar localmente)
            # Em produção usar S3 ou similar. Aqui salvamos em 'uploads/'
            import os
            import uuid
            
            ext = os.path.splitext(file.filename)[1]
            filename = f"chat_{uuid.uuid4()}{ext}"
            
            # Caminho absoluto para pasta de uploads do servidor
            # Assumindo estrutura: server_python/app.py -> server_python/static/uploads
            # Ajuste conforme estrutura real
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            uploads_dir = os.path.join(base_dir, 'static', 'uploads')
            
            if not os.path.exists(uploads_dir):
                os.makedirs(uploads_dir)
                
            save_path = os.path.join(uploads_dir, filename)
            file.save(save_path)
            
            # URL relativa para o frontend (assumindo que static é servido)
            # Flask serve static folder em /static by default
            file_url = f"/static/uploads/{filename}"
            file_name = file.filename

        school_db.execute('''
            INSERT INTO chat_messages (student_id, school_id, sender_type, sender_id, message_type, content, file_url, file_name, timestamp)
            VALUES (?, ?, 'guardian', ?, ?, ?, ?, ?, datetime('now'))
        ''', (student_id, school_id, guardian_id, msg_type, text, file_url, file_name))
        school_db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Erro chat POST: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if school_db: school_db.close()

@guardian_bp.route('/api/guardian/invoices', methods=['GET'])
@token_required
def get_invoices():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    schools = sys_db.execute('SELECT id, name FROM schools').fetchall()
    
    all_invoices = []
    
    for school in schools:
        school_db = None
        try:
            school_db = get_school_db(school['id'])
            # Verificar se tabela existe
            try:
                school_db.execute('SELECT 1 FROM invoices LIMIT 1')
            except:
                continue # Tabela não existe nesta escola
                
            # Join to get student info and verify guardian
            query = '''
                SELECT i.*, s.name as student_name, s.class_name
                FROM invoices i
                JOIN students s ON i.student_id = s.id
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
                ORDER BY i.due_date DESC
            '''
            rows = school_db.execute(query, (guardian_id,)).fetchall()
            for r in rows:
                inv = dict(r)
                inv['school_id'] = school['id']
                inv['school_name'] = school['name']
                all_invoices.append(inv)
        except Exception as e:
            print(f"Erro ao buscar faturas escola {school['id']}: {e}")
            continue
        finally:
             if school_db: school_db.close()
             
    return jsonify({'success': True, 'invoices': all_invoices})

@guardian_bp.route('/api/guardian/grades', methods=['GET'])
@token_required
def get_grades():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    schools = sys_db.execute('SELECT id, name FROM schools').fetchall()
    
    all_grades = []
    
    for school in schools:
        school_db = None
        try:
            school_db = get_school_db(school['id'])
            # Verificar se tabela existe
            try:
                school_db.execute('SELECT 1 FROM student_grades LIMIT 1')
            except:
                continue 
                
            query = '''
                SELECT g.*, s.name as student_name, s.class_name
                FROM student_grades g
                JOIN students s ON g.student_id = s.id
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
                ORDER BY g.created_at DESC
            '''
            
            rows = school_db.execute(query, (guardian_id,)).fetchall()
            for r in rows:
                item = dict(r)
                item['school_id'] = school['id']
                item['school_name'] = school['name']
                # Fetch teacher name from system db
                if item.get('teacher_id'):
                    t = sys_db.execute('SELECT name FROM teachers WHERE id = ?', (item['teacher_id'],)).fetchone()
                    item['teacher_name'] = t['name'] if t else 'Professor'
                else:
                    item['teacher_name'] = 'Professor'
                    
                all_grades.append(item)
        except Exception as e:
            # print(f"Erro ao buscar notas escola {school['id']}: {e}")
            continue
        finally:
             if school_db: school_db.close()
             
    return jsonify({'success': True, 'grades': all_grades})

@guardian_bp.route('/api/guardian/reports', methods=['GET'])
@token_required
def get_reports():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    schools = sys_db.execute('SELECT id, name FROM schools').fetchall()
    
    all_reports = []
    
    for school in schools:
        school_db = None
        try:
            school_db = get_school_db(school['id'])
            try:
                school_db.execute('SELECT 1 FROM student_reports LIMIT 1')
            except:
                continue 
                
            query = '''
                SELECT r.*, s.name as student_name, s.class_name
                FROM student_reports r
                JOIN students s ON r.student_id = s.id
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
                ORDER BY r.created_at DESC
            '''
            rows = school_db.execute(query, (guardian_id,)).fetchall()
            for r in rows:
                item = dict(r)
                item['school_id'] = school['id']
                item['school_name'] = school['name']
                if item.get('teacher_id'):
                    t = sys_db.execute('SELECT name FROM teachers WHERE id = ?', (item['teacher_id'],)).fetchone()
                    item['teacher_name'] = t['name'] if t else 'Professor'
                else:
                    item['teacher_name'] = 'Coordenação'
                all_reports.append(item)
        except Exception as e:
            continue
        finally:
             if school_db: school_db.close()
             
    return jsonify({'success': True, 'reports': all_reports})





