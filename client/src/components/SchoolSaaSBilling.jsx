import React, { useState, useEffect } from 'react';
import { DollarSign, Users, Calendar, AlertCircle, CheckCircle, Printer, CreditCard, FileText } from 'lucide-react';

const SchoolSaaSBilling = ({ schoolId }) => {
    const [billing, setBilling] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchBilling();
    }, [schoolId]);

    const fetchBilling = async () => {
        try {
            const token = localStorage.getItem('token');
            const id = schoolId || JSON.parse(localStorage.getItem('user'))?.school_id || 1;

            const response = await fetch(`http://localhost:5000/api/saas/school/billing?school_id=${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Falha ao carregar fatura');
            const data = await response.json();
            setBilling(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-white">Carregando informações financeiras...</div>;
    if (error) return <div className="p-8 text-red-400">Erro: {error}</div>;
    if (!billing) return <div className="p-8 text-gray-400">Nenhuma informação disponível.</div>;

    const isOverdue = billing.status === 'OVERDUE';
    const statusColor = isOverdue ? '#ef4444' : '#10b981'; // Vermelho ou Verde
    const statusText = isOverdue ? 'VENCIDA' : 'EM ABERTO';
    const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Formatação de moeda
    const formatMoney = (val) => `R$ ${val.toFixed(2).replace('.', ',')}`;

    return (
        <div className="fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>

            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileText size={32} className="text-blue-400" />
                        Fatura & Assinatura
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Gerencie a mensalidade do sistema EduFocus
                    </p>
                </div>
                <div style={{
                    background: isOverdue ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    border: `1px solid ${statusColor}`,
                    padding: '0.5rem 1rem',
                    borderRadius: '99px',
                    color: statusColor,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    {isOverdue ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                    Fatura {statusText}
                </div>
            </div>

            {/* Grid de Cards de Resumo */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2rem'
            }}>

                {/* Card Alunos */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#3b82f6' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600' }}>Alunos Ativos</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'white', marginTop: '0.5rem' }}>{billing.student_count}</div>
                        </div>
                        <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '10px', borderRadius: '12px' }}>
                            <Users size={24} style={{ color: '#60a5fa' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Base de cálculo da fatura</div>
                </div>

                {/* Card Preço */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#8b5cf6' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600' }}>Valor por Aluno</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'white', marginTop: '0.5rem' }}>
                                <span style={{ fontSize: '1.5rem', verticalAlign: 'top', marginRight: '4px' }}>R$</span>
                                {billing.price_per_student.toFixed(2).replace('.', ',')}
                            </div>
                        </div>
                        <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '10px', borderRadius: '12px' }}>
                            <DollarSign size={24} style={{ color: '#a78bfa' }} />
                        </div>
                    </div>
                    {billing.is_custom_price && (
                        <div style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 'bold' }}>✨ Valor exclusivo aplicado</div>
                    )}
                </div>

                {/* Card Vencimento */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: isOverdue ? '#ef4444' : '#f59e0b' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600' }}>Vencimento</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'white', marginTop: '0.5rem' }}>
                                {new Date(billing.due_date).getDate()}
                                <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '5px' }}>
                                    /{new Date(billing.due_date).getMonth() + 1}
                                </span>
                            </div>
                        </div>
                        <div style={{ background: isOverdue ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', padding: '10px', borderRadius: '12px' }}>
                            <Calendar size={24} style={{ color: isOverdue ? '#fca5a5' : '#fcd34d' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: isOverdue ? '#fca5a5' : 'var(--text-secondary)' }}>
                        {isOverdue ? '⚠️ Regularize imediatamente' : 'Vence em breve'}
                    </div>
                </div>
            </div>

            {/* CARD PRINCIPAL DA FATURA */}
            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white' }}>Detalhamento da Cobrança Atual</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fatura referente a {monthName}</p>
                </div>

                <div style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Linha Cabeçalho Tabela */}
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <div>Descrição do Serviço</div>
                            <div style={{ textAlign: 'center' }}>Qtd.</div>
                            <div style={{ textAlign: 'right' }}>Valor Unit.</div>
                            <div style={{ textAlign: 'right' }}>Total</div>
                        </div>

                        {/* Linha Item */}
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', padding: '1rem 0', color: 'white', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: '500' }}>Mensalidade Plataforma EduFocus</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cobrança por aluno ativo no sistema</div>
                            </div>
                            <div style={{ textAlign: 'center', fontWeight: '500' }}>{billing.student_count}</div>
                            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(billing.price_per_student)}</div>
                            <div style={{ textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatMoney(billing.total_amount)}</div>
                        </div>
                    </div>

                    {/* Área Total */}
                    <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Total a pagar</span>
                            <span style={{ fontSize: '2.5rem', fontWeight: '800', color: '#10b981', textShadow: '0 0 20px rgba(16, 185, 129, 0.3)' }}>
                                {formatMoney(billing.total_amount)}
                            </span>
                        </div>

                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem', maxWidth: '400px', textAlign: 'right' }}>
                            O pagamento garante acesso contínuo aos serviços de reconhecimento facial, notificações aos pais e gestão acadêmica.
                        </p>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                            <button className="btn" style={{
                                background: 'rgba(255,255,255,0.05)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '0.8rem 1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                height: 'auto'
                            }}>
                                <Printer size={20} />
                                Imprimir Fatura
                            </button>

                            <button className="btn" style={{
                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                color: 'white',
                                padding: '0.8rem 2rem',
                                fontWeight: 'bold',
                                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '1.1rem',
                                height: 'auto'
                            }}>
                                <CreditCard size={20} />
                                Pagar Agora
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rodapé Seguro */}
            <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                🔒 Pagamento processado em ambiente seguro e criptografado.
            </div>

        </div>
    );
};

export default SchoolSaaSBilling;
