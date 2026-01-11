
@guardian_bp.route('/api/guardian/grades', methods=['GET'])
@token_required
def get_grades():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    schools = sys_db.execute('SELECT id, name FROM schools').fetchall()
    
    all_grades = []
    
    for school in schools:
        try:
            school_db = get_school_db(school['id'])
            # Get students for this guardian in this school
            students = school_db.execute('''
                SELECT s.id 
                FROM students s
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
            ''', (guardian_id,)).fetchall()
            
            student_ids = [str(row['id']) for row in students]
            
            if student_ids:
                placeholders = ','.join('?' * len(student_ids))
                grades = school_db.execute(f'''
                    SELECT g.*, s.name as student_name
                    FROM student_grades g
                    JOIN students s ON g.student_id = s.id
                    WHERE g.student_id IN ({placeholders})
                    ORDER BY g.created_at DESC
                ''', student_ids).fetchall()
                
                for g_row in grades:
                    g_dict = dict(g_row)
                    g_dict['school_id'] = school['id']
                    all_grades.append(g_dict)
            school_db.close()
        except:
            continue
            
    return jsonify({'success': True, 'grades': all_grades})

@guardian_bp.route('/api/guardian/reports', methods=['GET'])
@token_required
def get_reports():
    guardian_id = g.user.get('id')
    sys_db = get_system_db()
    schools = sys_db.execute('SELECT id, name FROM schools').fetchall()
    
    all_reports = []
    
    for school in schools:
        try:
            school_db = get_school_db(school['id'])
            # Get students for this guardian in this school
            students = school_db.execute('''
                SELECT s.id 
                FROM students s
                JOIN student_guardians sg ON s.id = sg.student_id
                WHERE sg.guardian_id = ?
            ''', (guardian_id,)).fetchall()
            
            student_ids = [str(row['id']) for row in students]
            
            if student_ids:
                placeholders = ','.join('?' * len(student_ids))
                reports = school_db.execute(f'''
                    SELECT r.*, s.name as student_name
                    FROM student_reports r
                    JOIN students s ON r.student_id = s.id
                    WHERE r.student_id IN ({placeholders})
                    ORDER BY r.created_at DESC
                ''', student_ids).fetchall()
                
                for r_row in reports:
                    r_dict = dict(r_row)
                    r_dict['school_id'] = school['id']
                    all_reports.append(r_dict)
            school_db.close()
        except:
            continue
            
    return jsonify({'success': True, 'reports': all_reports})
