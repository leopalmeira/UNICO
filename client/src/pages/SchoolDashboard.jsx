import { useState, useEffect } from 'react';
import { Users, GraduationCap, ClipboardCheck, HelpCircle, FileText, BarChart3, MessageCircle, Menu, Camera, Clock, Calendar, Building2, Edit, Save, X, DollarSign, LogOut, Plus, CheckCircle, XCircle, Target, Info, DoorOpen, ArrowRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import WhatsAppPanel from '../components/WhatsAppPanel'; // Manter caso queira voltar
import SchoolCommunicationPanel from '../components/SchoolCommunicationPanel';
import ClassesPanel from '../components/ClassesPanel';
import api from '../api/axios';
import * as faceapi from 'face-api.js';
import AttendancePanel from '../components/AttendancePanel';
import AttendanceReport from '../components/AttendanceReport';
import SchoolFAQ from '../components/SchoolFAQ';
import StudentProfileModal from '../components/StudentProfileModal';
import TeacherCard from '../components/TeacherCard';
import TeacherMetricsModal from '../components/TeacherMetricsModal';
import TeacherMessageModal from '../components/TeacherMessageModal';
import ClassDetailsModal from '../components/ClassDetailsModal';
import SupportTickets from '../components/SupportTickets';
import EmployeeManagement from '../components/EmployeeManagement';
import EmployeeAttendancePanel from '../components/EmployeeAttendancePanel';
import SchoolPickupsManager from '../components/SchoolPickupsManager';
import EmployeeAttendanceReport from '../components/EmployeeAttendanceReport';
import AffiliatesPanel from '../components/AffiliatesPanel';
import SchoolSelector from '../components/SchoolSelector';
import FinancialPanel from '../components/FinancialPanel';
import SchoolSaaSBilling from '../components/SchoolSaaSBilling';
import OnboardingTour from '../components/OnboardingTour';
import UniversalCameraRecognition from '../components/UniversalCameraRecognition';
import { useAuth } from '../context/AuthContext';
import '../styles/TeacherDashboardFixed.css';

export default function SchoolDashboard() {
    const { user, logout } = useAuth();
    const schoolId = user?.id || 1; // ID da escola logada
    const [activeTab, setActiveTab] = useState('dashboard');
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [searchEmail, setSearchEmail] = useState('');
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showStudentForm, setShowStudentForm] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentForm, setStudentForm] = useState({
        name: '',
        parent_email: '',
        phone: '',
        class_name: ''
    });
    const [classes, setClasses] = useState([]);
    const [studentSearch, setStudentSearch] = useState('');
    const [supportMessage, setSupportMessage] = useState('');
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [selectedClasses, setSelectedClasses] = useState([]);

    const [newClass, setNewClass] = useState('');
    const [showMetricsModal, setShowMetricsModal] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [upcomingEvents, setUpcomingEvents] = useState([]); // Eventos reais

    // Camera Form States
    const [showCameraForm, setShowCameraForm] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [cameraForm, setCameraForm] = useState({
        // school_id será injetado no submit
        classroom_id: '',
        assigned_classes: [],
        camera_name: '',
        camera_type: 'IP',
        camera_purpose: 'entrance',
        camera_ip: '',
        camera_url: '',
        camera_port: '80',
        camera_username: '',
        camera_password: '',
        notes: ''
    });

    // School Edit State
    const [isEditSchoolModalOpen, setIsEditSchoolModalOpen] = useState(false);
    const [editSchoolData, setEditSchoolData] = useState({
        name: '',
        email: '',
        cnpj: '',
        address: '',
        number: '',
        zip_code: '',
        latitude: '',
        longitude: ''
    });

    // Tour State
    const [showTour, setShowTour] = useState(false);
    const [isFirstVisit, setIsFirstVisit] = useState(false);

    useEffect(() => {
        // Lógica do Tour: Mostrar sempre durante os primeiros 30 dias de uso
        const startDateStr = localStorage.getItem('tourStartDate');
        let shouldShow = false;

        if (!startDateStr) {
            // Primeiro acesso: MARCA O INÍCIO DO PERÍODO DE 30 DIAS
            localStorage.setItem('tourStartDate', new Date().toISOString());
            setIsFirstVisit(true);
            shouldShow = true;
        } else {
            // Verifica se ainda está dentro do período de 30 dias
            const startDate = new Date(startDateStr);
            const today = new Date();
            const diffTime = Math.abs(today - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 30) {
                shouldShow = true;
            }
        }

        if (shouldShow) {
            setTimeout(() => setShowTour(true), 2000);
        }
    }, [user?.id]);



    const [showMessageModal, setShowMessageModal] = useState(false);
    const [teacherForModal, setTeacherForModal] = useState(null);
    const [selectedClass, setSelectedClass] = useState(null);
    const [showClassModal, setShowClassModal] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const loadTourStatus = () => {
        // This function was likely intended for tour status loading, but the provided content was a copy of loadModels.
        // Keeping it as an empty placeholder or removing it if not needed.
        // For now, it's an empty function to avoid syntax errors from the provided snippet.
    };

    useEffect(() => {
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
                console.log('✅ Modelos face-api.js carregados! Agora você pode cadastrar alunos com fotos.');
            } catch (err) {
                console.error('❌ Erro ao carregar modelos:', err);
                alert('Erro ao carregar modelos de IA. Verifique sua conexão com a internet.');
            }
        };
        loadModels();
    }, []);

    const [expandedMenus, setExpandedMenus] = useState({
        students: false,
        employees: false,
        affiliates: false
    });

    const [affiliates, setAffiliates] = useState([]);
    // Get selected school from localStorage or default to user's school
    const [currentSchoolId, setCurrentSchoolId] = useState(() => {
        const saved = localStorage.getItem('selectedSchoolId');
        return saved ? parseInt(saved) : schoolId;
    });

    // Load affiliates
    useEffect(() => {
        loadAffiliates();
    }, []);

    const loadEmployees = async () => {
        try {
            const res = await api.get(`/school/employees`);
            setEmployees(res.data);
        } catch (error) {
            console.error('Erro ao carregar funcionários:', error);
        }
    };

    const loadEvents = async () => {
        try {
            const res = await api.get('/school/events');
            // Filtrar eventos futuros e ordenar por data
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const future = res.data.filter(e => new Date(e.event_date) >= today);
            future.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

            setUpcomingEvents(future);
        } catch (error) {
            console.error('Erro ao carregar eventos:', error);
            // Fallback silencioso (não quebrar o dash se falhar)
            setUpcomingEvents([]);
        }
    };

    const loadCameras = async () => {
        try {
            const res = await api.get('/school/cameras');
            setCameras(res.data || []);
        } catch (err) {
            console.error('Erro ao carregar câmeras:', err);
        }
    };

    const testConnection = async () => {
        if (!cameraForm.camera_url) {
            alert('⚠️ Preencha a URL da câmera primeiro');
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const res = await api.post('/technician/cameras/test', {
                camera_url: cameraForm.camera_url,
                camera_type: cameraForm.camera_type
            });
            setTestResult({ success: true, message: res.data.message });
        } catch (err) {
            setTestResult({ success: false, message: err.response?.data?.message || 'Erro ao testar conexão' });
        } finally {
            setTesting(false);
        }
    };

    const handleAddCamera = async (e) => {
        e.preventDefault();
        try {
            // Usar endpoint de técnico (funciona se autenticado) ou um específico de escola
            // Importante: schoolId vem do contexto (linha 32)
            const payload = { ...cameraForm, school_id: schoolId };

            await api.post('/technician/cameras', payload);

            alert('✅ Câmera adicionada com sucesso! O monitoramento será iniciado automaticamente pelo servidor.');
            setShowCameraForm(false);
            setCameraForm({
                classroom_id: '',
                assigned_classes: [],
                camera_name: '',
                camera_type: 'IP',
                camera_purpose: 'entrance',
                camera_ip: '',
                camera_url: '',
                camera_port: '80',
                camera_username: '',
                camera_password: '',
                notes: ''
            });
            loadCameras();
        } catch (err) {
            console.error(err);
            alert(`Erro ao salvar câmera: ${err.response?.data?.message || err.message}`);
        }
    };

    const loadAffiliates = async () => {
        try {
            const res = await api.get('/school/affiliates/list');
            setAffiliates(res.data.affiliates || []);
        } catch (err) {
            console.error('Erro ao carregar filiais:', err);
        }
    };

    const switchToAffiliate = async (affiliateId, affiliateName) => {
        try {
            const res = await api.post(`/school/affiliates/switch/${affiliateId}`);
            // Save to localStorage
            localStorage.setItem('selectedSchoolId', affiliateId);
            setCurrentSchoolId(affiliateId);
            alert(`Agora visualizando: ${affiliateName}`);
            // Reload page to refresh all data
            window.location.reload();
        } catch (err) {
            console.error('Erro ao alternar escola:', err);
            alert('Erro ao alternar escola');
        }
    };

    // Build menu items with dynamic affiliates submenu
    const menuItems = [
        { section: 'Gestão Acadêmica' },
        { id: 'dashboard', label: 'Visão Geral', icon: <BarChart3 size={20} /> },
        { id: 'classes', label: 'Turmas', icon: <Users size={20} /> },
        {
            id: 'students',
            label: 'Alunos',
            icon: <Users size={20} />,
            hasSubmenu: true,
            submenu: [
                { id: 'students', label: 'Gerenciar Alunos' },
                { id: 'reports', label: 'Frequência Escolar' }
            ]
        },
        { id: 'teachers', label: 'Professores', icon: <GraduationCap size={20} /> },

        { section: 'Operacional' },

        { id: 'attendance', label: 'Presença (Painel)', icon: <ClipboardCheck size={20} /> },
        { id: 'pickups', label: 'Portaria (Saídas)', icon: <Clock size={20} /> },
        {
            id: 'employees',
            label: 'Funcionários',
            icon: <Users size={20} />,
            hasSubmenu: true,
            submenu: [
                { id: 'employees', label: 'Gerenciar Funcionários' },
                { id: 'employee-clock', label: 'Ponto Biométrico' },
                { id: 'employee-report', label: 'Frequência Funcionários' }
            ]
        },

        { section: 'Comunicação' },

        { id: 'messages', label: 'Mensagens', icon: <MessageCircle size={20} /> },
        { id: 'events', label: 'Eventos', icon: <Calendar size={20} /> },

        { section: 'Administrativo' },
        { id: 'financial', label: 'Financeiro (Pais)', icon: <DollarSign size={20} /> },
        { id: 'saas-billing', label: 'Assinatura', icon: <FileText size={20} /> },
        {
            id: 'affiliates',
            label: 'Rede de Ensino',
            icon: <Building2 size={20} />,
            hasSubmenu: true,
            submenu: [
                {
                    id: `school-${schoolId}`,
                    label: user?.name || 'Minha Escola',
                    isAffiliate: true,
                    affiliateId: schoolId,
                    isMainSchool: true
                },
                { id: 'affiliates', label: 'Gerenciar Filiais' },
                ...affiliates.map(aff => ({
                    id: `affiliate-${aff.school_id}`,
                    label: aff.name,
                    isAffiliate: true,
                    affiliateId: aff.school_id
                }))
            ]
        },

        { section: 'Ajuda' },

        { id: 'faq', label: 'FAQ', icon: <FileText size={20} /> },
    ];

    const openEditSchoolModal = async () => {
        try {
            // First try to use current user data
            setEditSchoolData({
                name: user?.name || '',
                email: user?.email || '',
                cnpj: user?.cnpj || '',
                address: user?.address || '',
                number: user?.number || '',
                zip_code: user?.zip_code || '',
                latitude: user?.latitude || '',
                longitude: user?.longitude || ''
            });

            // Then fetch latest full data
            const res = await api.get('/school/settings');
            if (res.data) {
                setEditSchoolData(prev => ({
                    ...prev,
                    ...res.data
                }));
            }
            setIsEditSchoolModalOpen(true);
        } catch (err) {
            console.error('Error fetching school settings:', err);
            // Open anyway with what we have
            setIsEditSchoolModalOpen(true);
        }
    };

    const handleUpdateSchool = async () => {
        try {
            await api.post('/school/settings', editSchoolData);
            alert('Dados da escola atualizados com sucesso!');
            setIsEditSchoolModalOpen(false);
            window.location.reload(); // Reload to reflect changes
        } catch (err) {
            console.error('Erro ao atualizar escola:', err);
            alert('Erro ao atualizar dados: ' + (err.response?.data?.error || err.message));
        }
    };

    const toggleMenu = (menuId) => {
        setExpandedMenus(prev => ({
            ...prev,
            [menuId]: !prev[menuId]
        }));
    };

    // Sync currentSchoolId with user.id once user loads (if not overridden)
    useEffect(() => {
        if (user?.id) {
            const saved = localStorage.getItem('selectedSchoolId');
            if (!saved) {
                setCurrentSchoolId(user.id);
            }
        }
    }, [user]);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            loadTeachers();
            loadClasses();
            loadStudents();
            loadCameras();
            loadEmployees();
            loadEvents();
        }
        if (activeTab === 'teachers') {
            loadTeachers();
            loadClasses(); // Load classes for linking modal
        }
        if (activeTab === 'classes') loadClasses();
        if (activeTab === 'students') {
            loadStudents();
            loadClasses();
        }
        if (activeTab === 'attendance') {
            loadStudents(); // AttendancePanel needs students data
        }
        if (activeTab === 'reports') {
            loadStudents();
        }
        if (activeTab === 'cameras') {
            loadCameras();
        }
    }, [activeTab, currentSchoolId]);



    const requestCameraRemoval = async (cameraId, cameraName) => {
        const reason = prompt(`📝 Motivo da remoção da câmera "${cameraName}":\n(Esta solicitação será enviada para aprovação do Super Admin)`);

        if (!reason || reason.trim() === '') {
            alert('⚠️ É necessário informar um motivo para a remoção');
            return;
        }

        if (!confirm('Confirma o envio da solicitação de remoção?')) {
            return;
        }

        try {
            await api.post(`/school/cameras/${cameraId}/request-removal`, { reason });
            alert('✅ Solicitação enviada com sucesso!\nAguarde a aprovação do Super Admin.');
        } catch (err) {
            console.error('Erro ao solicitar remoção:', err);
            alert(`❌ ${err.response?.data?.message || 'Erro ao solicitar remoção'}`);
        }
    };

    const loadClasses = async () => {
        try {
            const url = currentSchoolId !== schoolId
                ? `/school/classes?school_id=${currentSchoolId}`
                : '/school/classes';
            const res = await api.get(url);
            setClasses(res.data);
        } catch (err) {
            console.error('Failed to load classes', err);
            if (err.response?.status === 403) {
                console.warn('Resetting school ID due to 403');
                localStorage.removeItem('selectedSchoolId');
                setCurrentSchoolId(schoolId);
            }
        }
    };

    const handleCreateClass = async () => {
        if (!newClass.trim()) {
            alert('Digite o nome da turma');
            return;
        }
        try {
            await api.post('/school/classes', { name: newClass });
            alert('Turma criada com sucesso!');
            setNewClass('');
            loadClasses();
        } catch (err) {
            alert('Erro ao criar turma');
        }
    };

    const loadTeachers = async () => {
        try {
            const url = currentSchoolId !== schoolId
                ? `/school/teachers?school_id=${currentSchoolId}`
                : '/school/teachers';
            const res = await api.get(url);
            setTeachers(res.data);
        } catch (err) {
            console.error('Failed to load teachers', err);
            if (err.response?.status === 403) {
                localStorage.removeItem('selectedSchoolId');
                setCurrentSchoolId(schoolId);
            }
        }
    };

    const loadStudents = async () => {
        try {
            const url = currentSchoolId !== schoolId
                ? `/school/students?school_id=${currentSchoolId}`
                : '/school/students';
            const res = await api.get(url);
            setStudents(res.data);
        } catch (err) {
            console.error('Failed to load students', err);
            if (err.response?.status === 403) {
                localStorage.removeItem('selectedSchoolId');
                setCurrentSchoolId(schoolId);
            }
        }
    };

    const handleLinkTeacher = async () => {
        if (!searchEmail.trim()) {
            alert('Digite o email do professor');
            return;
        }

        try {
            const res = await api.get(`/school/search-teacher?email=${searchEmail}`);
            const teacher = res.data;

            if (teacher.school_id && teacher.school_id !== null) {
                alert('Este professor já está vinculado a outra escola');
                return;
            }

            setSelectedTeacher(teacher);
            // Don't close modal yet, we need to show class selection
        } catch (err) {
            alert(err.response?.data?.message || 'Professor não encontrado no sistema');
        }
    };

    const confirmLinkTeacher = async () => {
        if (!selectedTeacher) return;

        try {
            await api.post('/school/link-teacher', {
                teacher_id: selectedTeacher.id,
                class_ids: selectedClasses
            });
            alert('Professor vinculado com sucesso!');
            setShowLinkModal(false);
            setSearchEmail('');
            setSelectedTeacher(null);
            setSelectedClasses([]);
            loadTeachers();
        } catch (err) {
            alert(err.response?.data?.message || 'Erro ao vincular professor');
        }
    };

    const handleUnlinkTeacher = async (teacherId, teacherName) => {
        const confirm = window.confirm(`Deseja realmente desvincular o professor ${teacherName}?`);
        if (!confirm) return;

        try {
            await api.post('/school/unlink-teacher', { teacher_id: teacherId });
            alert('Professor desvinculado com sucesso!');
            loadTeachers();
        } catch (err) {
            alert(err.response?.data?.message || 'Erro ao desvincular professor');
        }
    };

    const handleCreateStudent = async (e) => {
        e.preventDefault();

        try {
            const isEditing = studentForm.id; // Se tem ID, é edição

            console.log(isEditing ? '📝 Editando aluno:' : '📤 Cadastrando novo aluno:', studentForm);

            if (isEditing) {
                // Editar aluno existente
                await api.put(`/school/students/${studentForm.id}`, studentForm);
                console.log('✅ Aluno atualizado com sucesso!');
                alert('✅ Aluno atualizado com sucesso!');
            } else {
                // Criar novo aluno
                // Criar novo aluno
                const response = await api.post('/school/students', studentForm);
                const { guardian_login, guardian_password } = response.data;

                console.log('✅ Aluno cadastrado. Resposta:', response.data);

                let message = '✅ Aluno cadastrado com sucesso!';
                if (guardian_login && guardian_password) {
                    message += `\n\n📧 Conta do Responsável Criada:\nLogin: ${guardian_login}\nSenha: ${guardian_password}\n\n(Anote ou tire foto!)`;
                } else if (guardian_login) {
                    message += `\n\n📧 Aluno vinculado ao responsável: ${guardian_login}`;
                }

                alert(message);
            }

            setShowStudentForm(false);
            setStudentForm({
                name: '',
                parent_email: '',
                phone: '',
                class_name: ''
            });
            loadStudents();
        } catch (err) {
            console.error('❌ Erro ao salvar aluno:', err);
            console.error('Detalhes do erro:', err.response?.data);
            alert(`Erro ao salvar aluno: ${err.response?.data?.message || err.message}`);
        }
    };

    const handlePhotoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const imgUrl = reader.result;

            // MOSTRAR FOTO IMEDIATAMENTE
            setStudentForm(prev => ({ ...prev, photo_url: imgUrl }));

            try {
                console.log('🔄 Processando foto do aluno...');

                // Criar elemento de imagem
                const img = await faceapi.fetchImage(imgUrl);

                // Detectar rosto e extrair descritor
                const detection = await faceapi
                    .detectSingleFace(img, new faceapi.SsdMobilenetv1Options())
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (detection) {
                    const descriptor = Array.from(detection.descriptor);

                    setStudentForm(prev => ({
                        ...prev,
                        photo_url: imgUrl,
                        face_descriptor: JSON.stringify(descriptor) // Salvar como string JSON
                    }));

                    console.log('✅ Rosto detectado! Descritor extraído com sucesso.');
                    console.log(`📊 Descritor tem ${descriptor.length} dimensões`);
                    alert('✅ Rosto detectado e processado com sucesso! Agora você pode salvar o aluno.');
                } else {
                    console.warn('⚠️ Nenhum rosto detectado na foto');
                    alert('❌ Nenhum rosto detectado na foto.\n\nDicas:\n- Use uma foto clara do rosto\n- Certifique-se de que o rosto está bem iluminado\n- Evite fotos muito pequenas ou de baixa qualidade');
                    setStudentForm(prev => ({ ...prev, photo_url: '', face_descriptor: null }));
                }
            } catch (err) {
                console.error('❌ Erro ao processar foto:', err);
                alert('⚠️ Erro ao processar a foto. Tente outra imagem.');
                setStudentForm(prev => ({ ...prev, photo_url: '', face_descriptor: null }));
            }
        };

        reader.readAsDataURL(file);
    };

    const handleDeleteStudent = async (studentId, studentName) => {
        if (!confirm(`Tem certeza que deseja excluir o aluno "${studentName}"?\n\nEsta ação não pode ser desfeita!`)) {
            return;
        }

        try {
            console.log(`🗑️ Excluindo aluno ID ${studentId}...`);
            await api.delete(`/school/students/${studentId}`);
            console.log('✅ Aluno excluído com sucesso!');
            alert(`✅ Aluno "${studentName}" excluído com sucesso!`);
            loadStudents(); // Recarregar lista
        } catch (error) {
            console.error('❌ Erro ao excluir aluno:', error);
            alert(`Erro ao excluir aluno: ${error.response?.data?.message || error.message}`);
        }
    };



    const handleSendSupport = async () => {
        if (!supportMessage.trim()) {
            alert('Por favor, escreva sua mensagem');
            return;
        }
        try {
            await api.post('/school/support', { message: supportMessage });
            alert('Mensagem enviada com sucesso! Aguarde resposta do suporte.');
            setSupportMessage('');
        } catch (err) {
            alert('Erro ao enviar mensagem');
        }
    };

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
                onAffiliateClick={switchToAffiliate}
            />

            <div className="main-content">
                {activeTab === 'dashboard' && (
                    <div className="fade-in" style={{ paddingBottom: '3rem' }}>
                        {/* Header com Data e Hora */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '2rem' }}>
                            <div>
                                <h2 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Visão Geral</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Resumo em tempo real da sua escola</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-primary)', fontFamily: 'monospace' }}>
                                    {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                    {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </div>
                            </div>
                        </div>

                        {/* Métricas Principais (KPIS) - Clicáveis */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

                            {/* Card Alunos */}
                            <div
                                onClick={() => setActiveTab('students')}
                                style={{
                                    position: 'relative', overflow: 'hidden', padding: '1.5rem', borderRadius: '16px',
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(30, 30, 40, 0.4) 100%)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(59, 130, 246, 0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.1, color: '#3b82f6' }}>
                                    <Users size={100} />
                                </div>
                                <h3 style={{ fontSize: '3rem', fontWeight: '800', margin: 0, lineHeight: 1, color: '#3b82f6' }}>{students.length}</h3>
                                <p style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px', fontWeight: '600', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    Total de Alunos <ArrowRight size={14} />
                                </p>
                            </div>

                            {/* Card Professores */}
                            <div
                                onClick={() => setActiveTab('teachers')}
                                style={{
                                    position: 'relative', overflow: 'hidden', padding: '1.5rem', borderRadius: '16px',
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(30, 30, 40, 0.4) 100%)',
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(139, 92, 246, 0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.1, color: '#8b5cf6' }}>
                                    <GraduationCap size={100} />
                                </div>
                                <h3 style={{ fontSize: '3rem', fontWeight: '800', margin: 0, lineHeight: 1, color: '#8b5cf6' }}>{teachers.length}</h3>
                                <p style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px', fontWeight: '600', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    Professores <ArrowRight size={14} />
                                </p>
                            </div>

                            {/* Card Turmas */}
                            <div
                                onClick={() => setActiveTab('classes')}
                                style={{
                                    position: 'relative', overflow: 'hidden', padding: '1.5rem', borderRadius: '16px',
                                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(30, 30, 40, 0.4) 100%)',
                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                    cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(245, 158, 11, 0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.1, color: '#f59e0b' }}>
                                    <Users size={100} />
                                </div>
                                <h3 style={{ fontSize: '3rem', fontWeight: '800', margin: 0, lineHeight: 1, color: '#f59e0b' }}>{classes.length}</h3>
                                <p style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px', fontWeight: '600', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    Turmas <ArrowRight size={14} />
                                </p>
                            </div>
                        </div>

                        {/* Seção Gráficos e Detalhes */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

                            {/* Gráfico Melhorado */}
                            <div style={{ padding: '2rem', borderRadius: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                                <h4 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                    <BarChart3 size={20} className="text-accent-primary" /> Distribuição de Alunos por Turma
                                </h4>

                                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '240px', gap: '20px', paddingBottom: '10px' }}>
                                    {students.length > 0 ? Object.entries(students.reduce((acc, s) => {
                                        const cls = s.class_name || 'S/ Turma';
                                        acc[cls] = (acc[cls] || 0) + 1;
                                        return acc;
                                    }, {})).slice(0, 8).map(([cls, count], i, arr) => {
                                        const max = Math.max(...arr.map(a => a[1])) || 1;
                                        const height = (count / max) * 100;
                                        return (
                                            <div key={cls} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%' }}>

                                                {/* Barra */}
                                                <div className="tooltip-container" style={{ width: '40px', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                                    <div style={{
                                                        width: '100%',
                                                        height: `${height}%`,
                                                        background: `linear-gradient(to top, hsl(${210 + (i * 20)}, 70%, 50%), hsl(${210 + (i * 20)}, 70%, 65%))`,
                                                        borderRadius: '8px 8px 0 0',
                                                        opacity: 0.9,
                                                        transition: 'height 1s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        position: 'relative',
                                                        minHeight: '4px'
                                                    }}>

                                                    </div>
                                                    <span className="tooltip" style={{ bottom: '100%', marginBottom: '5px' }}>{count} alunos</span>
                                                    {/* Contador acima da barra */}
                                                    <span style={{ position: 'absolute', bottom: `${height + 5}%`, fontSize: '0.85rem', fontWeight: '700', color: 'white' }}>{count}</span>
                                                </div>

                                                {/* Label da Turma */}
                                                <span style={{
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600',
                                                    color: 'var(--text-secondary)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    maxWidth: '100%',
                                                    marginTop: '0.5rem'
                                                }}>
                                                    {cls}
                                                </span>
                                            </div>
                                        );
                                    }) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '1rem', opacity: 0.5 }}>
                                            <BarChart3 size={48} />
                                            <p>Ainda não há dados de alunos</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Widget de Próximos Eventos */}
                            <div style={{ padding: '2rem', borderRadius: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                                <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                    <Calendar size={20} className="text-accent-primary" /> Próximos Eventos
                                </h4>

                                <div style={{ flex: 1 }}>
                                    {upcomingEvents.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {upcomingEvents.slice(0, 3).map(event => (
                                                <div key={event.id} style={{ display: 'flex', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', alignItems: 'center', transition: 'background 0.2s', cursor: 'pointer' }} onClick={() => setActiveTab('events')} className="hover:bg-white/5">
                                                    <div style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.5rem', borderRadius: '8px', textAlign: 'center', minWidth: '50px' }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{new Date(event.event_date).getDate()}</div>
                                                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>{new Date(event.event_date).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</div>
                                                    </div>
                                                    <div>
                                                        <h5 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{event.title}</h5>
                                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{event.description || 'Ver detalhes...'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            <button className="btn" style={{ width: '100%', marginTop: '0.5rem', background: 'rgba(255,255,255,0.05)' }} onClick={() => setActiveTab('events')}>
                                                Ver Calendário Completo
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '1rem', opacity: 0.5, minHeight: '150px' }}>
                                            <Calendar size={48} />
                                            <p>Nenhum evento próximo</p>
                                            <button className="btn" style={{ background: 'var(--bg-secondary)', fontSize: '0.8rem', border: '1px solid var(--border-color)' }} onClick={() => setActiveTab('events')}>
                                                + Criar Evento
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Lista de Acesso Rápido Estilizada */}
                            <div style={{ padding: '1.5rem', borderRadius: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ marginBottom: '1.5rem' }}>Ações Rápidas</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <button
                                        onClick={() => setActiveTab('students')}
                                        style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                                        className="hover-card"
                                    >
                                        <Users size={24} style={{ color: '#3b82f6', marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: '600' }}>Gerenciar Alunos</div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab('attendance')}
                                        style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                                        className="hover-card"
                                    >
                                        <ClipboardCheck size={24} style={{ color: '#10b981', marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: '600' }}>Presença</div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab('teachers')}
                                        style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.1)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                                        className="hover-card"
                                    >
                                        <GraduationCap size={24} style={{ color: '#8b5cf6', marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: '600' }}>Professores</div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab('financial')}
                                        style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(236, 72, 153, 0.05)', border: '1px solid rgba(236, 72, 153, 0.1)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                                        className="hover-card"
                                    >
                                        <DollarSign size={24} style={{ color: '#ec4899', marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: '600' }}>Financeiro</div>
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {activeTab !== 'dashboard' && (
                    <>
                        {/* School Header */}
                        <div style={{
                            marginBottom: '1.5rem',
                            padding: '1.5rem',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            borderRadius: 'var(--radius)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'start'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem',
                                    fontWeight: '700',
                                    color: 'white'
                                }}>
                                    {user?.name?.charAt(0) || 'E'}
                                </div>
                                <div>
                                    <h1 style={{
                                        fontSize: '1.75rem',
                                        fontWeight: '700',
                                        marginBottom: '0.25rem',
                                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text'
                                    }}>
                                        {user?.name || 'Escola'}
                                    </h1>
                                    <p style={{
                                        fontSize: '0.875rem',
                                        color: 'var(--text-secondary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        flexWrap: 'wrap'
                                    }}>
                                        <span>📧 {user?.email}</span>
                                        {user?.cnpj && <span>• 🏢 CNPJ: {user?.cnpj}</span>}
                                        {user?.address && <span>• 📍 {user?.address}</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="tooltip-container">
                                <button
                                    className="btn btn-icon"
                                    onClick={openEditSchoolModal}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        border: '1px solid rgba(255, 255, 255, 0.2)'
                                    }}
                                >
                                    <Edit size={18} />
                                </button>
                                <span className="tooltip">Editar Informações da Escola</span>
                            </div>
                        </div>

                        <SchoolSelector
                            currentSchoolId={currentSchoolId}
                            onSchoolChange={(school) => {
                                console.log('Escola alterada:', school);
                                // Recarregar dados da nova escola
                                window.location.reload();
                            }}
                        />
                    </>
                )}
                {activeTab === 'teachers' && (
                    <div className="fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>Professores ({teachers.length})</h1>
                            <button className="btn btn-primary" onClick={() => setShowLinkModal(true)}>
                                Buscar e Vincular Professor
                            </button>
                        </div>

                        {showLinkModal && (
                            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>Vincular Novo Professor</h3>

                                {!selectedTeacher ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="btn"
                                            onClick={() => setShowTour(true)}
                                            style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
                                            title="Iniciar Tour Guiado"
                                        >
                                            <HelpCircle size={20} />
                                            <span className="hidden-mobile">Ajuda</span>
                                        </button>
                                        <button className="btn" onClick={() => {
                                            setEditSchoolData({
                                                name: currentSchool?.name || '',
                                                email: currentSchool?.email || '',
                                                cnpj: currentSchool?.cnpj || '',
                                                address: currentSchool?.address || '',
                                                number: currentSchool?.number || '',
                                                zip_code: currentSchool?.zip_code || '',
                                            });
                                            setIsEditSchoolModalOpen(true);
                                        }}
                                            style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
                                            title="Editar Informações da Escola"
                                        >
                                            <Edit size={20} />
                                            <span className="hidden-mobile">Editar Escola</span>
                                        </button>
                                        <input
                                            className="input-field"
                                            placeholder="Email do professor"
                                            value={searchEmail}
                                            onChange={(e) => setSearchEmail(e.target.value)}
                                        />
                                        <button className="btn btn-primary" onClick={handleLinkTeacher}>Buscar</button>
                                        <button className="btn" style={{ background: 'var(--bg-secondary)' }} onClick={() => setShowLinkModal(false)}>Cancelar</button>
                                    </div>
                                ) : (
                                    <div className="fade-in">
                                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem' }}>
                                            <p><strong>Nome:</strong> {selectedTeacher.name}</p>
                                            <p><strong>Email:</strong> {selectedTeacher.email}</p>
                                            <p><strong>Matéria:</strong> {selectedTeacher.subject || 'Não informada'}</p>
                                        </div>

                                        <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Selecione as turmas permitidas:</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                                            {classes.map(cls => (
                                                <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClasses.includes(cls.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedClasses([...selectedClasses, cls.id]);
                                                            } else {
                                                                setSelectedClasses(selectedClasses.filter(id => id !== cls.id));
                                                            }
                                                        }}
                                                    />
                                                    <span>{cls.name}</span>
                                                </label>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <button className="btn btn-primary" onClick={confirmLinkTeacher}>Confirmar Vínculo</button>
                                            <button className="btn" style={{ background: 'var(--bg-secondary)' }} onClick={() => {
                                                setSelectedTeacher(null);
                                                setSelectedClasses([]);
                                            }}>Voltar</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                            {teachers.map(teacher => (
                                <TeacherCard
                                    key={teacher.id}
                                    teacher={teacher}
                                    onLinkClass={(t) => {
                                        setSelectedTeacher(t);
                                        setShowLinkModal(true);
                                    }}
                                    onMessage={(t) => {
                                        setTeacherForModal(t);
                                        setShowMessageModal(true);
                                    }}
                                    onMetrics={(t) => {
                                        setTeacherForModal(t);
                                        setShowMetricsModal(true);
                                    }}
                                    onUnlink={(t) => handleUnlinkTeacher(t.id, t.name)}
                                />
                            ))}
                            {teachers.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
                                    Nenhum professor vinculado. Clique em "Buscar e Vincular Professor" para adicionar.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'students' && (
                    <div className="fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>Alunos</h1>
                            <button className="btn btn-primary" onClick={() => {
                                console.log('🔄 Abrindo form de aluno e recarregando turmas...');
                                loadClasses();
                                setShowStudentForm(true);
                            }}>
                                Cadastrar Aluno
                            </button>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <input
                                className="input-field"
                                type="text"
                                placeholder="🔍 Buscar aluno por nome..."
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                                style={{ maxWidth: '400px' }}
                            />
                        </div>

                        {showStudentForm && (
                            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                                    {studentForm.id ? '✏️ Editar Aluno' : '➕ Novo Aluno'}
                                </h3>
                                <form onSubmit={handleCreateStudent} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <input
                                        className="input-field"
                                        placeholder="Nome do Aluno"
                                        value={studentForm.name}
                                        onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                                        required
                                    />
                                    <input
                                        className="input-field"
                                        type="email"
                                        placeholder="Email do Responsável"
                                        value={studentForm.parent_email}
                                        onChange={(e) => setStudentForm({ ...studentForm, parent_email: e.target.value })}
                                        required
                                    />

                                    <input
                                        className="input-field"
                                        placeholder="Telefone do Responsável"
                                        value={studentForm.phone}
                                        onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                                        required
                                    />
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Turma *</label>
                                        <select
                                            className="input-field"
                                            value={studentForm.class_name || ''}
                                            onChange={(e) => setStudentForm({ ...studentForm, class_name: e.target.value })}
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                background: 'rgba(255,255,255,0.05)',
                                                color: '#fff',
                                                fontSize: '1rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="" style={{ background: '#1e293b', color: '#fff' }}>Selecione uma turma</option>
                                            {classes.map(cls => (
                                                <option key={cls.id} value={cls.name} style={{ background: '#1e293b', color: '#fff' }}>
                                                    {cls.name}
                                                </option>
                                            ))}
                                        </select>
                                        {classes.length === 0 && (
                                            <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.5rem' }}>
                                                ⚠️ Crie turmas na aba "Turmas" primeiro
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ gridColumn: '1 / -1', padding: '1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                        <p style={{ fontSize: '0.85rem', color: '#10b981', margin: 0 }}>
                                            📸 <strong>Biometria facial:</strong> O responsável fará o cadastro biométrico pelo App Guardian após vincular o aluno.
                                        </p>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button type="submit" className="btn btn-primary">Cadastrar</button>
                                        <button type="button" className="btn" style={{ background: 'var(--bg-secondary)' }} onClick={() => setShowStudentForm(false)}>Cancelar</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        <div className="card-grid">
                            {students
                                .filter(student => student.name.toLowerCase().includes(studentSearch.toLowerCase()))
                                .map(student => (
                                    <div key={student.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                                            {student.photo_url ? (
                                                <img
                                                    src={student.photo_url}
                                                    alt={student.name}
                                                    style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 1rem', display: 'block', border: '3px solid var(--accent-primary)' }}
                                                />
                                            ) : (
                                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: '700', color: 'white' }}>
                                                    {student.name.charAt(0)}
                                                </div>
                                            )}
                                            <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>{student.name}</h3>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{student.age} anos - {student.class_name || 'Sem turma'}</p>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                <div>Responsável: {student.parent_email}</div>
                                                <div>Tel: {student.phone}</div>
                                            </div>

                                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <button
                                                    className="btn"
                                                    style={{ width: '100%', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    onClick={() => setSelectedStudent(student)}
                                                >
                                                    Ver Detalhes
                                                </button>
                                                <button
                                                    className="btn"
                                                    style={{ width: '100%', background: 'var(--accent-primary)', color: '#fff' }}
                                                    onClick={() => {
                                                        setStudentForm({
                                                            id: student.id,
                                                            name: student.name,
                                                            parent_email: student.parent_email,
                                                            phone: student.phone,
                                                            photo_url: student.photo_url,
                                                            class_name: student.class_name,
                                                            age: student.age,
                                                            face_descriptor: student.face_descriptor
                                                        });
                                                        setShowStudentForm(true);
                                                    }}
                                                >
                                                    ✏️ Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteStudent(student.id, student.name)}
                                                    className="btn"
                                                    style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}
                                                >
                                                    Excluir
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            {students.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
                                    Nenhum aluno cadastrado. Clique em "Cadastrar Aluno" para adicionar.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <AttendancePanel schoolId={schoolId} />
                )}

                {activeTab === 'reports' && (
                    <div className="fade-in">
                        <AttendanceReport schoolId={schoolId} />
                    </div>
                )}

                {activeTab === 'classes' && (
                    <div className="fade-in">
                        <ClassesPanel schoolId={schoolId} />
                    </div>
                )}

                {false && activeTab === 'cameras' && (
                    <div className="fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div>
                                <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0 }}>📹 Câmeras de Monitoramento</h1>
                                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                    Gerencie as câmeras de segurança e reconhecimento facial da escola.
                                    <br />
                                    <span style={{ fontSize: '0.85em', color: '#10b981' }}>✅ O monitoramento é processado pelo servidor e continua ativo mesmo com este painel fechado.</span>
                                </p>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    setShowCameraForm(!showCameraForm);
                                    if (!showCameraForm) {
                                        // Carrega turmas para o select se for abrir
                                        api.get('/school/classes').then(res => setClasses(res.data)).catch(console.error);
                                    }
                                }}
                            >
                                {showCameraForm ? <X size={20} /> : <Plus size={20} />}
                                {showCameraForm ? 'Cancelar' : 'Nova Câmera'}
                            </button>
                        </div>

                        {showCameraForm && (
                            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                                <form onSubmit={handleAddCamera}>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>Cadastrar Nova Câmera</h3>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Finalidade *</label>
                                            <select
                                                className="input-field"
                                                value={cameraForm.camera_purpose}
                                                onChange={(e) => setCameraForm({ ...cameraForm, camera_purpose: e.target.value })}
                                                required
                                            >
                                                <option value="entrance">🚪 Entrada (Reconhecimento Facial - Alunos)</option>
                                                <option value="classroom">📚 Sala de Aula (Monitoramento)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Nome da Câmera *</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                placeholder="Ex: Câmera Portaria, Sala 101..."
                                                value={cameraForm.camera_name}
                                                onChange={(e) => setCameraForm({ ...cameraForm, camera_name: e.target.value })}
                                                required
                                            />
                                        </div>

                                        {cameraForm.camera_purpose === 'classroom' && (
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Vincular à Turma (Opcional)</label>
                                                <select
                                                    className="input-field"
                                                    value={cameraForm.assigned_classes[0] || ''}
                                                    onChange={(e) => setCameraForm({ ...cameraForm, assigned_classes: e.target.value ? [e.target.value] : [] })}
                                                >
                                                    <option value="">-- Nenhuma (Apenas Corredor/Pátio) --</option>
                                                    {classes.map(cls => (
                                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>URL da Câmera (RTSP/HTTP) *</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                placeholder="rtsp://admin:senha@192.168.1.100:554/stream"
                                                value={cameraForm.camera_url}
                                                onChange={(e) => setCameraForm({ ...cameraForm, camera_url: e.target.value })}
                                                required
                                            />
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                                Esta URL deve ser acessível pelo servidor.
                                            </p>
                                        </div>
                                    </div>

                                    {testResult && (
                                        <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: '8px', background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: testResult.success ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {testResult.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                            {testResult.message}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="button" className="btn" style={{ background: 'var(--bg-secondary)' }} onClick={testConnection} disabled={testing}>
                                            {testing ? 'Testando...' : '🔍 Testar Conexão'}
                                        </button>
                                        <button type="submit" className="btn btn-primary">💾 Salvar Câmera</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Seção de Reconhecimento Facial */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                🎯 Reconhecimento Facial em Tempo Real
                            </h3>
                            <UniversalCameraRecognition
                                cameraUrl={cameras.find(c => c.camera_purpose === 'entrance')?.camera_url || cameras.find(c => c.camera_purpose === 'entrance')?.url}
                                cameraName={cameras.find(c => c.camera_purpose === 'entrance')?.camera_name || 'Câmera de Entrada'}
                                schoolId={schoolId}
                                students={students}
                                onRecognition={(recognition) => {
                                    console.log('📸 Aluno reconhecido:', recognition);
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {cameras.map(camera => (
                                <div key={camera.id} className="glass-panel" style={{ padding: '1.5rem', borderLeft: camera.status === 'active' ? '4px solid #10b981' : '4px solid #ef4444' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                        <div>
                                            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {camera.camera_purpose === 'entrance' ? '🚪' : '📚'} {camera.camera_name || camera.name}
                                            </h3>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                                <div><strong>Finalidade:</strong> {camera.camera_purpose === 'entrance' ? 'Entrada (Face ID)' : 'Monitoramento'}</div>
                                                <div><strong>URL:</strong> {camera.camera_url || camera.url}</div>
                                                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: camera.status === 'active' ? '#10b981' : '#ef4444' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: camera.status === 'active' ? '#10b981' : '#ef4444' }} />
                                                        {camera.status === 'active' ? 'Online' : 'Offline'}
                                                    </span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
                                                        Monitoramento Ativo
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            {/* Botões de Ação Futuros (Editar/Excluir) */}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {cameras.length === 0 && !showCameraForm && (
                                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                                    <Camera size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem', opacity: 0.5 }} />
                                    <h3 style={{ marginBottom: '0.5rem' }}>Nenhuma câmera configurada</h3>
                                    <p style={{ color: 'var(--text-secondary)' }}>
                                        Clique em "Nova Câmera" para adicionar o monitoramento.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {false && activeTab === 'support' && (
                    <div className="fade-in">
                        <SupportTickets userType="school" userId={schoolId} />
                    </div>
                )}

                {activeTab === 'events' && (
                    <div className="fade-in">
                        <SchoolCommunicationPanel schoolId={schoolId} initialTab="events" />
                    </div>
                )}

                {activeTab === 'messages' && (
                    <div className="fade-in">
                        <SchoolCommunicationPanel schoolId={schoolId} initialTab="chat" />
                    </div>
                )}

                {activeTab === 'employees' && (
                    <div className="fade-in">
                        <EmployeeManagement schoolId={schoolId} />
                    </div>
                )}

                {activeTab === 'employee-clock' && (
                    <div className="fade-in">
                        <EmployeeAttendancePanel schoolId={schoolId} />
                    </div>
                )}

                {activeTab === 'employee-report' && (
                    <div className="fade-in">
                        <EmployeeAttendanceReport schoolId={schoolId} />
                    </div>
                )}

                {activeTab === 'faq' && (
                    <div className="fade-in">
                        <SchoolFAQ />
                    </div>
                )}

                {activeTab === 'affiliates' && (
                    <div className="fade-in">
                        <AffiliatesPanel
                            schoolId={schoolId}
                            onSwitchSchool={(school) => {
                                // Atualizar contexto da escola visualizada
                                console.log('Alternando para escola:', school);
                                // Aqui você pode adicionar lógica para atualizar o estado global
                                // e recarregar dados da nova escola
                            }}
                        />
                    </div>
                )}

                {activeTab === 'pickups' && (
                    <SchoolPickupsManager />
                )}

                {activeTab === 'financial' && (
                    <div className="fade-in">
                        <FinancialPanel schoolId={currentSchoolId} />
                    </div>
                )}

                {activeTab === 'saas-billing' && (
                    <div className="fade-in">
                        <SchoolSaaSBilling schoolId={currentSchoolId} />
                    </div>
                )}
            </div>

            {/* Modal de Perfil do Aluno */}
            {selectedStudent && (
                <StudentProfileModal
                    student={selectedStudent}
                    onClose={() => setSelectedStudent(null)}
                />
            )}

            {/* Modal de Métricas do Professor */}
            {showMetricsModal && teacherForModal && (
                <TeacherMetricsModal
                    teacher={teacherForModal}
                    schoolId={schoolId}
                    onClose={() => {
                        setShowMetricsModal(false);
                        setTeacherForModal(null);
                    }}
                />
            )}

            {/* Modal de Mensagem para Professor */}
            {showMessageModal && teacherForModal && (
                <TeacherMessageModal
                    teacher={teacherForModal}
                    schoolId={schoolId}
                    onClose={() => {
                        setShowMessageModal(false);
                        setTeacherForModal(null);
                    }}
                />
            )}

            {/* Modal de Detalhes da Turma */}
            {showClassModal && selectedClass && (
                <ClassDetailsModal
                    classData={selectedClass}
                    schoolId={schoolId}
                    onClose={() => {
                        setShowClassModal(false);
                        setSelectedClass(null);
                    }}
                    onUpdate={() => {
                        loadClasses();
                    }}
                />
            )}

            {/* Modal de Edição da Escola */}
            {isEditSchoolModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Editar Dados da Escola</h2>

                        <div className="form-group">
                            <label>Nome da Escola</label>
                            <input
                                className="input-field"
                                value={editSchoolData.name}
                                onChange={e => setEditSchoolData({ ...editSchoolData, name: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Email</label>
                            <input
                                className="input-field"
                                value={editSchoolData.email}
                                onChange={e => setEditSchoolData({ ...editSchoolData, email: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>CNPJ</label>
                            <input
                                className="input-field"
                                value={editSchoolData.cnpj}
                                onChange={e => setEditSchoolData({ ...editSchoolData, cnpj: e.target.value })}
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Endereço</label>
                                <input
                                    className="input-field"
                                    value={editSchoolData.address}
                                    placeholder="Rua Exemplo"
                                    onChange={e => setEditSchoolData({ ...editSchoolData, address: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ maxWidth: '100px' }}>
                                <label>Número</label>
                                <input
                                    className="input-field"
                                    value={editSchoolData.number}
                                    placeholder="123"
                                    onChange={e => setEditSchoolData({ ...editSchoolData, number: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>CEP</label>
                            <input
                                className="input-field"
                                value={editSchoolData.zip_code}
                                placeholder="00000-000"
                                onChange={e => setEditSchoolData({ ...editSchoolData, zip_code: e.target.value })}
                            />
                        </div>

                        <div style={{ marginTop: '1rem', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', fontSize: '0.9rem', color: '#60a5fa' }}>
                            📍 As coordenadas de latitude e longitude serão atualizadas automaticamente com base no endereço fornecido.
                        </div>

                        <div className="modal-actions">
                            <button className="btn" onClick={() => setIsEditSchoolModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleUpdateSchool}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {showTour && (
                <OnboardingTour
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onClose={() => setShowTour(false)}
                    isFirstVisit={isFirstVisit}
                />
            )}

            {/* Botão de Logout Flutuante para Tablets/Mobile */}
            <button
                className="floating-logout-btn"
                onClick={logout}
                title="Sair"
            >
                <LogOut size={24} />
            </button>
        </div>
    );
}
