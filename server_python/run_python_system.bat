@echo off
echo ===================================================
echo   INSTALANDO E INICIANDO SERVIDOR PYTHON
echo ===================================================
echo.
echo 1. Instalando dependencias...
pip install -r requirements.txt

echo.
echo 2. Iniciando servidor...
echo O sistema estara disponivel em http://localhost:5000
echo.
python app.py
pause
