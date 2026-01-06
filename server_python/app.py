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

app = Flask(__name__, static_folder='../client/dist')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0 # Desativar cache em desenvolvimento
CORS(app)

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
