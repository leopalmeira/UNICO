import { useState, useEffect } from 'react';
import { Clock, Users, Calendar, Camera, Play, Pause, CheckCircle, Download, UserPlus, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api/axios';
import FacialRecognitionCamera from './FacialRecognitionCamera';
import * as faceapi from 'face-api.js';

export default function EmployeeAttendancePanel({ schoolId }) {
    const [cameraActive, setCameraActive] = useState(false);
    const [todayRecords, setTodayRecords] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [absentEmployees, setAbsentEmployees] = useState([]);
    const [stats, setStats] = useState({
        totalEmployees: 0,
        presentToday: 0,
        absentToday: 0
    });
    const [newRecordAlert, setNewRecordAlert] = useState(null);
    const [showQuickForm, setShowQuickForm] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [showMonthlyReport, setShowMonthlyReport] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [monthlyData, setMonthlyData] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        role: '',
        employee_id: '',
        photo_url: '',
        face_descriptor: null
    });

    useEffect(() => {
        loadModels();
        loadEmployees();
        loadTodayRecords();

        const interval = setInterval(loadTodayRecords, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (employees.length > 0) {
            loadTodayRecords();
        }
    }, [employees]);

    const loadModels = async () => {
        try {
            console.log('🔄 Carregando modelos face-api.js...');
            const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL)
            ]);

            setModelsLoaded(true);
            console.log('✅ Modelos carregados!');
        } catch (err) {
            console.error('❌ Erro ao carregar modelos:', err);
        }
    };

    const loadEmployees = async () => {
        try {
            const res = await api.get('/school/employees');
            setEmployees(res.data);
        } catch (err) {
            console.error('Erro ao carregar funcionários:', err);
        }
    };

    const loadTodayRecords = async () => {
        try {
            const dateObj = new Date();
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;

            const res = await api.get(`/school/employee-attendance?date=${today}`);

            const uniqueRecords = [];
            const seenIds = new Set();

            res.data.forEach(record => {
                if (!seenIds.has(record.employee_id)) {
                    seenIds.add(record.employee_id);
                    uniqueRecords.push(record);
                }
            });

            setTodayRecords(uniqueRecords);

            // Calcular funcionários ausentes
            const presentIds = new Set(uniqueRecords.map(r => r.employee_id));
            const absent = employees.filter(emp => !presentIds.has(emp.id));
            setAbsentEmployees(absent);

            const totalEmployees = employees.length;
            const presentToday = uniqueRecords.length;
            const absentToday = Math.max(0, totalEmployees - presentToday);

            setStats({
                totalEmployees,
                presentToday,
                absentToday
            });
        } catch (err) {
            console.error('Erro ao carregar registros:', err);
        }
    };

    const handlePhotoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const imgUrl = reader.result;

            // MOSTRAR FOTO IMEDIATAMENTE
            setFormData(prev => ({ ...prev, photo_url: imgUrl }));

            try {
                const img = await faceapi.fetchImage(imgUrl);
                const detection = await faceapi
                    .detectSingleFace(img, new faceapi.SsdMobilenetv1Options())
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection) {
                    const descriptor = Array.from(detection.descriptor);
                    setFormData(prev => ({
                        ...prev,
                        photo_url: imgUrl,
                        face_descriptor: JSON.stringify(descriptor)
                    }));
                    alert('✅ Rosto detectado com sucesso!');
                } else {
                    alert('❌ Nenhum rosto detectado. Use uma foto clara.');
                    setFormData(prev => ({ ...prev, photo_url: '', face_descriptor: null }));
                }
            } catch (err) {
                console.error('Erro ao processar foto:', err);
                alert('⚠️ Erro ao processar a foto.');
            }
        };

        reader.readAsDataURL(file);
    };

    const handleQuickRegister = async (e) => {
        e.preventDefault();

        // FOTO É OBRIGATÓRIA para ponto biométrico
        if (!formData.photo_url) {
            alert('❌ FOTO OBRIGATÓRIA!\n\nPor favor, faça upload de uma foto do funcionário para o ponto biométrico funcionar.');
            return;
        }

        if (!formData.face_descriptor) {
            alert('❌ ROSTO NÃO DETECTADO!\n\nA foto precisa ter um rosto visível e claro.\n\nDicas:\n• Use boa iluminação\n• Rosto centralizado\n• Foto de boa qualidade');
            return;
        }

        try {
            await api.post('/school/employees', formData);
            alert('✅ Funcionário cadastrado com sucesso!');
            setFormData({
                name: '',
                role: '',
                employee_id: '',
                photo_url: '',
                face_descriptor: null
            });
            setShowQuickForm(false);
            loadEmployees();
            setTimeout(loadTodayRecords, 500);
        } catch (err) {
            console.error('Erro ao cadastrar funcionário:', err);
            alert(`❌ Erro ao cadastrar funcionário:\n${err.response?.data?.error || err.message}`);
        }
    };

    const handleNewRecord = async (recordData) => {
        console.log('📥 Novo registro de ponto:', recordData);

        const alreadyRegistered = todayRecords.some(r => r.employee_id === recordData.employee_id);

        if (alreadyRegistered) {
            alert('⚠️ Este funcionário já registrou ponto hoje!');
            return;
        }

        setNewRecordAlert(recordData);

        try {
            await api.post('/school/employee-attendance', {
                employee_id: recordData.employee_id
            });
            console.log('✅ Ponto registrado com sucesso!');
            loadTodayRecords();
        } catch (error) {
            console.error('❌ Erro ao registrar ponto:', error);
            alert('Erro ao registrar ponto');
        }

        setTimeout(() => {
            setNewRecordAlert(null);
        }, 5000);
    };

    const exportReport = () => {
        const headers = ['Horário', 'Funcionário', 'Matrícula', 'Cargo'];
        const rows = todayRecords.map(record => [
            new Date(record.timestamp).toLocaleTimeString('pt-BR'),
            record.employee_name,
            record.employee_id || 'N/A',
            record.employee_role || 'N/A'
        ]);

        const csvContent = [
            `Relatório de Ponto - ${new Date().toLocaleDateString('pt-BR')}`,
            '',
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ponto_funcionarios_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const loadMonthlyData = async () => {
        try {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth() + 1;
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

            const res = await api.get(`/school/employee-attendance?startDate=${startDate}&endDate=${endDate}`);

            // Agrupar por funcionário
            const employeeMap = new Map();

            employees.forEach(emp => {
                employeeMap.set(emp.id, {
                    ...emp,
                    records: [],
                    daysPresent: 0
                });
            });

            res.data.forEach(record => {
                if (employeeMap.has(record.employee_id)) {
                    const emp = employeeMap.get(record.employee_id);
                    const dateStr = new Date(record.timestamp).toISOString().split('T')[0];

                    // Adicionar registro (permitir múltiplos por dia)
                    // Se for o primeiro deste dia, incrementa daysPresent
                    const isNewDay = !emp.records.some(r => r.date === dateStr);
                    if (isNewDay) {
                        emp.daysPresent++;
                    }

                    emp.records.push({
                        date: dateStr,
                        time: new Date(record.timestamp).toLocaleTimeString('pt-BR'),
                        type: record.type
                    });
                }
            });

            setMonthlyData(Array.from(employeeMap.values()));
        } catch (err) {
            console.error('Erro ao carregar dados mensais:', err);
        }
    };

    useEffect(() => {
        if (showMonthlyReport && employees.length > 0) {
            loadMonthlyData();
        }
    }, [showMonthlyReport, selectedMonth, employees]);

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {newRecordAlert && (
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
                            ✅ PONTO REGISTRADO!
                        </h3>
                        <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>{newRecordAlert.employee_name}</p>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {newRecordAlert.employee_role} • {new Date().toLocaleTimeString('pt-BR')}
                        </p>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                        🕐 Ponto Biométrico - Funcionários
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        className="btn"
                        onClick={() => setShowQuickForm(true)}
                        style={{ background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <UserPlus size={18} />
                        Cadastro Rápido
                    </button>
                    <button
                        className="btn"
                        onClick={exportReport}
                        style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Download size={18} />
                        Exportar
                    </button>
                </div>
            </div>

            {showQuickForm && (
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>📝 Cadastro Rápido de Funcionário</h3>
                        <button onClick={() => setShowQuickForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleQuickRegister} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <input
                            className="input-field"
                            placeholder="Nome Completo *"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <input
                            className="input-field"
                            placeholder="Matrícula"
                            value={formData.employee_id}
                            onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                        />
                        <input
                            className="input-field"
                            placeholder="Cargo/Profissão *"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            required
                        />

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                Foto do Funcionário * (com rosto visível)
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                style={{ display: 'block', width: '100%', padding: '0.75rem', background: 'rgba(15, 23, 42, 0.6)', border: '2px solid var(--glass-border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                            />
                            {formData.photo_url && (
                                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                                    <img src={formData.photo_url} alt="Preview" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-primary)' }} />
                                    <p style={{ marginTop: '0.5rem', color: '#10b981', fontSize: '0.875rem' }}>✅ Rosto detectado!</p>
                                </div>
                            )}
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem' }}>
                            <button type="submit" className="btn" style={{ background: 'var(--accent-primary)' }}>Cadastrar</button>
                            <button type="button" className="btn" onClick={() => setShowQuickForm(false)}>Cancelar</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', borderLeft: '4px solid #10b981' }}>
                    <CheckCircle size={28} style={{ color: '#10b981', margin: '0 auto 0.5rem' }} />
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
                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#3b82f6' }}>{stats.totalEmployees}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Funcionários</div>
                </div>
            </div>

            {absentEmployees.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
                        <AlertCircle size={20} />
                        Funcionários que Ainda Não Bateram Ponto Hoje
                        <span style={{
                            background: '#ef4444',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            fontSize: '0.875rem'
                        }}>
                            {absentEmployees.length}
                        </span>
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                        {absentEmployees.map((employee) => (
                            <div
                                key={employee.id}
                                style={{
                                    padding: '1rem',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem'
                                }}
                            >
                                {employee.photo_url ? (
                                    <img
                                        src={employee.photo_url}
                                        alt={employee.name}
                                        style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #ef4444' }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: '700',
                                        fontSize: '1.25rem'
                                    }}>
                                        {employee.name?.charAt(0)}
                                    </div>
                                )}

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {employee.name}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {employee.role}
                                    </div>
                                    {employee.employee_id && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            Mat: {employee.employee_id}
                                        </div>
                                    )}
                                </div>

                                <AlertCircle size={20} color="#ef4444" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Camera size={24} style={{ color: cameraActive ? '#10b981' : 'var(--text-secondary)' }} />
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Câmera de Ponto</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                {cameraActive ? 'Reconhecimento facial ativo' : 'Sistema em espera'}
                            </p>
                        </div>
                    </div>

                    <button
                        className="btn"
                        onClick={() => setCameraActive(!cameraActive)}
                        style={{
                            background: cameraActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: cameraActive ? '#ef4444' : '#10b981',
                            border: `1px solid ${cameraActive ? '#ef4444' : '#10b981'}`,
                            padding: '0.75rem 2rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        {cameraActive ? <Pause size={20} /> : <Play size={20} />}
                        {cameraActive ? 'Parar Câmera' : 'Iniciar Câmera'}
                    </button>
                </div>

                {cameraActive && (
                    <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <FacialRecognitionCamera
                            schoolId={schoolId}
                            mode="employee"
                            employeesList={employees}
                            onNewRecord={handleNewRecord}
                        />
                    </div>
                )}
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={20} />
                    Registros de Hoje
                    <span style={{
                        background: 'var(--accent-primary)',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.875rem'
                    }}>
                        {todayRecords.length}
                    </span>
                </h3>

                {todayRecords.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        <Clock size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                        <p>Nenhum registro de ponto hoje.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {todayRecords.map((record) => (
                            <div
                                key={record.id}
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
                                    fontSize: '1rem'
                                }}>
                                    {record.employee_name?.charAt(0)}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                                        {record.employee_name}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {record.type ? (
                                            <span style={{
                                                color: record.type === 'clock_in' ? '#10b981' :
                                                    record.type === 'clock_out' ? '#ef4444' :
                                                        '#f59e0b',
                                                fontWeight: 'bold'
                                            }}>
                                                {record.type === 'clock_in' ? 'Entrada' :
                                                    record.type === 'lunch_out' ? 'Saída Almoço' :
                                                        record.type === 'lunch_return' ? 'Volta Almoço' :
                                                            record.type === 'clock_out' ? 'Saída' : 'Registro'}
                                            </span>
                                        ) : (
                                            <span>Ponto</span>
                                        )} • {new Date(record.timestamp).toLocaleTimeString('pt-BR')}
                                        {record.photo_url && <span title="Biometria"> 📸</span>}
                                    </div>
                                </div>

                                <CheckCircle size={24} color="#10b981" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* FREQUÊNCIA MENSAL */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div
                    onClick={() => setShowMonthlyReport(!showMonthlyReport)}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none'
                    }}
                >
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={20} />
                        Frequência Mensal por Funcionário
                    </h3>
                    {showMonthlyReport ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                </div>

                {showMonthlyReport && (
                    <div style={{ marginTop: '1.5rem' }}>
                        {/* Month Selector */}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                            <button
                                className="btn"
                                onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))}
                                style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem' }}
                            >
                                ← Mês Anterior
                            </button>
                            <h4 style={{ fontSize: '1.125rem', fontWeight: '600', textTransform: 'capitalize' }}>
                                {selectedMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </h4>
                            <button
                                className="btn"
                                onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))}
                                style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem' }}
                            >
                                Próximo Mês →
                            </button>
                        </div>

                        {/* Employee List */}
                        {monthlyData.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                <Calendar size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                <p>Nenhum registro encontrado para este mês.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {monthlyData.map((employee) => {
                                    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
                                    const attendanceRate = ((employee.daysPresent / daysInMonth) * 100).toFixed(1);

                                    return (
                                        <div
                                            key={employee.id}
                                            style={{
                                                padding: '1.5rem',
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '12px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {employee.photo_url ? (
                                                        <img
                                                            src={employee.photo_url}
                                                            alt={employee.name}
                                                            style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: '50px',
                                                            height: '50px',
                                                            borderRadius: '50%',
                                                            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: 'white',
                                                            fontWeight: '700',
                                                            fontSize: '1.25rem'
                                                        }}>
                                                            {employee.name?.charAt(0)}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: '600', fontSize: '1.125rem' }}>{employee.name}</div>
                                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                            {employee.role}
                                                            {employee.employee_id && ` • Mat: ${employee.employee_id}`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '2rem', fontWeight: '700', color: attendanceRate >= 90 ? '#10b981' : attendanceRate >= 75 ? '#f59e0b' : '#ef4444' }}>
                                                        {employee.daysPresent}
                                                    </div>
                                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                        de {daysInMonth} dias ({attendanceRate}%)
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Days Grid */}
                                            {employee.records.length > 0 && (
                                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                                        Dias com registro:
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        {employee.records.map((record, idx) => (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    padding: '0.5rem 0.75rem',
                                                                    background: 'rgba(16, 185, 129, 0.2)',
                                                                    border: '1px solid rgba(16, 185, 129, 0.5)',
                                                                    borderRadius: '8px',
                                                                    fontSize: '0.875rem'
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const label = record.type === 'clock_in' ? 'IN' :
                                                                        record.type === 'clock_out' ? 'OUT' :
                                                                            record.type === 'lunch_out' ? 'L-OUT' :
                                                                                record.type === 'lunch_return' ? 'L-IN' : 'REG';
                                                                    return `${new Date(record.date).getDate()}/${selectedMonth.getMonth() + 1} ${label} ${record.time}`;
                                                                })()}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.8; }
                }
            `}</style>
        </div>
    );
}
