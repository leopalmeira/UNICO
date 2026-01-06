from flask import Blueprint, request, jsonify, g
from .auth import token_required
from database import get_system_db, get_school_db
import datetime

attendance_bp = Blueprint('attendance', __name__)

@attendance_bp.route('/api/attendance/arrival', methods=['POST'])
@token_required
def register_arrival():
    data = request.json
    student_id = data.get('student_id')
    school_id = g.user.get('school_id') or g.user.get('id') # Se for admin da escola, id é o school_id
    
    if not school_id:
        return jsonify({'message': 'Escola não identificada'}), 400
        
    db = get_school_db(school_id)
    cur = db.cursor()
    
    # 1. Buscar aluno
    cur.execute('SELECT * FROM students WHERE id = ?', (student_id,))
    student = cur.fetchone()
    
    if not student:
        return jsonify({'message': 'Aluno não encontrado'}), 404
        
    # 2. Registrar presença
    timestamp = datetime.datetime.now().isoformat()
    cur.execute('''
        INSERT INTO attendance (student_id, timestamp, type)
        VALUES (?, ?, 'arrival')
    ''', (student_id, timestamp))
    
    # 3. Registrar Log de Acesso (para notificações do app do responsável)
    cur.execute('''
        INSERT INTO access_logs (student_id, event_type, timestamp, notified_guardian)
        VALUES (?, 'arrival', ?, 0)
    ''', (student_id, timestamp))
    
    db.commit()
    
    return jsonify({
        'success': True,
        'message': 'Presença registrada com sucesso',
        'student': student['name'],
        'timestamp': timestamp
    })

@attendance_bp.route('/api/attendance/departure', methods=['POST'])
@token_required
def register_departure():
    data = request.json
    student_id = data.get('student_id')
    school_id = g.user.get('school_id') or g.user.get('id')
    
    if not school_id:
        return jsonify({'message': 'Escola não identificada'}), 400
        
    db = get_school_db(school_id)
    cur = db.cursor()
    
    cur.execute('SELECT * FROM students WHERE id = ?', (student_id,))
    student = cur.fetchone()
    
    if not student:
        return jsonify({'message': 'Aluno não encontrado'}), 404
        
    timestamp = datetime.datetime.now().isoformat()
    cur.execute('''
        INSERT INTO attendance (student_id, timestamp, type)
        VALUES (?, ?, 'departure')
    ''', (student_id, timestamp))
    
    cur.execute('''
        INSERT INTO access_logs (student_id, event_type, timestamp, notified_guardian)
        VALUES (?, 'departure', ?, 0)
    ''', (student_id, timestamp))
    
    db.commit()

    return jsonify({
        'success': True,
        'message': 'Saída registrada com sucesso',
        'student': student['name'],
        'timestamp': timestamp
    })
