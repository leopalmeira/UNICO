from flask import Blueprint, request, jsonify, g
from .auth import token_required
from database import get_school_db, get_system_db
import datetime

teacher_bp = Blueprint('teacher_routes', __name__)

@teacher_bp.route('/api/teacher/grades', methods=['POST'])
@token_required
def add_grade():
    data = request.json
    # School ID comes from the logged-in teacher's token (fetched fresh to avoid stale token issues)
    sys_db = get_system_db()
    teacher_row = sys_db.execute('SELECT school_id FROM teachers WHERE id = ?', (g.user['id'],)).fetchone()
    school_id = teacher_row['school_id'] if teacher_row else None 
    
    student_id = data.get('student_id')
    subject = data.get('subject')
    value = data.get('value')
    term = data.get('term') # 1º Bimestre, etc.

    if not all([school_id, student_id, subject, value, term]):
        return jsonify({'error': 'Todos os campos são obrigatórios'}), 400

    db = None
    try:
        # Handle comma in grade (e.g. "8,5" -> 8.5)
        clean_value = str(value).replace(',', '.')
        float_value = float(clean_value)

        db = get_school_db(school_id)
        db.execute('''
            INSERT INTO student_grades (student_id, subject, value, term, teacher_id)
            VALUES (?, ?, ?, ?, ?)
        ''', (student_id, subject, float_value, term, g.user['id']))
        db.commit()
        return jsonify({'success': True, 'message': 'Nota adicionada com sucesso'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if db: db.close()

@teacher_bp.route('/api/teacher/reports', methods=['POST'])
@token_required
def add_report():
    data = request.json
    # School ID comes from the logged-in teacher's token (fetched fresh to avoid stale token issues)
    sys_db = get_system_db()
    teacher_row = sys_db.execute('SELECT school_id FROM teachers WHERE id = ?', (g.user['id'],)).fetchone()
    school_id = teacher_row['school_id'] if teacher_row else None
    student_id = data.get('student_id')
    title = data.get('title')
    content = data.get('content')

    if not all([school_id, student_id, title, content]):
        return jsonify({'error': 'Todos os campos são obrigatórios'}), 400

    db = None
    try:
        db = get_school_db(school_id)
        db.execute('''
            INSERT INTO student_reports (student_id, title, content, teacher_id)
            VALUES (?, ?, ?, ?)
        ''', (student_id, title, content, g.user['id']))
        db.commit()
        return jsonify({'success': True, 'message': 'Relatório criado com sucesso'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if db: db.close()
