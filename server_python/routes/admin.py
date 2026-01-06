from flask import Blueprint, jsonify, request
from database import get_system_db
import sqlite3
import random

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/api/admin/dashboard', methods=['GET'])
def dashboard_stats():
    db = get_system_db()
    
    # Counts
    schools = db.execute('SELECT COUNT(*) as c FROM schools').fetchone()['c']
    teachers = db.execute('SELECT COUNT(*) as c FROM teachers').fetchone()['c']
    reps = db.execute('SELECT COUNT(*) as c FROM representatives').fetchone()['c']
    
    return jsonify({
        'schoolsCount': schools,
        'teachersCount': teachers,
        'repsCount': reps
    })

@admin_bp.route('/api/admin/schools', methods=['GET'])
def get_schools():
    db = get_system_db()
    rows = db.execute('SELECT * FROM schools').fetchall()
    # Safely convert rows to dicts
    result = []
    for r in rows:
        d = dict(r)
        if 'password' in d: del d['password']
        result.append(d)
    return jsonify(result)

@admin_bp.route('/api/admin/schools/<int:id>', methods=['DELETE'])
def delete_school(id):
    db = get_system_db()
    db.execute('DELETE FROM schools WHERE id = ?', (id,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/representatives', methods=['GET'])
def get_reps():
    db = get_system_db()
    rows = db.execute('SELECT * FROM representatives').fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if 'password' in d: del d['password']
        result.append(d)
    return jsonify(result)

@admin_bp.route('/api/admin/representatives', methods=['POST'])
def create_rep():
    data = request.json
    db = get_system_db()
    password = ''.join(random.choices('0123456789', k=6))
    
    db.execute('INSERT INTO representatives (name, email, password, commission_rate) VALUES (?, ?, ?, ?)',
               (data.get('name'), data.get('email'), password, data.get('commission_rate', 10)))
    db.commit()
    return jsonify({'success': True, 'password': password})

@admin_bp.route('/api/admin/technicians', methods=['GET'])
def get_techs():
    db = get_system_db()
    rows = db.execute('SELECT * FROM technicians').fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if 'password' in d: del d['password']
        result.append(d)
    return jsonify(result)

@admin_bp.route('/api/admin/technicians', methods=['POST'])
def create_tech():
    data = request.json
    db = get_system_db()
    password = ''.join(random.choices('0123456789', k=6))
    
    db.execute('INSERT INTO technicians (name, email, password, phone) VALUES (?, ?, ?, ?)',
               (data.get('name'), data.get('email'), password, data.get('phone')))
    db.commit()
    return jsonify({'success': True, 'password': password})

@admin_bp.route('/api/admin/camera-removal-requests', methods=['GET'])
def get_camera_requests():
    db = get_system_db()
    # Join with schools and cameras to get details
    rows = db.execute('''
        SELECT cr.*, s.name as school_name, c.camera_name, c.camera_purpose
        FROM camera_removal_requests cr
        LEFT JOIN schools s ON cr.school_id = s.id
        LEFT JOIN cameras c ON cr.camera_id = c.id
        ORDER BY cr.requested_at DESC
    ''').fetchall()
    return jsonify([dict(r) for r in rows])

@admin_bp.route('/api/admin/camera-removal-requests/<int:id>/approve', methods=['POST'])
def approve_camera_removal(id):
    db = get_system_db()
    req = db.execute('SELECT * FROM camera_removal_requests WHERE id = ?', (id,)).fetchone()
    if not req: return jsonify({'success': False}), 404
    
    # Update status
    db.execute('UPDATE camera_removal_requests SET status = "approved" WHERE id = ?', (id,))
    
    # Remove camera from cameras table
    db.execute('DELETE FROM cameras WHERE id = ?', (req['camera_id'],))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/camera-removal-requests/<int:id>/reject', methods=['POST'])
def reject_camera_removal(id):
    db = get_system_db()
    db.execute('UPDATE camera_removal_requests SET status = "rejected" WHERE id = ?', (id,))
    db.commit()
    return jsonify({'success': True})
