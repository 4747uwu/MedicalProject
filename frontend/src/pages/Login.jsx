import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('lab_staff'); // Default selected role
  const { login, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const user = await login(email, password);
      // Redirect based on user role
      switch (user.role) {
        case 'admin':
          navigate('/admin/dashboard');
          break;
        case 'lab_staff':
          navigate('/lab/dashboard');
          break;
        case 'doctor_account':
          navigate('/doctor/dashboard');
          break;
        default:
          navigate('/');
      }
    } catch (err) {
      // Error is already handled in the auth context
      console.error("Login error", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Get the appropriate emoji based on the selected role
  const getEmoji = () => {
    switch (selectedRole) {
      case 'lab_staff':
        return '🧪';
      case 'doctor_account':
        return '👨‍⚕️';
      case 'admin':
        return '🔐';
      default:
        return '🏥';
    }
  };

  // Get tab classes based on whether it's selected
  const getTabClasses = (role) => {
    return `flex-1 py-3 text-center transition-all duration-300 ${
      selectedRole === role
        ? 'bg-white text-blue-600 rounded-t-lg font-medium border-t-2 border-blue-500 shadow-sm'
        : 'bg-blue-50 text-gray-600 hover:bg-blue-100'
    }`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center" 
         style={{ 
           background: 'linear-gradient(135deg, #c3e8ff 0%, #e9f8ff 50%, #d6f5e8 100%)',
           backgroundSize: 'cover'
         }}>
      <div className="w-full max-w-md p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Medical Platform</h1>
          <p className="text-gray-600 mt-2">Sign in to access your dashboard</p>
        </div>
        
        {/* Role selection tabs */}
        <div className="flex mb-6 rounded-t-lg overflow-hidden shadow-md">
          <button 
            onClick={() => setSelectedRole('lab_staff')}
            className={getTabClasses('lab_staff')}
          >
            Lab Staff
          </button>
          <button 
            onClick={() => setSelectedRole('doctor_account')}
            className={getTabClasses('doctor_account')}
          >
            Doctor
          </button>
          <button 
            onClick={() => setSelectedRole('admin')}
            className={getTabClasses('admin')}
          >
            Admin
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Emoji header */}
          <div className="text-center p-6 bg-gradient-to-r from-blue-50 to-teal-50">
            <div className="text-6xl mb-3 transform transition-all duration-300 hover:scale-110">
              {getEmoji()}
            </div>
            <h2 className="text-xl font-semibold text-gray-700">
              {selectedRole === 'lab_staff' ? 'Lab Staff Login' : 
               selectedRole === 'doctor_account' ? 'Doctor Login' : 'Admin Login'}
            </h2>
          </div>

          {/* Login form */}
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <input
                    id="remember_me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember_me" className="ml-2 block text-sm text-gray-700">
                    Remember me
                  </label>
                </div>
                <div className="text-sm">
                  <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                    Forgot your password?
                  </a>
                </div>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  isLoading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600">Need help? </span>
          <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;