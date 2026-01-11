import requests
import os
import json
from datetime import datetime, timedelta

# URLs Oficiais de Produção do Banco Cora
AUTH_URL = "https://matls-clients.api.cora.com.br/token"
INVOICE_URL = "https://matls-clients.api.cora.com.br/invoices"

class BancoCoraAPI:
    def __init__(self, cert_path, key_path, client_id):
        self.cert = (cert_path, key_path)
        self.client_id = client_id
        self.access_token = None
        self.token_expires = datetime.now()

    def authenticate(self):
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id
        }
        
        try:
            # Cora usa endpoint mTLS para token
            response = requests.post(AUTH_URL, data=payload, cert=self.cert, verify=True)
            if response.status_code == 200:
                data = response.json()
                self.access_token = data['access_token']
                self.token_expires = datetime.now() + timedelta(seconds=int(data.get('expires_in', 3600)))
                return True
            else:
                print(f"Erro Auth Cora: {response.text}")
                return False
        except Exception as e:
            print(f"Erro conexão Cora: {e}")
            return False

    def get_token(self):
        if not self.access_token or datetime.now() >= self.token_expires:
            success = self.authenticate()
            if not success:
                raise Exception("Falha na autenticação com Banco Cora")
        return self.access_token

    def create_invoice(self, amount, due_date, name, email, cpf, description):
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"inv_{int(datetime.now().timestamp())}" # Unique key
        }
        
        # Payload Cora para Boleto + Pix
        payload = {
            "code": f"REF-{int(datetime.now().timestamp())}",
            "customer": {
                "name": name,
                "email": email,
                "document": {
                    "identity": cpf,
                    "type": "CPF"
                }
            },
            "services": [
                {
                    "name": description,
                    "amount": int(amount * 100) # Centavos
                }
            ],
            "payment_forms": [
                "BANK_SLIP" # Gera boleto com QR Code Pix embutido
            ],
            "due_date": due_date
        }
        
        try:
            response = requests.post(INVOICE_URL, json=payload, headers=headers, cert=self.cert)
            if response.status_code in [200, 201]:
                return response.json() # Retorna ID, Barcode, URL do PDF
            else:
                raise Exception(f"Erro criar Boleto Cora: {response.text}")
        except Exception as e:
            raise e
