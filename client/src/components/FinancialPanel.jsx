import React, { useState, useEffect } from 'react';
import { DollarSign, CreditCard, Calendar, CheckCircle, AlertCircle, Settings, Plus, ExternalLink, Copy } from 'lucide-react';
import api from '../api/axios';

export default function FinancialPanel({ schoolId }) {
    const [activeTab, setActiveTab] = useState('invoices');
    const [config, setConfig] = useState({ api_key: '', wallet_id: '', configured: false });
    const [invoices, setInvoices] = useState([]);
    const [students, setStudents] = useState([]);
    const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);

    // Webhook URL display
    const webhookUrl = `${window.location.protocol}//${window.location.hostname}:5000/webhook/asaas?school_id=${schoolId}`;

    // New Invoice Form
    const [newInvoice, setNewInvoice] = useState({
        student_id: '',
        amount: '',
        description: 'Mensalidade Escolar',
        due_date: new Date().toISOString().split('T')[0],
        payment_method: 'PIX'
    });

    useEffect(() => {
        loadConfig();
        if (activeTab === 'invoices') {
            loadInvoices();
            loadStudents();
        }
    }, [activeTab, schoolId]); // Reload when school changes

    const loadConfig = async () => {
        try {
            const res = await api.get(`/school/financial/config?school_id=${schoolId}`);
            setConfig(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadInvoices = async () => {
        try {
            const res = await api.get(`/school/financial/invoices?school_id=${schoolId}`);
            setInvoices(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error(err);
            setInvoices([]);
        }
    };

    const loadStudents = async () => {
        try {
            const res = await api.get(`/school/students?school_id=${schoolId}`);
            setStudents(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveConfig = async () => {
        try {
            await api.post(`/school/financial/config?school_id=${schoolId}`, { api_key: config.api_key });
            alert('Configuração salva com sucesso!');
            loadConfig();
        } catch (err) {
            alert('Erro ao salvar configuração');
        }
    };

    const handleCreateInvoice = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post(`/school/financial/invoices?school_id=${schoolId}`, newInvoice);
            alert('Cobrança gerada com sucesso!');
            setShowNewInvoiceModal(false);
            loadInvoices();
            setNewInvoice({
                student_id: '',
                amount: '',
                description: 'Mensalidade Escolar',
                due_date: new Date().toISOString().split('T')[0],
                payment_method: 'PIX'
            });
        } catch (err) {
            alert('Erro ao gerar cobrança: ' + (err.response?.data?.error || err.message));
        }
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch (e) {
            return dateString;
        }
    };

    const copyToClipboard = (text) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text);
            alert('Copiado para a área de transferência!');
        } else {
            // Fallback for non-secure contexts
            alert('Copie manualmente: ' + text);
        }
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <DollarSign size={32} className="text-secondary" />
                    Gestão Financeira
                </h1>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    {activeTab === 'invoices' ? (
                        <button
                            className="btn"
                            onClick={() => setActiveTab('config')}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <Settings size={18} /> Configurações
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary"
                            onClick={() => setActiveTab('invoices')}
                        >
                            <CreditCard size={18} /> Ver Cobranças
                        </button>
                    )}
                </div>
            </div>

            {/* ERROR BANNER IF NOT CONFIGURED */}
            {activeTab === 'invoices' && !config.configured && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#fca5a5',
                    padding: '1rem',
                    borderRadius: 'var(--radius)',
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                }}>
                    <AlertCircle size={24} />
                    <div>
                        <strong>Configuração Necessária!</strong>
                        <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                            Configure sua conta (Banco Inter ou Cora) para emitir cobranças com baixa automática.
                        </p>
                    </div>
                    <button
                        className="btn"
                        onClick={() => setActiveTab('config')}
                        style={{ marginLeft: 'auto', background: 'rgba(239, 68, 68, 0.2)' }}
                    >
                        Configurar Agora
                    </button>
                </div>
            )}


            {
                activeTab === 'config' && (
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Settings size={24} /> Configuração de Pagamentos
                        </h2>

                        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: 'var(--radius)' }}>
                            <button
                                className={`btn ${(!config.gateway_provider || config.gateway_provider === 'inter') ? 'btn-primary' : ''}`}
                                style={{ flex: 1 }}
                                onClick={() => setConfig({ ...config, gateway_provider: 'inter' })}
                            >
                                Banco Inter
                            </button>
                            <button
                                className={`btn ${config.gateway_provider === 'cora' ? 'btn-primary' : ''}`}
                                style={{ flex: 1 }}
                                onClick={() => setConfig({ ...config, gateway_provider: 'cora' })}
                            >
                                Banco Cora
                            </button>
                        </div>

                        {/* COMPARATIVO DE OPÇÕES GRATUITAS */}
                        <div style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{
                                padding: '1rem',
                                borderRadius: 'var(--radius)',
                                border: (!config.gateway_provider || config.gateway_provider === 'inter') ? '2px solid #fb923c' : '1px solid rgba(255,255,255,0.1)',
                                background: (!config.gateway_provider || config.gateway_provider === 'inter') ? 'rgba(249, 115, 22, 0.15)' : 'rgba(255,255,255,0.02)',
                                transition: 'all 0.2s',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <h3 style={{ color: '#fb923c', fontWeight: 'bold', marginBottom: '0.8rem', fontSize: '1.1rem' }}>Banco Inter</h3>
                                <ul style={{ fontSize: '0.9rem', color: 'var(--text-primary)', listStyle: 'none', padding: 0, lineHeight: '1.8', flex: 1 }}>
                                    <li style={{ fontWeight: '600', color: '#4ade80' }}>✅ Pix Copia e Cola GRATUITO</li>
                                    <li>✅ Baixa Automática no sistema</li>
                                    <li>✅ Vê quem pagou e quem deve</li>
                                    <li style={{ color: '#fcd34d' }}>⚠️ Boletos podem ter custo (verifique seu plano)</li>
                                </ul>
                                <a
                                    href="https://inter.co/empresas/relacionamento/pj-pro/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn"
                                    style={{ marginTop: '1rem', background: 'rgba(249, 115, 22, 0.2)', color: '#fb923c', textAlign: 'center', width: '100%', border: '1px solid rgba(249, 115, 22, 0.5)' }}
                                >
                                    Abrir Conta Inter PJ <ExternalLink size={14} style={{ marginLeft: 5 }} />
                                </a>
                            </div>
                            <div style={{
                                padding: '1rem',
                                borderRadius: 'var(--radius)',
                                border: config.gateway_provider === 'cora' ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.1)',
                                background: config.gateway_provider === 'cora' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.02)',
                                transition: 'all 0.2s',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <h3 style={{ color: '#a855f7', fontWeight: 'bold', marginBottom: '0.8rem', fontSize: '1.1rem' }}>Banco Cora</h3>
                                <ul style={{ fontSize: '0.9rem', color: 'var(--text-primary)', listStyle: 'none', padding: 0, lineHeight: '1.8', flex: 1 }}>
                                    <li style={{ fontWeight: '600', color: '#4ade80' }}>✅ Pix + Boleto Híbrido GRATUITO</li>
                                    <li>✅ Baixa Automática no sistema</li>
                                    <li>✅ Vê quem pagou e quem deve</li>
                                    <li style={{ color: '#e2e8f0' }}>⚙️ Mesmo processo de certificados do Inter</li>
                                </ul>
                                <a
                                    href="https://www.cora.com.br/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn"
                                    style={{ marginTop: '1rem', background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', textAlign: 'center', width: '100%', border: '1px solid rgba(168, 85, 247, 0.5)' }}
                                >
                                    Abrir Conta Cora <ExternalLink size={14} style={{ marginLeft: 5 }} />
                                </a>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h4 style={{ color: 'var(--text-primary)', marginBottom: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Settings size={20} /> Configurando: {(!config.gateway_provider || config.gateway_provider === 'inter') ? 'Banco Inter' : 'Banco Cora'}
                            </h4>

                            <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                                {(!config.gateway_provider || config.gateway_provider === 'inter') ? (
                                    <p>Acesse o <strong>Internet Banking PJ</strong> do Inter &gt; Gestão de Acessos &gt; Aplicações &gt; Nova Aplicação. Baixe o pacote de chaves.</p>
                                ) : (
                                    <p>Acesse o <strong>Cora Web</strong> &gt; Configurações &gt; Integrações (API). Crie uma nova aplicação e baixe os certificados.</p>
                                )}
                            </div>

                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData();
                                const provider = config.gateway_provider === 'cora' ? 'cora' : 'inter';
                                formData.append('provider', provider);
                                formData.append('client_id', e.target.client_id.value);
                                // Cora não pede Client Secret as vezes no fluxo novo, mas mantemos por compatibilidade
                                if (e.target.client_secret) formData.append('client_secret', e.target.client_secret.value);
                                if (e.target.pix_key) formData.append('pix_key', e.target.pix_key.value);

                                if (e.target.cert_file.files[0]) formData.append('cert_file', e.target.cert_file.files[0]);
                                if (e.target.key_file.files[0]) formData.append('key_file', e.target.key_file.files[0]);

                                api.post(`/school/financial/config?school_id=${schoolId}`, formData)
                                    .then(() => {
                                        alert(`Configuração ${provider.toUpperCase()} salva!`);
                                        loadConfig();
                                    })
                                    .catch(err => alert('Erro: ' + err.message));
                            }}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="label">Client ID</label>
                                    <input name="client_id" className="input-field" required defaultValue={config.client_id} />
                                </div>

                                {(!config.gateway_provider || config.gateway_provider === 'inter') && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className="label">Client Secret</label>
                                        <input name="client_secret" className="input-field" type="password" required defaultValue={config.client_secret} />
                                    </div>
                                )}

                                {(!config.gateway_provider || config.gateway_provider === 'inter') && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className="label">Chave Pix</label>
                                        <input name="pix_key" className="input-field" required defaultValue={config.pix_key} />
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block' }}>Certificado (.crt / .pem)</label>
                                        <input type="file" name="cert_file" className="input-field" style={{ padding: '0.5rem' }} />
                                        {config.configured && <small style={{ color: '#4ade80' }}>✓ Já configurado</small>}
                                    </div>
                                    <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                        <label className="label" style={{ marginBottom: '0.5rem', display: 'block' }}>Chave (.key)</label>
                                        <input type="file" name="key_file" className="input-field" style={{ padding: '0.5rem' }} />
                                        {config.configured && <small style={{ color: '#4ade80' }}>✓ Já configurado</small>}
                                    </div>
                                </div>

                                <button className="btn btn-primary" style={{ width: '100%', padding: '1rem' }}>
                                    Salvar Configuração {(config.gateway_provider || 'inter').toUpperCase()}
                                </button>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                activeTab === 'invoices' && (
                    <>
                        <div style={{ marginBottom: '2rem' }}>
                            <button className="btn btn-primary" onClick={() => setShowNewInvoiceModal(true)}>
                                <Plus size={18} /> Nova Cobrança
                            </button>
                        </div>

                        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)' }}>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Aluno</th>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Descrição</th>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Vencimento</th>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Valor</th>
                                        <th style={{ padding: '1rem', textAlign: 'center' }}>Status</th>
                                        <th style={{ padding: '1rem', textAlign: 'center' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                Nenhuma cobrança registrada.
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map(inv => (
                                            <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '600' }}>{inv.student_name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{inv.parent_email}</div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>{inv.description}</td>
                                                <td style={{ padding: '1rem' }}>{formatDate(inv.due_date)}</td>
                                                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{formatCurrency(inv.amount)}</td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '999px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        background: inv.status === 'PAID' || inv.status === 'RECEIVED' ? 'rgba(74, 222, 128, 0.2)' :
                                                            inv.status === 'OVERDUE' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                                                        color: inv.status === 'PAID' || inv.status === 'RECEIVED' ? '#4ade80' :
                                                            inv.status === 'OVERDUE' ? '#fca5a5' : '#fcd34d'
                                                    }}>
                                                        {inv.status === 'PENDING' ? 'Pendente' :
                                                            inv.status === 'PAID' || inv.status === 'RECEIVED' ? 'Pago' :
                                                                inv.status === 'OVERDUE' ? 'Vencido' : inv.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    {inv.payment_url && (
                                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                                            <a
                                                                href={inv.payment_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="btn"
                                                                style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                                                                title="Abrir Link de Pagamento"
                                                            >
                                                                <ExternalLink size={14} /> Link
                                                            </a>
                                                            <button
                                                                className="btn"
                                                                onClick={() => copyToClipboard(inv.payment_url)}
                                                                style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                                                                title="Copiar Link"
                                                            >
                                                                <Copy size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )
            }

            {/* MODAL NOVA COBRANÇA */}
            {
                showNewInvoiceModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.8)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Nova Cobrança</h3>

                            <form onSubmit={handleCreateInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label className="label">Aluno</label>
                                    <select
                                        className="input-field"
                                        value={newInvoice.student_id}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, student_id: e.target.value })}
                                        required
                                    >
                                        <option value="">Selecione um aluno...</option>
                                        {students.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.class_name})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="label">Descrição</label>
                                    <input
                                        className="input-field"
                                        value={newInvoice.description}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })}
                                        required
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label className="label">Valor (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="input-field"
                                            value={newInvoice.amount}
                                            onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="label">Vencimento</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={newInvoice.due_date}
                                            onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="label">Método Preferencial</label>
                                    <select
                                        className="input-field"
                                        value={newInvoice.payment_method}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, payment_method: e.target.value })}
                                    >
                                        <option value="PIX">Pix</option>
                                        <option value="BOLETO">Boleto Bancário</option>
                                        <option value="CREDIT_CARD">Cartão de Crédito</option>
                                        <option value="UNDEFINED">Definido pelo Cliente</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Criar Cobrança</button>
                                    <button type="button" className="btn" style={{ flex: 1, background: 'var(--bg-secondary)' }} onClick={() => setShowNewInvoiceModal(false)}>Cancelar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
