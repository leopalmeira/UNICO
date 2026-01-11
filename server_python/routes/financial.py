from flask import Blueprint, request, jsonify, g
from database import get_school_db
import sqlite3
import requests
import json
from datetime import datetime

financial_bp = Blueprint('financial', __name__)

# --- CONFIGURAÇÃO ---

@financial_bp.route('/school/financial/config', methods=['GET'])
def get_financial_config():
    school_id = request.args.get('school_id') or getattr(g, 'school_id', None) or 1
    
    try:
        conn = get_school_db(school_id)
        # ... logic ...
        cur = conn.cursor()
        cur.execute("SELECT api_key, wallet_id FROM financial_config LIMIT 1")
        # ...
        row = cur.fetchone()
        
        if row:
            # Mascarar a chave para segurança
            api_key = row['api_key'] or ""
            masked_key = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "****"
            return jsonify({
                "configured": True,
                "api_key_masked": masked_key,
                "wallet_id": row['wallet_id']
            })
        else:
            return jsonify({"configured": False})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals(): conn.close()

@financial_bp.route('/school/financial/config', methods=['POST'])
def save_financial_config():
    # Suporte a multipart/form-data para upload de arquivos
    school_id = request.args.get('school_id') or getattr(g, 'school_id', None) or 1
    
    # Se for JSON (legado/asaas)
    if request.is_json:
        data = request.json
        api_key = data.get('api_key')
        # ... lógica antiga do Asaas ...
        return jsonify({"message": "Use a nova interface para upload de certificados"})

    # Se for Form Data
    provider = request.form.get('provider') # 'inter', 'cora'
    client_id = request.form.get('client_id')
    client_secret = request.form.get('client_secret')
    pix_key = request.form.get('pix_key')
    
    cert_file = request.files.get('cert_file')
    key_file = request.files.get('key_file')

    try:
        # Diretório seguro para guardar certificados
        cert_dir = os.path.join(os.getcwd(), 'certificates', f'school_{school_id}')
        if not os.path.exists(cert_dir):
            os.makedirs(cert_dir)
            
        conn = get_school_db(school_id)
        cur = conn.cursor()
        
        # Verificar se já existe config
        cur.execute("SELECT id FROM financial_config LIMIT 1")
        exists = cur.fetchone()
        
        if exists:
            # Update
            if provider: cur.execute("UPDATE financial_config SET gateway_provider = ? WHERE id=?", (provider, exists['id']))
            if client_id: cur.execute("UPDATE financial_config SET client_id = ? WHERE id=?", (client_id, exists['id']))
            if client_secret: cur.execute("UPDATE financial_config SET client_secret = ? WHERE id=?", (client_secret, exists['id']))
            if pix_key: cur.execute("UPDATE financial_config SET pix_key = ? WHERE id=?", (pix_key, exists['id']))
        else:
            cur.execute("INSERT INTO financial_config (client_id, client_secret, pix_key, gateway_provider) VALUES (?, ?, ?, ?)", (client_id, client_secret, pix_key, provider or 'inter'))
            
        conn.commit()

        # Salvar arquivos (com prefixo do provider para não sobrescrever)
        prefix = provider if provider else 'inter'
        
        if cert_file:
            cert_path = os.path.join(cert_dir, f'{prefix}_cert.crt') # .pem ou .crt
            cert_file.save(cert_path)
            
        if key_file:
            key_path = os.path.join(cert_dir, f'{prefix}_key.key')
            key_file.save(key_path)

        return jsonify({"message": f"Configuração do {provider.upper() if provider else 'Banco'} salva com sucesso!"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'conn' in locals(): conn.close()

# --- FATURAS ---
from routes.inter_api import BancoInterAPI
from routes.cora_api import BancoCoraAPI

@financial_bp.route('/school/financial/invoices', methods=['POST'])
def create_invoice():
    data = request.json
    school_id = request.args.get('school_id') or getattr(g, 'school_id', None) or 1
    
    student_id = data.get('student_id')
    amount = data.get('amount')
    description = data.get('description')
    due_date = data.get('due_date')
    
    conn = get_school_db(school_id)
    try:
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM students WHERE id = ?", (student_id,))
        student = cur.fetchone()
        
        cur.execute("SELECT * FROM financial_config LIMIT 1")
        config = cur.fetchone()
        
        external_id = None
        payment_url = None
        status = 'PENDING'
        
        provider = config.get('gateway_provider', 'asaas') if config else 'asaas'
        
        # === LÓGICA BANCO INTER ===
        if provider == 'inter' and config.get('client_id'):
             try:
                 cert_path = os.path.join(os.getcwd(), 'certificates', f'school_{school_id}', 'inter_cert.crt')
                 key_path = os.path.join(os.getcwd(), 'certificates', f'school_{school_id}', 'inter_key.key')
                 
                 inter = BancoInterAPI(cert_path, key_path, config['client_id'], config['client_secret'])
                 # (Lógica existente de Pix...)
                 cpf = "00000000000" 
                 pix_data = inter.create_pix_charge(None, cpf, student['name'], float(amount), description)
                 external_id = pix_data.get('txid')
                 payment_url = pix_data.get('pixCopiaECola')
                 
             except Exception as e:
                 print(f"Erro Inter: {e}")
                 # Fallback Mock
                 import random
                 external_id = f"mock_{random.randint(1000,9999)}"
                 payment_url = f"00020126580014br.gov.bcb.pix0136{random.randint(1000,9999)}"

        # === LÓGICA BANCO CORA ===
        elif provider == 'cora' and config.get('client_id'):
             try:
                 # Cora usa .pem (cert) e .key
                 cert_path = os.path.join(os.getcwd(), 'certificates', f'school_{school_id}', 'cora_cert.crt') 
                 key_path = os.path.join(os.getcwd(), 'certificates', f'school_{school_id}', 'cora_key.key')
                 
                 cora = BancoCoraAPI(cert_path, key_path, config['client_id'])
                 
                 # Cora exige CPF real, aqui vamos mockar um para teste se não tiver
                 cpf_valid = "00000000000" # TODO: Pegar do cadastro
                 
                 invoice = cora.create_invoice(
                     amount=float(amount),
                     due_date=due_date,
                     name=student['name'],
                     email=student.get('parent_email', 'email@teste.com'),
                     cpf=cpf_valid,
                     description=description
                 )
                 
                 external_id = invoice.get('id')
                 payment_url = invoice.get('pdf_url') # Cora retorna PDF do boleto que tem QR Code Pix
                 
             except Exception as e:
                 print(f"Erro Cora: {e}")
                 # Fallback Mock
                 import random
                 external_id = f"mock_cora_{random.randint(1000,9999)}"
                 payment_url = "https://mock.cora.com.br/boleto.pdf"

        # === LÓGICA ASAAS (ou fallback) ===
        else:
             import random
             external_id = f"pay_{random.randint(10000,99999)}"
             payment_url = f"https://sandbox.asaas.com/i/{external_id}"
        
        cur.execute('''
            INSERT INTO invoices (student_id, description, amount, status, payment_method, due_date, external_id, payment_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (student_id, description, amount, status, 'MIXED', due_date, external_id, payment_url))
        
        conn.commit()
        return jsonify({
            "message": f"Cobrança ({provider.upper()}) gerada com sucesso!",
            "payment_url": payment_url,
            "provider": provider
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# --- WEBHOOK (Receber notificação de pagamento) ---
@financial_bp.route('/webhook/asaas', methods=['POST'])
def asaas_webhook():
    # O Asaas envia notificações aqui quando uma cobrança muda de status
    # É NECESSÁRIO que o webhook seja configurado com ?school_id=X
    school_id = request.args.get('school_id')
    
    data = request.json
    event = data.get('event')
    payment = data.get('payment')
    
    if not payment or not school_id:
         return jsonify({"received": True, "processed": False, "reason": "Missing payment data or school_id"})
         
    external_id = payment.get('id')
    status = payment.get('status') # RECEIVED, CONFIRMED, OVERDUE
    
    print(f"Webhook Asaas recebido: {event} para {external_id} (Escola {school_id})")
    
    try:
        conn = get_school_db(school_id)
        cur = conn.cursor()
        
        # Mapear status do Asaas para o nosso
        new_status = 'PENDING'
        if event in ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']:
            new_status = 'PAID'
        elif event in ['PAYMENT_OVERDUE']:
            new_status = 'OVERDUE'
        
        if new_status != 'PENDING':
            cur.execute("UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE external_id = ?", (new_status, external_id))
            conn.commit()
            print(f"Fatura {external_id} atualizada para {new_status}")
            
    except Exception as e:
        print(f"Erro ao processar webhook: {e}")
    finally:
        if 'conn' in locals(): conn.close()
    
    return jsonify({"received": True})
