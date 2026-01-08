from flask import Blueprint, jsonify, request, g
from .auth import token_required
from database import get_system_db, get_school_db

teacher_bp = Blueprint('teacher', __name__)

@teacher_bp.route('/api/teacher/me', methods=['GET'])
@token_required
def get_teacher_info():
    teacher_id = g.user.get('id')
    db = get_system_db()
    
    teacher = db.execute('SELECT * FROM teachers WHERE id = ?', (teacher_id,)).fetchone()
    if not teacher:
        return jsonify({'message': 'Professor não encontrado'}), 404
        
    teacher_dict = dict(teacher)
    if 'password' in teacher_dict:
        del teacher_dict['password']
        
    return jsonify(teacher_dict)

@teacher_bp.route('/api/teacher/classes', methods=['GET'])
@token_required
def get_teacher_classes():
    teacher_id = g.user.get('id')
    school_id = g.user.get('school_id')
    
    print(f"🔍 DEBUG TEACHER CLASSES: ID={teacher_id}, School={school_id}")
    
    if not school_id:
        print("❌ School ID is missing in token")
        return jsonify([])
    
    try:
        school_db = get_school_db(school_id)
        
        # Get classes linked to this teacher
        print(f"🔍 Querying school_{school_id}.db for teacher {teacher_id}")
        rows = school_db.execute('''
            SELECT c.* FROM classes c
            JOIN teacher_classes tc ON c.id = tc.class_id
            WHERE tc.teacher_id = ?
        ''', (teacher_id,)).fetchall()
        
        print(f"✅ Found {len(rows)} classes")
        
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        print(f"❌ Error getting teacher classes: {e}")
        import traceback
        traceback.print_exc()
        return jsonify([])

@teacher_bp.route('/api/teacher/students', methods=['GET'])
@token_required
def get_class_students():
    class_id = request.args.get('class_id')
    school_id = g.user.get('school_id')
    
    if not school_id or not class_id:
        return jsonify([])
    
    try:
        school_db = get_school_db(school_id)
        rows = school_db.execute('SELECT * FROM students WHERE class_name = (SELECT name FROM classes WHERE id = ?)', (class_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    except:
        return jsonify([])

@teacher_bp.route('/api/teacher/class/<int:class_id>/last-seating-change', methods=['GET'])
@token_required
def get_last_seating_change(class_id):
    # Mock for now
    return jsonify({'last_change': None})

@teacher_bp.route('/api/teacher/messages', methods=['GET'])
@token_required
def get_messages():
    teacher_id = g.user.get('id')
    school_id = g.user.get('school_id')
    
    if not school_id:
        return jsonify([])
        
    try:
        db = get_school_db(school_id)
        rows = db.execute('''
            SELECT * FROM teacher_messages 
            WHERE teacher_id = ? 
            ORDER BY created_at DESC
        ''', (teacher_id,)).fetchall()
        
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        print(f"Error getting teacher messages: {e}")
        return jsonify([])

@teacher_bp.route('/api/teacher/polls', methods=['POST'])
@token_required
def create_poll():
    # Mock for now
    return jsonify({'pollId': 1})

@teacher_bp.route('/api/teacher/polls/<int:poll_id>/responses', methods=['POST'])
@token_required
def save_poll_responses(poll_id):
    # Mock for now
    return jsonify({'success': True})

@teacher_bp.route('/api/teacher/seating', methods=['POST'])
@token_required
def save_seating():
    # Mock for now
    return jsonify({'success': True})

@teacher_bp.route('/api/teacher/student/<int:student_id>/report', methods=['GET'])
@token_required
def get_student_report(student_id):
    # Mock for now
    return jsonify({'attendance': 95, 'performance': 85})

@teacher_bp.route('/api/teacher/messages/<int:message_id>/read', methods=['PUT'])
@token_required
def mark_message_read(message_id):
    # Mock for now
    return jsonify({'success': True})
