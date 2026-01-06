# Configuração do WhatsApp via Python

Você solicitou mudar o sistema de comunicação para Python. O sistema foi preparado para usar uma "ponte" entre o servidor principal (Node.js) e um novo microserviço Python que gerencia o WhatsApp.

## Passos para Ativar

1. **Ativar o Servidor Python**
   - Vá para a pasta `server/whatsapp_python`.
   - Execute o arquivo `install_and_run.bat`.
   - Uma janela preta do terminal abrirá. **Não feche esta janela**.
   - O script instalará as dependências necessárias e iniciará o servidor na porta 5002.
   - **IMPORTANTE**: Certifique-se de estar logado no WhatsApp Web no seu navegador padrão (Chrome/Edge).

2. **Configurar o Servidor Principal**
   - Volte para a pasta `server`.
   - Execute o arquivo `USAR_WHATSAPP_PYTHON.bat`.
   - Isso fará a troca automática dos arquivos para que o sistema principal comece a usar a versão Python.

## Como funciona

O Node.js agora envia uma requisição HTTP para o Python (`localhost:5002/send`). O Python usa a biblioteca `pywhatkit` para abrir o navegador e enviar a mensagem instantaneamente.

## Voltando para o original

Se quiser voltar para o sistema antigo, execute `VOLTAR_PRO_NODE.bat` na pasta `server`.
