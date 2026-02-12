import { useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import api from '../../api/axios';

const levels = [
    { id: 'excelente', emoji: '🟢', label: 'Excelente', color: '#10b981', desc: 'Turma totalmente focada' },
    { id: 'bom', emoji: '🟡', label: 'Bom', color: '#fbbf24', desc: 'Maioria atenta' },
    { id: 'regular', emoji: '🟠', label: 'Regular', color: '#f97316', desc: 'Alguma dispersão' },
    { id: 'ruim', emoji: '🔴', label: 'Ruim', color: '#ef4444', desc: 'Turma dispersa' }
];

export default function QuickCheckModal({ session, classId, subject, onClose, onSuccess }) {
    const [selected, setSelected] = useState(null);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            await api.post('/teacher/attention-check', {
                session_id: session?.id,
                class_id: classId,
                subject,
                level: selected,
                notes
            });
            onSuccess?.(selected);
            onClose();
        } catch (err) {
            console.error(err);
            alert('Erro ao registrar avaliação');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
            <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.3rem' }}>⏰ Quick Check - Atenção da Turma</h2>
                    <button className="btn-icon" onClick={onClose}><X size={20} /></button>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Como está o nível de atenção da turma agora?
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    {levels.map(l => (
                        <button key={l.id} onClick={() => setSelected(l.id)} style={{
                            padding: '1.2rem', borderRadius: '12px', border: selected === l.id ? `2px solid ${l.color}` : '2px solid rgba(255,255,255,0.1)',
                            background: selected === l.id ? `${l.color}20` : 'rgba(255,255,255,0.03)',
                            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', color: '#fff'
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>{l.emoji}</div>
                            <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{l.label}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{l.desc}</div>
                        </button>
                    ))}
                </div>
                <textarea className="input-field" placeholder="Observações (opcional)..." value={notes} onChange={e => setNotes(e.target.value)}
                    style={{ width: '100%', minHeight: '60px', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.75rem', borderRadius: '8px', resize: 'vertical' }} />
                <button className="btn btn-primary" onClick={handleSubmit} disabled={!selected || saving} style={{ width: '100%', padding: '12px' }}>
                    {saving ? 'Salvando...' : <><CheckCircle size={18} /> Registrar Avaliação</>}
                </button>
            </div>
        </div>
    );
}
