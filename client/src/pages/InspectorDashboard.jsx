import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import api from '../api/axios';
import { LogOut, Volume2, CheckCircle2, Clock, MapPin, History, UserCheck, Bell, Car, Phone } from 'lucide-react';

export default function InspectorDashboard() {
    const { logout } = useAuth();
    const [pickups, setPickups] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [newArrival, setNewArrival] = useState(null);
    const lastCountRef = useRef(0);

    const playChime = () => {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, context.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.5);

            gainNode.gain.setValueAtTime(0.3, context.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.start();
            oscillator.stop(context.currentTime + 0.5);
        } catch (e) {
            console.error('Audio error:', e);
        }
    };

    const fetchPickups = async () => {
        try {
            const res = await api.get('/school/pickups');
            if (Array.isArray(res.data)) {
                const currentPickups = res.data.filter(p => p.status !== 'completed');
                const sortedPickups = currentPickups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const completedPickups = res.data.filter(p => p.status === 'completed').slice(0, 50);

                if (sortedPickups.length > lastCountRef.current) {
                    playChime();
                    setNewArrival(sortedPickups[0]);
                    setTimeout(() => setNewArrival(null), 8000);
                }

                setPickups(sortedPickups);
                setHistory(completedPickups);
                lastCountRef.current = sortedPickups.length;
            }
        } catch (error) {
            console.error('Erro ao buscar retiradas:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPickups();
        const interval = setInterval(fetchPickups, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleCall = async (pickupId) => {
        try {
            await api.post(`/school/pickups/${pickupId}/status`, { status: 'calling' });
            toast.success('Chamando aluno na sala!', { icon: '📢' });
            fetchPickups();
        } catch (error) {
            toast.error('Erro ao chamar aluno');
        }
    };

    const handleComplete = async (pickupId) => {
        try {
            await api.post(`/school/pickups/${pickupId}/status`, { status: 'completed' });
            toast.success('Aluno entregue ao responsável!', { icon: '✅' });
            fetchPickups();
        } catch (error) {
            toast.error('Erro ao finalizar');
        }
    };

    // CSS responsivo mobile-first
    const responsiveStyles = `
        * { box-sizing: border-box; }
        
        .inspector-container {
            min-height: 100vh;
            min-height: 100dvh;
            padding: 0.75rem;
            padding-bottom: 2rem;
            max-width: 1600px;
            margin: 0 auto;
            background: #0b0e14;
        }
        
        .inspector-header {
            padding: 1rem;
            margin-bottom: 1rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 16px;
        }
        
        .inspector-header-left {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        
        .inspector-header-right {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        
        .inspector-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
        }
        
        .pickup-card {
            padding: 1rem;
            border-radius: 20px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
        }
        
        .pickup-card.calling {
            border: 2px solid #f59e0b;
            background: rgba(245, 158, 11, 0.05);
        }
        
        .pickup-card-content {
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        
        .pickup-photo {
            width: 80px;
            height: 80px;
            border-radius: 16px;
            background: #1e293b;
            overflow: hidden;
            border: 3px solid rgba(255,255,255,0.1);
            flex-shrink: 0;
        }
        
        .pickup-info {
            flex: 1;
            min-width: 0;
        }
        
        .pickup-name {
            font-size: 1.1rem;
            font-weight: 800;
            color: #fff;
            margin-bottom: 0.25rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .pickup-class {
            display: inline-block;
            background: rgba(99, 102, 241, 0.2);
            color: #818cf8;
            padding: 0.2rem 0.6rem;
            border-radius: 8px;
            font-size: 0.7rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        
        .pickup-guardian {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.8rem;
            color: #10b981;
            font-weight: 600;
        }
        
        .pickup-time {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.75rem;
            color: #94a3b8;
            margin-top: 0.25rem;
        }
        
        .pickup-status {
            position: absolute;
            top: 0.75rem;
            right: 0.75rem;
            font-size: 0.6rem;
            font-weight: 800;
            padding: 0.35rem 0.6rem;
            border-radius: 10px;
            letter-spacing: 0.3px;
        }
        
        .pickup-status.waiting {
            background: rgba(255,255,255,0.05);
            color: #94a3b8;
        }
        
        .pickup-status.calling {
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #000;
            animation: pulse 1.5s infinite;
        }
        
        .pickup-actions {
            margin-top: 1rem;
            display: flex;
            gap: 0.5rem;
        }
        
        .action-btn {
            flex: 1;
            padding: 1rem;
            font-size: 0.9rem;
            font-weight: 800;
            border-radius: 14px;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
        }
        
        .action-btn.call {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
        }
        
        .action-btn.release {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.3);
        }
        
        .action-btn:active {
            transform: scale(0.98);
        }
        
        .new-arrival-popup {
            position: fixed;
            top: 1rem;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            width: calc(100% - 2rem);
            max-width: 400px;
            padding: 1.25rem;
            background: linear-gradient(135deg, #10b981, #059669);
            border-radius: 20px;
            box-shadow: 0 20px 50px rgba(16, 185, 129, 0.4);
            display: flex;
            align-items: center;
            gap: 1rem;
            border: 3px solid rgba(255,255,255,0.2);
            animation: slideDown 0.4s ease;
        }
        
        @keyframes slideDown {
            from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        
        .new-arrival-photo {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            overflow: hidden;
            border: 3px solid white;
            flex-shrink: 0;
            background: white;
        }
        
        .empty-state {
            padding: 4rem 1.5rem;
            text-align: center;
        }
        
        .header-btn {
            padding: 0.6rem 1rem;
            font-size: 0.75rem;
            font-weight: 700;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            transition: all 0.2s ease;
        }
        
        /* TABLET E DESKTOP */
        @media (min-width: 600px) {
            .inspector-container { padding: 1.5rem; }
            .inspector-header { flex-direction: row; justify-content: space-between; align-items: center; }
            .inspector-grid { grid-template-columns: repeat(2, 1fr); gap: 1.25rem; }
            .pickup-photo { width: 100px; height: 100px; }
            .pickup-name { font-size: 1.25rem; }
            .new-arrival-popup { width: 90%; max-width: 450px; }
        }
        
        @media (min-width: 1024px) {
            .inspector-grid { grid-template-columns: repeat(3, 1fr); }
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
    `;

    return (
        <div className="inspector-container">
            <style>{responsiveStyles}</style>

            {/* Pop-up de Novo Aluno */}
            {newArrival && (
                <div className="fade-in new-arrival-popup">
                    <div className="new-arrival-photo">
                        {newArrival.photo_url ? (
                            <img src={newArrival.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '800', color: '#10b981', background: 'white' }}>
                                {newArrival.student_name?.charAt(0) || '?'}
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Car size={14} /> Responsável Chegou!
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'white', lineHeight: '1.2', margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {newArrival.student_name}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>
                            {newArrival.class_name}
                        </div>
                    </div>
                    <Bell className="animate-bounce" size={28} style={{ color: 'white', flexShrink: 0 }} />
                </div>
            )}

            <header className="glass-panel inspector-header">
                <div className="inspector-header-left">
                    <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius: '12px', color: 'white', display: 'flex' }}>
                        <MapPin size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: '900', letterSpacing: '-0.02em', margin: 0, background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            PORTARIA
                        </h1>
                        <p style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: '500', margin: 0 }}>Retirada de Alunos</p>
                    </div>
                </div>

                <div className="inspector-header-right">
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '0.4rem 0.7rem',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                        <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#10b981' }}>Online</span>
                    </div>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="header-btn"
                        style={{ background: showHistory ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', color: 'white' }}
                    >
                        <History size={14} /> {showHistory ? 'Voltar' : 'Histórico'}
                    </button>
                    <button onClick={logout} className="header-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        <LogOut size={14} /> Sair
                    </button>
                </div>
            </header>

            {!showHistory ? (
                <div className="fade-in">
                    <div className="inspector-grid">
                        {loading ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '5rem 2rem' }}>
                                <div className="animate-pulse" style={{ fontSize: '1rem', color: '#94a3b8' }}>Sincronizando...</div>
                            </div>
                        ) : pickups.length === 0 ? (
                            <div style={{ gridColumn: '1/-1' }} className="glass-panel">
                                <div className="empty-state">
                                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏫</div>
                                    <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#fff', marginBottom: '0.5rem' }}>Nenhum responsável aguardando</h3>
                                    <p style={{ color: '#94a3b8', maxWidth: '280px', margin: '0 auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                        Quando um responsável chegar para buscar um aluno, ele aparecerá aqui automaticamente.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            pickups.map(pickup => (
                                <div
                                    key={pickup.id}
                                    className={`glass-panel fade-in pickup-card ${pickup.status === 'calling' ? 'calling' : ''}`}
                                    style={{ position: 'relative' }}
                                >
                                    {/* Status Badge */}
                                    <div className={`pickup-status ${pickup.status === 'calling' ? 'calling' : 'waiting'}`}>
                                        {pickup.status === 'calling' ? '📢 CHAMANDO' : '⏳ AGUARDANDO'}
                                    </div>

                                    <div className="pickup-card-content">
                                        {/* Foto do Aluno */}
                                        <div className="pickup-photo">
                                            {pickup.photo_url ? (
                                                <img src={pickup.photo_url} alt={pickup.student_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: '900', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}>
                                                    {pickup.student_name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pickup-info">
                                            <h3 className="pickup-name">{pickup.student_name}</h3>
                                            <div className="pickup-class">{pickup.class_name}</div>

                                            <div className="pickup-guardian">
                                                <Car size={14} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {pickup.guardian_name} veio buscar
                                                </span>
                                            </div>

                                            <div className="pickup-time">
                                                <Clock size={12} />
                                                <span>Chegou às {new Date(pickup.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ações */}
                                    <div className="pickup-actions">
                                        {pickup.status === 'waiting' ? (
                                            <button onClick={() => handleCall(pickup.id)} className="action-btn call">
                                                <Volume2 size={20} />
                                                CHAMAR NA SALA
                                            </button>
                                        ) : (
                                            <button onClick={() => handleComplete(pickup.id)} className="action-btn release">
                                                <CheckCircle2 size={20} />
                                                ENTREGAR AO RESPONSÁVEL
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : (
                /* Histórico */
                <div className="fade-in">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <History size={18} className="text-primary" /> Últimas Retiradas
                    </h2>

                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
                        {history.length === 0 ? (
                            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                                Nenhum registro recente.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {history.map(p => (
                                    <div key={p.id} style={{
                                        padding: '1rem',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}>
                                        <div style={{
                                            width: '45px',
                                            height: '45px',
                                            borderRadius: '12px',
                                            background: '#1e293b',
                                            overflow: 'hidden',
                                            border: '2px solid rgba(255,255,255,0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '18px',
                                            fontWeight: '700',
                                            color: '#fff',
                                            flexShrink: 0
                                        }}>
                                            {p.photo_url ? (
                                                <img src={p.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                            ) : p.student_name?.charAt(0) || '?'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ color: '#fff', fontWeight: '700', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.student_name}
                                            </div>
                                            <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                                {p.guardian_name} buscou • {p.class_name}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                color: '#10b981',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                padding: '0.3rem 0.6rem',
                                                borderRadius: '8px'
                                            }}>
                                                <CheckCircle2 size={12} /> Entregue
                                            </div>
                                            <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <span style={{ fontWeight: '700', color: '#64748b' }}>{new Date(p.timestamp).toLocaleDateString('pt-BR')}</span>
                                                <span>{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
