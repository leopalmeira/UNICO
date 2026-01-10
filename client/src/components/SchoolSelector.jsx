import { useState, useEffect } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import api from '../api/axios';

export default function SchoolSelector({ currentSchoolId, onSchoolChange }) {
    const [schools, setSchools] = useState([]);
    const [selectedSchool, setSelectedSchool] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        loadSchools();
    }, [currentSchoolId]);

    const loadSchools = async () => {
        try {
            const res = await api.get('/school/affiliates/list');
            const affiliates = res.data.affiliates || [];
            const parents = res.data.parents || [];

            // Get current school info
            const currentRes = await api.get('/auth/me');
            const currentSchool = {
                id: currentSchoolId,
                name: currentRes.data.name || 'Minha Escola',
                relationship: 'current'
            };

            // Combine all schools
            const allSchools = [
                currentSchool,
                ...affiliates.map(a => ({ ...a, id: a.school_id })),
                ...parents.map(p => ({ ...p, id: p.school_id }))
            ];

            setSchools(allSchools);
            setSelectedSchool(currentSchool);
        } catch (err) {
            console.error('Erro ao carregar escolas:', err);
        }
    };

    const handleSchoolChange = async (school) => {
        try {
            if (school.id !== currentSchoolId) {
                await api.post(`/school/affiliates/switch/${school.id}`);
            }
            setSelectedSchool(school);
            setShowDropdown(false);
            if (onSchoolChange) {
                onSchoolChange(school);
            }
        } catch (err) {
            console.error('Erro ao trocar escola:', err);
            alert('Erro ao alternar escola: ' + (err.response?.data?.message || err.message));
        }
    };

    // Only show if there are affiliated schools
    if (schools.length <= 1) {
        return null;
    }

    return (
        <div style={{
            position: 'relative',
            marginBottom: '1.5rem',
            zIndex: 100
        }}>
            <div
                className="glass-panel"
                style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)'
                }}
                onClick={() => setShowDropdown(!showDropdown)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Building2 size={20} style={{ color: 'var(--accent-primary)' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.125rem' }}>
                            Visualizando
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                            {selectedSchool?.name || 'Selecione uma escola'}
                        </div>
                    </div>
                </div>
                <ChevronDown
                    size={20}
                    style={{
                        transition: 'transform 0.2s',
                        transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}
                />
            </div>

            {showDropdown && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 99
                        }}
                        onClick={() => setShowDropdown(false)}
                    />
                    <div
                        className="glass-panel"
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            zIndex: 100
                        }}
                    >
                        {schools.map(school => (
                            <div
                                key={school.id}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: 'var(--radius)',
                                    cursor: 'pointer',
                                    background: selectedSchool?.id === school.id ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                    marginBottom: '0.25rem',
                                    transition: 'background 0.2s'
                                }}
                                onClick={() => handleSchoolChange(school)}
                                onMouseEnter={(e) => {
                                    if (selectedSchool?.id !== school.id) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (selectedSchool?.id !== school.id) {
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.125rem' }}>
                                            {school.name}
                                        </div>
                                        {school.email && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {school.email}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: '0.625rem',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '999px',
                                        fontWeight: '600',
                                        background: school.relationship === 'current'
                                            ? 'rgba(99, 102, 241, 0.2)'
                                            : school.relationship === 'filial'
                                                ? 'rgba(16, 185, 129, 0.2)'
                                                : 'rgba(245, 158, 11, 0.2)',
                                        color: school.relationship === 'current'
                                            ? '#6366f1'
                                            : school.relationship === 'filial'
                                                ? '#10b981'
                                                : '#f59e0b'
                                    }}>
                                        {school.relationship === 'current' ? 'ATUAL' : school.relationship === 'filial' ? 'FILIAL' : 'MATRIZ'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
