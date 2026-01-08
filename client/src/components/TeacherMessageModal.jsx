import React, { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare, CheckCircle } from 'lucide-react';
import api from '../api/axios';

const TeacherMessageModal = ({ teacher, schoolId, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    const loadMessages = async () => {
        try {
            const res = await api.get(`/messages/school-teacher-chat?teacher_id=${teacher.id}`);
            setMessages(res.data || []);
        } catch (error) {
            console.error("Error loading chat", error);
        }
    };

    useEffect(() => {
        loadMessages();
        const interval = setInterval(loadMessages, 5000); // Polling for new messages
        return () => clearInterval(interval);
    }, [teacher.id]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSend = async () => {
        if (!message.trim()) return;

        try {
            setSending(true);
            await api.post('/messages/send', {
                from_user_type: 'school_admin',
                from_user_id: schoolId,
                to_user_type: 'teacher',
                to_user_id: teacher.id,
                message: message.trim()
            });

            setMessage('');
            loadMessages();
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            alert('❌ Erro ao enviar mensagem. Tente novamente.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div className="glass-panel" style={{
                width: '90%',
                maxWidth: '600px',
                height: '80vh',
                display: 'flex',
                flexDirection: 'column',
                padding: '2rem',
                borderRadius: '16px'
            }}>
                {/* HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MessageSquare size={24} />
                        Chat com {teacher.name.split(' ')[0]}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* CHAT AREA */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    marginBottom: '1rem',
                    paddingRight: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {messages.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
                            <p>Inicie a conversa com o professor.</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isMe = msg.sender_type === 'school';
                            return (
                                <div key={idx} style={{
                                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                                    maxWidth: '80%',
                                    background: isMe ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                                    padding: '0.8rem 1rem',
                                    borderRadius: '12px',
                                    borderBottomRightRadius: isMe ? '2px' : '12px',
                                    borderBottomLeftRadius: !isMe ? '2px' : '12px',
                                    color: 'white'
                                }}>
                                    <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>{msg.message || msg.content}</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.7, textAlign: 'right', marginTop: '0.3rem' }}>
                                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* INPUT AREA */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'end',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '1rem',
                    borderRadius: '12px'
                }}>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            resize: 'none',
                            minHeight: '24px',
                            maxHeight: '100px',
                            fontFamily: 'inherit',
                            fontSize: '1rem',
                            outline: 'none'
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={sending}
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !message.trim()}
                        style={{
                            background: sending || !message.trim() ? 'rgba(255,255,255,0.1)' : 'var(--accent-primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: sending || !message.trim() ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {sending ? (
                            <div className="spinner" style={{
                                width: '16px',
                                height: '16px',
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderTop: '2px solid white',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }}></div>
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default TeacherMessageModal;
