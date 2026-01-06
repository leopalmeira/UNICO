import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import api from '../api/axios';

export default function AttendanceReport({ schoolId }) {
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [attendanceData, setAttendanceData] = useState([]);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showStudentDetails, setShowStudentDetails] = useState(false);
    const [selectedStudentData, setSelectedStudentData] = useState(null);

    useEffect(() => {
        loadStudents();
    }, []);

    useEffect(() => {
        loadAttendanceData();
    }, [selectedMonth, selectedStudent]);

    const loadStudents = async () => {
        try {
            const res = await api.get('/school/students');
            setStudents(res.data);
        } catch (err) {
            console.error('Erro ao carregar alunos:', err);
        }
    };

    const loadAttendanceData = async () => {
        try {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth() + 1;
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

            const res = await api.get(`/school/attendance?startDate=${startDate}&endDate=${endDate}`);
            // Filtrar apenas entradas (entry/arrival) para evitar duplicidade com saídas
            const entries = res.data.filter(r => r.type === 'entry' || r.type === 'arrival');
            setAttendanceData(entries);
        } catch (err) {
            console.error('Erro ao carregar frequência:', err);
        }
    };

    const getDaysInMonth = () => {
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];

        // Dias vazios no início
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null);
        }

        // Dias do mês
        for (let day = 1; day <= lastDay.getDate(); day++) {
            days.push(new Date(year, month, day));
        }

        return days;
    };

    const hasAttendance = (date) => {
        if (!date) return false;

        const dateStr = date.toISOString().split('T')[0];
        return attendanceData.some(record => {
            const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
            return recordDate === dateStr &&
                (selectedStudent === 'all' || record.student_id === parseInt(selectedStudent));
        });
    };

    const previousMonth = () => {
        setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1));
    };

    const nextMonth = () => {
        setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1));
    };

    const handleStudentClick = (studentId) => {
        if (studentId === 'all') {
            setShowStudentDetails(false);
            setSelectedStudentData(null);
            return;
        }

        const student = students.find(s => s.id === parseInt(studentId));
        if (!student) return;

        // Calcular estatísticas do aluno no mês atual
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const studentRecords = attendanceData.filter(record =>
            record.student_id === parseInt(studentId)
        );

        const daysPresent = new Set(
            studentRecords.map(record =>
                new Date(record.timestamp).toISOString().split('T')[0]
            )
        ).size;

        const attendanceRate = ((daysPresent / daysInMonth) * 100).toFixed(1);

        setSelectedStudentData({
            ...student,
            daysPresent,
            daysInMonth,
            attendanceRate,
            records: studentRecords
        });
        setShowStudentDetails(true);
    };

    const exportReport = () => {
        const monthName = selectedMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const days = getDaysInMonth().filter(d => d !== null);

        let csvContent = `Relatório de Frequência - Alunos - ${monthName}\n\n`;
        csvContent += 'Aluno,Turma,';
        csvContent += days.map(d => d.getDate()).join(',') + '\n';

        const studentsToExport = selectedStudent === 'all'
            ? students
            : students.filter(s => s.id === parseInt(selectedStudent));

        studentsToExport.forEach(student => {
            csvContent += `${student.name},${student.class_name || 'N/A'},`;
            csvContent += days.map(day => hasAttendance(day) ? 'P' : 'F').join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `frequencia_alunos_${selectedMonth.getFullYear()}-${selectedMonth.getMonth() + 1}.csv`;
        link.click();
    };

    const days = getDaysInMonth();
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    // Filtrar alunos
    const filteredStudents = students.filter(std => {
        if (!searchTerm) return true;

        const search = searchTerm.toLowerCase();
        const name = std.name?.toLowerCase() || '';
        const className = std.class_name?.toLowerCase() || '';

        return name.includes(search) || className.includes(search);
    });

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>
                    📅 Frequência de Alunos
                </h1>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Campo de Busca */}
                    <input
                        type="text"
                        className="input-field"
                        placeholder="🔍 Buscar por nome ou turma..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: '0.75rem',
                            minWidth: '300px',
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '2px solid var(--glass-border)',
                            borderRadius: 'var(--radius)',
                            color: 'var(--text-primary)'
                        }}
                    />

                    {/* Dropdown de Seleção */}
                    <select
                        className="input-field"
                        value={selectedStudent}
                        onChange={(e) => {
                            setSelectedStudent(e.target.value);
                            handleStudentClick(e.target.value);
                        }}
                        style={{ padding: '0.75rem', minWidth: '200px' }}
                    >
                        <option value="all">Todos os Alunos</option>
                        {filteredStudents.map(std => (
                            <option key={std.id} value={std.id}>
                                {std.name} - {std.class_name}
                            </option>
                        ))}
                    </select>

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

            {/* Indicador de Resultados da Busca */}
            {searchTerm && (
                <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <span style={{ fontSize: '0.9rem' }}>
                        🔍 <strong>{filteredStudents.length}</strong> aluno(s) encontrado(s) para "{searchTerm}"
                    </span>
                    <button
                        onClick={() => setSearchTerm('')}
                        style={{
                            marginLeft: 'auto',
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            color: 'var(--text-primary)'
                        }}
                    >
                        Limpar
                    </button>
                </div>
            )}

            {/* Card de Detalhes do Aluno */}
            {showStudentDetails && selectedStudentData && (
                <div className="glass-panel" style={{
                    padding: '2rem',
                    marginBottom: '1.5rem',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.1))',
                    border: '2px solid rgba(59, 130, 246, 0.3)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
                            👤 Detalhes do Aluno
                        </h3>
                        <button
                            onClick={() => {
                                setShowStudentDetails(false);
                                setSelectedStudent('all');
                            }}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: 'var(--text-primary)'
                            }}
                        >
                            ✕ Fechar
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2rem', alignItems: 'start' }}>
                        {/* Foto do Aluno */}
                        <div style={{ textAlign: 'center' }}>
                            {selectedStudentData.photo_url ? (
                                <img
                                    src={selectedStudentData.photo_url}
                                    alt={selectedStudentData.name}
                                    style={{
                                        width: '150px',
                                        height: '150px',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '4px solid var(--accent-primary)',
                                        boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: '150px',
                                    height: '150px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '4rem',
                                    fontWeight: '700',
                                    color: 'white',
                                    border: '4px solid var(--accent-primary)',
                                    boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
                                }}>
                                    {selectedStudentData.name?.charAt(0)}
                                </div>
                            )}
                        </div>

                        {/* Informações do Aluno */}
                        <div>
                            <h2 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                {selectedStudentData.name}
                            </h2>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                                {/* Turma */}
                                <div style={{
                                    padding: '1rem',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                        🏫 Turma
                                    </div>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                                        {selectedStudentData.class_name || 'Não informada'}
                                    </div>
                                </div>

                                {/* Idade */}
                                {selectedStudentData.age && (
                                    <div style={{
                                        padding: '1rem',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                            🎂 Idade
                                        </div>
                                        <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                                            {selectedStudentData.age} anos
                                        </div>
                                    </div>
                                )}

                                {/* Responsável */}
                                {selectedStudentData.parent_email && (
                                    <div style={{
                                        padding: '1rem',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                            📧 Email do Responsável
                                        </div>
                                        <div style={{ fontSize: '1.125rem', fontWeight: '600', wordBreak: 'break-all' }}>
                                            {selectedStudentData.parent_email}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Estatísticas de Frequência */}
                            <div style={{
                                marginTop: '1.5rem',
                                padding: '1.5rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '12px',
                                border: '2px solid rgba(16, 185, 129, 0.3)'
                            }}>
                                <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
                                    📊 Frequência em {selectedMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#10b981' }}>
                                            {selectedStudentData.daysPresent}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            Dias Presentes
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#ef4444' }}>
                                            {selectedStudentData.daysInMonth - selectedStudentData.daysPresent}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            Dias Ausentes
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{
                                            fontSize: '2.5rem',
                                            fontWeight: '700',
                                            color: selectedStudentData.attendanceRate >= 90 ? '#10b981' :
                                                selectedStudentData.attendanceRate >= 75 ? '#f59e0b' : '#ef4444'
                                        }}>
                                            {selectedStudentData.attendanceRate}%
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            Taxa de Presença
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ padding: '2rem' }}>
                {/* Month Navigator */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <button
                        onClick={previousMonth}
                        className="btn"
                        style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem' }}
                    >
                        <ChevronLeft size={24} />
                    </button>

                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', textTransform: 'capitalize' }}>
                        {selectedMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h2>

                    <button
                        onClick={nextMonth}
                        className="btn"
                        style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem' }}
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                {/* Calendar Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
                    {/* Week day headers */}
                    {weekDays.map(day => (
                        <div
                            key={day}
                            style={{
                                padding: '0.75rem',
                                textAlign: 'center',
                                fontWeight: '600',
                                color: 'var(--text-secondary)',
                                fontSize: '0.875rem'
                            }}
                        >
                            {day}
                        </div>
                    ))}

                    {/* Calendar days */}
                    {days.map((date, index) => {
                        if (!date) {
                            return <div key={`empty-${index}`} />;
                        }

                        const isToday = date.toDateString() === new Date().toDateString();
                        const hasRecord = hasAttendance(date);
                        const isFuture = date > new Date();

                        return (
                            <div
                                key={date.toISOString()}
                                style={{
                                    padding: '1rem',
                                    background: hasRecord
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : isFuture
                                            ? 'rgba(255,255,255,0.02)'
                                            : 'rgba(239, 68, 68, 0.1)',
                                    border: isToday ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s',
                                    opacity: isFuture ? 0.5 : 1
                                }}
                            >
                                <div style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                                    {date.getDate()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {hasRecord ? '✓ Presente' : isFuture ? '-' : '✗ Ausente'}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '20px', height: '20px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.5)', borderRadius: '4px' }} />
                        <span style={{ fontSize: '0.875rem' }}>Presente</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '20px', height: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: '4px' }} />
                        <span style={{ fontSize: '0.875rem' }}>Ausente</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '20px', height: '20px', border: '2px solid var(--accent-primary)', borderRadius: '4px' }} />
                        <span style={{ fontSize: '0.875rem' }}>Hoje</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
