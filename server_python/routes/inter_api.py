import requests
import os
import json
from datetime import datetime, timedelta

# URLs Oficiais de Produção do Banco Inter
AUTH_URL = "https://cdpj.partners.bancointer.com.br/oauth/v2/token"
PIX_URL = "https://cdpj.partners.bancointer.com.br/pix/v2/cob"
WEBHOOK_URL = "https://cdpj.partners.bancointer.com.br/pix/v2/webhook"

class BancoInterAPI:
    def __init__(self, cert_path, key_path, client_id, client_secret):
        self.cert = (cert_path, key_path)
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
        self.token_expires = datetime.now()

    def authenticate(self):
        # Escopo para Pix Cobrança (cob.write, cob.read) e Webhook (pix.write, pix.read)
        # O escopo exato depende da app criada no Inter, geralmente 'boleto-cobranca.read boleto-cobranca.write' ou similar para boletos
        # Para PIX é 'pix.read pix.write'
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
            "scope": "pix.write pix.read"
        }
        
        try:
            response = requests.post(AUTH_URL, data=payload, cert=self.cert, verify=True)
            if response.status_code == 200:
                data = response.json()
                self.access_token = data['access_token']
                # Token dura 3600s (1h)
                self.token_expires = datetime.now() + timedelta(seconds=int(data.get('expires_in', 3600)))
                return True
            else:
                print(f"Erro Auth Inter: {response.text}")
                return False
        except Exception as e:
            print(f"Erro conexão Inter: {e}")
            return False

    def get_token(self):
        if not self.access_token or datetime.now() >= self.token_expires:
            success = self.authenticate()
            if not success:
                raise Exception("Falha na autenticação com Banco Inter")
        return self.access_token

    def create_pix_charge(self, txid, cpf, name, amount, description):
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Payload padrão Cobrança Imediata (Cob)
        payload = {
            "calendario": {
                "expiracao": 86400 # 24h para pagar
            },
            "devedor": {
                "cpf": cpf,
                "nome": name
            },
            "valor": {
                "original": f"{amount:.2f}"
            },
            "chave": "SUA_CHAVE_PIX_AQUI", # ISSO VEM DA CONFIGURAÇÃO, precisamos pedir a chave pix também
            "solicitacaoPagador": description
        }
        
        # Adicionar txid na URL se quiser um específico, ou POST sem txid pro Inter gerar
        # O Inter V2 recomenda PUT com txid gerado pelo cliente ou POST.
        # Vamos usar POST para simplicidade inicial, Inter gera o txid.
        
        try:
            response = requests.post(PIX_URL, json=payload, headers=headers, cert=self.cert)
            if response.status_code == 201:
                return response.json() # Retorna txid, pixCopiaECola, imagem QRCode
            else:
                raise Exception(f"Erro criar Pix: {response.text}")
        except Exception as e:
            raise e

    def configure_webhook(self, webhook_url, pix_key):
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # O endpoint de webhook do Inter é por chave pix
        url = f"{WEBHOOK_URL}/{pix_key}"
        payload = {"webhookUrl": webhook_url}
        
        response = requests.put(url, json=payload, headers=headers, cert=self.cert)
        return response.status_code in [200, 204]
