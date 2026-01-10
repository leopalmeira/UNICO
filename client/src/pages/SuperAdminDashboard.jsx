import { useState, useEffect } from 'react';
import { LayoutDashboard, School, DollarSign, Users, Wrench, MessageSquare, MessageCircle, Menu, Camera } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import WhatsAppPanel from '../components/WhatsAppPanel';
import AdminSupportTickets from '../components/AdminSupportTickets';
import CameraRemovalRequests from '../components/CameraRemovalRequests';
import api from '../api/axios';

export default function SuperAdminDashboard() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState({ schoolsCount: 0, teachersCount: 0, repsCount: 0 });
    const [schools, setSchools] = useState([]);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState({});

    const toggleMenu = (menuId) => {
        setExpandedMenus(prev => ({
            ...prev,
            [menuId]: !prev[menuId]
        }));
    };

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { id: 'schools', label: 'Escolas', icon: <School size={20} /> },
        { id: 'billing', label: 'Faturamento', icon: <DollarSign size={20} /> },
        { id: 'representatives', label: 'Representantes', icon: <Users size={20} /> },
        { id: 'infrastructure', label: 'Infraestrutura', icon: <Wrench size={20} /> },
        { id: 'camera-requests', label: 'Solicitações Câmeras', icon: <Camera size={20} /> },
        { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={20} /> },
        { id: 'support', label: 'Suporte', icon: <MessageSquare size={20} /> }
    ];

    const loadStats = async () => {
        try {
            const res = await api.get('/admin/dashboard');
            setStats(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadSchools = async () => {
        try {
            const res = await api.get('/admin/schools');
            setSchools(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadStats();
        loadSchools();
        const interval = setInterval(() => {
            loadStats();
            loadSchools();
        }, 10000); // Update every 10 seconds

        document.body.classList.add('force-landscape');
        return () => {
            document.body.classList.remove('force-landscape');
            clearInterval(interval);
        };
    }, []);

    return (
        <div className="dashboard-layout">
            <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <Menu size={24} />
            </button>
            <div className={`sidebar-backdrop ${mobileMenuOpen ? 'visible' : ''}`} onClick={() => setMobileMenuOpen(false)} />

            <Sidebar
                menuItems={menuItems}
                activeTab={activeTab}
                setActiveTab={(tab) => { setActiveTab(tab); setMobileMenuOpen(false); }}
                isOpen={mobileMenuOpen}
                expandedMenus={expandedMenus}
                toggleMenu={toggleMenu}
            />

            <div className="main-content">
                {activeTab === 'dashboard' && <DashboardTab stats={stats} />}
                {activeTab === 'schools' && <SchoolsTab schools={schools} loadSchools={loadSchools} />}
                {activeTab === 'billing' && <BillingTab />}
                {activeTab === 'representatives' && <RepresentativesTab />}
                {activeTab === 'infrastructure' && <InfrastructureTab />}
                {activeTab === 'camera-requests' && <CameraRemovalRequests />}
                {activeTab === 'whatsapp' && <WhatsAppPanel />}
                {activeTab === 'support' && <AdminSupportTickets />}
            </div>
        </div>
    );
}


function DashboardTab({ stats }) {
    return (
        <div className="fade-in">
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}>Dashboard</h1>

            <div className="card-grid">
                <div className="glass-panel stat-card">
                    <div className="stat-label">Total de Escolas</div>
                    <div className="stat-value">{stats.schoolsCount}</div>
                </div>

                <div className="glass-panel stat-card">
                    <div className="stat-label">Total de Professores</div>
                    <div className="stat-value">{stats.teachersCount}</div>
                </div>

                <div className="glass-panel stat-card">
                    <div className="stat-label">Representantes</div>
                    <div className="stat-value">{stats.repsCount}</div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Log do Sistema</h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                        Sistema inicializado com sucesso
                    </div>
                    <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                        {stats.schoolsCount} escolas ativas
                    </div>
                    <div style={{ padding: '0.5rem 0' }}>
                        Todos os serviços operacionais
                    </div>
                </div>
            </div>
        </div>
    );
}

function SchoolsTab({ schools, loadSchools }) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSchools = schools.filter(school =>
        school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        school.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDeleteSchool = async (schoolId, schoolName) => {
        if (window.confirm(`Tem certeza que deseja EXCLUIR a escola "${schoolName}"?\n\nEsta ação não pode ser desfeita e todos os dados serão perdidos.`)) {
            try {
                await api.delete(`/admin/schools/${schoolId}`);
                // alert('Escola excluída com sucesso!'); // Feedback discreto ou nenhum se preferir rapidez
                loadSchools();
            } catch (err) {
                console.error(err);
                alert('Erro ao excluir escola: ' + (err.response?.data?.message || err.message));
            }
        }
    };

    return (
        <div className="fade-in">
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}>Escolas</h1>

            <div style={{ marginBottom: '1.5rem' }}>
                <input
                    type="text"
                    className="input-field"
                    placeholder="Buscar escola..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ maxWidth: '400px' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredSchools.map(school => (
                    <div key={school.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>{school.name}</h3>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    <div>Email: {school.email}</div>
                                    {school.cnpj && <div>CNPJ: {school.cnpj}</div>}
                                    <div>Administrador: {school.admin_name}</div>
                                    <div>Endereço: {school.address}</div>
                                    <div>Status: <span style={{ color: school.status === 'active' ? 'var(--success)' : 'var(--danger)' }}>{school.status === 'active' ? 'Ativa' : 'Inativa'}</span></div>
                                    <div>Cadastrada em: {new Date(school.created_at).toLocaleDateString('pt-BR')}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn" style={{ background: 'var(--warning)', color: 'white', padding: '0.5rem 1rem' }}>
                                    Bloquear
                                </button>
                                <button
                                    className="btn btn-danger"
                                    style={{ padding: '0.5rem 1rem' }}
                                    onClick={() => handleDeleteSchool(school.id, school.name)}
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {filteredSchools.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                        Nenhuma escola encontrada
                    </div>
                )}
            </div>
        </div>
    );
}

function BillingTab() {
    return (
        <div className="fade-in">
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}>Faturamento</h1>

            <div className="card-grid">
                <div className="glass-panel stat-card">
                    <div className="stat-label">Alunos Pagantes</div>
                    <div className="stat-value">0</div>
                </div>

                <div className="glass-panel stat-card">
                    <div className="stat-label">Faturamento Mensal</div>
                    <div className="stat-value">R$ 0</div>
                </div>

                <div className="glass-panel stat-card">
                    <div className="stat-label">Previsão Próximo Mês</div>
                    <div className="stat-value">R$ 0</div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Histórico de Pagamentos</h3>
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                    Nenhum pagamento registrado
                </div>
            </div>
        </div>
    );
}

