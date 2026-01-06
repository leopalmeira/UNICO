@echo off
echo ===================================================
echo   TROCANDO SISTEMA DE COMUNICACAO PARA PYTHON
echo ===================================================
echo.
echo 1. Fazendo backup do sistema atual (Baileys)...
copy whatsapp-service.js whatsapp-service-baileys.js /Y

echo 2. Ativando sistema Python...
copy whatsapp-service-python.js whatsapp-service.js /Y

echo.
echo ===================================================
echo   SUCESSO!
echo ===================================================
echo O sistema agora usara a ponte Python.
echo.
echo IMPORTANTE:
echo Voce PRECISA manter a janela do Python aberta.
echo Va para a pasta server/whatsapp_python e execute install_and_run.bat
echo.
pause
