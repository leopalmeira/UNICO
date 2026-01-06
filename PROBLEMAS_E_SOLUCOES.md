# PROBLEMAS IDENTIFICADOS E CORREÇÕES NECESSÁRIAS

## 1. CADASTRO E LOGIN DE PROFESSORES
**Problema**: Professor consegue cadastrar mas não consegue fazer login
**Causa**: Professor cadastrado fica com `school_id = NULL` e status `pending`
**Solução**: 
- Ajustar lógica de login para aceitar professores sem escola
- Criar tela de "Aguardando Aprovação" para professores pendentes

## 2. PAINEL SUPER ADMIN - SUPORTE
**Problema**: Aba "Suporte" desconecta/trava o painel
**Causa**: Endpoints `/api/support/tickets/all` podem estar faltando dados
**Solução**: Verificar e corrigir rotas de suporte

## 3. PAINEL SUPER ADMIN - PENÚLTIMO BOTÃO
**Problema**: Penúltimo botão do menu desconecta o painel
**Causa**: Provavelmente "Solicitações de Câmeras" com dados faltantes
**Solução**: Verificar endpoint `/api/admin/camera-removal-requests`

## 4. RECONHECIMENTO FACIAL EM PYTHON
**Problema**: Sistema atual usa face-api.js (JavaScript no cliente)
**Requisito**: Migrar para Python (DeepFace/OpenCV no servidor)
**Solução Necessária**:
- Criar endpoint Python para upload de foto
- Processar foto com DeepFace e extrair descriptor
- Salvar descriptor no banco
- Criar serviço de reconhecimento em tempo real
- Integrar com câmera para detecção automática

## 5. REGISTRO AUTOMÁTICO DE PRESENÇA
**Problema**: Não existe sistema automático de detecção
**Requisito**: Quando aluno/funcionário passa pela câmera, registrar automaticamente
**Solução Necessária**:
- Criar serviço Python que monitora stream da câmera
- Comparar faces detectadas com banco de dados
- Registrar presença automaticamente em `access_logs`
- Enviar notificação para app do responsável

---

## PRIORIDADE DE IMPLEMENTAÇÃO

### URGENTE (Corrigir Agora)
1. ✅ Criar rotas de professor faltantes
2. ⚠️ Corrigir login de professor sem escola
3. ⚠️ Verificar/corrigir rotas de suporte
4. ⚠️ Verificar/corrigir rotas de câmera

### IMPORTANTE (Próxima Fase)
5. 🔄 Implementar reconhecimento facial em Python
6. 🔄 Criar serviço de monitoramento de câmera
7. 🔄 Integrar detecção automática com presença

---

## ARQUITETURA PROPOSTA - RECONHECIMENTO FACIAL

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (React)                                   │
│  - Upload de foto do aluno                          │
│  - Visualização de câmera                           │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  BACKEND PYTHON (Flask)                             │
│  ┌───────────────────────────────────────────────┐  │
│  │ /api/school/students (POST)                   │  │
│  │ - Recebe foto + dados do aluno                │  │
│  │ - Processa com DeepFace                       │  │
│  │ - Salva descriptor no banco                   │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Serviço de Reconhecimento (Thread separada)  │  │
│  │ - Monitora stream da câmera                   │  │
│  │ - Detecta faces em tempo real                 │  │
│  │ - Compara com descriptors do banco            │  │
│  │ - Registra presença automaticamente           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  BANCO DE DADOS (SQLite)                            │
│  - students (id, name, photo_url, class_name)       │
│  - face_descriptors (student_id, descriptor)        │
│  - access_logs (student_id, event_type, timestamp)  │
└─────────────────────────────────────────────────────┘
```

---

## DECISÃO NECESSÁRIA

**Você quer que eu:**
A) Corrija APENAS os problemas urgentes de login/navegação agora?
B) Implemente TUDO incluindo reconhecimento facial em Python?
C) Corrija os problemas urgentes E crie um plano detalhado para o reconhecimento facial?

**Recomendação**: Opção C - Corrigir bugs críticos primeiro, depois implementar reconhecimento facial como feature separada.
