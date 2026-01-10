"""
Helper functions for affiliate school access control
"""
from flask import g, request
from database import get_system_db

def get_accessible_school_id():
    """
    Get the school_id that should be used for data queries.
    If a school_id query parameter is provided and the user has access to it,
    return that. Otherwise return the user's own school_id.
    """
    # Get user's own school_id
    user_school_id = g.user.get('school_id') or g.user.get('id')
    
    # Check if a different school_id is requested
    requested_school_id = request.args.get('school_id', type=int)
    
    print(f"DEBUG ACCESS: UserSchool={user_school_id}, Requested={requested_school_id}")
    
    if not requested_school_id or requested_school_id == user_school_id:
        return user_school_id
    
    # Verify user has access to the requested school
    db = get_system_db()
    cur = db.cursor()
    
    cur.execute('''
        SELECT id FROM school_affiliates
        WHERE ((parent_school_id = ? AND affiliate_school_id = ?)
           OR (parent_school_id = ? AND affiliate_school_id = ?))
           AND status = 'active'
    ''', (user_school_id, requested_school_id, requested_school_id, user_school_id))
    
    if cur.fetchone():
        return requested_school_id
    
    # Raise error to prevent showing wrong data
    print(f"DEBUG ACCESS DENIED: User {user_school_id} tried to access {requested_school_id}")
    from werkzeug.exceptions import Forbidden
    raise Forbidden(f"School {user_school_id} does not have access to School {requested_school_id}")