function RepresentativesTab() {
    const [representatives, setRepresentatives] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', commission_rate: 10 });
    const [generatedPassword, setGeneratedPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/admin/representatives', formData);
            setGeneratedPassword(res.data.password);
            setFormData({ name: '', email: '', commission_rate: 10 });
            loadRepresentatives();
        } catch (err) {
            alert('Erro ao cadastrar representante');
        }
    };

    const loadRepresentatives = async () => {
        try {
            const res = await api.get('/admin/representatives');
            setRepresentatives(res.data);
        } catch (err) {
            console.error('Failed to load representatives', err);
        }
    };

    useEffect(() => {
        loadRepresentatives();
    }, []);

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>Representantes</h1>
                <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setGeneratedPassword(''); }}>
                    {showForm ? 'Cancelar' : 'Novo Representante'}
                </button>
            </div>

            {generatedPassword && (
                <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--success)' }}>✓ Representante Cadastrado!</h3>
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Senha Gerada:</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--success)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{generatedPassword}</div>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>⚠️ Copie e envie esta senha para o representante. Ela não será mostrada novamente.</p>
                    <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setGeneratedPassword('')}>Entendido</button>
                </div>
            )}

            {showForm && !generatedPassword && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            className="input-field"
                            placeholder="Nome"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <input
                            className="input-field"
                            type="email"
                            placeholder="Email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                        <input
                            className="input-field"
                            type="number"
                            placeholder="Taxa de Comissão (%)"
                            value={formData.commission_rate}
                            onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) })}
                            required
                        />
                        <button type="submit" className="btn btn-primary">Cadastrar</button>
                    </form>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {representatives.map(rep => (
                    <div key={rep.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>{rep.name}</h3>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    <div>Email: {rep.email}</div>
                                    <div>Comissão: {rep.commission_rate}%</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn" style={{ background: 'var(--warning)', color: 'white' }}>Bloquear</button>
                                <button className="btn" style={{ background: 'var(--accent-primary)', color: 'white' }}>Mensagem</button>
                            </div>
                        </div>
                    </div>
                ))}

                {representatives.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                        Nenhum representante cadastrado
                    </div>
                )}
            </div>
        </div>
    );
}

