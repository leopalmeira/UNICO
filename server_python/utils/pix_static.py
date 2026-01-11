import crcmod

def generate_pix_static(pix_key, name, city, amount, txt_id):
    """
    Gera o payload "Copia e Cola" do Pix Estático padrão BRCode.
    """
    try:
        # Formatar Valor (ex: 10.00)
        str_amount = f"{amount:.2f}"
        
        # Normalizar strings (remover acentos seria ideal, mas simplificando)
        name = (name[:25] or 'Escola').upper()
        city = (city[:15] or 'Brasil').upper()
        txt_id = (txt_id[:25] or '***').replace(' ', '')
        
        # Montar Payload
        # 00 - Payload Format Indicator
        # 26 - Merchant Account Information (GUI + Key)
        # 52 - MCC (0000)
        # 53 - Currency (986 = BRL)
        # 54 - Transaction Amount
        # 58 - Country Code (BR)
        # 59 - Merchant Name
        # 60 - Merchant City
        # 62 - Additional Data Field Template (TxID)
        # 63 - CRC16
        
        # Field 26 (Merchant): 0014br.gov.bcb.pix + 01(len)Key
        merchant_account = f"0014br.gov.bcb.pix01{len(pix_key):02d}{pix_key}"
        
        payload = (
            f"000201" 
            f"26{len(merchant_account):02d}{merchant_account}" 
            f"52040000" 
            f"5303986" 
            f"54{len(str_amount):02d}{str_amount}" 
            f"5802BR" 
            f"59{len(name):02d}{name}" 
            f"60{len(city):02d}{city}" 
            f"62{len(txt_id)+4:02d}05{len(txt_id):02d}{txt_id}" 
            f"6304" # CRC placeholder
        )
        
        # Calcular CRC16 (CCITT-FALSE)
        crc16_func = crcmod.mkCrcFun(0x11021, initCrc=0xFFFF, rev=False, xorOut=0x0000)
        crc_val = crc16_func(payload.encode('utf-8'))
        crc_hex = hex(crc_val)[2:].upper().zfill(4)
        
        return f"{payload}{crc_hex}"
        
    except Exception as e:
        print(f"Erro gerando Pix: {e}")
        return None
