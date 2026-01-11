from flask import Blueprint, request, jsonify, g
import bcrypt
import jwt
import datetime
import os

auth_bp = Blueprint('auth', __name__)
SECRET_KEY = os.environ.get('SECRET_KEY', 'edufocus-secret-key-123')

from database import get_system_db

@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    print(f"🔒 Login attempt for: {email}")
    
    db = get_system_db()
    
    # Check roles strictly in order
    user = None
    role = None
    
    # 1. Super Admin
    cur = db.cursor()
    cur.execute('SELECT * FROM super_admins WHERE email = ?', (email,))
    user = cur.fetchone()
    if user:
        role = 'super_admin'
    
    # 2. School
    if not user:
        cur.execute('SELECT * FROM schools WHERE email = ?', (email,))
        user = cur.fetchone()
        if user:
            role = 'school_admin'
            
    # 3. Teacher
    if not user:
        cur.execute('SELECT * FROM teachers WHERE email = ?', (email,))
        user = cur.fetchone()
        if user:
            role = 'teacher'
            
    # 4. Inspector
    if not user:
        cur.execute('SELECT * FROM inspectors WHERE email = ?', (email,))
        user = cur.fetchone()
        if user:
            role = 'inspector'

    # 5. Guardian (or Employee via guardian table)
    if not user:
        cur.execute('SELECT * FROM guardians WHERE email = ?', (email,))
        user = cur.fetchone()
        if user:
            # Check if role column exists and uses it, otherwise default to guardian
            if 'role' in user.keys() and user['role']:
                role = user['role']
            else:
                role = 'guardian'
            
    if not user:
        return jsonify({'message': 'Usuário não encontrado'}), 400
        
    # Verify password
    # Em produção, senhas devem estar hasheadas.
    # O user atual pode ter senhas em texto plano ou hash. 
    # O Node usava bcryptjs. Python usa bcrypt. O formato do hash é compatível ($2a$ ou $2b$).
    try:
        stored_password = user['password']
        if stored_password.startswith('$2'):
            if bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8')):
                valid = True
            else:
                valid = False
        else:
            # Fallback para texto plano (dev/testes antigos)
            valid = (password == stored_password)
    except Exception as e:
        print(f"Erro ao verificar senha: {e}")
        valid = False

    if not valid:
        return jsonify({'message': 'Senha inválida'}), 400
        
    # Generate Token
    token_payload = {
        'id': user['id'],
        'email': user['email'],
        'role': role,
        'school_id': user['id'] if role == 'school_admin' else (user['school_id'] if 'school_id' in user.keys() else None),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30)
    }
    
    token = jwt.encode(token_payload, SECRET_KEY, algorithm='HS256')
    
    # Return user data (converter row para dict)
    user_dict = dict(user)
    if 'password' in user_dict:
        del user_dict['password']
        
    return jsonify({
        'token': token,
        'role': role,
        'user': user_dict
    })
@auth_bp.route('/api/register/school', methods=['POST'])
def register_school():
    data = request.json
    db = get_system_db()
    
    # Hash password
    password = data.get('password')
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        cur = db.cursor()
        cur.execute('''
            INSERT INTO schools (name, email, password, cnpj, address, admin_name)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            data.get('name'), 
            data.get('email'), 
            hashed,
            data.get('cnpj'),
            data.get('address'),
            data.get('admin_name', 'Admin') # Default admin name if not provided
        ))
        db.commit()
        return jsonify({'message': 'Escola registrada com sucesso!'})
    except Exception as e:
        return jsonify({'message': 'Erro ao registrar escola. Email já existe?'}), 400
@auth_bp.route('/api/register/teacher', methods=['POST'])
def register_teacher():
    data = request.json
    db = get_system_db()
    
    # Hash password
    password = data.get('password')
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    try:
        cur = db.cursor()
        cur.execute('''
            INSERT INTO teachers (name, email, password, subject, school_id, status)
            VALUES (?, ?, ?, ?, NULL, 'pending')
        ''', (
            data.get('name'), 
            data.get('email'), 
            hashed, 
            data.get('subject', 'Geral')
        ))
        db.commit()
        return jsonify({'message': 'Professor registrado com sucesso! Aguarde aprovação da escola.'})
    except Exception as e:
        print(f"Erro ao registrar professor: {e}")
        return jsonify({'message': 'Erro ao registrar professor. Email já existe?'}), 400

# Middleware check (decorator)
from functools import wraps

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        
        if not token:
            print(f"❌ Token ausente na requisição")
            return jsonify({'message': 'Token ausente'}), 401
            
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            g.user = data
            print(f"✅ Token válido para usuário: {data.get('email', 'unknown')}")
        except jwt.ExpiredSignatureError:
            print(f"❌ Token expirado")
            return jsonify({'message': 'Token expirado. Faça login novamente.'}), 403
        except jwt.InvalidTokenError as e:
            print(f"❌ Token inválido: {str(e)}")
            return jsonify({'message': 'Token inválido'}), 403
        except Exception as e:
            print(f"❌ Erro ao validar token: {str(e)}")
            return jsonify({'message': 'Token inválido'}), 403
            
        return f(*args, **kwargs)
    return decorated

