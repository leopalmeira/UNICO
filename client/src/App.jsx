import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GatewayMonitor from './pages/GatewayMonitor';
import InspectorDashboard from './pages/InspectorDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/employee" element={<EmployeeDashboard />} />
          <Route path="/gateway" element={<GatewayMonitor />} />
          <Route path="/inspector" element={<InspectorDashboard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
