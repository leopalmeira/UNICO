from flask import Blueprint, request, jsonify, g
from database import get_system_db
from routes.auth import token_required
import secrets
import string

affiliates_bp = Blueprint('affiliates', __name__, url_prefix='/api/school/affiliates')

def generate_token(length=12):
    """Generate a secure random token for school affiliation"""
    # Updated: 2026-01-10 13:28
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))

@affiliates_bp.route('/generate-token', methods=['POST'])
@token_required
def create_affiliate_token():
    """Generate a token for another school to join as affiliate"""
    try:
        school_id = g.user['id']  # From auth middleware
        
        # Generate unique token
        token = generate_token()
        
        db = get_system_db()
        cur = db.cursor()
        
        # Store token (without affiliate yet, will be filled when token is used)
        cur.execute('''
            INSERT INTO school_affiliates (parent_school_id, token, status)
            VALUES (?, ?, 'pending')
        ''', (school_id, token))
        
        db.commit()
        
        return jsonify({
            'success': True,
            'token': token,
            'message': 'Token gerado com sucesso! Compartilhe com a escola filial.'
        })
    
    except Exception as e:
        print(f'Error generating token: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

@affiliates_bp.route('/join', methods=['POST'])
@token_required
def join_as_affiliate():
    """Join a parent school using a token"""
    try:
        school_id = g.user.get('school_id') or g.user.get('id')
        print(f"🔍 Join attempt - Current school ID: {school_id}, User: {g.user}")
        
        data = request.json
        token = data.get('token', '').strip().upper()
        
        if not token:
            return jsonify({'success': False, 'message': 'Token é obrigatório'}), 400
        
        db = get_system_db()
        cur = db.cursor()
        
        # Find token
        cur.execute('''
            SELECT id, parent_school_id, affiliate_school_id, status
            FROM school_affiliates
            WHERE token = ?
        ''', (token,))
        
        affiliate = cur.fetchone()
        
        if not affiliate:
            print(f"❌ Token não encontrado: {token}")
            return jsonify({'success': False, 'message': 'Token inválido'}), 404
        
        print(f"✅ Token encontrado - Parent: {affiliate['parent_school_id']}, Status: {affiliate['status']}")
        
        if affiliate['status'] != 'pending':
            return jsonify({'success': False, 'message': 'Token já foi utilizado'}), 400
        
        if affiliate['parent_school_id'] == school_id:
            return jsonify({
                'success': False, 
                'message': 'Este token foi gerado pela sua escola. Para vincular filiais, você deve:\n1. Gerar o token na ESCOLA MATRIZ\n2. Usar o token em uma ESCOLA FILIAL diferente'
            }), 400
        
        # Check if already affiliated
        cur.execute('''
            SELECT id FROM school_affiliates
            WHERE ((parent_school_id = ? AND affiliate_school_id = ?)
               OR (parent_school_id = ? AND affiliate_school_id = ?))
               AND status = 'active'
        ''', (school_id, affiliate['parent_school_id'], affiliate['parent_school_id'], school_id))
        
        existing = cur.fetchone()
        if existing:
            return jsonify({'success': False, 'message': 'Escolas já estão vinculadas'}), 400
        
        # Update token with affiliate school
        cur.execute('''
            UPDATE school_affiliates
            SET affiliate_school_id = ?, status = 'active'
            WHERE id = ?
        ''', (school_id, affiliate['id']))
        
        db.commit()
        
        # Get parent school name
        cur.execute('SELECT name FROM schools WHERE id = ?', (affiliate['parent_school_id'],))
        parent = cur.fetchone()
        
        print(f"✅ Vínculo criado com sucesso! Filial {school_id} -> Matriz {affiliate['parent_school_id']}")
        
        return jsonify({
            'success': True,
            'message': f'Vinculado com sucesso à escola matriz: {parent["name"]}'
        })
    
    except Exception as e:
        print(f'❌ Error joining affiliate: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@affiliates_bp.route('/list', methods=['GET'])
@token_required
def list_affiliates():
    """List all affiliated schools (both as parent and as affiliate)"""
    try:
        school_id = g.user['id']
        
        db = get_system_db()
        cur = db.cursor()
        
        # Get schools where current school is parent
        cur.execute('''
            SELECT 
                sa.id,
                sa.affiliate_school_id as school_id,
                s.name,
                s.email,
                s.address,
                'filial' as relationship,
                sa.created_at
            FROM school_affiliates sa
            JOIN schools s ON s.id = sa.affiliate_school_id
            WHERE sa.parent_school_id = ? AND sa.status = 'active'
        ''', (school_id,))
        
        as_parent = [dict(row) for row in cur.fetchall()]
        
        # Get schools where current school is affiliate
        cur.execute('''
            SELECT 
                sa.id,
                sa.parent_school_id as school_id,
                s.name,
                s.email,
                s.address,
                'matriz' as relationship,
                sa.created_at
            FROM school_affiliates sa
            JOIN schools s ON s.id = sa.parent_school_id
            WHERE sa.affiliate_school_id = ? AND sa.status = 'active'
        ''', (school_id,))
        
        as_affiliate = [dict(row) for row in cur.fetchall()]
        
        return jsonify({
            'success': True,
            'affiliates': as_parent,  # Filiais
            'parents': as_affiliate    # Matrizes
        })
    
    except Exception as e:
        print(f'Error listing affiliates: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

@affiliates_bp.route('/remove/<int:affiliate_id>', methods=['DELETE'])
@token_required
def remove_affiliate(affiliate_id):
    """Remove an affiliate relationship"""
    try:
        school_id = g.user['id']
        
        db = get_system_db()
        cur = db.cursor()
        
        # Verify ownership
        cur.execute('''
            SELECT id FROM school_affiliates
            WHERE id = ? AND (parent_school_id = ? OR affiliate_school_id = ?)
        ''', (affiliate_id, school_id, school_id))
        
        if not cur.fetchone():
            return jsonify({'success': False, 'message': 'Vínculo não encontrado'}), 404
        
        # Remove relationship
        cur.execute('UPDATE school_affiliates SET status = ? WHERE id = ?', ('removed', affiliate_id))
        db.commit()
        
        return jsonify({
            'success': True,
            'message': 'Vínculo removido com sucesso'
        })
    
    except Exception as e:
        print(f'Error removing affiliate: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500

@affiliates_bp.route('/switch/<int:school_id>', methods=['POST'])
@token_required
def switch_school_context(school_id):
    """Switch to view another school's data (if affiliated)"""
    try:
        current_school_id = g.user['id']
        
        db = get_system_db()
        cur = db.cursor()
        
        # Verify affiliation
        cur.execute('''
            SELECT id FROM school_affiliates
            WHERE ((parent_school_id = ? AND affiliate_school_id = ?)
               OR (parent_school_id = ? AND affiliate_school_id = ?))
               AND status = 'active'
        ''', (current_school_id, school_id, school_id, current_school_id))
        
        if not cur.fetchone() and current_school_id != school_id:
            return jsonify({'success': False, 'message': 'Acesso negado'}), 403
        
        # Get school info
        cur.execute('SELECT id, name, email FROM schools WHERE id = ?', (school_id,))
        school = cur.fetchone()
        
        if not school:
            return jsonify({'success': False, 'message': 'Escola não encontrada'}), 404
        
        return jsonify({
            'success': True,
            'school': dict(school),
            'message': f'Visualizando: {school["name"]}'
        })
    
    except Exception as e:
        print(f'Error switching school: {e}')
        return jsonify({'success': False, 'message': str(e)}), 500
