import { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, BarChart3, Users, MessageSquare, Shuffle, LogOut, TrendingUp, CheckCircle, Clock, Brain, BookOpen, Bell, FileText, Calendar, RefreshCw, Activity, Zap, Target, Send, X, Plus, Trash2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import SessionControl from '../components/teacher/SessionControl';
import QuickCheckModal from '../components/teacher/QuickCheckModal';
import LessonPlanTab from '../components/teacher/LessonPlanTab';
import WeeklyReportTab from '../components/teacher/WeeklyReportTab';
import '../styles/TeacherDashboardFixed.css';

export default function TeacherDashboard() {
    const { logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [teacher, setTeacher] = useState(null);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [students, setStudents] = useState([]);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Session & Attention
    const [activeSession, setActiveSession] = useState(null);
    const [showQuickCheck, setShowQuickCheck] = useState(false);
    const [attentionSummary, setAttentionSummary] = useState({ total: 0, counts: {}, average: 'N/A', avgScore: 0, sessions_today: 0 });
    const [attentionHistory, setAttentionHistory] = useState([]);
    const [lastCheckTime, setLastCheckTime] = useState(null);

    // Seats
    const [lastSeatingChange, setLastSeatingChange] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);

    // Messages
    const [messages, setMessages] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    // Polls
    const [pollHistory, setPollHistory] = useState([]);

    // Quick Check reminder timer
    const quickCheckTimerRef = useRef(null);

    useEffect(() => {
        document.body.classList.add('force-landscape');
        return () => document.body.classList.remove('force-landscape');
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                const res = await api.get('/teacher/me');
                setTeacher(res.data);
                if (res.data.school_id) {
                    const cr = await api.get('/teacher/classes');
                    setClasses(cr.data);
                }
            } catch (err) { console.error('Erro ao carregar dados:', err); }
            finally { setLoading(false); }
        };
        init();
    }, []);

    useEffect(() => {
        if (!selectedClass) return;
        const load = async () => {
            try {
                const res = await api.get(`/teacher/students?class_id=${selectedClass.id}`);
                setStudents(res.data.map(s => ({ ...s, img: s.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=random` })));
                api.get(`/teacher/class/${selectedClass.id}/last-seating-change`).then(r => setLastSeatingChange(r.data?.last_change)).catch(() => { });
                loadMessages();
                loadAttentionData();
                loadActiveSession();
            } catch (err) { console.error(err); }
        };
        load();
    }, [selectedClass]);

    // Quick Check reminder every 15 min during active session
    useEffect(() => {
        if (quickCheckTimerRef.current) clearInterval(quickCheckTimerRef.current);
        if (activeSession) {
            quickCheckTimerRef.current = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    setShowQuickCheck(true);
                }
            }, 15 * 60 * 1000); // 15 minutes
        }
        return () => { if (quickCheckTimerRef.current) clearInterval(quickCheckTimerRef.current); };
    }, [activeSession]);

    const loadActiveSession = async () => {
        try {
            const res = await api.get('/teacher/session/active');
            setActiveSession(res.data);
        } catch (e) { setActiveSession(null); }
    };

    const loadAttentionData = async () => {
        if (!selectedClass) return;
        try {
            const [sumRes, histRes] = await Promise.all([
                api.get(`/teacher/attention-summary?class_id=${selectedClass.id}`),
                api.get(`/teacher/attention-history?class_id=${selectedClass.id}&days=7`)
            ]);
            setAttentionSummary(sumRes.data);
            setAttentionHistory(histRes.data || []);
            if (histRes.data?.length > 0) setLastCheckTime(histRes.data[0].checked_at);
        } catch (e) { console.error(e); }
    };

    const loadMessages = async () => {
        try {
            const res = await api.get('/teacher/messages');
            setMessages(res.data || []);
            setUnreadCount((res.data || []).filter(m => !m.read && m.sender_type !== 'teacher').length);
        } catch (e) { setMessages([]); }
    };

    useEffect(() => {
        if (teacher?.school_id) {
            loadMessages();
            const iv = setInterval(loadMessages, 5000);
            return () => clearInterval(iv);
        }
    }, [teacher]);

    const markAsRead = async (id) => {
        try {
            await api.put(`/teacher/messages/${id}/read`);
            setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (e) { console.error(e); }
    };

    const shuffleSeats = async () => {
        if (!confirm('Reorganizar carteiras?')) return;
        try {
            await api.post('/teacher/seating', { class_id: selectedClass.id, arrangement: students.map((s, i) => ({ studentId: s.id, position: i + 1 })) });
            setLastSeatingChange(new Date());
            alert('✅ Carteiras reorganizadas!');
        } catch (e) { console.error(e); }
    };

    const handleQuickCheckSuccess = (level) => {
        loadAttentionData();
        setLastCheckTime(new Date().toISOString());
    };

    if (loading) return <div className="teacher-dashboard-wrapper"><div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Carregando...</div></div>;

    if (!teacher?.school_id) {
        return (
            <div className="teacher-dashboard-wrapper"><div className="class-selection"><div className="class-box">
                <h1>Aguardando Vínculo</h1>
                <p>Olá, <strong>{teacher?.name}</strong>. Peça ao administrador para vincular você a uma escola.</p>
                <button className="btn btn-danger" onClick={logout}>Sair</button>
            </div></div></div>
        );
    }

    if (!selectedClass) {
        return (
            <div className="teacher-dashboard-wrapper"><div className="class-selection"><div className="class-box">
                <h1>Selecionar Turma</h1>
                <p>Olá, Professor(a) <strong>{teacher.name}</strong>! Selecione a turma:</p>
                {classes.length > 0 ? (
                    <div className="class-grid">
                        {classes.map(cls => (
                            <div key={cls.id} className="class-item" onClick={() => setSelectedClass(cls)}>
                                <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{cls.name}</div>
                            </div>
                        ))}
                    </div>
                ) : <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>Nenhuma turma vinculada.</div>}
                <button className="btn btn-danger" onClick={logout} style={{ marginTop: '20px' }}>Sair</button>
            </div></div></div>
        );
    }

    const daysSinceLastSeating = lastSeatingChange ? Math.floor((new Date() - new Date(lastSeatingChange)) / 86400000) : null;
    const levelConfig = {
        excelente: { emoji: '🟢', color: '#10b981', label: 'Excelente', bg: 'rgba(16,185,129,0.15)' },
        bom: { emoji: '🟡', color: '#fbbf24', label: 'Bom', bg: 'rgba(251,191,36,0.15)' },
        regular: { emoji: '🟠', color: '#f97316', label: 'Regular', bg: 'rgba(249,115,22,0.15)' },
        ruim: { emoji: '🔴', color: '#ef4444', label: 'Ruim', bg: 'rgba(239,68,68,0.15)' },
        'N/A': { emoji: '⚪', color: '#888', label: 'Sem dados', bg: 'rgba(136,136,136,0.15)' }
    };

    const menuItems = [
        { id: 'dashboard', icon: <BarChart3 size={20} />, label: 'Dashboard' },
        { id: 'lesson-plan', icon: <FileText size={20} />, label: 'Plano de Aula' },
        { id: 'students', icon: <Users size={20} />, label: 'Alunos' },
        { id: 'interactivity', icon: <MessageSquare size={20} />, label: 'Enquetes' },
        { id: 'seats', icon: <Shuffle size={20} />, label: 'Rodízio' },
        { id: 'academic', icon: <BookOpen size={20} />, label: 'Acadêmico' },
        { id: 'weekly-report', icon: <BarChart3 size={20} />, label: 'Relatório Semanal' },
        { id: 'messages', icon: <Bell size={20} />, label: 'Mensagens', badge: unreadCount }
    ];

    return (
        <div className="teacher-dashboard-wrapper">
            <div className="app-container">
                <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={24} /></button>
                <div className={`sidebar-backdrop ${mobileMenuOpen ? 'visible' : ''}`} onClick={() => setMobileMenuOpen(false)} />

                <div className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
                    <div className="logo"><h1>Edu<span>Focus</span></h1></div>
                    <ul className="menu">
                        {menuItems.map(mi => (
                            <li key={mi.id} className={`menu-item ${activeTab === mi.id ? 'active' : ''}`}
                                onClick={() => { setActiveTab(mi.id); setMobileMenuOpen(false); }}>
                                {mi.icon} <span>{mi.label}</span>
                                {mi.badge > 0 && <span className="menu-badge">{mi.badge}</span>}
                            </li>
                        ))}
                    </ul>
                    <button className="logout-btn" onClick={logout}><LogOut size={20} /> <span>Sair</span></button>
                </div>

                <div className="main-content">
                    {/* DASHBOARD */}
                    {activeTab === 'dashboard' && (
                        <DashboardTab
                            teacher={teacher} selectedClass={selectedClass} students={students}
                            activeSession={activeSession} onSessionChange={s => { setActiveSession(s); if (!s) loadAttentionData(); }}
                            attentionSummary={attentionSummary} attentionHistory={attentionHistory}
                            lastCheckTime={lastCheckTime} levelConfig={levelConfig}
                            onQuickCheck={() => setShowQuickCheck(true)} onRefresh={loadAttentionData}
                        />
                    )}
                    {activeTab === 'lesson-plan' && <LessonPlanTab classId={selectedClass.id} teacher={teacher} />}
                    {activeTab === 'students' && <StudentsTab students={students} onSelectStudent={s => setSelectedStudent(s)} />}
                    {activeTab === 'interactivity' && <InteractivityTab classId={selectedClass.id} students={students} />}
                    {activeTab === 'seats' && <SeatsTab students={students} lastSeatingChange={lastSeatingChange} daysSinceLastSeating={daysSinceLastSeating} onShuffle={shuffleSeats} />}
                    {activeTab === 'academic' && <AcademicTab students={students} classId={selectedClass.id} />}
                    {activeTab === 'weekly-report' && <WeeklyReportTab classId={selectedClass.id} teacher={teacher} />}
                    {activeTab === 'messages' && <MessagesTab messages={messages} onMarkAsRead={markAsRead} onRefresh={loadMessages} teacher={teacher} />}
                </div>

                {selectedStudent && <StudentReportModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
                {showQuickCheck && <QuickCheckModal session={activeSession} classId={selectedClass?.id} subject={activeSession?.subject || teacher?.subject || ''} onClose={() => setShowQuickCheck(false)} onSuccess={handleQuickCheckSuccess} />}

                <button className="floating-logout-btn" onClick={logout} title="Sair"><LogOut size={24} /></button>
            </div>
        </div>
    );
}

// ===== DASHBOARD TAB =====
function DashboardTab({ teacher, selectedClass, students, activeSession, onSessionChange, attentionSummary, attentionHistory, lastCheckTime, levelConfig, onQuickCheck, onRefresh }) {
    const lc = levelConfig[attentionSummary.average] || levelConfig['N/A'];
    const timeSinceCheck = lastCheckTime ? Math.floor((Date.now() - new Date(lastCheckTime).getTime()) / 60000) : null;

    return (
        <div className="fade-in">
            <div className="content-header-premium">
                <div className="header-title-group">
                    <div className="title-icon-wrapper"><BarChart3 size={32} /></div>
                    <div>
                        <h1>Painel de Comando</h1>
                        <p>{selectedClass.name} • {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                    </div>
                </div>
                <div className="header-controls-premium">
                    {activeSession && (
                        <button className="btn btn-primary" onClick={onQuickCheck} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', animation: timeSinceCheck >= 15 ? 'pulse 2s infinite' : 'none' }}>
                            ⏰ Quick Check
                        </button>
                    )}
                    <button className="btn-small-round" title="Atualizar" onClick={onRefresh}><RefreshCw size={18} /></button>
                </div>
            </div>

            <SessionControl classId={selectedClass.id} teacher={teacher} activeSession={activeSession} onSessionChange={onSessionChange} />

            {/* Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: `3px solid ${lc.color}`, background: lc.bg }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Atenção Média Hoje</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: lc.color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {lc.emoji} {lc.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Score: {attentionSummary.avgScore}/4.0</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Quick Checks Hoje</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{attentionSummary.total}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                        {timeSinceCheck !== null ? `Último: ${timeSinceCheck} min atrás` : 'Nenhum hoje'}
                    </div>
                </div>
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Sessões Hoje</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{attentionSummary.sessions_today}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Aulas registradas</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Alunos na Turma</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{students.length}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{selectedClass.name}</div>
                </div>
            </div>

            {/* Attention Distribution */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart3 size={18} /> Distribuição dos Checks</h3>
                    {['excelente', 'bom', 'regular', 'ruim'].map(level => {
                        const c = levelConfig[level];
                        const count = attentionSummary.counts?.[level] || 0;
                        const pct = attentionSummary.total > 0 ? Math.round((count / attentionSummary.total) * 100) : 0;
                        return (
                            <div key={level} style={{ marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                                    <span>{c.emoji} {c.label}</span><span>{count} ({pct}%)</span>
                                </div>
                                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: '3px', transition: 'width 0.5s' }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={18} /> Últimos Quick Checks</h3>
                    {attentionHistory.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>Nenhum check registrado ainda</p>
                    ) : (
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {attentionHistory.slice(0, 8).map((h, i) => {
                                const hc = levelConfig[h.level] || levelConfig['N/A'];
                                return (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span>{hc.emoji}</span>
                                            <span style={{ fontSize: '0.85rem' }}>{hc.label}</span>
                                            {h.subject && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({h.subject})</span>}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            {new Date(h.checked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ===== STUDENTS TAB =====
function StudentsTab({ students, onSelectStudent }) {
    return (
        <div className="fade-in">
            <div className="content-header"><div className="page-title"><h1>Meus Alunos</h1><div className="page-subtitle">Visualize e acompanhe cada aluno</div></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {students.map(s => (
                    <div key={s.id} className="glass-panel" style={{ padding: '1.25rem', cursor: 'pointer', transition: 'transform 0.2s' }}
                        onClick={() => onSelectStudent(s)} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <img src={s.img} alt={s.name} style={{ width: '50px', height: '50px', borderRadius: '50%' }} />
                            <div><div style={{ fontWeight: 'bold' }}>{s.name}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.class_name}</div></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ===== INTERACTIVITY TAB (Manual Polls) =====
function InteractivityTab({ classId, students }) {
    const [poll, setPoll] = useState({ question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A' });
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadHistory = async () => {
        try { const r = await api.get(`/teacher/polls/history?class_id=${classId}`); setHistory(r.data || []); } catch (e) { }
    };
    useEffect(() => { loadHistory(); }, [classId]);

    const handleCreate = async () => {
        if (!poll.question || !poll.option_a || !poll.option_b) return alert('Preencha pergunta e pelo menos 2 opções');
        setLoading(true);
        try {
            await api.post('/teacher/polls/create', { ...poll, class_id: classId });
            alert('✅ Enquete criada!');
            setPoll({ question: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A' });
            loadHistory();
        } catch (e) { alert('Erro ao criar enquete'); }
        finally { setLoading(false); }
    };

    return (
        <div className="fade-in">
            <div className="content-header"><div className="page-title"><h1>Enquetes Interativas</h1><div className="page-subtitle">Crie perguntas para a turma</div></div></div>
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Nova Enquete</h3>
                <input className="input-field" placeholder="Pergunta..." value={poll.question} onChange={e => setPoll({ ...poll, question: e.target.value })}
                    style={{ width: '100%', padding: '0.7rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    {['A', 'B', 'C', 'D'].map(opt => (
                        <input key={opt} className="input-field" placeholder={`Opção ${opt}`} value={poll[`option_${opt.toLowerCase()}`]}
                            onChange={e => setPoll({ ...poll, [`option_${opt.toLowerCase()}`]: e.target.value })}
                            style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.85rem' }}>Resposta Correta:</label>
                    <select value={poll.correct_answer} onChange={e => setPoll({ ...poll, correct_answer: e.target.value })}
                        style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px' }}>
                        {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <button className="btn btn-primary" onClick={handleCreate} disabled={loading} style={{ width: '100%' }}>{loading ? 'Criando...' : 'Criar Enquete'}</button>
            </div>
            {history.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Histórico</h3>
                    {history.map(p => (
                        <div key={p.id} style={{ padding: '1rem', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>{p.question}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.total_responses} respostas • {p.correct_responses} corretas</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ===== SEATS TAB =====
function SeatsTab({ students, lastSeatingChange, daysSinceLastSeating, onShuffle }) {
    const needsChange = daysSinceLastSeating === null || daysSinceLastSeating >= 15;
    return (
        <div className="fade-in">
            <div className="content-header"><div className="page-title"><h1>Rodízio de Carteiras</h1><div className="page-subtitle">Reorganize os alunos</div></div></div>
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3>Status</h3>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{lastSeatingChange ? `Última: ${new Date(lastSeatingChange).toLocaleDateString('pt-BR')}` : 'Nenhuma mudança'}</p>
                        {needsChange && <p style={{ color: '#f97316', fontWeight: 'bold', marginTop: '0.3rem' }}>⚠️ Recomendado reorganizar</p>}
                    </div>
                    <button className="btn btn-primary" onClick={onShuffle}><Shuffle size={20} /> Reorganizar</button>
                </div>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Disposição Atual</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                    {students.map((s, i) => (
                        <div key={s.id} className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Pos {i + 1}</div>
                            <img src={s.img} alt={s.name} style={{ width: '45px', height: '45px', borderRadius: '50%', marginBottom: '0.3rem' }} />
                            <div style={{ fontSize: '0.8rem' }}>{s.name}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ===== ACADEMIC TAB =====
function AcademicTab({ students, classId }) {
    const [subTab, setSubTab] = useState('grades');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [loading, setLoading] = useState(false);
    const [gradeData, setGradeData] = useState({ subject: '', value: '', term: '1º Bimestre' });
    const [reportData, setReportData] = useState({ title: '', content: '' });

    const handleSaveGrade = async (e) => {
        e.preventDefault();
        if (!selectedStudentId) return alert('Selecione um aluno');
        setLoading(true);
        try {
            await api.post('/teacher/grades', { student_id: selectedStudentId, subject: gradeData.subject, value: gradeData.value, term: gradeData.term, class_id: classId });
            alert('Nota salva!'); setGradeData(p => ({ ...p, value: '' }));
        } catch (e) { alert('Erro ao salvar'); } finally { setLoading(false); }
    };

    const handleSaveReport = async (e) => {
        e.preventDefault();
        if (!selectedStudentId) return alert('Selecione um aluno');
        setLoading(true);
        try {
            await api.post('/teacher/reports', { student_id: selectedStudentId, title: reportData.title, content: reportData.content, class_id: classId });
            alert('Relatório salvo!'); setReportData({ title: '', content: '' });
        } catch (e) { alert('Erro ao salvar'); } finally { setLoading(false); }
    };

    const inputStyle = { width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px' };

    return (
        <div className="fade-in">
            <div className="content-header"><div className="page-title"><h1>Acadêmico</h1><div className="page-subtitle">Notas e relatórios</div></div></div>
            <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    {['grades', 'reports'].map(t => (
                        <button key={t} className={`btn ${subTab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSubTab(t)}>
                            {t === 'grades' ? 'Lançar Notas' : 'Criar Relatórios'}
                        </button>
                    ))}
                </div>
                <div style={{ maxWidth: '400px', marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Aluno</label>
                    <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} style={inputStyle}>
                        <option value="">-- Selecione --</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                {subTab === 'grades' && (
                    <form onSubmit={handleSaveGrade} style={{ maxWidth: '500px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                            <div><label style={{ display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>Matéria</label><input type="text" required style={inputStyle} value={gradeData.subject} onChange={e => setGradeData({ ...gradeData, subject: e.target.value })} /></div>
                            <div><label style={{ display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>Nota (0-10)</label><input type="number" required step="0.1" max="10" min="0" style={inputStyle} value={gradeData.value} onChange={e => setGradeData({ ...gradeData, value: e.target.value })} /></div>
                        </div>
                        <div style={{ marginBottom: '20px' }}><label style={{ display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>Bimestre</label>
                            <select style={inputStyle} value={gradeData.term} onChange={e => setGradeData({ ...gradeData, term: e.target.value })}>
                                {['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre', 'Recuperação'].map(t => <option key={t}>{t}</option>)}
                            </select></div>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '12px' }}>{loading ? 'Salvando...' : 'Salvar Nota'}</button>
                    </form>
                )}
                {subTab === 'reports' && (
                    <form onSubmit={handleSaveReport} style={{ maxWidth: '600px' }}>
                        <div style={{ marginBottom: '15px' }}><label style={{ display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>Título</label><input type="text" required style={inputStyle} value={reportData.title} onChange={e => setReportData({ ...reportData, title: e.target.value })} /></div>
                        <div style={{ marginBottom: '20px' }}><label style={{ display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>Conteúdo</label>
                            <textarea required rows={6} style={{ ...inputStyle, resize: 'vertical' }} value={reportData.content} onChange={e => setReportData({ ...reportData, content: e.target.value })} /></div>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '12px' }}>{loading ? 'Salvando...' : 'Salvar Relatório'}</button>
                    </form>
                )}
            </div>
        </div>
    );
}

// ===== MESSAGES TAB =====
function MessagesTab({ messages, onMarkAsRead, onRefresh, teacher }) {
    const [showCompose, setShowCompose] = useState(false);
    const [msgText, setMsgText] = useState('');
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        if (!msgText.trim()) return;
        setSending(true);
        try {
            await api.post('/messages/send', { from_user_type: 'teacher', from_user_id: teacher.id, to_user_type: 'school_admin', to_user_id: teacher.school_id, message: msgText });
            alert('Mensagem enviada!'); setMsgText(''); setShowCompose(false); onRefresh();
        } catch (e) { alert('Erro ao enviar'); } finally { setSending(false); }
    };

    return (
        <div className="fade-in">
            <div className="content-header">
                <div className="page-title"><h1>Mensagens</h1><div className="page-subtitle">Chat com a Coordenação</div></div>
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={() => setShowCompose(true)}><Send size={18} /> Nova Mensagem</button>
                    <button className="btn-icon" title="Atualizar" onClick={onRefresh}><RefreshCw size={20} /></button>
                </div>
            </div>
            {showCompose && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--accent-primary)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Nova Mensagem</h3>
                    <textarea className="input-field" style={{ width: '100%', minHeight: '100px', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '1rem' }}
                        value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Digite sua mensagem..." disabled={sending} />
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button className="btn" onClick={() => setShowCompose(false)} disabled={sending}>Cancelar</button>
                        <button className="btn btn-primary" onClick={handleSend} disabled={sending}>{sending ? 'Enviando...' : 'Enviar'}</button>
                    </div>
                </div>
            )}
            {messages.length === 0 ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <Bell size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} /><h3>Nenhuma mensagem</h3>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {messages.map(m => {
                        const isMe = m.sender_type === 'teacher';
                        return (
                            <div key={m.id} className="glass-panel" style={{ padding: '1.25rem', borderLeft: isMe ? '3px solid #10b981' : (m.read ? '3px solid #666' : '3px solid var(--accent-primary)'), marginLeft: isMe ? '2rem' : 0, marginRight: isMe ? 0 : '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <strong style={{ color: isMe ? '#10b981' : 'var(--text-primary)' }}>{isMe ? 'Você' : (m.from || 'Coordenação')}</strong>
                                        {!isMe && !m.read && <span style={{ background: 'var(--accent-primary)', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem' }}>NOVA</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(m.created_at).toLocaleString('pt-BR')}</span>
                                        {!isMe && !m.read && <button className="btn-icon" onClick={() => onMarkAsRead(m.id)}><CheckCircle size={16} /></button>}
                                    </div>
                                </div>
                                <div style={{ lineHeight: '1.5' }}>{m.message || m.content}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ===== STUDENT REPORT MODAL =====
function StudentReportModal({ student, onClose }) {
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={onClose}>
            <div className="glass-panel" style={{ maxWidth: '700px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <img src={student.img} alt={student.name} style={{ width: '60px', height: '60px', borderRadius: '50%' }} />
                    <div><h2 style={{ margin: 0 }}>{student.name}</h2><p style={{ margin: 0, color: 'var(--text-secondary)' }}>{student.class_name}</p></div>
                </div>
                <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>Fechar</button>
            </div>
        </div>
    );
}
