import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function EmployeeDashboard() {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // States
    const [time, setTime] = useState(new Date());
    const [location, setLocation] = useState(null);
    const [dist, setDist] = useState(null);
    const [employeeData, setEmployeeData] = useState(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [clockType, setClockType] = useState(null);
    const [loadingMsg, setLoadingMsg] = useState('');

    const videoRef = useRef();
    const streamRef = useRef();

    // 1. Relógio
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. Carregar Dados
    useEffect(() => {
        const init = async () => {
            await loadEmployeeData();
            await loadFaceModels();
        };
        init();

        // GPS Tracking
        if (!navigator.geolocation) {
            alert("Seu navegador não suporta Geolocalização.");
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                // Fake GPS Check (básico): Se accuracy for muito ruim ou coordenadas zeradas
                // Mas difícil detectar fake real via web.
                setLocation(loc);
            },
            (err) => console.error("GPS Error", err),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // 3. Calc Distância
    useEffect(() => {
        if (location && employeeData) {
            const d = getDistanceFromLatLonInMeters(
                location.lat, location.lng,
                employeeData.school_lat, employeeData.school_lng
            );
            setDist(d);
        }
    }, [location, employeeData]);

    const loadFaceModels = async () => {
        try {
            const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL)
            ]);
            setModelsLoaded(true);
        } catch (e) { console.error("Erro models", e); }
    };

    const loadEmployeeData = async () => {
        try {
            const res = await api.get('/employee/info');
            if (res.data.success) {
                setEmployeeData(res.data.data);
            }
        } catch (err) {
            console.error(err);
            alert("Erro ao carregar dados do funcionário. Tente recarregar.");
        }
    };

    const handleClockClick = (type) => {
        if (!employeeData) return;

        // Validação GPS
        if (dist === null) {
            alert("Aguardando sinal de GPS...");
            return;
        }

        // LIMITE DE DISTÂNCIA: 200 Metros
        if (dist > 200) {
            alert(`Você está longe da escola (${Math.round(dist)}m).\nLimite permitido: 200m.\nAproxime-se para registrar o ponto.`);
            return;
        }

        setClockType(type);
        setShowCamera(true);
        setTimeout(startCamera, 100);
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
            }
        } catch (err) {
            alert("Erro ao abrir câmera. Verifique permissões.");
            setShowCamera(false);
        }
    };

    const captureAndVerify = async () => {
        if (!videoRef.current || !employeeData?.face_descriptor) {
            alert("Dados de rosto não encontrados ou câmera fechada.");
            return;
        }

        setLoadingMsg("Verificando Biometria...");

        try {
            const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

            if (!detection) {
                alert("Rosto não detectado! Olhe fixamente para a câmera em local iluminado.");
                setLoadingMsg("");
                return;
            }

            // Comparar
            let storedDescriptor;
            try {
                storedDescriptor = new Float32Array(JSON.parse(employeeData.face_descriptor));
            } catch (e) {
                // Tenta parsear caso esteja em formato array direto
                storedDescriptor = new Float32Array(employeeData.face_descriptor);
            }

            const distance = faceapi.euclideanDistance(detection.descriptor, storedDescriptor);
            console.log("Face Distance:", distance);

            // Threshold recomendado: 0.6 (pode ser 0.5 para mais rigor, ou 0.4)
            if (distance < 0.55) {
                processClock();
            } else {
                alert("Rosto não confere com o cadastro! Tente novamente.");
                setLoadingMsg("");
            }
        } catch (e) {
            console.error(e);
            alert("Erro na validação facial.");
            setLoadingMsg("");
        }
    };

    const processClock = async () => {
        setLoadingMsg("Enviando Ponto...");
        // Snapshot
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
        const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);

        try {
            await api.post('/employee/clock', {
                type: clockType,
                latitude: location?.lat,
                longitude: location?.lng,
                photo: photoBase64
            });
            alert("✅ Ponto registrado com sucesso!");
            window.location.reload(); // Recarrega para resetar estado e ver novos logs
        } catch (err) {
            alert("Erro ao enviar ponto: " + (err.response?.data?.error || err.message));
            setShowCamera(false);
            stopCamera();
        } finally {
            setLoadingMsg("");
        }
    }

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
    }

    function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lat2) return 999999;
        var R = 6371;
        var dLat = deg2rad(lat2 - lat1);
        var dLon = deg2rad(lon2 - lon1);
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c) * 1000;
    }
    function deg2rad(deg) { return deg * (Math.PI / 180) }

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Header */}
            <div style={{ width: '100%', maxWidth: '600px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>Ponto Biométrico</h1>
                    <p style={{ color: '#94a3b8', fontSize: '14px' }}>
                        {employeeData ? `${employeeData.name} - ${employeeData.school_name}` : 'Carregando...'}
                    </p>
                </div>
                <button onClick={logout} style={{ background: '#334155', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>Sair</button>
            </div>

            {/* Relógio */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <div style={{ fontSize: '56px', fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-2px' }}>
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div style={{ color: '#94a3b8', marginTop: '5px', textTransform: 'uppercase', fontSize: '14px', letterSpacing: '1px' }}>
                    {time.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}
                </div>

                {/* Indicador de GPS */}
                <div style={{ marginTop: '20px' }}>
                    {location ? (
                        <div style={{
                            padding: '6px 12px',
                            background: (dist !== null && dist <= 200) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            borderRadius: '20px',
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            fontSize: '13px',
                            color: (dist !== null && dist <= 200) ? '#34d399' : '#f87171'
                        }}>
                            <span>{(dist !== null && dist <= 200) ? '✅' : '⚠️'}</span>
                            <span>{dist !== null ? `${Math.round(dist)}m da escola` : 'Calculando...'}</span>
                        </div>
                    ) : (
                        <div style={{ color: '#fbbf24', fontSize: '13px' }}>📡 Buscando sinal GPS...</div>
                    )}
                </div>
            </div>

            {/* Botões */}
            {!showCamera ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', width: '100%', maxWidth: '500px' }}>
                    <ClockButton label="CHEGADA" icon="☀️" color="#10b981" onClick={() => handleClockClick('clock_in')} disabled={!modelsLoaded} />
                    <ClockButton label="SAÍDA ALMOÇO" icon="🍽️" color="#f59e0b" onClick={() => handleClockClick('lunch_out')} disabled={!modelsLoaded} />
                    <ClockButton label="VOLTA ALMOÇO" icon="🔙" color="#3b82f6" onClick={() => handleClockClick('lunch_return')} disabled={!modelsLoaded} />
                    <ClockButton label="SAÍDA" icon="🏠" color="#ef4444" onClick={() => handleClockClick('clock_out')} disabled={!modelsLoaded} />
                </div>
            ) : (
                <div style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeIn 0.3s ease' }}>
                    <h3 style={{ marginBottom: '15px' }}>Confirmação Facial</h3>
                    <div style={{ position: 'relative', width: '100%', borderRadius: '16px', overflow: 'hidden', border: '4px solid #3b82f6', background: '#000', aspectRatio: '3/4' }}>
                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    </div>

                    {loadingMsg && <p style={{ color: '#fbbf24', margin: '15px 0', fontWeight: 'bold' }}>⏳ {loadingMsg}</p>}

                    {!loadingMsg && (
                        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '20px' }}>
                            <button onClick={captureAndVerify} style={{ flex: 1, padding: '16px', background: '#3b82f6', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                                📸 Confirmar Ponto
                            </button>
                            <button onClick={() => { setShowCamera(false); stopCamera(); }} style={{ padding: '16px', background: '#334155', border: 'none', borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}

function ClockButton({ label, icon, color, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                background: color,
                border: 'none',
                borderRadius: '16px',
                padding: '24px 16px',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
                transition: 'transform 0.1s'
            }}
            onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={e => !disabled && (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => !disabled && (e.currentTarget.style.transform = 'scale(1)')}
        >
            <span style={{ fontSize: '28px' }}>{icon}</span>
            <span style={{ fontWeight: '700', fontSize: '13px', letterSpacing: '0.5px' }}>{label}</span>
        </button>
    )
}
