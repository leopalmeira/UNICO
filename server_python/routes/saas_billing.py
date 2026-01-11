from flask import Blueprint, request, jsonify, g
from database import get_system_db, get_school_db
from datetime import datetime
import calendar

saas_billing_bp = Blueprint('saas_billing', __name__)

def get_default_price():
    conn = get_system_db()
    price = conn.execute("SELECT value FROM system_settings WHERE key = 'saas_default_price'").fetchone()
    if price:
        return float(price['value'])
    return 6.50

# --- ESCOLA (Visualizar Fatura) ---

@saas_billing_bp.route('/api/saas/school/billing', methods=['GET'])
def get_school_billing():
    # Identificar escola logada
    # Assumindo que o middleware de auth coloca user e role em g
    # Mas o endpoint da escola pode ser chamado pelo Admin logado na escola ou pela própria escola
    
    # Se for chamada do frontend da escola, o ID da escola pode vir do token ou deve ser inferido
    # Como não temos o middleware completo aqui, vamos pegar school_id do query param ou header, ou g
    
    # Para simplificar e manter compatibilidade com o padrão:
    school_id = request.args.get('school_id')
    
    if not school_id and getattr(g, 'user', None) and g.user.get('role') == 'school_admin':
        # Se estiver logado como escola, precisamos do ID da escola. 
        # Normalmente estaria no user['id'] ou similar
        # Por enquanto, vou confiar no query param school_id que o frontend envia
        pass

    if not school_id:
        return jsonify({"error": "School ID required"}), 400

    try:
        sys_db = get_system_db()
        
        # 1. Pegar configurações da escola
        school = sys_db.execute("SELECT id, name, custom_price FROM schools WHERE id = ?", (school_id,)).fetchone()
        if not school:
            return jsonify({"error": "School not found"}), 404
            
        default_price = get_default_price()
        # Se custom_price for NULL, usa default. Se for setado (mesmo 0), usa ele.
        price_per_student = school['custom_price'] if school['custom_price'] is not None else default_price
        
        # 2. Contar alunos
        # Tentar conectar no banco da escola
        try:
            school_conn = get_school_db(school_id)
            student_count = school_conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]
            school_conn.close()
        except Exception as e:
            # Se banco da escola não existe ou erro, assume 0
            print(f"Erro ao ler banco da escola {school_id}: {e}")
            student_count = 0
            
        # 3. Calcular Fatura
        total_amount = student_count * float(price_per_student)
        
        # Data de vencimento: dia 5 do mês atual (ou próximo se já passou)
        today = datetime.now()
        due_day = 5
        
        # Se hoje é dia 6, o vencimento é dia 5 do próximo mês? Ou mostramos a fatura atual 'Vencida'?
        # Normalmente SaaS cobra POSTECIPADO ou ANTECIPADO. Vamos assumir mensalidade do mês corrente.
        # Vencimento dia 5 deste mês.
        
        due_date = datetime(today.year, today.month, due_day)
        status = 'PENDING'
        
        if today.day > due_day:
            status = 'OVERDUE' # Vencido se passou do dia 5 e não pagou (não temos controle de pagamento real ainda)
            
        # Formatar
        return jsonify({
            "school_name": school['name'],
            "student_count": student_count,
            "price_per_student": price_per_student,
            "total_amount": total_amount,
            "currency": "BRL",
            "due_date": due_date.strftime("%Y-%m-%d"),
            "status": status,
            "is_custom_price": school['custom_price'] is not None
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- SUPER ADMIN (Gestão) ---

@saas_billing_bp.route('/api/saas/admin/config', methods=['GET'])
def get_global_config():
    return jsonify({"default_price": get_default_price()})

@saas_billing_bp.route('/api/saas/admin/config', methods=['POST'])
def update_global_config():
    data = request.json
    new_price = data.get('default_price')
    
    if new_price is None:
        return jsonify({"error": "Price required"}), 400
        
    conn = get_system_db()
    conn.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('saas_default_price', ?)", (str(new_price),))
    conn.commit()
    
    return jsonify({"success": True, "new_default_price": new_price})

@saas_billing_bp.route('/api/saas/admin/schools', methods=['GET'])
def list_schools_billing():
    conn = get_system_db()
    schools = conn.execute("SELECT id, name, custom_price FROM schools").fetchall()
    default_price = get_default_price()
    
    results = []
    for s in schools:
        # Calcular alunos e total on-the-fly (pode ser lento se muitos bancos, mas ok para MVP)
        student_count = 0
        try:
            s_db = get_school_db(s['id'])
            student_count = s_db.execute("SELECT COUNT(*) FROM students").fetchone()[0]
            s_db.close()
        except:
            pass
            
        price = s['custom_price'] if s['custom_price'] is not None else default_price
        total = student_count * float(price)
        
        results.append({
            "id": s['id'],
            "name": s['name'],
            "student_count": student_count,
            "price_per_student": price,
            "is_custom_price": s['custom_price'] is not None,
            "current_invoice_total": total
        })
        
    return jsonify(results)

@saas_billing_bp.route('/api/saas/admin/school/<int:school_id>/price', methods=['PUT'])
def update_school_price(school_id):
    data = request.json
    custom_price = data.get('custom_price') # Pode ser None para resetar ao default
    
    conn = get_system_db()
    conn.execute("UPDATE schools SET custom_price = ? WHERE id = ?", (custom_price, school_id))
    conn.commit()
    
    return jsonify({"success": True})
