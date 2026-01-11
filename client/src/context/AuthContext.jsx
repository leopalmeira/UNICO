import { createContext, useState, useEffect, useContext } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                const token = localStorage.getItem('token');
                const savedUser = localStorage.getItem('user');

                console.log('🔄 Verificando sessão salva...', { hasToken: !!token, hasUser: !!savedUser });

                if (token && savedUser) {
                    const parsedUser = JSON.parse(savedUser);
                    setUser(parsedUser);
                    console.log('✅ Sessão restaurada para:', parsedUser.email);

                    // Opcional: Validar token com backend aqui se necessário
                } else {
                    console.log('⚠️ Nenhuma sessão salva encontrada');
                }
            } catch (error) {
                console.error('❌ Erro ao restaurar sessão:', error);
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            } finally {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (email, password) => {
        try {
            console.log('🔐 Tentando fazer login:', email);
            // baseURL já inclui /api, então usamos apenas /login
            const response = await api.post('/login', { email, password });
            const { token, user, role } = response.data;

            console.log('✅ Login bem-sucedido:', { email, role });

            localStorage.setItem('token', token);
            const userData = { ...user, role };
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);

            console.log('✅ Usuário salvo no estado:', userData);

            return { success: true, role };
        } catch (error) {
            console.error('❌ Erro no login:', error.response?.data || error.message);
            return { success: false, message: error.response?.data?.message || 'Login failed' };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
