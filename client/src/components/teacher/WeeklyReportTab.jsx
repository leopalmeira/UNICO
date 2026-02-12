import { useState, useEffect } from 'react';
import { BarChart3, FileText, Send, Calendar } from 'lucide-react';
import api from '../../api/axios';

export default function WeeklyReportTab({ classId, teacher }) {
    const [reports, setReports] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        subject: teacher?.subject || '', summary: '', highlights: '', concerns: '',
        week_start: getMonday(), week_end: getFriday()
    });

    function getMonday() {
        const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
        return d.toISOString().split('T')[0];
    }
    function getFriday() {
        const d = new Date(); d.setDate(d.getDate() - d.getDay() + 5);
        return d.toISOString().split('T')[0];
    }

    const loadReports = async () => {
        try {
            const res = await api.get(`/teacher/weekly-reports?class_id=${classId}`);
            setReports(res.data || []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { loadReports(); }, [classId]);

    const handleGenerate = async () => {
        if (!form.subject) return alert('Informe a matéria');
        setLoading(true);
        try {
            const res = await api.post('/teacher/weekly-report', { ...form, class_id: classId });
            alert(`Relatório gerado! Atenção média: ${res.data.avg_attention} (${res.data.total_checks} avaliações)`);
            setShowForm(false);
            loadReports();
        } catch (e) { alert('Erro ao gerar relatório'); }
        finally { setLoading(false); }
    };

    const levelConfig = {
        excelente: { emoji: '🟢', color: '#10b981', label: 'Excelente' },
        bom: { emoji: '🟡', color: '#fbbf24', label: 'Bom' },
        regular: { emoji: '🟠', color: '#f97316', label: 'Regular' },
        ruim: { emoji: '🔴', color: '#ef4444', label: 'Ruim' }
    };

    return (
        <div className="fade-in">
            <div className="content-header">
                <div className="page-title">
                    <h1>📊 Relatório Semanal</h1>
                    <div className="page-subtitle">Resumo automático da semana para pais e coordenação</div>
                </div>
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><Send size={18} /> Gerar Relatório</button>
                </div>
            </div>

            {showForm && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--accent-primary)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Gerar Relatório Semanal</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Matéria</label>
                            <input className="input-field" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                                style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Início da Semana</label>
                            <input type="date" value={form.week_start} onChange={e => setForm({ ...form, week_start: e.target.value })}
                                style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fim da Semana</label>
                            <input type="date" value={form.week_end} onChange={e => setForm({ ...form, week_end: e.target.value })}
                                style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Resumo / Observações</label>
                        <textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="Como foi a semana..."
                            style={{ width: '100%', minHeight: '60px', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Destaques Positivos</label>
                            <textarea value={form.highlights} onChange={e => setForm({ ...form, highlights: e.target.value })} placeholder="O que deu certo..."
                                style={{ width: '100%', minHeight: '50px', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', resize: 'vertical' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pontos de Atenção</label>
                            <textarea value={form.concerns} onChange={e => setForm({ ...form, concerns: e.target.value })} placeholder="O que precisa melhorar..."
                                style={{ width: '100%', minHeight: '50px', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', resize: 'vertical' }} />
                        </div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        💡 A atenção média é calculada automaticamente com base nos Quick Checks feitos durante a semana.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>{loading ? 'Gerando...' : 'Gerar e Publicar'}</button>
                    </div>
                </div>
            )}

            {reports.length === 0 ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <BarChart3 size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
                    <h3>Nenhum relatório gerado</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Gere seu primeiro relatório semanal</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {reports.map(r => {
                        const lc = levelConfig[r.avg_attention] || levelConfig.bom;
                        return (
                            <div key={r.id} className="glass-panel" style={{ padding: '1.25rem', borderLeft: `3px solid ${lc.color}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{r.subject}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            <Calendar size={12} /> {new Date(r.week_start).toLocaleDateString('pt-BR')} — {new Date(r.week_end).toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: `${lc.color}20`, borderRadius: '20px', border: `1px solid ${lc.color}40` }}>
                                        <span>{lc.emoji}</span>
                                        <span style={{ fontWeight: 'bold', color: lc.color }}>{lc.label}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                                    <div><strong>Sessões:</strong> {r.total_sessions}</div>
                                    <div><strong>Avaliações:</strong> {r.total_checks}</div>
                                </div>
                                {r.summary && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{r.summary}</div>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
