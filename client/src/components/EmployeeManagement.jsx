import { useState, useEffect } from 'react';
import { Users, UserPlus, Edit, Trash2, Camera, X } from 'lucide-react';
import api from '../api/axios';
import * as faceapi from 'face-api.js';

export default function EmployeeManagement({ schoolId }) {
    const [employees, setEmployees] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        role: '',
        phone: '',
        email: '',
        employee_id: '',
        photo_url: '',
        face_descriptor: null,
        work_start_time: '08:00',
        work_end_time: '17:00'
    });

    useEffect(() => {
        loadModels();
        loadEmployees();
    }, []);

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

    const handleEdit = (employee) => {
        setEditingEmployee(employee);
        setFormData({
            name: employee.name,
            role: employee.role,
            phone: employee.phone || '',
            email: employee.email || '',
            employee_id: employee.employee_id || '',
            photo_url: employee.photo_url || '',
            face_descriptor: employee.face_descriptor,
            work_start_time: employee.work_start_time || '08:00',
            work_end_time: employee.work_end_time || '17:00'
        });
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
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
            if (editingEmployee) {
                // Atualizar funcionário existente
                console.log('🔄 Atualizando funcionário:', editingEmployee.id, formData);
                const res = await api.put(`/school/employees/${editingEmployee.id}`, formData);
                alert('✅ ' + (res.data.message || 'Funcionário atualizado com sucesso!'));
            } else {
                // Cadastrar novo funcionário
                console.log('➕ Cadastrando funcionário:', formData);
                const res = await api.post('/school/employees', formData);

                if (res.data.generated_password) {
                    alert(`✅ Funcionário cadastrado com sucesso!\n\n🔑 SENHA DE ACESSO GERADA: ${res.data.generated_password}\n\nPor favor, entregue esta senha ao funcionário para uso no Ponto Biométrico.`);
                } else {
                    alert('✅ Funcionário cadastrado com sucesso!');
                }
            }

            setFormData({
                name: '',
                role: '',
                phone: '',
                email: '',
                employee_id: '',
                photo_url: '',
                face_descriptor: null,
                work_start_time: '08:00',
                work_end_time: '17:00'
            });
            setShowForm(false);
            setEditingEmployee(null);
            loadEmployees();
        } catch (err) {
            console.error('Erro ao salvar funcionário:', err);
            alert(`❌ Erro ao salvar funcionário:\n${err.response?.data?.error || err.message}`);
        }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Deseja excluir o funcionário ${name}?`)) return;

        try {
            await api.delete(`/school/employees/${id}`);
            alert('✅ Funcionário excluído!');
            loadEmployees();
        } catch (err) {
            alert('Erro ao excluir funcionário');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: '700' }}>👥 Funcionários</h2>
                <button
                    onClick={() => setShowForm(true)}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <UserPlus size={20} />
                    Cadastrar Funcionário
                </button>
            </div>

            {showForm && (
                <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                            {editingEmployee ? '✏️ Editar Funcionário' : '➕ Novo Funcionário'}
                        </h3>
                        <button onClick={() => { setShowForm(false); setEditingEmployee(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <input
                            className="input-field"
                            placeholder="Nome Completo"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <input
                            className="input-field"
                            placeholder="Cargo"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
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
                            type="email"
                            placeholder="Email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                        <input
                            className="input-field"
                            placeholder="Telefone"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                ⏰ Horário de Entrada
                            </label>
                            <input
                                className="input-field"
                                type="time"
                                value={formData.work_start_time}
                                onChange={(e) => setFormData({ ...formData, work_start_time: e.target.value })}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                🏁 Horário de Saída
                            </label>
                            <input
                                className="input-field"
                                type="time"
                                value={formData.work_end_time}
                                onChange={(e) => setFormData({ ...formData, work_end_time: e.target.value })}
                                required
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                Foto do Funcionário *
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                style={{ display: 'block', width: '100%', padding: '0.75rem', background: 'rgba(15, 23, 42, 0.6)', border: '2px solid var(--glass-border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                            />
                            {formData.photo_url && (
                                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                                    <img src={formData.photo_url} alt="Preview" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover' }} />
                                </div>
                            )}
                        </div>

                        {editingEmployee && (
                            <div style={{ gridColumn: '1 / -1', marginBottom: '1rem', background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#3b82f6', fontWeight: '600' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.reset_password || false}
                                        onChange={(e) => setFormData({ ...formData, reset_password: e.target.checked })}
                                        style={{ width: '1.25rem', height: '1.25rem' }}
                                    />
                                    Gerar Nova Senha de Acesso
                                </label>
                                <p style={{ marginLeft: '1.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    Marque esta opção se o funcionário esqueceu a senha ou precisa de um novo acesso. A nova senha será exibida após salvar.
                                </p>
                            </div>
                        )}

                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem' }}>
                            <button type="submit" className="btn btn-primary">
                                {editingEmployee ? 'Atualizar' : 'Cadastrar'}
                            </button>
                            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {employees.map(employee => (
                    <div key={employee.id} className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            {employee.photo_url ? (
                                <img
                                    src={employee.photo_url}
                                    alt={employee.name}
                                    style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 1rem', border: '3px solid var(--accent-primary)' }}
                                />
                            ) : (
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: '700', color: 'white' }}>
                                    {employee.name.charAt(0)}
                                </div>
                            )}
                            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>{employee.name}</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{employee.role}</p>
                            {employee.email && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{employee.email}</p>}
                            {employee.phone && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{employee.phone}</p>}

                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => handleEdit(employee)}
                                    className="btn"
                                    style={{ flex: 1, background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}
                                >
                                    <Edit size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(employee.id, employee.name)}
                                    className="btn"
                                    style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {employees.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        <Users size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                        <p>Nenhum funcionário cadastrado</p>
                    </div>
                )}
            </div>
        </div>
    );
}
