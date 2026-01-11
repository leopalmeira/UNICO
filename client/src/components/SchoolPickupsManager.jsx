import { useState, useEffect } from 'react';
import api from '../api/axios';
import { toast } from 'react-hot-toast';
import { MapPin, UserPlus, ShieldCheck, Trash2, Crosshair, Save } from 'lucide-react';

export default function SchoolPickupsManager() {
    // Campos visuais (iniciam vazios para edição)
    const [form, setForm] = useState({
        address: '',
        number: '',
        zip_code: '',
        latitude: '',
        longitude: ''
    });

    const [currentLocation, setCurrentLocation] = useState(null);
    const [loadingGPS, setLoadingGPS] = useState(false);

    // Inspetores
    const [inspectors, setInspectors] = useState([]);
    const [showAddInspector, setShowAddInspector] = useState(false);
    const [newInspector, setNewInspector] = useState({ name: '', email: '', password: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const sRes = await api.get('/school/settings');
            // Salva dados atuais para mostrar no card de status, mas não preenche o form
            if (sRes.data.latitude) {
                setCurrentLocation(sRes.data);
            }
            const iRes = await api.get('/school/inspectors');
            setInspectors(iRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    // --- CAPTURAR GPS (SIMPLES E DIRETO) ---
    const handleCaptureGPS = () => {
        if (!navigator.geolocation) {
            return toast.error("Seu navegador não suporta GPS.");
        }

        setLoadingGPS(true);
        const toastId = toast.loading("Buscando satélites...");

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            // Tenta preencher endereço 'de graça' usando OpenStreetMap (sem chave API complicada)
            let addressFound = '';
            let zipFound = '';
            let numberFound = '';

            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await resp.json();
                if (data && data.address) {
                    addressFound = data.address.road || '';
                    zipFound = data.address.postcode || '';
                    numberFound = data.address.house_number || '';
                }
            } catch (e) {
                console.warn("Não foi possível pegar nome da rua, mas GPS foi capturado.", e);
            }

            setForm({
                ...form,
                latitude: lat,
                longitude: lng,
                address: addressFound,
                number: numberFound,
                zip_code: zipFound
            });

            setLoadingGPS(false);
            toast.success("Localização capturada com sucesso!", { id: toastId });

        }, (err) => {
            setLoadingGPS(false);
            console.error(err);
            toast.error("Erro ao pegar GPS. Verifique se a permissão foi concedida.", { id: toastId });
        }, { enableHighAccuracy: true });
    };

    // --- SALVAR DIRETO ---
    const handleSave = async () => {
        if (!form.latitude || !form.longitude) {
            return toast.error("Capture o GPS primeiro.");
        }

        try {
            await api.post('/school/settings', form);
            toast.success("✅ Localização da escola atualizada!");
            setCurrentLocation(form); // Atualiza visualização
            setForm({ address: '', number: '', zip_code: '', latitude: '', longitude: '' }); // Limpa form
        } catch (err) {
            toast.error("Erro ao salvar.");
        }
    };

    // --- INSPETORES (MANTIDO IGUAL) ---
    const handleCreateInspector = async (e) => {
        e.preventDefault();
        try {
            await api.post('/school/inspectors', newInspector);
            toast.success('Inspetor criado!');
            setNewInspector({ name: '', email: '', password: '' });
            setShowAddInspector(false);
            loadData();
        } catch (err) { toast.error('Erro ao criar conta'); }
    };
    const handleDeleteInspector = async (id, name) => {
        if (confirm(`Excluir ${name}?`)) {
            try {
                await api.delete(`/school/inspectors/${id}`);
                loadData();
                toast.success('Excluído.');
            } catch (e) { toast.error('Erro ao excluir'); }
        }
    };

    return (
        <div className="fade-in">
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}>🎯 Gestão de Portaria</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* PAINEL SIMPLIFICADO GPS */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', color: '#3b82f6' }}>
                            <MapPin size={24} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Localização (GPS)</h3>
                    </div>

                    {/* MOSTRAR ATUAL */}
                    <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Endereço Atual</div>
                        {currentLocation ? (
                            <div>
                                <div style={{ fontSize: '1.1rem', color: '#fff' }}>{currentLocation.address}, {currentLocation.number}</div>
                                <div style={{ color: '#10b981', fontSize: '0.9rem', marginTop: '0.2rem' }}>📍 GPS Configurado</div>
                            </div>
                        ) : (
                            <div style={{ color: '#ef4444' }}>Não configurado</div>
                        )}
                    </div>

                    <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                        Esteja na portaria da escola e clique no botão abaixo para capturar a posição exata.
                    </p>

                    <button
                        onClick={handleCaptureGPS}
                        disabled={loadingGPS}
                        className="btn w-full py-4 mb-6 flex items-center justify-center gap-2"
                        style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                    >
                        <Crosshair size={24} className={loadingGPS ? "animate-spin" : ""} />
                        {loadingGPS ? "Buscando Posição..." : "📍 Capturar Minha Localização Atual"}
                    </button>

                    {/* FORM APÓS CAPTURA */}
                    {form.latitude && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="mb-4 text-center text-green-400 text-sm">
                                GPS Capturado: {form.latitude.toString().slice(0, 8)}, {form.longitude.toString().slice(0, 8)}
                            </div>

                            <div className="mb-4">
                                <label className="text-sm text-gray-400 block mb-1">Confirme o Nome da Rua</label>
                                <input className="input-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="text-sm text-gray-400 block mb-1">Número</label>
                                    <input className="input-field" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 block mb-1">CEP</label>
                                    <input className="input-field" value={form.zip_code} onChange={e => setForm({ ...form, zip_code: e.target.value })} />
                                </div>
                            </div>

                            <button onClick={handleSave} className="btn btn-primary w-full py-3 text-lg shadow-xl">
                                <Save size={20} className="inline mr-2" />
                                Salvar Definitivamente
                            </button>
                        </div>
                    )}
                </div>

                {/* INSPETORES */}
                {/* INSPETORES */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500"><ShieldCheck size={24} /></div>
                            <h3 className="text-xl font-semibold">Inspetores</h3>
                        </div>
                        <button className="btn btn-primary px-4 py-2 flex items-center gap-2" onClick={() => setShowAddInspector(true)}>
                            <UserPlus size={18} />
                            <span>Adicionar</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 text-gray-400 text-sm">
                                    <th className="p-3 font-semibold">Nome</th>
                                    <th className="p-3 font-semibold">Email</th>
                                    <th className="p-3 font-semibold text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inspectors.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" className="p-4 text-center text-gray-500">
                                            Nenhum inspetor cadastrado.
                                        </td>
                                    </tr>
                                ) : (
                                    inspectors.map(insp => (
                                        <tr key={insp.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="p-3 font-medium text-white">{insp.name}</td>
                                            <td className="p-3 text-gray-300">{insp.email}</td>
                                            <td className="p-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteInspector(insp.id, insp.name)}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded transition-colors"
                                                    title="Excluir Inspetor"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Inspetor */}
            {showAddInspector && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-md p-8 animate-in zoom-in duration-200">
                        <h3 className="text-xl font-bold mb-6 text-center">Novo Inspetor</h3>
                        <form onSubmit={handleCreateInspector} className="space-y-4">
                            <input className="input-field w-full" placeholder="Nome" value={newInspector.name} onChange={e => setNewInspector({ ...newInspector, name: e.target.value })} required />
                            <input className="input-field w-full" type="email" placeholder="Email" value={newInspector.email} onChange={e => setNewInspector({ ...newInspector, email: e.target.value })} required />
                            <input className="input-field w-full" type="password" placeholder="Senha" value={newInspector.password} onChange={e => setNewInspector({ ...newInspector, password: e.target.value })} required />
                            <div className="flex gap-3 pt-2">
                                <button type="button" className="btn flex-1 bg-white/10 hover:bg-white/20" onClick={() => setShowAddInspector(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary flex-1">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
