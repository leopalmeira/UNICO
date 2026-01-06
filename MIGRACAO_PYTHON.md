# Migração para Sistema Python

Você solicitou a migração completa do backend para Python para simplificar o sistema e melhorar a estabilidade das notificações.

## O que foi feito

1. **Novo Backend em Flask**: Todo o servidor foireescrito em Python (`server_python/`), mantendo a compatibilidade com o frontend existente.
2. **Autenticação**: Migrada para usar JWT e compatível com os logins existentes.
3. **Banco de Dados**: Mantida a estrutura SQLite, mas agora gerenciada pelo Python.
4. **Notificações**: O sistema de envio de WhatsApp agora é nativo no servidor Python, usando `pywhatkit` para abrir o navegador e enviar mensagens instantaneamente, sem precisar de APIs complexas ou pontes.

## Como Executar

1. **Pare o servidor Node.js** (feche os terminais antigos).
2. Entre na pasta `server_python`:
   `cd server_python`
3. Execute o script de inicialização:
   `run_python_system.bat`

O navegador padrão do seu computador será usado para enviar as mensagens de WhatsApp. Mantenha o WhatsApp Web logado.

## Frontend
O frontend (HTML/CSS/JS) continua o mesmo e é servido automaticamente pelo servidor Python na porta 5000 (`http://localhost:5000`).

## Guardian App
O app dos pais também é servido na rota `/guardian/`.
