import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistSearch from '../../components/admin/WorklistSearch';
import api from '../../services/api';
import useAdminWebSocket from '../../hooks/useAdminWebSocket';
import { useAuth } from '../../hooks/useAuth';

const AdminDashboard = React.memo(() => {
  const { currentUser } = useAuth();
  
  // 🔧 MEMOIZE THE USER TO PREVENT UNNECESSARY RE-RENDERS
  const stableUser = useMemo(() => currentUser, [currentUser?.id, currentUser?.role]);
  
  const { isConnected, connectionStatus, newStudyCount, resetNewStudyCount, reconnect } = useAdminWebSocket(stableUser);

  const [allStudies, setAllStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  const [dashboardStats, setDashboardStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    inProgressStudies: 0, // Added inProgress count
    completedStudies: 0,
    activeLabs: 0,
    activeDoctors: 0
  });
  const intervalRef = useRef(null);

  // 🔧 IMPROVED API CALL WITH BACKEND CATEGORY FILTERING
  const fetchStudies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/studies', {
        params: {
          page: currentPage,
          limit: 50,
          // Use category filter if not showing 'all'
          category: activeCategory !== 'all' ? activeCategory : undefined,
        }
      });
      
      if (response.data.success) {
        setAllStudies(response.data.data);
        setTotalPages(response.data.totalPages);
        setTotalRecords(response.data.totalRecords);
        
        // Use the backend-provided category counts if available
        if (response.data.summary?.byCategory) {
          setDashboardStats({
            totalStudies: response.data.summary.byCategory.all || response.data.totalRecords,
            pendingStudies: response.data.summary.byCategory.pending || 0,
            inProgressStudies: response.data.summary.byCategory.inprogress || 0,
            completedStudies: response.data.summary.byCategory.completed || 0,
            // Maintain other stats
            activeLabs: response.data.summary.activeLabs || 
                        [...new Set(response.data.data.map(s => s.sourceLab?._id).filter(Boolean))].length,
            activeDoctors: response.data.summary.activeDoctors || 
                           [...new Set(response.data.data.map(s => s.lastAssignedDoctor?._id).filter(Boolean))].length
          });
        } else {
          // Fallback to the client-side counting (less efficient)
          const studies = response.data.data;
          setDashboardStats({
            totalStudies: response.data.totalRecords,
            pendingStudies: studies.filter(s => s.currentCategory === 'pending').length,
            inProgressStudies: studies.filter(s => s.currentCategory === 'inprogress').length,
            completedStudies: studies.filter(s => s.currentCategory === 'completed').length,
            activeLabs: [...new Set(studies.map(s => s.sourceLab?._id).filter(Boolean))].length,
            activeDoctors: [...new Set(studies.map(s => s.lastAssignedDoctor?._id).filter(Boolean))].length
          });
        }
      }
    } catch (error) {
      console.error('Error fetching studies:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, activeCategory]);

  // Initial fetch when component mounts or page changes
  useEffect(() => {
    fetchStudies();
  }, [fetchStudies]);

  // 🔧 MEMOIZED AUTO-REFRESH SETUP
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      console.log('Auto-refreshing studies data...');
      fetchStudies();
    }, 10 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStudies]);

  // 🔧 MEMOIZED CALLBACKS
  const handlePageChange = useCallback((page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const handleAssignmentComplete = useCallback(() => {
    fetchStudies();
  }, [fetchStudies]);

  const handleManualRefresh = useCallback(() => {
    console.log('Manual refresh triggered');
    fetchStudies();
  }, [fetchStudies]);

  const handleWorklistView = useCallback(() => {
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  // Handle category change
  const handleCategoryChange = useCallback((category) => {
    setActiveCategory(category);
    setCurrentPage(1); // Reset to first page when changing categories
  }, []);
  
  // 🔧 MEMOIZED CONNECTION STATUS
  const statusDisplay = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return {
          color: 'bg-emerald-500',
          text: 'Live',
          textColor: 'text-emerald-700',
          bgColor: 'bg-emerald-50',
          icon: (
            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'connecting':
        return {
          color: 'bg-amber-500 animate-pulse',
          text: 'Connecting...',
          textColor: 'text-amber-700',
          bgColor: 'bg-amber-50',
          icon: (
            <svg className="w-4 h-4 text-amber-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
            </svg>
          )
        };
      case 'error':
        return {
          color: 'bg-red-500',
          text: 'Offline',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50',
          icon: (
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      default:
        return {
          color: 'bg-gray-500',
          text: 'Offline',
          textColor: 'text-gray-700',
          bgColor: 'bg-gray-50',
          icon: (
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728" />
            </svg>
          )
        };
    }
  }, [connectionStatus]);

  return (
    <div className="min-h-screen bg-gray-50">
      <UniversalNavbar />

      <div className="max-w-8xl mx-auto p-4">
        {/* Compact Header with Essential Info Only */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            {/* Left side - Title and basic info */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Studies Worklist</h1>
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-600">{totalRecords} total studies</span>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${statusDisplay.color}`}></div>
                  <span className={`text-xs ${statusDisplay.textColor}`}>{statusDisplay.text}</span>
                </div>
                {newStudyCount > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-semibold animate-pulse">
                    {newStudyCount} new
                  </span>
                )}
              </div>
            </div>

            {/* Right side - Compact actions */}
            <div className="flex items-center space-x-3">
              {/* Quick Stats - Horizontal - UPDATED WITH INPROGRESS */}
              <div className="hidden md:flex items-center space-x-4 px-4 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">{dashboardStats.pendingStudies}</div>
                  <div className="text-xs text-gray-500">Pending</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-orange-600">{dashboardStats.inProgressStudies}</div>
                  <div className="text-xs text-gray-500">In Progress</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">{dashboardStats.completedStudies}</div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-purple-600">{dashboardStats.activeLabs}</div>
                  <div className="text-xs text-gray-500">Labs</div>
                </div>
              </div>

              {/* Action Buttons - Compact */}
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleManualRefresh}
                  disabled={loading}
                  className="p-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 disabled:opacity-50"
                  title="Refresh data"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                </button>

                <Link 
                  to="/admin/new-lab" 
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
                >
                  + Lab
                </Link>

                <Link 
                  to="/admin/new-doctor" 
                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 text-sm font-medium"
                >
                  + Doctor
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* PRIMARY FOCUS: Enhanced Worklist Section */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Worklist Content - Maximum Focus */}
          <div className="p-6">
            <WorklistSearch 
              allStudies={allStudies}
              loading={loading}
              totalRecords={totalRecords}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              userRole="admin"
              onAssignmentComplete={handleAssignmentComplete}
              onView={handleWorklistView}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              categoryStats={dashboardStats}
            />
          </div>
        </div>

        {/* Secondary Information - Collapsible Mobile Stats - UPDATED WITH INPROGRESS */}
        <div className="md:hidden mt-4">
          <details className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
              View Statistics
            </summary>
            <div className="px-4 pb-4 grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-lg font-semibold text-blue-600">{dashboardStats.pendingStudies}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-lg font-semibold text-orange-600">{dashboardStats.inProgressStudies}</div>
                <div className="text-xs text-gray-500">In Progress</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-lg font-semibold text-green-600">{dashboardStats.completedStudies}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
});

export default AdminDashboard;