from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
from database import init_system_db
from routes.auth import auth_bp
from routes.school import school_bp
from routes.attendance import attendance_bp
from routes.guardian import guardian_bp
from routes.admin import admin_bp
from routes.technician import technician_bp
from routes.support import support_bp
from routes.teacher import teacher_bp
from routes.location import location_bp
from routes.affiliates import affiliates_bp

app = Flask(__name__, static_folder='../client/dist')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0 # Desativar cache em desenvolvimento

# Configuração CORS - permitir todas as origens em desenvolvimento
CORS(app, resources={r"/api/*": {
    "origins": ["http://localhost:5173", "http://localhost:3001", "http://127.0.0.1:5173", "http://127.0.0.1:3001"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
    "supports_credentials": True,
    "expose_headers": ["Content-Type", "Authorization"]
}})

# Health check - rota crucial para monitoramento
@app.route('/api/health')
def health_check():
    return {'status': 'healthy', 'service': 'edufocus-backend'}, 200

# Inicializar DB ao arrancar
with app.app_context():
    init_system_db()

# Registrar Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(guardian_bp)
app.register_blueprint(school_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(technician_bp)
app.register_blueprint(support_bp)
app.register_blueprint(teacher_bp)
app.register_blueprint(location_bp)
app.register_blueprint(affiliates_bp)
from routes.teacher_academic import teacher_bp as teacher_academic_bp
app.register_blueprint(teacher_academic_bp)
from routes.financial import financial_bp
app.register_blueprint(financial_bp)
from routes.saas_billing import saas_billing_bp
app.register_blueprint(saas_billing_bp)

from routes.employee_app import employee_bp
app.register_blueprint(employee_bp)

# Rota para servir Uploads
UPLOAD_FOLDER_ROOT = os.path.join(os.getcwd(), 'uploads')
@app.route('/uploads/<path:path>')
def serve_uploads(path):
    return send_from_directory(UPLOAD_FOLDER_ROOT, path)

# Rota para servir o frontend (Client)
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        # Fallback para SPA (se usar history mode) ou 404
        return send_from_directory(app.static_folder, 'index.html')

# Rota específica para servir arquivos do Guardian PWA 
GUARDIAN_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../client/dist/guardian-pwa')

@app.route('/guardian/<path:path>')
def serve_guardian(path):
    if os.path.exists(os.path.join(GUARDIAN_FOLDER, path)):
        return send_from_directory(GUARDIAN_FOLDER, path)
    return jsonify({'error': 'File not found'}), 404

@app.route('/guardian/')
def serve_guardian_index():
    return send_from_directory(GUARDIAN_FOLDER, 'index.html')

if __name__ == '__main__':
    print("🚀 Servidor Python EduFocus iniciando na porta 5000...")
    print("📱 Notificações: App do Responsável (Access Logs)")
    print("Use CTRL+C para parar.")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)

