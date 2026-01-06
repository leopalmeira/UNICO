@echo off
echo Instalando dependencias do WhatsApp Python...
pip install -r requirements.txt
echo.
echo Iniciando servidor WhatsApp Python...
python whatsapp_server.py
pause
