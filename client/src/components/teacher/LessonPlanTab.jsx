import { useState, useEffect } from 'react';
import { FileText, Plus, Calendar, Trash2, CheckCircle, Edit3 } from 'lucide-react';
import api from '../../api/axios';

export default function LessonPlanTab({ classId, teacher }) {
    const [plans, setPlans] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ subject: teacher?.subject || '', topic: '', objectives: '', content: '', resources: '', planned_date: new Date().toISOString().split('T')[0] });

    const loadPlans = async () => {
        try {
            const res = await api.get(`/teacher/lesson-plans?class_id=${classId}`);
            setPlans(res.data || []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { loadPlans(); }, [classId]);

    const handleSave = async () => {
        if (!form.subject || !form.topic) return alert('Preencha matéria e tópico');
        setLoading(true);
        try {
            await api.post('/teacher/lesson-plans', { ...form, class_id: classId });
            setForm({ subject: teacher?.subject || '', topic: '', objectives: '', content: '', resources: '', planned_date: new Date().toISOString().split('T')[0] });
            setShowForm(false);
            loadPlans();
        } catch (e) { alert('Erro ao salvar'); }
        finally { setLoading(false); }
    };

    const deletePlan = async (id) => {
        if (!confirm('Remover este plano?')) return;
        try { await api.delete(`/teacher/lesson-plans/${id}`); loadPlans(); } catch (e) { console.error(e); }
    };

    const markDone = async (plan) => {
        try {
            await api.put(`/teacher/lesson-plans/${plan.id}`, { ...plan, status: 'done' });
            loadPlans();
        } catch (e) { console.error(e); }
    };

    const statusColors = { pending: '#fbbf24', done: '#10b981' };
    const statusLabels = { pending: 'Pendente', done: 'Concluído' };

    return (
        <div className="fade-in">
            <div className="content-header">
                <div className="page-title">
                    <h1>📋 Plano de Aula</h1>
                    <div className="page-subtitle">Organize e registre o que será ensinado</div>
                </div>
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        <Plus size={18} /> Novo Plano
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--accent-primary)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Novo Plano de Aula</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Matéria *</label>
                            <input className="input-field" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Matemática"
                                style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tópico *</label>
                            <input className="input-field" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="Equações do 2º grau"
                                style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Data</label>
                            <input type="date" className="input-field" value={form.planned_date} onChange={e => setForm({ ...form, planned_date: e.target.value })}
                                style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Objetivos</label>
                        <textarea className="input-field" value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })} placeholder="O que os alunos devem aprender..."
                            style={{ width: '100%', minHeight: '60px', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', resize: 'vertical' }} />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Conteúdo / Atividades</label>
                        <textarea className="input-field" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Descreva as atividades planejadas..."
                            style={{ width: '100%', minHeight: '80px', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar Plano'}</button>
                    </div>
                </div>
            )}

            {plans.length === 0 ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <FileText size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
                    <h3>Nenhum plano cadastrado</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Crie seu primeiro plano de aula</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {plans.map(p => (
                        <div key={p.id} className="glass-panel" style={{ padding: '1.25rem', borderLeft: `3px solid ${statusColors[p.status] || '#fbbf24'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{p.subject} — {p.topic}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', marginTop: '0.3rem' }}>
                                        <span><Calendar size={12} /> {new Date(p.planned_date).toLocaleDateString('pt-BR')}</span>
                                        <span style={{ color: statusColors[p.status] }}>{statusLabels[p.status] || p.status}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {p.status !== 'done' && (
                                        <button className="btn-icon" title="Marcar como concluído" onClick={() => markDone(p)}><CheckCircle size={18} style={{ color: '#10b981' }} /></button>
                                    )}
                                    <button className="btn-icon" title="Remover" onClick={() => deletePlan(p.id)}><Trash2 size={18} style={{ color: '#ef4444' }} /></button>
                                </div>
                            </div>
                            {p.objectives && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}><strong>Objetivos:</strong> {p.objectives}</div>}
                            {p.content && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}><strong>Conteúdo:</strong> {p.content}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
