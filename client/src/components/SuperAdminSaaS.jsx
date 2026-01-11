import React, { useState, useEffect } from 'react';
import { DollarSign, Save, Edit2, X, TrendingUp, Users, Building2, Search, AlertCircle } from 'lucide-react';

const SuperAdminSaaS = () => {
    const [config, setConfig] = useState({ default_price: 6.50 });
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingSchool, setEditingSchool] = useState(null);
    const [newPrice, setNewPrice] = useState('');
    const [globalPrice, setGlobalPrice] = useState('6.50');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [configRes, schoolsRes] = await Promise.all([
                fetch('http://localhost:5000/api/saas/admin/config').then(r => r.json()),
                fetch('http://localhost:5000/api/saas/admin/schools').then(r => r.json())
            ]);
            setConfig(configRes);
            setGlobalPrice(configRes.default_price.toString());
            setSchools(schoolsRes);
        } catch (error) {
            console.error("Erro ao carregar dados SaaS:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateGlobal = async () => {
        try {
            await fetch('http://localhost:5000/api/saas/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ default_price: parseFloat(globalPrice) })
            });
            alert("Preço global atualizado!");
            fetchData();
        } catch (error) {
            alert("Erro ao atualizar preço global");
        }
    };

    const handleUpdateSchool = async () => {
        if (!editingSchool) return;
        try {
            const price = newPrice === '' ? null : parseFloat(newPrice);
            await fetch(`http://localhost:5000/api/saas/admin/school/${editingSchool.id}/price`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ custom_price: price })
            });
            setEditingSchool(null);
            fetchData();
        } catch (error) {
            alert("Erro ao atualizar escola");
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#60a5fa' }}>Carregando gestão financeira...</div>;

    // Métricas
    const totalRevenue = schools.reduce((acc, s) => acc + s.current_invoice_total, 0);
    const totalStudents = schools.reduce((acc, s) => acc + s.student_count, 0);
    const payingSchools = schools.filter(s => s.current_invoice_total > 0).length;

    const filteredSchools = schools.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fade-in" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '8px', borderRadius: '12px', display: 'flex' }}>
                        <DollarSign size={32} style={{ color: '#60a5fa' }} />
                    </div>
                    Gestão Financeira SaaS
                </h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '1rem' }}>
                    Administre o faturamento recorrente e configure preços por escola
                </p>
            </div>

            {/* Grid de Cards de Métricas */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2rem'
            }}>
                {/* Card MRR */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#10b981' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>Faturamento Mensal (MRR)</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'white', marginTop: '0.5rem' }}>
                                <span style={{ fontSize: '1.5rem', marginRight: '4px', color: '#10b981' }}>R$</span>
                                {totalRevenue.toFixed(2).replace('.', ',')}
                            </div>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '12px' }}>
                            <TrendingUp size={24} style={{ color: '#10b981' }} />
                        </div>
                    </div>
                </div>

                {/* Card Alunos */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#3b82f6' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>Total de Alunos</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'white', marginTop: '0.5rem' }}>
                                {totalStudents}
                            </div>
                        </div>
                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '12px' }}>
                            <Users size={24} style={{ color: '#3b82f6' }} />
                        </div>
                    </div>
                </div>

                {/* Card Escolas */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#8b5cf6' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>Escolas Pagantes</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'white', marginTop: '0.5rem' }}>
                                {payingSchools} <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: '400' }}>/ {schools.length}</span>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '10px', borderRadius: '12px' }}>
                            <Building2 size={24} style={{ color: '#8b5cf6' }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Layout Principal: Config + Tabela */}
            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', alignItems: 'start' }}>

                {/* Coluna Esquerda: Config Global */}
                <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, rgba(15, 23, 42, 0.4) 100%)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'white', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        Preço Base Global
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '99px' }}>Padrão</span>
                    </h3>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Valor mensal por aluno</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>R$</div>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={globalPrice}
                                    onChange={(e) => setGlobalPrice(e.target.value)}
                                    className="input-field"
                                    style={{ width: '100%', paddingLeft: '40px', fontSize: '1.1rem', fontWeight: '600' }}
                                />
                            </div>
                            <button
                                onClick={handleUpdateGlobal}
                                className="btn btn-primary"
                                style={{ padding: '0 15px' }}
                                title="Salvar Preço Padrão"
                            >
                                <Save size={20} />
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <p style={{ fontSize: '0.85rem', color: '#bfdbfe', display: 'flex', gap: '8px', lineHeight: '1.4' }}>
                            <AlertCircle size={16} style={{ minWidth: '16px', marginTop: '2px' }} />
                            Atenção: Este valor será aplicado automaticamente a todas as escolas que não possuem um preço personalizado definido.
                        </p>
                    </div>
                </div>

                {/* Coluna Direita: Lista de Escolas */}
                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                    {/* Header da Tabela */}
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'white' }}>Faturamento por Escola</h3>

                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                placeholder="Buscar escola..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="input-field"
                                style={{ width: '100%', paddingLeft: '35px', paddingRight: '15px', height: '40px', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '16px 24px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: '600' }}>Escola</th>
                                    <th style={{ padding: '16px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: '600' }}>Alunos</th>
                                    <th style={{ padding: '16px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: '600' }}>Preço / Aluno</th>
                                    <th style={{ padding: '16px 24px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: '600' }}>Total Mensal</th>
                                    <th style={{ padding: '16px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: '600' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSchools.map((school, index) => (
                                    <tr key={school.id} style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                                    }}>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ fontWeight: '600', color: 'white', fontSize: '0.95rem' }}>{school.name}</div>
                                            {school.is_custom_price && (
                                                <span style={{ fontSize: '0.7rem', color: '#d8b4fe', background: 'rgba(168, 85, 247, 0.2)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                                                    ★ Personalizado
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center', color: '#cbd5e1' }}>{school.student_count}</td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.9rem',
                                                background: school.is_custom_price ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                                                color: school.is_custom_price ? '#d8b4fe' : '#94a3b8',
                                                border: school.is_custom_price ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                                R$ {school.price_per_student.toFixed(2).replace('.', ',')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: '700', color: '#34d399', fontSize: '1rem', fontFamily: 'monospace' }}>
                                            R$ {school.current_invoice_total.toFixed(2).replace('.', ',')}
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => {
                                                    setEditingSchool(school);
                                                    setNewPrice(school.is_custom_price ? school.price_per_student.toString() : '');
                                                }}
                                                className="btn"
                                                style={{ padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}
                                                title="Editar Preço Personalizado"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredSchools.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            Nenhuma escola encontrada para "{searchTerm}"
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '12px 24px', background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'right' }}>
                        Total de {filteredSchools.length} registros
                    </div>
                </div>
            </div>

            {/* Modal de Edição (Estilo Dark Glass) */}
            {editingSchool && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '0', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'white' }}>Editar Preço</h3>
                            <button onClick={() => setEditingSchool(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', marginBottom: '8px' }}>Escola</label>
                                <div style={{ fontSize: '1.1rem', color: 'white', fontWeight: '500' }}>{editingSchool.name}</div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Novo Preço Personalizado (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    placeholder={`Padrão Atual: R$ ${config.default_price.toFixed(2)}`}
                                    className="input-field"
                                    style={{ width: '100%', fontSize: '1.1rem', padding: '12px' }}
                                    autoFocus
                                />
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '10px', lineHeight: '1.4' }}>
                                    💡 Deixe o campo em branco para remover o preço personalizado e voltar a utilizar o preço padrão global (atualmente R$ {config.default_price.toFixed(2)}).
                                </p>
                            </div>
                        </div>

                        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => setEditingSchool(null)}
                                className="btn"
                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleUpdateSchool}
                                className="btn btn-primary"
                                style={{ padding: '0 24px' }}
                            >
                                <Save size={18} style={{ marginRight: '8px' }} />
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminSaaS;
