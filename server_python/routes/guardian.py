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

@guardian_bp.route('/api/guardian/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    db = get_system_db()
    cur = db.cursor()
    cur.execute('SELECT * FROM guardians WHERE email = ?', (email,))
    guardian = cur.fetchone()
    
    if not guardian:
        return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401
    
    valid = False
    try:
        if guardian['password'].startswith('$2'):
            if bcrypt.checkpw(password.encode('utf-8'), guardian['password'].encode('utf-8')):
                valid = True
        else:
            if password == guardian['password']:
                valid = True
    except:
        valid = False
        
    if not valid:
        return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401
        
    token = jwt.encode({
        'id': guardian['id'],
        'email': guardian['email'],
        'role': 'guardian',
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

@guardian_bp.route('/api/guardian/students', methods=['GET'])
@token_required
def get_students():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    
    schools_cur = sys_db.cursor()
    schools_cur.execute('SELECT id, name FROM schools')
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
                all_students.append(student_data)
                
        except Exception as e:
            continue
        finally:
            if school_db: school_db.close()
            
    return jsonify({'success': True, 'data': {'students': all_students}})

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
