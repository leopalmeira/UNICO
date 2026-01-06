const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testLogin() {
    try {
        console.log('Tentando login com leandro2703palmeira@gmail.com...');
        const res = await axios.post(`${API_URL}/guardian/login`, {
            email: 'leandro2703palmeira@gmail.com',
            password: '123456' // Assuming this is the password based on user request
        });
        console.log('Login bem sucedido!');
        console.log('Token recebido:', res.data.token ? 'Sim' : 'Não');
    } catch (error) {
        console.error('Erro no login:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Dados:', error.response.data);
        }
    }
}

testLogin();