function InfrastructureTab() {
    const [technicians, setTechnicians] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
    const [generatedPassword, setGeneratedPassword] = useState('');
    const [rates, setRates] = useState({ 3: 250, 4: 310, 5: 380 });
    const [editingRates, setEditingRates] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/admin/technicians', formData);
            setGeneratedPassword(res.data.password);
            setFormData({ name: '', email: '', phone: '' });
            loadTechnicians();
        } catch (err) {
            alert('Erro ao cadastrar técnico');
        }
    };

    const loadTechnicians = async () => {
        try {
            const res = await api.get('/admin/technicians');
            setTechnicians(res.data);
        } catch (err) {
            console.error('Failed to load technicians', err);
        }
    };

    useEffect(() => {
        loadTechnicians();
    }, []);

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>Infraestrutura</h1>
                <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setGeneratedPassword(''); }}>
                    {showForm ? 'Cancelar' : 'Novo Técnico'}
                </button>
            </div>

            {generatedPassword && (
                <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--success)' }}>✓ Técnico Cadastrado!</h3>
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Senha Gerada:</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--success)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{generatedPassword}</div>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>⚠️ Copie e envie esta senha para o técnico. Ela não será mostrada novamente.</p>
                    <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setGeneratedPassword('')}>Entendido</button>
                </div>
            )}

            {showForm && !generatedPassword && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Cadastrar Técnico</h3>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input className="input-field" placeholder="Nome" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="input-field" type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                        <input className="input-field" placeholder="Telefone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required />
                        <button type="submit" className="btn btn-primary">Cadastrar</button>
                    </form>
                </div>
            )}

            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Tabela de Valores</h3>
                    <button className="btn" style={{ background: editingRates ? 'var(--success)' : 'var(--accent-primary)', color: 'white' }} onClick={() => setEditingRates(!editingRates)}>
                        {editingRates ? 'Salvar' : 'Editar Valores'}
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    {[3, 4, 5].map(count => (
                        <div key={count} style={{ padding: '1.5rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.3)', textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>{count}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Câmeras</div>
                            {editingRates ? (
                                <input className="input-field" type="number" value={rates[count]} onChange={(e) => setRates({ ...rates, [count]: parseFloat(e.target.value) })} style={{ textAlign: 'center', padding: '0.5rem' }} />
                            ) : (
                                <div style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--success)' }}>R$ {rates[count]}</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {technicians.map(tech => (
                    <div key={tech.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>{tech.name}</h3>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    <div>Email: {tech.email}</div>
                                    <div>Telefone: {tech.phone}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn" style={{ background: 'var(--warning)', color: 'white' }}>Bloquear</button>
                                <button className="btn" style={{ background: 'var(--accent-primary)', color: 'white' }}>Mensagem</button>
                            </div>
                        </div>
                    </div>
                ))}

                {technicians.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                        Nenhum técnico cadastrado
                    </div>
                )}
            </div>
        </div>
    );
}




