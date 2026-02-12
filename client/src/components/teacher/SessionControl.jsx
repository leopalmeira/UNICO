import { useState, useEffect } from 'react';
import { Play, Square, Clock, BookOpen } from 'lucide-react';
import api from '../../api/axios';

const MODES = [
    { id: 'expositiva', label: 'Aula Expositiva', icon: '📖' },
    { id: 'debate', label: 'Debate / Discussão', icon: '💬' },
    { id: 'prova', label: 'Prova / Avaliação', icon: '📝' },
    { id: 'trabalho_grupo', label: 'Trabalho em Grupo', icon: '👥' }
];

export default function SessionControl({ classId, teacher, activeSession, onSessionChange }) {
    const [subject, setSubject] = useState(teacher?.subject || '');
    const [topic, setTopic] = useState('');
    const [mode, setMode] = useState('expositiva');
    const [loading, setLoading] = useState(false);
    const [elapsed, setElapsed] = useState('00:00:00');

    useEffect(() => {
        if (!activeSession) { setElapsed('00:00:00'); return; }
        const tick = () => {
            const start = new Date(activeSession.started_at).getTime();
            const diff = Date.now() - start;
            const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
            setElapsed(`${h}:${m}:${s}`);
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [activeSession]);

    const startSession = async () => {
        if (!subject.trim()) return alert('Informe a matéria');
        setLoading(true);
        try {
            const res = await api.post('/teacher/session/start', {
                class_id: classId, subject: subject.trim(), topic: topic.trim(), mode
            });
            onSessionChange?.({ id: res.data.session_id, subject, topic, mode, started_at: new Date().toISOString(), status: 'active' });
        } catch (e) { console.error(e); alert('Erro ao iniciar sessão'); }
        finally { setLoading(false); }
    };

    const endSession = async () => {
        if (!confirm('Encerrar a aula atual?')) return;
        setLoading(true);
        try {
            await api.post('/teacher/session/end', { session_id: activeSession?.id });
            onSessionChange?.(null);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    if (activeSession) {
        const modeObj = MODES.find(m => m.id === activeSession.mode) || MODES[0];
        return (
            <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid rgba(16,185,129,0.3)', background: 'linear-gradient(135deg,rgba(16,185,129,0.08),rgba(6,78,59,0.08))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                            {modeObj.icon}
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="pulse-green" style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                                {activeSession.subject} — {modeObj.label}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {activeSession.topic || 'Sem tópico definido'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 'bold' }}>
                            <Clock size={16} /> {elapsed}
                        </div>
                        <button className="btn" onClick={endSession} disabled={loading}
                            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Square size={16} /> Encerrar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={20} /> Iniciar Aula
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Matéria *</label>
                    <input className="input-field" placeholder="Ex: Matemática" value={subject} onChange={e => setSubject(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tópico</label>
                    <input className="input-field" placeholder="Ex: Equações" value={topic} onChange={e => setTopic(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                </div>
            </div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Modo da Aula</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                {MODES.map(m => (
                    <button key={m.id} onClick={() => setMode(m.id)} style={{
                        padding: '0.7rem 0.5rem', borderRadius: '8px', border: mode === m.id ? '2px solid var(--accent-primary)' : '2px solid rgba(255,255,255,0.08)',
                        background: mode === m.id ? 'rgba(99,102,241,0.15)' : 'transparent', cursor: 'pointer', textAlign: 'center', color: '#fff', fontSize: '0.8rem'
                    }}>
                        <div style={{ fontSize: '1.3rem', marginBottom: '2px' }}>{m.icon}</div>
                        {m.label}
                    </button>
                ))}
            </div>
            <button className="btn btn-primary" onClick={startSession} disabled={loading} style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Play size={18} /> {loading ? 'Iniciando...' : 'Iniciar Sessão de Aula'}
            </button>
        </div>
    );
}
