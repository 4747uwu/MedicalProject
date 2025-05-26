import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/authContext';
import { useAuth } from './hooks/useAuth';
import ChangePasswordPage from './pages/ChangePasswordPage';

// Pages
import LoginPage from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import LabDashboard from './pages/lab/Dashboard';
import DoctorDashboard from './pages/doctor/Dashboard';
import NewLabPage from './pages/admin/NewLabPage';
import NewDoctorPage from './pages/admin/NewDoctorPage';
import ForgotPasswordPage from './pages/ForgotPassword';
import ManageDoctorsPage from './pages/ManageDoctorsPage';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    const redirectPath = currentUser.role === 'admin' ? '/admin/dashboard' : 
                          currentUser.role === 'lab_staff' ? '/lab/dashboard' : 
                          currentUser.role === 'doctor_account' ? '/doctor/dashboard' : 
                          '/login';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

function App() {
  const [count, setCount] = useState(0)

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          
          {/* Admin Routes */}
          <Route 
            path="/admin/dashboard" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/new-lab" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <NewLabPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/new-doctor" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <NewDoctorPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Lab Routes */}
          <Route 
            path="/lab/dashboard" 
            element={
              <ProtectedRoute allowedRoles={['lab_staff']}>
                <LabDashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Doctor Routes */}
          <Route 
            path="/doctor/dashboard" 
            element={
              <ProtectedRoute allowedRoles={['doctor_account']}>
                <DoctorDashboard />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/change-password" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'lab_staff', 'doctor_account']}>
                <ChangePasswordPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/doctors" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ManageDoctorsPage />
              </ProtectedRoute>
            } 
          />

          
          
          {/* Catch-all route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
