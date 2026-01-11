import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Book, Pen, GraduationCap, School, Users, Lock, Mail, ArrowRight, Sparkles } from 'lucide-react';
import api from '../api/axios';

export default function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [registerType, setRegisterType] = useState('teacher');
    const { login } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        subject: '',
        admin_name: '',
        cnpj: '',
        address: ''
    });

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotStatus, setForgotStatus] = useState({ message: '', type: '' });
    const [previewUrl, setPreviewUrl] = useState('');

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setForgotStatus({ message: 'Enviando...', type: 'info' });
        setPreviewUrl('');
        try {
            const res = await api.post('/auth/forgot-password', { email: forgotEmail });
            setForgotStatus({ message: res.data.message, type: 'success' });
            if (res.data.previewUrl) {
                setPreviewUrl(res.data.previewUrl);
            }
        } catch (err) {
            setForgotStatus({ message: err.response?.data?.message || 'Erro ao enviar e-mail.', type: 'error' });
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // ... (resto do código)



    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (isLogin) {
            const res = await login(formData.email, formData.password);
            if (res.success) {
                if (res.role === 'employee') {
                    navigate('/employee');
                } else if (res.role === 'inspector') {
                    navigate('/inspector'); // Rota hipotética se existir painel separado para inspetor
                } else {
                    navigate('/dashboard');
                }
            } else {
                setError(res.message);
            }
        } else {
            try {
                const endpoint = registerType === 'teacher' ? '/register/teacher' : '/register/school';
                await api.post(endpoint, formData);
                setSuccess(registerType === 'teacher'
                    ? 'Cadastro realizado com sucesso! Aguarde ser vinculado a sua escola.'
                    : 'Escola cadastrada com sucesso! Faça login.');
                setTimeout(() => {
                    setIsLogin(true);
                    setFormData({ email: '', password: '', name: '', subject: '', admin_name: '', cnpj: '', address: '' });
                }, 3000);
            } catch (err) {
                setError(err.response?.data?.message || 'Erro no cadastro');
            }
        }
    };

    return (
        <div className="login-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            {/* Enhanced Floating Background */}
            <div className="floating-bg">
                <Book className="float-item" style={{ top: '15%', left: '8%', color: '#6366f1', width: 64, height: 64, animationDelay: '0s' }} />
                <Pen className="float-item" style={{ top: '25%', right: '15%', color: '#8b5cf6', width: 48, height: 48, animationDelay: '1.5s' }} />
                <GraduationCap className="float-item" style={{ bottom: '20%', left: '12%', color: '#10b981', width: 72, height: 72, animationDelay: '2.5s' }} />
                <School className="float-item" style={{ bottom: '35%', right: '8%', color: '#f59e0b', width: 80, height: 80, animationDelay: '3.5s' }} />
                <Users className="float-item" style={{ top: '50%', left: '5%', color: '#ec4899', width: 56, height: 56, animationDelay: '4s' }} />
                <Sparkles className="float-item" style={{ top: '40%', right: '10%', color: '#06b6d4', width: 40, height: 40, animationDelay: '2s' }} />
            </div>

            <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '480px', padding: '3rem', zIndex: 10, position: 'relative' }}>
                {/* Glow effect */}
                <div style={{ position: 'absolute', top: '-50%', left: '50%', transform: 'translateX(-50%)', width: '200%', height: '200%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)', pointerEvents: 'none', zIndex: -1 }}></div>

                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <GraduationCap size={40} style={{ color: '#6366f1' }} />
                        <h1 style={{ fontSize: '3rem', fontWeight: '900', background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
                            EDUFOCUS
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: '500' }}>Plataforma Educacional Inteligente</p>
                </div>

                {/* Enhanced Tabs */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', padding: '0.5rem', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px' }}>
                    <button
                        className={`btn ${isLogin ? 'btn-primary' : ''}`}
                        style={{
                            flex: 1,
                            background: isLogin ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
                            color: isLogin ? 'white' : 'var(--text-secondary)',
                            boxShadow: isLogin ? '0 4px 20px rgba(99, 102, 241, 0.4)' : 'none',
                            padding: '0.75rem'
                        }}
                        onClick={() => setIsLogin(true)}
                    >
                        Login
                    </button>
                    <button
                        className={`btn ${!isLogin ? 'btn-primary' : ''}`}
                        style={{
                            flex: 1,
                            background: !isLogin ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
                            color: !isLogin ? 'white' : 'var(--text-secondary)',
                            boxShadow: !isLogin ? '0 4px 20px rgba(99, 102, 241, 0.4)' : 'none',
                            padding: '0.75rem'
                        }}
                        onClick={() => setIsLogin(false)}
                    >
                        Cadastro
                    </button>
                </div>

                {error && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
                        {error}
                    </div>
                )}

                {success && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.2))', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: '500', textAlign: 'center' }}>
                        {success}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {!isLogin && (
                        <div style={{ display: 'flex', gap: '1rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1, color: registerType === 'teacher' ? '#6366f1' : 'var(--text-secondary)', fontWeight: '600', transition: 'all 0.3s' }}>
                                <input type="radio" name="type" checked={registerType === 'teacher'} onChange={() => setRegisterType('teacher')} style={{ accentColor: '#6366f1' }} /> Professor
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1, color: registerType === 'school' ? '#6366f1' : 'var(--text-secondary)', fontWeight: '600', transition: 'all 0.3s' }}>
                                <input type="radio" name="type" checked={registerType === 'school'} onChange={() => setRegisterType('school')} style={{ accentColor: '#6366f1' }} /> Escola
                            </label>
                        </div>
                    )}

                    {!isLogin && registerType === 'school' && (
                        <>
                            <input className="input-field" name="name" placeholder="Nome da Escola" value={formData.name} required onChange={handleChange} />
                            <input className="input-field" name="cnpj" placeholder="CNPJ (apenas números)" value={formData.cnpj} onChange={handleChange} maxLength="14" />
                            <input className="input-field" name="admin_name" placeholder="Nome do Administrador" value={formData.admin_name} required onChange={handleChange} />
                            <input className="input-field" name="address" placeholder="Endereço" value={formData.address} required onChange={handleChange} />
                        </>
                    )}

                    {!isLogin && registerType === 'teacher' && (
                        <>
                            <input className="input-field" name="name" placeholder="Nome Completo" value={formData.name} required onChange={handleChange} />
                            <input className="input-field" name="subject" placeholder="Matéria" value={formData.subject} required onChange={handleChange} />
                        </>
                    )}

                    <div style={{ position: 'relative' }}>
                        <Mail size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#6366f1', zIndex: 1 }} />
                        <input
                            className="input-field"
                            name="email"
                            type="email"
                            placeholder={!isLogin && registerType === 'school' ? "Email Institucional" : "Email"}
                            value={formData.email}
                            style={{ paddingLeft: '3rem' }}
                            required
                            onChange={handleChange}
                        />
                    </div>

                    <div style={{ position: 'relative' }}>
                        <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#6366f1', zIndex: 1 }} />
                        <input
                            className="input-field"
                            name="password"
                            type="password"
                            value={formData.password}
                            style={{ paddingLeft: '3rem' }}
                            required
                            onChange={handleChange}
                        />
                    </div>

                    {isLogin && (
                        <div style={{ textAlign: 'right' }}>
                            <button
                                type="button"
                                onClick={() => setShowForgotModal(true)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500', textDecoration: 'underline' }}
                            >
                                Esqueci minha senha
                            </button>
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', fontSize: '1rem', padding: '1rem' }}>
                        {isLogin ? 'Entrar' : 'Cadastrar'} <ArrowRight size={20} />
                    </button>
                </form>
            </div>

            {showForgotModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem', color: 'white' }}>Recuperar Senha</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Digite seu e-mail para receber uma nova senha.</p>

                        {forgotStatus.message && (
                            <div style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                background: forgotStatus.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : (forgotStatus.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'),
                                color: forgotStatus.type === 'success' ? '#6ee7b7' : (forgotStatus.type === 'error' ? '#fca5a5' : '#93c5fd'),
                                border: `1px solid ${forgotStatus.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : (forgotStatus.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)')}`
                            }}>
                                {forgotStatus.message}
                                {previewUrl && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 'bold' }}>
                                            Clique aqui para ver o e-mail (Modo Teste)
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        <form onSubmit={handleForgotPassword}>
                            <input
                                className="input-field"
                                type="email"
                                placeholder="Seu e-mail cadastrado"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                required
                                style={{ marginBottom: '1rem' }}
                            />
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Enviar</button>
                                <button type="button" className="btn" style={{ flex: 1, background: 'var(--bg-secondary)' }} onClick={() => { setShowForgotModal(false); setForgotStatus({ message: '', type: '' }); setForgotEmail(''); setPreviewUrl(''); }}>Fechar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
