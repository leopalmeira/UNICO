from flask import Blueprint, request, jsonify, g
from .auth import token_required
from database import get_system_db, get_school_db
import sqlite3
import json
import datetime

employee_bp = Blueprint('employee_app', __name__)

def find_employee_by_guardian_id(guardian_id):
    # Itera sobre todas as escolas para achar o funcionário vinculado a este login
    sys_db = get_system_db()
    schools = sys_db.execute('SELECT id, name, latitude, longitude FROM schools').fetchall()
    
    for school in schools:
        try:
            s_db = get_school_db(school['id'])
            # Verifica se tem coluna guardian_id (já fizemos migração)
            emp = s_db.execute('SELECT * FROM employees WHERE guardian_id = ?', (guardian_id,)).fetchone()
            if emp:
                emp_dict = dict(emp)
                emp_dict['school_id'] = school['id']
                emp_dict['school_name'] = school['name']
                emp_dict['school_lat'] = school['latitude']
                emp_dict['school_lng'] = school['longitude']
                return emp_dict
        except Exception as e:
            continue
            
    return None

@employee_bp.route('/api/employee/info', methods=['GET'])
@token_required
def get_employee_info():
    if g.user.get('role') != 'employee':
        return jsonify({'error': 'Acesso negado. Apenas funcionários.'}), 403
        
    guardian_id = g.user['id']
    employee = find_employee_by_guardian_id(guardian_id)
    
    if not employee:
        return jsonify({'error': 'Funcionário não encontrado nas escolas.'}), 404
        
    return jsonify({
        'success': True,
        'data': employee
    })

@employee_bp.route('/api/employee/clock', methods=['POST'])
@token_required
def register_clock():
    # Recebe o ponto
    data = request.json
    guardian_id = g.user['id']
    employee = find_employee_by_guardian_id(guardian_id)
    
    if not employee:
        return jsonify({'error': 'Funcionário não encontrado.'}), 404
        
    school_id = employee['school_id']
    emp_id = employee['id']
    
    type_ = data.get('type') # clock_in, lunch_out, lunch_return, clock_out
    lat = data.get('latitude')
    lng = data.get('longitude')
    photo = data.get('photo') # Base64 da foto tirada na hora
    timestamp = datetime.datetime.now()
    
    db = get_school_db(school_id)
    
    # Salvar na tabela employee_attendance
    # Preciso criar essa tabela se não existir? 
    # Vou assumir que não existe e tratar no try/catch ou criar na hora.
    
    try:
        db.execute('''
            INSERT INTO employee_attendance (employee_id, type, timestamp, latitude, longitude, photo_url, verified)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        ''', (emp_id, type_, timestamp, lat, lng, photo)) # photo aqui salvando base64 direto? Melhor salvar URL mas tempo é curto. Vou salvar string 'base64...'
        db.commit()
    except sqlite3.OperationalError:
        # Tabela não existe, criar
        db.execute('''
            CREATE TABLE IF NOT EXISTS employee_attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER,
                type TEXT, -- clock_in, lunch_out, etc
                timestamp DATETIME,
                latitude REAL,
                longitude REAL,
                photo_url TEXT,
                verified INTEGER DEFAULT 0
            )
        ''')
        db.execute('''
            INSERT INTO employee_attendance (employee_id, type, timestamp, latitude, longitude, photo_url, verified)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        ''', (emp_id, type_, timestamp, lat, lng, photo))
        db.commit()
        
    return jsonify({'success': True, 'message': 'Ponto registrado com sucesso!'})

@employee_bp.route('/api/employee/history', methods=['GET'])
@token_required
def get_history():
    guardian_id = g.user['id']
    employee = find_employee_by_guardian_id(guardian_id)
    if not employee: return jsonify([]), 404
    
    db = get_school_db(employee['school_id'])
    try:
        # Pegar histórico do mês atual
        rows = db.execute('''
            SELECT * FROM employee_attendance 
            WHERE employee_id = ? 
            ORDER BY timestamp DESC
            LIMIT 50
        ''', (employee['id'],)).fetchall()
        return jsonify([dict(r) for r in rows])
    except:
        return jsonify([])
