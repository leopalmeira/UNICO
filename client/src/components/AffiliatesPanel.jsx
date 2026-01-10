import { useState, useEffect } from 'react';
import { Building2, Copy, Check, Plus, Trash2, RefreshCw } from 'lucide-react';
import api from '../api/axios';

export default function AffiliatesPanel({ schoolId, onSwitchSchool }) {
    const [affiliates, setAffiliates] = useState([]);
    const [parents, setParents] = useState([]);
    const [showTokenModal, setShowTokenModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [generatedToken, setGeneratedToken] = useState('');
    const [joinToken, setJoinToken] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadAffiliates();
    }, [schoolId]);

    const loadAffiliates = async () => {
        try {
            const res = await api.get('/school/affiliates/list');
            setAffiliates(res.data.affiliates || []);
            setParents(res.data.parents || []);
        } catch (err) {
            console.error('Erro ao carregar filiais:', err);
        }
    };

    const generateToken = async () => {
        setLoading(true);
        try {
            const res = await api.post('/school/affiliates/generate-token');
            setGeneratedToken(res.data.token);
            setShowTokenModal(true);
        } catch (err) {
            alert('Erro ao gerar token: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const copyToken = () => {
        navigator.clipboard.writeText(generatedToken);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const joinAffiliate = async () => {
        if (!joinToken.trim()) {
            alert('Digite o token fornecido pela escola matriz');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/school/affiliates/join', { token: joinToken.toUpperCase() });
            alert(res.data.message);
            setShowJoinModal(false);
            setJoinToken('');
            loadAffiliates();
        } catch (err) {
            alert('Erro: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeAffiliate = async (affiliateId, name) => {
        if (!confirm(`Deseja realmente remover o vínculo com "${name}"?`)) return;

        try {
            await api.delete(`/school/affiliates/remove/${affiliateId}`);
            alert('Vínculo removido com sucesso!');
            loadAffiliates();
        } catch (err) {
            alert('Erro ao remover vínculo: ' + (err.response?.data?.message || err.message));
        }
    };

    const switchToSchool = async (targetSchoolId, schoolName) => {
        try {
            const res = await api.post(`/school/affiliates/switch/${targetSchoolId}`);
            if (onSwitchSchool) {
                onSwitchSchool(res.data.school);
            }
            alert(`Agora visualizando: ${schoolName}`);
        } catch (err) {
            alert('Erro ao alternar escola: ' + (err.response?.data?.message || err.message));
        }
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>🏢 Gestão de Filiais</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-primary" onClick={generateToken} disabled={loading}>
                        <Plus size={18} /> Gerar Token
                    </button>
                    <button className="btn" style={{ background: 'var(--accent-secondary)' }} onClick={() => setShowJoinModal(true)}>
                        <Building2 size={18} /> Vincular à Matriz
                    </button>
                </div>
            </div>

            {/* Info Box */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(99, 102, 241, 0.1)', borderLeft: '4px solid var(--accent-primary)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>💡 Como funciona?</h3>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '1.5rem' }}>
                    <li><strong>Escola Matriz:</strong> Gere um token e compartilhe com a escola filial</li>
                    <li><strong>Escola Filial:</strong> Use o token recebido para se vincular à matriz</li>
                    <li>Após vinculadas, a matriz pode visualizar e gerenciar dados de todas as filiais</li>
                    <li>Use o menu "Filiais" para alternar entre as escolas do grupo</li>
                    <li><strong>Desvincular:</strong> Apenas a escola matriz pode remover o vínculo com filiais</li>
                </ul>
            </div>

            {/* Escolas Filiais */}
            {affiliates.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Building2 size={24} /> Filiais Vinculadas ({affiliates.length})
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
                        {affiliates.map(affiliate => (
                            <div key={affiliate.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                                            {affiliate.name}
                                        </h3>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            {affiliate.email}
                                        </p>
                                        {affiliate.address && (
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                                📍 {affiliate.address}
                                            </p>
                                        )}
                                    </div>
                                    <span style={{
                                        background: 'rgba(16, 185, 129, 0.2)',
                                        color: '#10b981',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '999px',
                                        fontSize: '0.75rem',
                                        fontWeight: '600'
                                    }}>
                                        FILIAL
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Vinculada em: {new Date(affiliate.created_at).toLocaleDateString('pt-BR')}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1, fontSize: '0.875rem', padding: '0.5rem' }}
                                        onClick={() => switchToSchool(affiliate.school_id, affiliate.name)}
                                    >
                                        <RefreshCw size={16} /> Visualizar
                                    </button>
                                    <button
                                        className="btn"
                                        style={{ background: 'var(--danger)', padding: '0.5rem' }}
                                        onClick={() => removeAffiliate(affiliate.id, affiliate.name)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Escolas Matriz */}
            {parents.length > 0 && (
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Building2 size={24} /> Escola Matriz ({parents.length})
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
                        {parents.map(parent => (
                            <div key={parent.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                                            {parent.name}
                                        </h3>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            {parent.email}
                                        </p>
                                        {parent.address && (
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                                📍 {parent.address}
                                            </p>
                                        )}
                                    </div>
                                    <span style={{
                                        background: 'rgba(99, 102, 241, 0.2)',
                                        color: '#6366f1',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '999px',
                                        fontSize: '0.75rem',
                                        fontWeight: '600'
                                    }}>
                                        MATRIZ
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Vinculada em: {new Date(parent.created_at).toLocaleDateString('pt-BR')}
                                </div>
                                <div style={{
                                    padding: '0.75rem',
                                    background: 'rgba(99, 102, 241, 0.1)',
                                    borderRadius: 'var(--radius)',
                                    border: '1px solid rgba(99, 102, 241, 0.3)'
                                }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                        ℹ️ Apenas a escola matriz pode desvincular filiais
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {affiliates.length === 0 && parents.length === 0 && (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <Building2 size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem', opacity: 0.5 }} />
                    <h3 style={{ marginBottom: '0.5rem' }}>Nenhuma filial vinculada</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        Gere um token para vincular escolas filiais ou use um token para se vincular a uma escola matriz.
                    </p>
                </div>
            )}

            {/* Token Generation Modal */}
            {showTokenModal && (
                <div className="modal-overlay" onClick={() => setShowTokenModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
                            🎫 Token Gerado
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            Compartilhe este token com a escola filial. Eles devem usar este código para se vincular à sua escola.
                        </p>
                        <div style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '1.5rem',
                            borderRadius: 'var(--radius)',
                            marginBottom: '1.5rem',
                            border: '2px dashed var(--accent-primary)'
                        }}>
                            <div style={{
                                fontSize: '2rem',
                                fontWeight: '700',
                                textAlign: 'center',
                                letterSpacing: '0.2em',
                                color: 'var(--accent-primary)',
                                fontFamily: 'monospace'
                            }}>
                                {generatedToken}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                                onClick={copyToken}
                            >
                                {copied ? <><Check size={18} /> Copiado!</> : <><Copy size={18} /> Copiar Token</>}
                            </button>
                            <button
                                className="btn"
                                style={{ background: 'var(--bg-secondary)' }}
                                onClick={() => setShowTokenModal(false)}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Join Modal */}
            {showJoinModal && (
                <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
                            🔗 Vincular à Escola Matriz
                        </h2>
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: 'var(--radius)',
                            padding: '1rem',
                            marginBottom: '1rem'
                        }}>
                            <p style={{ fontSize: '0.875rem', color: '#fbbf24', fontWeight: '600', marginBottom: '0.5rem' }}>
                                ⚠️ Atenção:
                            </p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                Use esta opção apenas se você recebeu um token de OUTRA escola (matriz).
                                Não tente usar um token que você mesmo gerou.
                            </p>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            Digite o token fornecido pela escola matriz para estabelecer o vínculo.
                        </p>
                        <input
                            className="input-field"
                            type="text"
                            placeholder="Digite o token (ex: ABC123XYZ456)"
                            value={joinToken}
                            onChange={(e) => setJoinToken(e.target.value.toUpperCase())}
                            style={{
                                marginBottom: '1.5rem',
                                textAlign: 'center',
                                fontSize: '1.25rem',
                                letterSpacing: '0.1em',
                                fontFamily: 'monospace'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                                onClick={joinAffiliate}
                                disabled={loading}
                            >
                                {loading ? 'Vinculando...' : 'Confirmar Vínculo'}
                            </button>
                            <button
                                className="btn"
                                style={{ background: 'var(--bg-secondary)' }}
                                onClick={() => setShowJoinModal(false)}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
