import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';

const UniversalNavbar = () => {
  const { currentUser, logout } = useAuth();
  const [greeting, setGreeting] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate(); // Add this hook


  useEffect(() => {
    // Set greeting based on time of day
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        setGreeting('Good morning');
      } else if (hour >= 12 && hour < 18) {
        setGreeting('Good afternoon');
      } else {
        setGreeting('Good evening');
      }
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Get role-based configurations
  const getRoleConfig = () => {
    switch (currentUser?.role) {
      case 'admin':
        return {
          title: 'Admin Dashboard',
          color: 'from-blue-600 to-purple-600',
          hoverColor: 'hover:bg-blue-500',
          activeColor: 'bg-white text-blue-600',
          links: [
            { to: '/admin/dashboard', label: 'Dashboard', exact: true },
           
            { to: '/admin/doctors', label: 'Doctors' },
            { to: '/admin/labs', label: 'Labs' },
            
          ]
        };
      case 'doctor_account':
        return {
          title: 'Doctor Dashboard',
          color: 'from-green-600 to-teal-600',
          hoverColor: 'hover:bg-green-500',
          activeColor: 'bg-white text-green-600',
          links: [
            { to: '/doctor', label: 'Dashboard', exact: true },
            { to: '/doctor/assigned-studies', label: 'My Studies' },
            { to: '/doctor/reports', label: 'My Reports' },
            { to: '/doctor/profile', label: 'Profile' }
          ]
        };
      case 'lab_staff':
        return {
          title: 'Lab Dashboard',
          color: 'from-orange-600 to-red-600',
          hoverColor: 'hover:bg-orange-500',
          activeColor: 'bg-white text-orange-600',
          links: [
            { to: '/lab', label: 'Dashboard', exact: true },
            { to: '/lab/studies', label: 'Studies' },
            { to: '/lab/upload', label: 'Upload' },
            { to: '/lab/patients', label: 'Patients' }
          ]
        };
      default:
        return {
          title: 'Medical Dashboard',
          color: 'from-gray-600 to-gray-800',
          hoverColor: 'hover:bg-gray-500',
          activeColor: 'bg-white text-gray-600',
          links: []
        };
    }
  };

  const config = getRoleConfig();

  // Check if a nav item is active
  const isActive = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const handleChangePassword = () => {
    // Navigate to change password page or open modal
    navigate('/change-password'); // Use navigate function
    setIsDropdownOpen(false);  
  };

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.user-dropdown')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className={`bg-gradient-to-r ${config.color} text-white shadow-xl rounded-b-lg`}>
      {/* Remove container constraints to allow full width */}
      <div className="w-full flex flex-col">
        <div className="flex justify-between items-center px-4 md:px-8 py-4">
          {/* Left side - Logo and Brand, moved to extreme left */}
          <div className="flex items-center">
            {/* Logo/Icon */}
            <div className="rounded-full bg-white p-2 mr-3 shadow-lg">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-7 w-7 text-gray-700" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" 
                />
              </svg>
            </div>
            
            {/* Brand Name */}
            <div>
              <h1 className="text-xl font-bold tracking-tight">{config.title}</h1>
              <div className="text-xs text-white/80 font-medium">
                Medical Portal System
              </div>
            </div>
          </div>
          
          {/* Center - Navigation Links, now truly centered */}
          <div className="hidden lg:flex items-center justify-center">
            {config.links.map((link, index) => (
              <Link 
                key={index}
                to={link.to} 
                className={`py-2 px-4 rounded-lg transition-all duration-200 font-medium mx-1 ${
                  isActive(link.to, link.exact) 
                    ? `${config.activeColor} shadow-lg transform scale-105` 
                    : `${config.hoverColor} hover:shadow-md hover:transform hover:scale-105`
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          
          {/* Right side - User info and dropdown, pushed to extreme right */}
          <div className="flex items-center">
            {/* Greeting and User Info */}
            <div className="hidden md:flex flex-col items-end mr-3">
              <div className="text-sm font-medium text-white/80">{greeting},</div>
              <div className="text-sm font-semibold text-white">
                {currentUser?.firstName} {currentUser?.lastName}
              </div>
              <div className="text-xs text-white/70 capitalize">
                {currentUser?.role?.replace('_', ' ')}
              </div>
            </div>
            
            {/* User Avatar with Dropdown */}
            <div className="relative user-dropdown">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center overflow-hidden hover:bg-white/30 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-white/30"
              >
                {currentUser?.firstName ? (
                  <span className="text-lg font-bold text-white">
                    {currentUser.firstName.charAt(0).toUpperCase()}
                    {currentUser.lastName?.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </button>
              
              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 transform transition-all duration-200 origin-top-right">
                  {/* User Info in Dropdown */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-900">
                      {currentUser?.firstName} {currentUser?.lastName}
                    </div>
                    <div className="text-sm text-gray-500">{currentUser?.email}</div>
                    <div className="text-xs text-gray-400 capitalize mt-1">
                      {currentUser?.role?.replace('_', ' ')}
                    </div>
                  </div>
                  
                  {/* Dropdown Options */}
                  <button
                    onClick={handleChangePassword}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors duration-150"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Change Password
                  </button>
                  
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center transition-colors duration-150"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation - Only show on small screens */}
        <div className="lg:hidden pb-2 px-4">
          <div className="flex flex-wrap gap-2">
            {config.links.map((link, index) => (
              <Link 
                key={index}
                to={link.to} 
                className={`py-1.5 px-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
                  isActive(link.to, link.exact) 
                    ? `${config.activeColor} shadow-md` 
                    : `${config.hoverColor} hover:shadow-md`
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default UniversalNavbar;