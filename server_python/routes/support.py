from flask import Blueprint, jsonify, request
from database import get_system_db

support_bp = Blueprint('support', __name__)

@support_bp.route('/api/support/tickets/all', methods=['GET'])
def get_tickets():
    db = get_system_db()
    status = request.args.get('status')
    
    query = 'SELECT * FROM support_tickets'
    params = []
    
    if status and status != 'all':
        query += ' WHERE status = ?'
        params.append(status)
        
    query += ' ORDER BY created_at DESC'
    
    rows = db.execute(query, params).fetchall()
    
    tickets = []
    for r in rows:
        t = dict(r)
        # Get last message
        last_msg = db.execute('SELECT message FROM support_messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1', (t['id'],)).fetchone()
        t['last_message'] = last_msg['message'] if last_msg else ''
        tickets.append(t)
        
    return jsonify(tickets)

@support_bp.route('/api/support/tickets/<int:id>/messages', methods=['GET'])
def get_messages(id):
    db = get_system_db()
    rows = db.execute('SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC', (id,)).fetchall()
    return jsonify({'messages': [dict(r) for r in rows]})

@support_bp.route('/api/support/tickets/<int:id>/messages', methods=['POST'])
def send_message(id):
    data = request.json
    db = get_system_db()
    
    db.execute('''
        INSERT INTO support_messages (ticket_id, user_type, user_id, message, is_internal)
        VALUES (?, ?, ?, ?, ?)
    ''', (id, data.get('user_type'), data.get('user_id'), data.get('message'), data.get('is_internal', 0)))
    
    db.execute('UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', (id,))
    db.commit()
    return jsonify({'success': True})

@support_bp.route('/api/support/tickets/<int:id>/status', methods=['PATCH'])
def update_status(id):
    data = request.json
    db = get_system_db()
    db.execute('UPDATE support_tickets SET status = ? WHERE id = ?', (data.get('status'), id))
    db.commit()
    return jsonify({'success': True})

@support_bp.route('/api/support/tickets/<int:id>', methods=['DELETE'])
def delete_ticket(id):
    db = get_system_db()
    db.execute('DELETE FROM support_messages WHERE ticket_id = ?', (id,))
    db.execute('DELETE FROM support_tickets WHERE id = ?', (id,))
    db.commit()
    return jsonify({'success': True})
