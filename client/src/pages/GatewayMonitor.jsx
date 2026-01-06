import { useState, useEffect, useRef } from 'react';
import { Camera, Wifi, WifiOff, Users, Clock } from 'lucide-react';
import * as faceapi from 'face-api.js';
import api from '../api/axios';

export default function GatewayMonitor() {
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const [students, setStudents] = useState([]);
    const [recentDetections, setRecentDetections] = useState([]);
    const [stats, setStats] = useState({ today: 0, total: 0 });
    const [connectionStatus, setConnectionStatus] = useState('online');

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const detectionIntervalRef = useRef(null);
    const lastRecognitionTime = useRef({});

    // Configuração da escola (pode vir de localStorage ou config)
    const schoolId = localStorage.getItem('gateway_school_id') || 14;
    const schoolName = localStorage.getItem('gateway_school_name') || 'Escola 123';

    useEffect(() => {
        loadModels();
        loadStudents();

        // Verificar conexão a cada 30 segundos
        const connectionCheck = setInterval(checkConnection, 30000);

        return () => {
            clearInterval(connectionCheck);
            stopCamera();
        };
    }, []);

    const loadModels = async () => {
        try {
            console.log('🔄 Carregando modelos de IA...');
            const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL)
            ]);

            setModelsLoaded(true);
            console.log('✅ Modelos carregados! Sistema pronto.');
        } catch (error) {
            console.error('❌ Erro ao carregar modelos:', error);
            alert('Erro ao carregar IA. Verifique sua conexão.');
        }
    };

    const loadStudents = async () => {
        try {
            const response = await api.get(`/school/${schoolId}/students`);
            const studentsWithDescriptors = response.data.filter(s => s.face_descriptor);
            setStudents(studentsWithDescriptors);
            console.log(`📚 ${studentsWithDescriptors.length} alunos carregados com biometria`);
        } catch (error) {
            console.error('❌ Erro ao carregar alunos:', error);
            setConnectionStatus('offline');
        }
    };

    const checkConnection = async () => {
        try {
            await api.get('/health');
            setConnectionStatus('online');
        } catch (error) {
            setConnectionStatus('offline');
        }
    };

    const startCamera = async () => {
        if (!modelsLoaded) {
            alert('Aguarde o carregamento dos modelos de IA...');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: 'user' }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
                setCameraActive(true);

                // Iniciar detecção contínua
                detectionIntervalRef.current = setInterval(detectFaces, 500);
                console.log('📹 Câmera da portaria ativada!');
            }
        } catch (error) {
            console.error('❌ Erro ao acessar câmera:', error);
            alert('Erro ao acessar câmera. Verifique as permissões.');
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }

        if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
        }

        setCameraActive(false);
        console.log('📹 Câmera desativada');
    };

    const detectFaces = async () => {
        if (!videoRef.current || !canvasRef.current || !cameraActive) return;

        try {
            const detections = await faceapi
                .detectAllFaces(videoRef.current)
                .withFaceLandmarks()
                .withFaceDescriptors();

            const displaySize = {
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
            };

            faceapi.matchDimensions(canvasRef.current, displaySize);
            const resizedDetections = faceapi.resizeResults(detections, displaySize);

            // Limpar canvas
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            // Desenhar detecções
            faceapi.draw.drawDetections(canvasRef.current, resizedDetections);

            // Reconhecer alunos
            for (const detection of resizedDetections) {
                const bestMatch = findBestMatch(detection.descriptor);

                if (bestMatch && bestMatch.label !== 'unknown' && bestMatch.distance < 0.5) {
                    // Desenhar nome
                    const box = detection.detection.box;
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
                    ctx.fillRect(box.x, box.y - 30, box.width, 30);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px Arial';
                    ctx.fillText(bestMatch.label, box.x + 5, box.y - 10);

                    // Registrar presença
                    await registerAttendance(bestMatch);
                }
            }
        } catch (error) {
            console.error('Erro na detecção:', error);
        }
    };

    const findBestMatch = (descriptor) => {
        if (!students.length) return null;

        const labeledDescriptors = students.map(student => {
            const descriptorArray = JSON.parse(student.face_descriptor);
            return new faceapi.LabeledFaceDescriptors(
                student.name,
                [new Float32Array(descriptorArray)]
            );
        });

        const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
        return faceMatcher.findBestMatch(descriptor);
    };

    const registerAttendance = async (match) => {
        const student = students.find(s => s.name === match.label);
        if (!student) return;

        const now = Date.now();
        const lastTime = lastRecognitionTime.current[student.id] || 0;

        // MODO TESTE: Reduzido para 2 segundos para testar notificações
        if ((now - lastTime) / 1000 < 2) return;

        try {
            console.log(`🎯 [TESTE] Registrando: ${student.name}`);

            const response = await api.post('/attendance/register', {
                student_id: student.id,
                school_id: schoolId,
                event_type: 'arrival'
            });

            lastRecognitionTime.current[student.id] = now;

            // Adicionar à lista de detecções recentes
            const detection = {
                id: student.id,
                name: student.name,
                time: new Date().toLocaleTimeString('pt-BR'),
                whatsappSent: response.data.whatsapp?.success || false
            };

            setRecentDetections(prev => [detection, ...prev].slice(0, 10));
            setStats(prev => ({ ...prev, today: prev.today + 1 }));

            console.log(`✅ [TESTE] Registrado! Guardian deve receber notificação!`);
        } catch (error) {
            console.error('❌ Erro ao registrar:', error);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            padding: '20px'
        }}>
            {/* Header */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <Camera size={32} style={{ color: '#10b981' }} />
                    <div>
                        <h1 style={{ color: '#fff', margin: 0, fontSize: '1.5rem' }}>
                            Portaria - {schoolName}
                        </h1>
                        <p style={{ color: '#aaa', margin: '5px 0 0 0', fontSize: '0.9rem' }}>
                            Monitoramento Automático de Entrada
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {/* Status Conexão */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {connectionStatus === 'online' ? (
                            <>
                                <Wifi size={20} style={{ color: '#10b981' }} />
                                <span style={{ color: '#10b981', fontSize: '0.9rem' }}>Online</span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={20} style={{ color: '#ef4444' }} />
                                <span style={{ color: '#ef4444', fontSize: '0.9rem' }}>Offline</span>
                            </>
                        )}
                    </div>

                    {/* Botão Câmera */}
                    {!cameraActive ? (
                        <button
                            onClick={startCamera}
                            style={{
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Camera size={20} />
                            Ativar Câmera
                        </button>
                    ) : (
                        <button
                            onClick={stopCamera}
                            style={{
                                background: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            Desativar
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                {/* Vídeo */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    padding: '20px',
                    position: 'relative'
                }}>
                    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                borderRadius: '12px',
                                background: '#000'
                            }}
                        />
                        <canvas
                            ref={canvasRef}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%'
                            }}
                        />
                    </div>

                    {!cameraActive && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            color: '#aaa'
                        }}>
                            <Camera size={64} style={{ marginBottom: '20px', opacity: 0.3 }} />
                            <p style={{ fontSize: '1.2rem' }}>Câmera Desativada</p>
                            <p style={{ fontSize: '0.9rem' }}>Clique em "Ativar Câmera" para iniciar</p>
                        </div>
                    )}
                </div>

                {/* Painel Lateral */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Stats */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '16px',
                        padding: '20px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <Users size={24} style={{ color: '#10b981' }} />
                            <h3 style={{ color: '#fff', margin: 0 }}>Estatísticas</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div>
                                <div style={{ color: '#aaa', fontSize: '0.85rem' }}>Hoje</div>
                                <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>
                                    {stats.today}
                                </div>
                            </div>
                            <div>
                                <div style={{ color: '#aaa', fontSize: '0.85rem' }}>Alunos Cadastrados</div>
                                <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 'bold' }}>
                                    {students.length}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detecções Recentes */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '16px',
                        padding: '20px',
                        flex: 1
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <Clock size={24} style={{ color: '#10b981' }} />
                            <h3 style={{ color: '#fff', margin: 0 }}>Últimas Detecções</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                            {recentDetections.map((detection, index) => (
                                <div
                                    key={index}
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold' }}>
                                            {detection.name}
                                        </div>
                                        <div style={{ color: '#aaa', fontSize: '0.85rem' }}>
                                            {detection.time}
                                        </div>
                                    </div>
                                    {detection.whatsappSent && (
                                        <div style={{
                                            background: '#10b981',
                                            color: '#fff',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold'
                                        }}>
                                            📱 WhatsApp
                                        </div>
                                    )}
                                </div>
                            ))}
                            {recentDetections.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#aaa', padding: '20px' }}>
                                    Nenhuma detecção ainda
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
