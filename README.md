<p align="center">
  <img src="https://img.shields.io/badge/EduFocus-Sistema%20Escolar-2563eb?style=for-the-badge&logo=graduation-cap&logoColor=white" alt="EduFocus Badge"/>
</p>

<h1 align="center">📚 EduFocus — Sistema de Gestão Escolar Inteligente</h1>

<p align="center">
  Plataforma completa de gestão escolar com painel administrativo, dashboard do professor,<br>
  reconhecimento facial, PWA para responsáveis e monitoramento de atenção em tempo real.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white" />
</p>

---

## 🏗️ Arquitetura do Projeto

```
edufocus1-main/
├── server/           # Backend Node.js + Express + SQLite
├── client/           # Frontend React + Vite (Painel Admin + Professor)
├── guardian-web-pwa/ # PWA para Responsáveis (HTML/JS standalone)
├── database/         # Bancos de dados SQLite
├── docs/             # Documentação técnica
└── package.json      # Orquestrador (concurrently)
```

---

## ✨ Funcionalidades

### 🏫 Painel Administrativo (Admin/Escola)
- Cadastro de escolas, turmas e alunos
- Gestão de professores e vínculos
- Registro de presença/frequência
- Criação de eventos escolares
- Gestão de pagamentos e cobranças
- Comunicação com responsáveis via chat
- Painel de inspeção escolar

### 👨‍🏫 Dashboard do Professor
- **Sessões de aula** — Iniciar/encerrar aulas com matéria, tópico e modo
- **Quick Check** — Avaliação rápida de atenção da turma (Excelente/Bom/Regular/Ruim)
- **Plano de Aula** — Criação e gestão de planos de aula
- **Relatório Semanal** — Resumos automáticos por semana
- **Enquetes Interativas** — Perguntas para a turma com respostas
- **Rodízio de Carteiras** — Reorganização automática de alunos
- **Acadêmico** — Lançamento de notas e relatórios individuais
- **Mensagens** — Chat com a coordenação

### 📱 PWA do Responsável (Guardian)
- Login e vinculação de filhos por código
- **Notificação de chegada** com geolocalização (≤30m da escola)
- **Biometria facial** — Cadastro de 5 ângulos do rosto do aluno
- **Média de atenção diária** — Card em tempo real (auto-refresh 30s)
- Visualização de notas e relatórios
- Calendário de presença
- Eventos escolares com confirmação de participação
- Chat com a escola
- Autorização remota para terceiros
- Compatível com PWA (instalar no celular)

### 🔐 Segurança
- Autenticação JWT para todas as rotas
- Reconhecimento facial com face-api.js
- Geolocalização para validar proximidade da escola
- Bancos de dados separados por escola (multi-tenant)

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- **Node.js** 18+
- **npm** 9+

### 1. Clonar o repositório
```bash
git clone https://github.com/seu-usuario/edufocus1.git
cd edufocus1/edufocus1-main
```

### 2. Instalar dependências
```bash
# Instalar tudo de uma vez
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
cd guardian-web-pwa && npm install && cd ..
```

### 3. Configurar variáveis de ambiente
Crie um arquivo `.env` na raiz (ou edite o existente):
```env
PORT=5000
JWT_SECRET=sua_chave_secreta_aqui
```

### 4. Rodar o projeto
```bash
# Rodar tudo junto (server + client + guardian PWA)
npm run dev
```

Isso inicia simultaneamente:
| Serviço | URL | Descrição |
|---------|-----|-----------|
| **Backend API** | `http://localhost:5000` | Servidor Express + SQLite |
| **Frontend React** | `http://localhost:5173` | Painel Admin + Professor |
| **Guardian PWA** | `http://localhost:5174` | App dos Responsáveis |

### Rodar individualmente
```bash
npm run server    # Apenas o backend
npm run client    # Apenas o frontend React
npm run guardian   # Apenas o PWA
```

---

## 🔑 Roles e Login

