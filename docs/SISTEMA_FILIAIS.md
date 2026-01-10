# 🏢 Sistema de Gestão de Filiais - EduFocus

## 📋 Visão Geral

O sistema de filiais permite que grupos educacionais com múltiplas unidades gerenciem todas as suas escolas de forma centralizada. Uma escola matriz pode visualizar e administrar dados de todas as suas filiais através de um sistema de tokens de vinculação.

## 🎯 Funcionalidades

### Para a Escola Matriz:
- ✅ Gerar tokens de vinculação para filiais
- ✅ Visualizar lista de todas as filiais vinculadas
- ✅ Alternar entre diferentes unidades para visualizar dados
- ✅ Gerenciar funcionários de todas as filiais
- ✅ Remover vínculos com filiais

### Para a Escola Filial:
- ✅ Vincular-se a uma escola matriz usando token
- ✅ Manter autonomia operacional
- ✅ Compartilhar dados com a matriz
- ✅ Desvincular-se quando necessário

## 🚀 Como Usar

### 1️⃣ Vincular uma Escola Filial (Escola Matriz)

1. Acesse o painel da **Escola Matriz**
2. Clique em **"Filiais"** no menu lateral (ícone 🏢)
3. Clique no botão **"Gerar Token"**
4. Um token único será gerado (ex: `ABC123XYZ456`)
5. **Copie o token** e compartilhe com a escola filial
6. O token pode ser usado apenas uma vez

### 2️⃣ Usar o Token (Escola Filial)

1. Acesse o painel da **Escola Filial**
2. Clique em **"Filiais"** no menu lateral
3. Clique no botão **"Vincular à Matriz"**
4. Cole o token recebido da escola matriz
5. Clique em **"Confirmar Vínculo"**
6. Pronto! A filial está vinculada à matriz

### 3️⃣ Alternar Entre Escolas

Após vincular filiais, um **seletor de escola** aparecerá no topo do painel:

1. Clique no seletor (mostra a escola atual)
2. Escolha qual escola deseja visualizar
3. Os dados serão atualizados automaticamente
4. Você pode gerenciar:
   - Professores
   - Alunos
   - Turmas
   - Funcionários
   - Câmeras
   - Eventos
   - E muito mais!

### 4️⃣ Remover Vínculo

**⚠️ Importante: Apenas a Escola Matriz pode remover vínculos!**

**Escola Matriz:**
1. Vá em **"Filiais"** → **"Gerenciar Filiais"**
2. Encontre a filial que deseja remover
3. Clique no botão de **lixeira** (🗑️)
4. Confirme a remoção

**Escola Filial:**
- As filiais **não podem** desvincular-se da matriz
- Apenas visualizam a escola matriz vinculada
- Para desvincular, entre em contato com a escola matriz

## 🔐 Segurança

- ✅ Tokens são únicos e de uso único
- ✅ Apenas escolas vinculadas podem acessar dados umas das outras
- ✅ Apenas a escola matriz pode remover vínculos
- ✅ Filiais não podem se desvincular sozinhas

## 💡 Casos de Uso

### Exemplo 1: Rede de Escolas
```
Escola Matriz: Colégio ABC - Unidade Central
├── Filial 1: Colégio ABC - Unidade Norte
├── Filial 2: Colégio ABC - Unidade Sul
└── Filial 3: Colégio ABC - Unidade Leste
```

### Exemplo 2: Franquia Educacional
```
Franqueadora: EduTech Master
├── Franquia 1: EduTech - São Paulo
├── Franquia 2: EduTech - Rio de Janeiro
└── Franquia 3: EduTech - Belo Horizonte
```

## 📊 Estrutura de Dados

### Tabela: `school_affiliates`
```sql
- id: Identificador único
- parent_school_id: ID da escola matriz
- affiliate_school_id: ID da escola filial
- token: Token de vinculação (único)
- status: 'pending', 'active', 'removed'
- created_at: Data de criação
```

## 🔄 Fluxo de Vinculação

```
1. Matriz gera token
   ↓
2. Token é compartilhado com filial
   ↓
3. Filial usa token para se vincular
   ↓
4. Vínculo é ativado
   ↓
5. Matriz pode visualizar dados da filial
```

## ⚠️ Observações Importantes

1. **Token Único**: Cada token só pode ser usado uma vez
2. **Controle da Matriz**: Apenas a escola matriz pode remover vínculos com filiais
3. **Dados em Tempo Real**: Ao alternar entre escolas, os dados são atualizados
4. **Autonomia**: Cada escola mantém sua autonomia operacional
5. **Hierarquia**: Não há limite de filiais por matriz
6. **Menu Dropdown**: As filiais vinculadas aparecem no menu "Filiais" como submenu

## 🛠️ API Endpoints

### Backend (Python/Flask)

```python
# Gerar token
POST /api/school/affiliates/generate-token

# Vincular usando token
POST /api/school/affiliates/join
Body: { "token": "ABC123XYZ456" }

# Listar filiais e matrizes
GET /api/school/affiliates/list

# Remover vínculo
DELETE /api/school/affiliates/remove/{affiliate_id}

# Alternar contexto de escola
POST /api/school/affiliates/switch/{school_id}
```

## 📱 Interface do Usuário

### Componentes Frontend:
- `AffiliatesPanel.jsx` - Painel principal de gestão
- `SchoolSelector.jsx` - Seletor de escola no topo do dashboard

### Localização no Menu:
- Menu Lateral → 🏢 **Filiais**

## 🎨 Design

- **Badge Matriz**: Roxo (#6366f1)
- **Badge Filial**: Verde (#10b981)
- **Badge Atual**: Azul (#6366f1)

## 📞 Suporte

Para dúvidas ou problemas:
1. Acesse a aba **"Suporte"** no painel
2. Envie uma mensagem descrevendo o problema
3. Nossa equipe responderá em breve

---

**Desenvolvido por EduFocus Team** 🚀
Versão 2.0 - Janeiro 2026
