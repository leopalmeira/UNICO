import { useState, useEffect, useRef } from 'react';
import {
    Users, Clock, Bell, CheckCircle, AlertCircle, Calendar,
    TrendingUp, MessageSquare, Camera, Play, Pause, UserCheck,
    Filter, Download, Phone, Send, Eye, RefreshCw
} from 'lucide-react';
import api from '../api/axios';
import FacialRecognitionCamera from './FacialRecognitionCamera';

export default function AttendancePanel({ schoolId = 1 }) {
    // States

    const [todayArrivals, setTodayArrivals] = useState([]);
    const [stats, setStats] = useState({
        totalStudents: 0,
        presentToday: 0,
        absentToday: 0,
        lastArrival: null,
        averageArrivalTime: '--:--'
    });
    const [selectedClass, setSelectedClass] = useState('all');
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNotificationSettings, setShowNotificationSettings] = useState(false);
    const [notificationConfig, setNotificationConfig] = useState({
        whatsappEnabled: true,
        emailEnabled: false,
        messageTemplate: 'Olá! Seu filho(a) {nome} chegou à escola com segurança às {hora}. 📚✅'
    });
    const [newArrivalAlert, setNewArrivalAlert] = useState(null);
    const [sendingTo, setSendingTo] = useState(null);
    const audioRef = useRef(null);

    // Initial Load
    useEffect(() => {
        loadInitialData();
        // Poll for new arrivals every 30 seconds
        const interval = setInterval(loadTodayArrivals, 30000);
        return () => clearInterval(interval);
    }, []);

    // Filter arrivals by class
    useEffect(() => {
        loadTodayArrivals();
    }, [selectedClass]);

    const loadInitialData = async () => {
        try {
            setLoading(true);

            // Load classes
            const classesRes = await api.get('/school/classes');
            setClasses(classesRes.data);

            // Load students
            const studentsRes = await api.get('/school/students');
            setStudents(studentsRes.data);

            // Load today's arrivals
            await loadTodayArrivals();

        } catch (err) {
            console.error('Erro ao carregar dados:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadTodayArrivals = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await api.get(`/school/${schoolId}/attendance?startDate=${today}&endDate=${today}`);

            // ✅ Backend já filtra apenas entradas (type = 'entry')
            let entries = Array.isArray(res.data) ? res.data : [];

            // Filter by class if selected
            if (selectedClass !== 'all') {
                entries = entries.filter(e => e.class_name === selectedClass);
            }

            // Sort by most recent (garantir que é array antes de sort)
            if (entries.length > 0) {
                entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }

            // ✅ FILTRO DE SEGURANÇA: Garantir apenas UMA entrada por aluno
            // Mesmo que o backend retorne duplicatas, filtramos aqui
            const uniqueMap = new Map();
            entries.forEach(entry => {
                if (!uniqueMap.has(entry.student_id)) {
                    uniqueMap.set(entry.student_id, entry);
                }
            });
            const uniqueEntries = Array.from(uniqueMap.values());

            setTodayArrivals(uniqueEntries);

            // Calculate stats
            const uniqueStudentIds = [...new Set(entries.map(e => e.student_id))];
            const totalStudents = selectedClass === 'all'
                ? students.length
                : students.filter(s => s.class_name === selectedClass).length;

            // Calculate average arrival time
            let avgTime = '--:--';
            if (entries.length > 0) {
                const totalMinutes = entries.reduce((acc, e) => {
                    const date = new Date(e.timestamp);
                    return acc + (date.getHours() * 60 + date.getMinutes());
                }, 0);
                const avgMinutes = Math.floor(totalMinutes / entries.length);
                const hours = Math.floor(avgMinutes / 60);
                const mins = avgMinutes % 60;
                avgTime = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            }

            setStats({
                totalStudents,
                presentToday: uniqueStudentIds.length,
                absentToday: Math.max(0, totalStudents - uniqueStudentIds.length),
                lastArrival: entries[0] || null,
                averageArrivalTime: avgTime
            });

        } catch (err) {
            console.error('Erro ao carregar presenças:', err);
        }
    };

    // Handle new arrival from camera recognition
    const handleNewArrival = async (arrivalData) => {
        console.log('📥 Nova chegada recebida:', arrivalData);

        // Show alert banner
        setNewArrivalAlert(arrivalData);

        // Play notification sound (if available)
        if (audioRef.current) {
            audioRef.current.play().catch(() => { });
        }

        // ✅ CHAMAR API DE PRESENÇA QUE ENVIA WHATSAPP AUTOMATICAMENTE
        try {
            const response = await api.post('/attendance/arrival', {
                student_id: arrivalData.student_id
            });

            if (response.data.success) {
                console.log('✅ Presença registrada e WhatsApp enviado automaticamente!');
            }
        } catch (error) {
            console.error('❌ Erro ao registrar presença:', error);
        }

        // Recarregar lista de presenças
        loadTodayArrivals();

        // Auto-hide alert after 5 seconds
        setTimeout(() => {
            setNewArrivalAlert(null);
        }, 5000);
    };

    const sendWhatsAppNotification = async (student, arrivalTime) => {
        if (!student.phone) {
            alert('Número de telefone do responsável não cadastrado.');
            return;
        }

        try {
            setSendingTo(student.id);
            // Enviar notificação via backend (sem abrir WhatsApp Web)
            const response = await api.post('/school/notify-parent', {
                student_id: student.id,
                school_id: schoolId
            });

            if (response.data.success) {
                alert(`Mensagem enviada com sucesso para o responsável de ${student.name}!`);
            }
        } catch (error) {
            console.error('Erro ao enviar WhatsApp:', error);
            const msg = error.response?.data?.error || 'Erro ao conectar com o serviço de WhatsApp';
            alert(`Falha no envio: ${msg}`);
        } finally {
            setSendingTo(null);
        }
    };

    const exportTodayReport = () => {
        const headers = ['Horário', 'Aluno', 'Turma', 'Notificado'];
        const rows = todayArrivals.map(arrival => [
            new Date(arrival.timestamp).toLocaleTimeString('pt-BR'),
            arrival.student_name,
            arrival.class_name || 'Sem turma',
            'Sim'
        ]);

        const csvContent = [
            `Relatório de Presença - ${new Date().toLocaleDateString('pt-BR')}`,
            '',
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `presenca_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    if (loading) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <RefreshCw size={48} className="spin" style={{ margin: '0 auto 1rem' }} />
                <p>Carregando sistema de presença...</p>
            </div>
        );
    }

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Audio for notifications */}
            <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleApAjMbZYwQ" />

            {/* NEW ARRIVAL ALERT BANNER */}
            {newArrivalAlert && (
                <div style={{
                    padding: '1.5rem',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))',
                    border: '2px solid #10b981',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.5rem',
                    animation: 'pulse 2s infinite'
                }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <CheckCircle size={32} color="white" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
                            🎉 ALUNO CHEGOU!
                        </h3>
                        <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>{newArrivalAlert.student_name}</p>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {newArrivalAlert.class_name || 'Sem turma'} • {new Date().toLocaleTimeString('pt-BR')}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            const student = students.find(s => s.id === newArrivalAlert.student_id);
                            if (student) sendWhatsAppNotification(student, new Date().toLocaleTimeString('pt-BR'));
                        }}
                        disabled={sendingTo === newArrivalAlert.student_id}
                        style={{
                            background: sendingTo === newArrivalAlert.student_id ? '#9ca3af' : '#25D366',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            cursor: sendingTo === newArrivalAlert.student_id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontWeight: '600',
                            transition: 'all 0.3s'
                        }}
                    >
                        {sendingTo === newArrivalAlert.student_id ? <RefreshCw className="spin" size={20} /> : <Phone size={20} />}
                        {sendingTo === newArrivalAlert.student_id ? 'Enviando...' : 'Avisar Responsável'}
                    </button>
                </div>
            )}

            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                        📋 Controle de Presença
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <select
                        className="input-field"
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        style={{ padding: '0.75rem', minWidth: '180px' }}
                    >
                        <option value="all">Todas as Turmas</option>
                        {classes.map(cls => (
                            <option key={cls.id} value={cls.name}>{cls.name}</option>
                        ))}
                    </select>

                    <button
                        className="btn"
                        onClick={exportTodayReport}
                        style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Download size={18} />
                        Exportar
                    </button>

                    <button
                        className="btn"
                        onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                        style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Bell size={18} />
                        Notificações
                    </button>
                </div>
            </div>

            {/* NOTIFICATION SETTINGS PANEL */}
            {showNotificationSettings && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MessageSquare size={20} /> Configurações de Notificação
                    </h3>

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={notificationConfig.whatsappEnabled}
                                onChange={(e) => setNotificationConfig({ ...notificationConfig, whatsappEnabled: e.target.checked })}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Phone size={14} color="white" />
                                </div>
                                <span>Habilitar notificações via WhatsApp</span>
                            </div>
                        </label>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                Modelo da Mensagem:
                            </label>
                            <textarea
                                className="input-field"
                                value={notificationConfig.messageTemplate}
                                onChange={(e) => setNotificationConfig({ ...notificationConfig, messageTemplate: e.target.value })}
                                placeholder="Use {nome} para o nome do aluno e {hora} para o horário"
                                rows={3}
                                style={{ resize: 'none' }}
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                Variáveis disponíveis: {'{nome}'}, {'{hora}'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* STATS CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', borderLeft: '4px solid #10b981' }}>
                    <UserCheck size={28} style={{ color: '#10b981', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#10b981' }}>{stats.presentToday}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Presentes Hoje</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', borderLeft: '4px solid #ef4444' }}>
                    <AlertCircle size={28} style={{ color: '#ef4444', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#ef4444' }}>{stats.absentToday}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Ausentes</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', borderLeft: '4px solid #3b82f6' }}>
                    <Users size={28} style={{ color: '#3b82f6', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#3b82f6' }}>{stats.totalStudents}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total de Alunos</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', borderLeft: '4px solid #8b5cf6' }}>
                    <Clock size={28} style={{ color: '#8b5cf6', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#8b5cf6' }}>{stats.averageArrivalTime}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Hora Média Chegada</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', borderLeft: '4px solid #f59e0b' }}>
                    <TrendingUp size={28} style={{ color: '#f59e0b', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#f59e0b' }}>
                        {stats.totalStudents > 0 ? Math.round((stats.presentToday / stats.totalStudents) * 100) : 0}%
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Taxa de Presença</div>
                </div>
            </div>

            {/* CAMERA RECOGNITION (Always Active) */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <Camera size={24} style={{ color: '#10b981' }} />
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Câmera de Entrada</h3>
                        <p style={{ color: '#10b981', fontSize: '0.875rem' }}>
                            Reconhecimento facial ativo • Sistema Online
                        </p>
                    </div>
                </div>

                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <FacialRecognitionCamera
                        schoolId={schoolId}
                        mode="attendance"
                        studentsList={students}
                        onNewArrival={handleNewArrival}
                    />
                </div>
            </div>


            {/* ÚLTIMOS REGISTROS - Mostra apenas UMA entrada por aluno (backend faz GROUP BY) */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={20} />
                        Últimos Registros
                        <span style={{
                            background: 'var(--accent-primary)',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            fontSize: '0.875rem'
                        }}>
                            {todayArrivals.length}
                        </span>
                    </h3>

                    <button
                        className="btn"
                        onClick={loadTodayArrivals}
                        style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RefreshCw size={16} />
                        Atualizar
                    </button>
                </div>

                {todayArrivals.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        <Users size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                        <p>Nenhuma chegada registrada hoje.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {todayArrivals.map((arrival, idx) => {
                            const arrivalTime = new Date(arrival.timestamp).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            return (
                                <div
                                    key={`${arrival.student_id}-${arrival.timestamp}`}
                                    style={{
                                        padding: '1rem',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}
                                >
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: '700',
                                        fontSize: '1rem',
                                        flexShrink: 0
                                    }}>
                                        {arrival.student_name?.charAt(0)}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                                            {arrival.student_name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {arrivalTime}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>


            {/* CSS for animations */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.8; }
                }
                
                .spin {
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