O sistema suporta múltiplos papéis:

| Role | Acesso | Descrição |
|------|--------|-----------|
| `admin` | Painel Administrativo | Gestão completa da escola |
| `teacher` | Dashboard Professor | Aulas, notas, atenção |
| `inspector` | Painel de Inspeção | Vistorias e relatórios |
| `guardian` | PWA Responsável | Acompanhamento do filho |

---

## 📊 Sistema de Atenção (Professor → Responsável)

Fluxo completo:

```
Professor                          Backend                         PWA Responsável
   │                                  │                                  │
   │ Quick Check (🟢🟡🟠🔴)          │                                  │
   ├─────────────────────────────────►│                                  │
   │  POST /teacher/attention-check   │                                  │
   │                                  │ ◄── Salva no SQLite              │
   │                                  │                                  │
   │                                  │   GET /guardian/class-attention   │
   │                                  │◄─────────────────────────────────┤
   │                                  │                                  │ (polling 30s)
   │                                  ├─────────────────────────────────►│
   │                                  │   { overall_level, score, ... }  │
   │                                  │                                  │
   │                                  │                    📊 Card Atualiza
```

---

## 🗄️ Banco de Dados

O sistema usa **SQLite** com arquitetura multi-tenant:

```
database/
├── system.db           # Usuários, escolas, professores (global)
└── school_<id>.db      # Dados de cada escola (alunos, turmas, notas, etc.)
```

### Tabelas principais (por escola)
- `students` — Alunos
- `classes` — Turmas
- `attendance` — Presença
- `class_sessions` — Sessões de aula do professor
- `attention_checks` — Quick Checks de atenção
- `lesson_plans` — Planos de aula
- `weekly_reports` — Relatórios semanais
- `manual_polls` — Enquetes
- `messages` — Chat
- `face_descriptors` — Biometria facial
- `events` — Eventos escolares

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Backend** | Node.js, Express, better-sqlite3 |
| **Frontend** | React 19, Vite 7, React Router 7 |
| **PWA** | HTML/CSS/JS vanilla, Service Workers |
| **Banco** | SQLite (multi-tenant por escola) |
| **Auth** | JWT (jsonwebtoken) |
| **UI Icons** | Lucide React |
| **Face Recognition** | face-api.js |
| **Maps** | Leaflet, React-Leaflet |
| **Deploy** | Render (backend), Netlify/Firebase (frontend) |

---

## 📁 Estrutura do Frontend (React)

```
client/src/
├── api/              # Configuração do Axios
├── components/       # Componentes reutilizáveis
│   ├── teacher/      # SessionControl, QuickCheckModal, LessonPlanTab, etc.
│   └── ...
├── context/          # AuthContext (autenticação)
├── pages/            # Páginas principais
│   ├── Login.jsx
│   ├── SchoolPanel.jsx
│   ├── TeacherDashboard.jsx
│   ├── InspectorDashboard.jsx
│   └── ...
├── styles/           # CSS
│   └── TeacherDashboardFixed.css  # Dark glass theme
└── App.jsx           # Rotas e layout
```

---

## 🌐 Deploy

### Render (Backend)
O arquivo `render.yaml` já está configurado:
```bash
git push origin main  # Deploy automático via Render
```

### Netlify (Frontend)
```bash
cd client && npm run build
# Upload da pasta dist/ para o Netlify
```

### Firebase (Guardian PWA)
```bash
cd guardian-web-pwa
firebase deploy
```

---

## 📝 Variáveis de Ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `PORT` | Porta do servidor | `5000` |
| `JWT_SECRET` | Chave secreta para tokens JWT | — |
| `NODE_ENV` | Ambiente (`development`/`production`) | `development` |

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/minha-feature`)
3. Commit suas mudanças (`git commit -m 'feat: minha feature'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

---

## 📜 Licença

Este projeto está sob a licença ISC.

---

<p align="center">
  Feito com 💙 pela equipe EduFocus
</p>
