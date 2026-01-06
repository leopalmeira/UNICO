import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';
import { Send, Paperclip, MessageCircle, Users, Bell, X, Calendar, DollarSign, CheckCircle, XCircle, CreditCard, Eye } from 'lucide-react';

export default function SchoolCommunicationPanel({ schoolId, initialTab = 'events' }) {
    // TABS
    const [panelTab, setPanelTab] = useState(initialTab); // 'events' | 'chat'

    useEffect(() => {
        setPanelTab(initialTab);
    }, [initialTab]);

    // CHAT STATES
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isBroadcast, setIsBroadcast] = useState(false);
    const [messages, setMessages] = useState([]);
    const [msgContent, setMsgContent] = useState('');
    const [pollInterval, setPollInterval] = useState(null);
    const uploadRef = useRef(null);

    // EVENTS STATES
    const [events, setEvents] = useState([]);
    const [showEventModal, setShowEventModal] = useState(false);
    const [newEvent, setNewEvent] = useState({ title: '', description: '', date: '', cost: '', className: '', pix_key: '', payment_deadline: '' });
    const [selectedEvent, setSelectedEvent] = useState(null); // For Details/Participants
    const [participants, setParticipants] = useState([]);
    const [showParticipantsModal, setShowParticipantsModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editEvent, setEditEvent] = useState(null);

    // --- SHARED DATA LOADING ---
    useEffect(() => {
        const loadData = async () => {
            try {
                const [resClasses, resStudents] = await Promise.all([
                    api.get('/school/classes'),
                    api.get('/school/students')
                ]);
                setClasses(resClasses.data);
                setStudents(resStudents.data);
            } catch (e) { console.error("Erro dados", e); }
        };
        loadData();
    }, []);

    // --- EVENTS LOGIC ---
    useEffect(() => {
        if (panelTab === 'events') loadEvents();
    }, [panelTab]);

    const loadEvents = async () => {
        try {
            const res = await api.get('/school/events');
            setEvents(res.data);
        } catch (e) { }
    };

    const handleCreateEvent = async () => {
        if (!newEvent.title || !newEvent.date) return alert('Campos obrigatórios: Título e Data');
        try {
            await api.post('/school/events', {
                title: newEvent.title,
                description: newEvent.description,
                event_date: newEvent.date,
                cost: newEvent.cost ? parseFloat(newEvent.cost) : null,
                class_name: newEvent.className || null,
                pix_key: newEvent.pix_key || null,
                payment_deadline: newEvent.payment_deadline || null
            });
            alert('Evento criado!');
            setShowEventModal(false);
            setNewEvent({ title: '', description: '', date: '', cost: '', className: '', pix_key: '', payment_deadline: '' });
            loadEvents();
        } catch (e) { alert('Erro ao criar evento'); }
    }

    const handleViewParticipants = async (evt) => {
        setSelectedEvent(evt);
        setShowParticipantsModal(true);
        loadParticipants(evt.id);
    }

    const loadParticipants = async (evtId) => {
        try {
            const res = await api.get(`/school/events/${evtId}/participants`);
            setParticipants(res.data);
        } catch (e) { }
    }

    const handleUpdateStatus = async (pId, status) => {
        try {
            await api.post(`/school/events/participations/${pId}/confirm`, { status });
            loadParticipants(selectedEvent.id);
        } catch (e) { alert('Erro ao atualizar status'); }
    }

    // Excluir Evento
    const handleDeleteEvent = async (evtId) => {
        if (!confirm('Tem certeza que deseja EXCLUIR este evento? Esta ação não pode ser desfeita.')) return;
        try {
            await api.delete(`/school/events/${evtId}`);
            alert('Evento excluído!');
            loadEvents();
        } catch (e) { alert('Erro ao excluir evento'); }
    }

    // Editar Evento
    const handleEditEvent = (evt) => {
        setEditEvent({
            id: evt.id,
            title: evt.title || '',
            description: evt.description || '',
            date: evt.event_date ? evt.event_date.split('T')[0] : '',
            cost: evt.cost || '',
            className: evt.class_name || '',
            pix_key: evt.pix_key || '',
            payment_deadline: evt.payment_deadline ? evt.payment_deadline.split('T')[0] : ''
        });
        setShowEditModal(true);
    }

    const handleSaveEdit = async () => {
        if (!editEvent.title || !editEvent.date) return alert('Título e Data são obrigatórios');
        console.log('Tentando atualizar evento:', editEvent);
        console.log('URL:', `/school/events/${editEvent.id}`);
        try {
            const payload = {
                title: editEvent.title,
                description: editEvent.description,
                event_date: editEvent.date,
                cost: editEvent.cost ? parseFloat(editEvent.cost) : null,
                class_name: editEvent.className || null,
                pix_key: editEvent.pix_key || null,
                payment_deadline: editEvent.payment_deadline || null
            };
            console.log('Payload:', payload);
            const response = await api.put(`/school/events/${editEvent.id}`, payload);
            console.log('Resposta:', response);
            alert('Evento atualizado!');
            setShowEditModal(false);
            setEditEvent(null);
            loadEvents();
        } catch (e) {
            console.error('Erro ao atualizar:', e);
            alert('Erro ao atualizar evento');
        }
    }

    // --- CHAT LOGIC ---
    // (Existing logic preserved)
    const classStudents = selectedClass ? students.filter(s => s.class_name === selectedClass.name) : [];

    useEffect(() => {
        if (!selectedStudent || isBroadcast || panelTab !== 'chat') {
            setMessages([]);
            if (pollInterval) clearInterval(pollInterval);
            return;
        }
        loadMessages();
        const interval = setInterval(loadMessages, 3000);
        setPollInterval(interval);
        return () => clearInterval(interval);
    }, [selectedStudent, isBroadcast, panelTab]);

    useEffect(() => {
        const container = document.getElementById('school-chat-container');
        if (container) container.scrollTop = container.scrollHeight;
    }, [messages]);

    const loadMessages = async () => {
        if (!selectedStudent) return;
        try {
            const res = await api.get(`/school/chat/${selectedStudent.id}/messages`);
            setMessages(res.data);
        } catch (e) { }
    }

    const sendMessage = async () => {
        if (!msgContent.trim() && !uploadRef.current?.files[0]) return;
        const formData = new FormData();
        formData.append('content', msgContent);
        if (uploadRef.current?.files[0]) formData.append('file', uploadRef.current.files[0]);
        try {
            if (isBroadcast && selectedClass) {
                if (!confirm(`Confirmar envio para TODA a turma ${selectedClass.name}?`)) return;
                formData.append('classId', selectedClass.id);
                await api.post('/school/chat/broadcast', formData);
                alert('Enviado!');
            } else if (selectedStudent) {
                await api.post(`/school/chat/${selectedStudent.id}/messages`, formData);
                loadMessages();
            }
            setMsgContent('');
            if (uploadRef.current) uploadRef.current.value = '';
        } catch (e) { alert('Erro ao enviar'); }
    }

    const handleFileUpload = (e) => {
        if (e.target.files.length > 0 && confirm(`Enviar ${e.target.files[0].name}?`)) sendMessage();
        else e.target.value = '';
    };

    return (
        <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', color: '#fff' }}>
            {/* TOP TABS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', padding: '0 1rem' }}>
                <button className={`btn`} style={{ background: panelTab === 'events' ? '#6366f1' : 'rgba(255,255,255,0.1)', border: 'none', color: 'white', display: 'flex', gap: '8px', alignItems: 'center' }} onClick={() => setPanelTab('events')}>
                    <Calendar size={18} /> Gerenciar Eventos
                </button>
                <button className={`btn`} style={{ background: panelTab === 'chat' ? '#6366f1' : 'rgba(255,255,255,0.1)', border: 'none', color: 'white', display: 'flex', gap: '8px', alignItems: 'center' }} onClick={() => setPanelTab('chat')}>
                    <MessageCircle size={18} /> Mensagens e Chat
                </button>
            </div>

            {/* MAIN CONTENT AREA */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                {/* === EVENTS TAB === */}
                {panelTab === 'events' && (
                    <div className="glass-panel" style={{ height: '100%', padding: '20px', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontWeight: '700', fontSize: '1.5rem' }}>Eventos e Avisos</h2>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Gerencie comunicados, passeios e pagamentos.</p>
                            </div>
                            <button className="btn btn-primary" onClick={() => setShowEventModal(true)} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <Bell size={18} /> Novo Evento
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                            {events.map(e => (
                                <div key={e.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h3 style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#f1f5f9' }}>{e.title}</h3>
                                        <span style={{ fontSize: '11px', background: e.type === 'event' ? '#4f46e5' : '#d97706', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', fontWeight: 'bold' }}>{e.type === 'event' ? 'Evento' : 'Aviso'}</span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '15px', color: '#cbd5e1', fontSize: '13px' }}>
                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><Calendar size={14} /> {new Date(e.event_date).toLocaleDateString()}</div>
                                        {e.class_name ? <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><Users size={14} /> Turma {e.class_name}</div> : <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}><Users size={14} /> Todos</div>}
                                    </div>

                                    <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.5', flex: 1 }}>{e.description}</p>

                                    {(e.cost > 0 || e.pix_key || e.payment_deadline) && (
                                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                            {e.cost > 0 && <div style={{ color: '#34d399', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}><DollarSign size={16} /> R$ {e.cost.toFixed(2)}</div>}
                                            {e.pix_key && <div style={{ color: '#fbbf24', fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px', wordBreak: 'break-all' }}><CreditCard size={14} /> Pix: {e.pix_key}</div>}
                                            {e.payment_deadline && <div style={{ color: '#f87171', fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}><Calendar size={14} /> Pagar até: {new Date(e.payment_deadline).toLocaleDateString()}</div>}
                                        </div>
                                    )}

                                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '5px', gap: '8px', justifyContent: 'center' }} onClick={() => handleViewParticipants(e)}>
                                        <Eye size={16} /> Ver Participantes / Pagamentos
                                    </button>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                        <button onClick={() => handleEditEvent(e)} style={{ flex: 1, padding: '8px', background: '#3b82f6', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                            ✏️ Editar
                                        </button>
                                        <button onClick={() => handleDeleteEvent(e.id)} style={{ flex: 1, padding: '8px', background: '#ef4444', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                            🗑️ Excluir
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* === CHAT TAB (Reusing previous logic) === */}
                {panelTab === 'chat' && (
                    <div style={{ display: 'flex', height: '100%', gap: '1rem' }}>
                        {/* TURMAS */}
                        <div className="glass-panel" style={{ width: '250px', display: 'flex', flexDirection: 'column', padding: '0' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <h3 style={{ fontWeight: '600' }}>Turmas</h3>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {classes.map(c => (
                                    <div key={c.id}
                                        onClick={() => { setSelectedClass(c); setSelectedStudent(null); setIsBroadcast(false); }}
                                        style={{
                                            padding: '12px 16px', background: selectedClass?.id === c.id ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                            cursor: 'pointer', borderLeft: selectedClass?.id === c.id ? '3px solid #6366f1' : '3px solid transparent'
                                        }}>
                                        {c.name}
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* ALUNOS */}
                        <div className="glass-panel" style={{ width: '280px', display: 'flex', flexDirection: 'column', padding: '0' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <h3 style={{ fontWeight: '600' }}>{selectedClass ? selectedClass.name : 'Selecione'}</h3>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {selectedClass && (
                                    <div onClick={() => { setIsBroadcast(true); setSelectedStudent(null); }}
                                        style={{ padding: '12px', background: isBroadcast ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', margin: '10px', borderRadius: '8px', cursor: 'pointer', border: isBroadcast ? '1px solid #10b981' : 'none', color: isBroadcast ? '#10b981' : '#fff', fontWeight: 'bold', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <Users size={18} /> Mensagem Coletiva
                                    </div>
                                )}
                                {classStudents.map(s => (
                                    <div key={s.id} onClick={() => { setSelectedStudent(s); setIsBroadcast(false); }}
                                        style={{ padding: '10px 16px', background: selectedStudent?.id === s.id ? 'rgba(99, 102, 241, 0.2)' : 'transparent', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>{s.name.charAt(0)}</div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* CHAT AREA */}
                        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                            {selectedStudent || isBroadcast ? (
                                <>
                                    <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <h3 style={{ fontWeight: '600' }}>{isBroadcast ? `Transmissão: ${selectedClass.name}` : selectedStudent.name}</h3>
                                    </div>
                                    <div id="school-chat-container" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#0f172a' }}>
                                        {messages.map((m, i) => (
                                            <div key={i} style={{ alignSelf: m.sender_type === 'school' ? 'flex-end' : 'flex-start', maxWidth: '70%', padding: '10px', borderRadius: '12px', background: m.sender_type === 'school' ? '#4f46e5' : '#334155', color: '#fff' }}>
                                                {m.content}
                                                {m.file_url && <div style={{ fontSize: '12px', marginTop: '5px', textDecoration: 'underline' }}>Anexo: {m.file_name}</div>}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', display: 'flex', gap: '10px' }}>
                                        <input type="file" ref={uploadRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                                        <button className="btn" onClick={() => uploadRef.current.click()}><Paperclip size={20} /></button>
                                        <input className="input-field" style={{ flex: 1, borderRadius: '24px' }} value={msgContent} onChange={e => setMsgContent(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Mensagem..." />
                                        <button className="btn btn-primary" onClick={sendMessage}><Send size={20} /></button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Selecione um chat</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* === MODAL CREATE EVENT === */}
            {showEventModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#1e293b', padding: '25px', borderRadius: '16px', width: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h3>Novo Evento</h3>
                            <button onClick={() => setShowEventModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <input className="input-field" placeholder="Título" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
                            <textarea className="input-field" style={{ height: '80px' }} placeholder="Descrição" value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input type="date" className="input-field" style={{ flex: 1, colorScheme: 'dark' }} value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
                                <input type="number" step="0.01" className="input-field" style={{ flex: 1 }} placeholder="Custo (R$)" value={newEvent.cost} onChange={e => setNewEvent({ ...newEvent, cost: e.target.value })} />
                            </div>
                            <input className="input-field" placeholder="Chave Pix (CPF, Email, Aleatória...)" value={newEvent.pix_key} onChange={e => setNewEvent({ ...newEvent, pix_key: e.target.value })} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>Data Limite Pagamento</label>
                                    <input type="date" className="input-field" style={{ colorScheme: 'dark' }} value={newEvent.payment_deadline} onChange={e => setNewEvent({ ...newEvent, payment_deadline: e.target.value })} />
                                </div>
                            </div>
                            <select className="input-field" style={{ background: '#334155', color: 'white' }} value={newEvent.className} onChange={e => setNewEvent({ ...newEvent, className: e.target.value })}>
                                <option value="">Toda a Escola</option>
                                {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={handleCreateEvent}>Publicar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* === MODAL PARTICIPANTS === */}
            {showParticipantsModal && selectedEvent && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#1e293b', padding: '25px', borderRadius: '16px', width: '700px', height: '80vh', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h3>Participantes: {selectedEvent.title}</h3>
                            <button onClick={() => setShowParticipantsModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                                        <th style={{ padding: '10px' }}>Aluno</th>
                                        <th style={{ padding: '10px' }}>Turma</th>
                                        <th style={{ padding: '10px' }}>Status</th>
                                        <th style={{ padding: '10px' }}>Data Confirmação</th>
                                        <th style={{ padding: '10px' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {participants.length === 0 ? (
                                        <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Nenhum participante confirmou ainda.</td></tr>
                                    ) : participants.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '10px' }}>{p.student_name}</td>
                                            <td style={{ padding: '10px' }}>{p.class_name}</td>
                                            <td style={{ padding: '10px' }}>
                                                {p.status === 'interested' && <span style={{ color: '#a78bfa', background: 'rgba(167, 139, 250, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>Tem Interesse</span>}
                                                {p.status === 'confirmed' && <span style={{ color: '#60a5fa', background: 'rgba(96, 165, 250, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>Presença Confirmada</span>}
                                                {p.status === 'paid' && <span style={{ color: '#34d399', background: 'rgba(52, 211, 153, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>Pago</span>}
                                                {p.status === 'pending' && <span style={{ color: '#fbbf24', background: 'rgba(251, 191, 36, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>Pendente</span>}
                                            </td>
                                            <td style={{ padding: '10px' }}>{new Date(p.confirmed_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '10px', display: 'flex', gap: '5px' }}>
                                                <button onClick={() => handleUpdateStatus(p.id, 'paid')} style={{ background: '#059669', border: 'none', borderRadius: '4px', padding: '4px', color: 'white', cursor: 'pointer' }} title="Marcar como Pago"><CheckCircle size={16} /></button>
                                                <button onClick={() => handleUpdateStatus(p.id, 'confirmed')} style={{ background: '#2563eb', border: 'none', borderRadius: '4px', padding: '4px', color: 'white', cursor: 'pointer' }} title="Confirmar Presença"><Users size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* === MODAL EDIT EVENT === */}
            {showEditModal && editEvent && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#1e293b', padding: '25px', borderRadius: '16px', width: '500px', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h3>Editar Evento</h3>
                            <button onClick={() => { setShowEditModal(false); setEditEvent(null); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <input className="input-field" placeholder="Título" value={editEvent.title} onChange={e => setEditEvent({ ...editEvent, title: e.target.value })} />
                            <textarea className="input-field" style={{ height: '80px' }} placeholder="Descrição" value={editEvent.description} onChange={e => setEditEvent({ ...editEvent, description: e.target.value })} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>Data do Evento</label>
                                    <input type="date" className="input-field" style={{ colorScheme: 'dark' }} value={editEvent.date} onChange={e => setEditEvent({ ...editEvent, date: e.target.value })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>Custo (R$)</label>
                                    <input type="number" step="0.01" className="input-field" placeholder="0.00" value={editEvent.cost} onChange={e => setEditEvent({ ...editEvent, cost: e.target.value })} />
                                </div>
                            </div>
                            <input className="input-field" placeholder="Chave Pix" value={editEvent.pix_key} onChange={e => setEditEvent({ ...editEvent, pix_key: e.target.value })} />
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>Data Limite Pagamento</label>
                                <input type="date" className="input-field" style={{ colorScheme: 'dark' }} value={editEvent.payment_deadline} onChange={e => setEditEvent({ ...editEvent, payment_deadline: e.target.value })} />
                            </div>
                            <select className="input-field" style={{ background: '#334155', color: 'white' }} value={editEvent.className} onChange={e => setEditEvent({ ...editEvent, className: e.target.value })}>
                                <option value="">Toda a Escola</option>
                                {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={handleSaveEdit}>💾 Salvar Alterações</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
