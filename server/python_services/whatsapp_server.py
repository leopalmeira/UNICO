from flask import Flask, request, jsonify
from flask_cors import CORS
import pywhatkit
import time
import threading
import pyautogui
import logging
from datetime import datetime

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("whatsapp_python.log"),
        logging.StreamHandler()
    ]
)

app = Flask(__name__)
CORS(app)

# Lock para garantir que apenas uma mensagem seja enviada por vez
send_lock = threading.Lock()

def send_message_task(phone, message, wait_time=15):
    """
    Função auxiliar para enviar mensagem via PyWhatKit
    """
    with send_lock:
        try:
            logging.info(f"Iniciando envio para {phone}")
            
            # Formatar número: PyWhatKit espera +55...
            if not phone.startswith('+'):
                phone = '+' + phone
            
            # Enviar mensagem instantaneamente (abre o navegador)
            # wait_time: tempo para carregar o WhatsApp Web
            # tab_close: se True, fecha a aba depois
            pywhatkit.sendwhatmsg_instantly(
                phone_no=phone, 
                message=message, 
                wait_time=wait_time, 
                tab_close=True,
                close_time=3
            )
            
            logging.info(f"Mensagem enviada para {phone}")
            return True, "Enviado com sucesso"
        except Exception as e:
            logging.error(f"Erro ao enviar para {phone}: {str(e)}")
            return False, str(e)

@app.route('/send', methods=['POST'])
def send_message():
    data = request.json
    phone = data.get('phone')
    message = data.get('message')
    
    if not phone or not message:
        return jsonify({'success': False, 'error': 'Phone and message are required'}), 400

    logging.info(f"Recebida solicitação de envio para {phone}")
    
    # Processar em thread separada para não bloquear a resposta HTTP
    # Mas como o PyWhatKit usa GUI, idealmente deve ser síncrono ou com fila
    # Vamos fazer síncrono por enquanto para garantir o retorno correto
    
    success, result = send_message_task(phone, message)
    
    if success:
        return jsonify({'success': True, 'message': result})
    else:
        return jsonify({'success': False, 'error': result}), 500

@app.route('/status', methods=['GET'])
def status():
    return jsonify({'status': 'online', 'service': 'whatsapp-python-bridge'})

if __name__ == '__main__':
    print("🚀 Servidor WhatsApp Python iniciando na porta 5002...")
    print("⚠️  IMPORTANTE: Mantenha o WhatsApp Web logado no navegador padrão!")
    app.run(host='0.0.0.0', port=5002)
