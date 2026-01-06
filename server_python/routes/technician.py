from flask import Blueprint, jsonify, request
from database import get_system_db, get_school_db

technician_bp = Blueprint('technician', __name__)

@technician_bp.route('/api/technician/schools', methods=['GET'])
def list_schools():
    db = get_system_db()
    rows = db.execute('SELECT * FROM schools').fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if 'password' in d: del d['password']
        result.append(d)
    return jsonify(result)

@technician_bp.route('/api/technician/cameras', methods=['GET'])
def list_cameras():
    db = get_system_db()
    # Join with schools to get school name
    rows = db.execute('''
        SELECT c.*, s.name as school_name 
        FROM cameras c 
        LEFT JOIN schools s ON c.school_id = s.id
    ''').fetchall()
    return jsonify([dict(r) for r in rows])

@technician_bp.route('/api/technician/cameras', methods=['POST'])
def create_camera():
    data = request.json
    db = get_system_db()
    
    # Check if we should assign classes logic
    assigned_classes = data.get('assigned_classes', [])
    classroom_names = '' # Logic to fetch names could be added here or just store IDs
    
    db.execute('''
        INSERT INTO cameras (school_id, camera_name, camera_purpose, camera_ip, camera_url, camera_port, camera_username, camera_password, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (data.get('school_id'), data.get('camera_name'), data.get('camera_purpose'), data.get('camera_ip'), data.get('camera_url'), data.get('camera_port'), data.get('camera_username'), data.get('camera_password'), data.get('notes')))
    db.commit()
    return jsonify({'success': True})

@technician_bp.route('/api/technician/schools/<int:school_id>/classrooms', methods=['GET'])
def get_school_classrooms(school_id):
    try:
        db = get_school_db(school_id)
        rows = db.execute('SELECT * FROM classes').fetchall()
        return jsonify([dict(r) for r in rows])
    except:
        return jsonify([])

@technician_bp.route('/api/technician/schools/<int:school_id>/classrooms', methods=['POST'])
def create_school_classroom(school_id):
    data = request.json
    try:
        db = get_school_db(school_id)
        db.execute('INSERT INTO classes (name, description) VALUES (?, ?)', (data.get('name'), data.get('capacity')))
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@technician_bp.route('/api/technician/cameras/test', methods=['POST'])
def test_camera():
    # Mock
    return jsonify({'success': True, 'message': 'Conexão estabelecida com sucesso!'})
