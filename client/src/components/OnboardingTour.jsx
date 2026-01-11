import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

const OnboardingTour = ({ activeTab, setActiveTab, onClose, isFirstVisit }) => {
    const [step, setStep] = useState(0);

    const steps = [
        {
            title: "Bem-vindo ao EduFocus! 🎉",
            content: "Parabéns por fazer parte da revolução na gestão escolar! Vamos fazer um tour detalhado para você dominar todas as ferramentas.",
            position: 'center',
            showArrow: false
        },
        {
            title: "Professores 👨‍🏫",
            content: "Aqui você cadastra e gerencia toda a sua equipe docente. Vincule professores às turmas para liberar o acesso deles ao app.",
            targetTab: 'teachers',
            position: 'sidebar',
            top: '100px'
        },
        {
            title: "Turmas 🏫",
            content: "Crie e organize as salas de aula (ex: 1º Ano A, Berçário). É o primeiro passo para organizar sua escola.",
            targetTab: 'classes',
            position: 'sidebar',
            top: '160px'
        },
        {
            title: "Alunos 🎓",
            content: "Gerencie as matrículas, fotos para reconhecimento facial e dados dos responsáveis. Tudo centralizado aqui.",
            targetTab: 'students',
            position: 'sidebar',
            top: '220px'
        },
        {
            title: "Câmeras de Segurança 📹",
            content: "Visualize as câmeras da escola em tempo real. Monitore o pátio, portaria e áreas comuns.",
            targetTab: 'cameras',
            position: 'sidebar',
            top: '280px'
        },
        {
            title: "Presença Automática ✅",
            content: "Acompanhe a frequência dos alunos registrada automaticamente pelo reconhecimento facial.",
            targetTab: 'attendance',
            position: 'sidebar',
            top: '340px'
        },
        {
            title: "Funcionários 💼",
            content: "Cadastro de porteiros, cozinheiras, coordenação e outros colaboradores administrativos.",
            targetTab: 'employees',
            position: 'sidebar',
            top: '400px'
        },
        {
            title: "Eventos e Calendário 📅",
            content: "Publique avisos, reuniões e passeios que aparecerão no aplicativo dos pais.",
            targetTab: 'events',
            position: 'sidebar',
            top: '460px'
        },
        {
            title: "Mensagens 💬",
            content: "Canal direto de comunicação com os pais via chat integrado ao aplicativo deles.",
            targetTab: 'messages',
            position: 'sidebar',
            top: '520px'
        },
        {
            title: "Financeiro (Pais) 💲",
            content: "Controle quem pagou a mensalidade escolar. Emita boletos e veja inadimplentes.",
            targetTab: 'financial',
            position: 'sidebar',
            top: '580px'
        },
        {
            title: "Sua Assinatura (EduFocus) 💎",
            content: "Aqui você vê a fatura do uso do sistema EduFocus e o total de alunos ativos na plataforma.",
            targetTab: 'saas-billing',
            position: 'sidebar',
            top: '640px'
        },
        {
            title: "Você está pronto! 🌟",
            content: "Agora você conhece cada ferramenta. Se tiver dúvidas, clique no botão de 'Ajuda' no topo a qualquer momento. Bom trabalho!",
            position: 'center',
            showArrow: false
        }
    ];

    // Efeito de Confetes nos passos importantes (Início e Fim), SOMENTE NA PRIMEIRA VEZ
    useEffect(() => {
        if (isFirstVisit && (step === 0 || step === steps.length - 1)) {
            triggerConfetti();
        }

        // Sincronizar Aba
        const currentStep = steps[step];
        if (currentStep.targetTab) {
            setActiveTab(currentStep.targetTab);
        }
    }, [step, isFirstVisit]);

    const triggerConfetti = () => {
        const count = 200;
        const defaults = {
            origin: { y: 0.7 }
        };

        function fire(particleRatio, opts) {
            confetti({
                ...defaults,
                ...opts,
                particleCount: Math.floor(count * particleRatio)
            });
        }

        fire(0.25, { spread: 26, startVelocity: 55 });
        fire(0.2, { spread: 60 });
        fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
        fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        fire(0.1, { spread: 120, startVelocity: 45 });
    };

    const handleNext = () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            handleFinish();
        }
    };

    const handlePrev = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    const handleFinish = () => {
        localStorage.setItem('hasSeenTour', 'true');
        onClose();
    };

    const currentData = steps[step];
    const isSidebar = currentData.position === 'sidebar';

    const containerStyle = currentData.position === 'center'
        ? {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem'
        }
        : {
            position: 'absolute',
            left: '280px',
            top: currentData.top,
            display: 'block'
        };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            pointerEvents: 'none',
        }}>
            <div style={{
                position: 'absolute',
                inset: 0,
                background: currentData.position === 'center' ? 'rgba(0,0,0,0.7)' : 'transparent',
                transition: 'background 0.5s ease',
                zIndex: -1,
                pointerEvents: 'auto'
            }} onClick={currentData.position === 'center' ? null : handleFinish} />

            <div style={{
                height: '100%',
                width: '100%',
                ...containerStyle
            }}>
                <div style={{
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '16px',
                    padding: '24px',
                    width: '100%',
                    maxWidth: '400px',
                    boxShadow: '0 0 40px rgba(0,0,0,0.6), 0 0 0 2px rgba(96, 165, 250, 0.1)',
                    pointerEvents: 'auto',
                    animation: 'fadeIn 0.3s ease-out',
                    position: 'relative',
                    color: 'white'
                }}>
                    {isSidebar && (
                        <div style={{
                            position: 'absolute',
                            left: '-12px',
                            top: '20px',
                            width: 0,
                            height: 0,
                            borderTop: '12px solid transparent',
                            borderBottom: '12px solid transparent',
                            borderRight: '12px solid rgba(96, 165, 250, 0.3)',
                        }}>
                            <div style={{
                                position: 'absolute',
                                left: '1px',
                                top: '-12px',
                                width: 0,
                                height: 0,
                                borderTop: '12px solid transparent',
                                borderBottom: '12px solid transparent',
                                borderRight: '12px solid rgba(15, 23, 42, 0.95)',
                            }}></div>
                        </div>
                    )}

                    <button
                        onClick={handleFinish}
                        className="btn-icon"
                        style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            background: 'transparent',
                            color: '#94a3b8',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={20} />
                    </button>

                    <div>
                        <div style={{
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            color: '#60a5fa',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            letterSpacing: '1px'
                        }}>
                            Passo {step + 1} de {steps.length}
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {currentData.title}
                        </h3>
                        <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.95rem' }}>
                            {currentData.content}
                        </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                        <button
                            onClick={handlePrev}
                            disabled={step === 0}
                            className="btn"
                            style={{
                                background: step === 0 ? 'transparent' : 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '8px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                opacity: step === 0 ? 0 : 1,
                                cursor: step === 0 ? 'default' : 'pointer',
                                color: 'white'
                            }}
                        >
                            <ChevronLeft size={16} /> Anterior
                        </button>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleFinish}
                                className="btn"
                                style={{
                                    background: 'transparent',
                                    color: '#64748b',
                                    fontSize: '0.9rem',
                                    marginRight: '8px'
                                }}
                            >
                                Pular
                            </button>

                            <button
                                onClick={handleNext}
                                className="btn btn-primary"
                                style={{
                                    padding: '10px 24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: '#3b82f6',
                                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                {step === steps.length - 1 ? 'Concluir' : 'Próximo'}
                                {step === steps.length - 1 ? <CheckCircle size={16} /> : <ChevronRight size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OnboardingTour;
