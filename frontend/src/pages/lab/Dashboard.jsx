import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import WorklistTable from '../../components/admin/WorklistTable';
import UniversalNavbar from '../../components/layout/AdminNavbar';

import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const LabDashboard = () => {
  const { currentUser } = useAuth();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const limit = 10;

  const fetchStudies = async () => {
    try {
      setLoading(true);
      const response = await api.get('/lab/studies', {
        params: {
          page: currentPage,
          limit,
          search: searchTerm,
          location: selectedLocation
        }
      });
      
      if (response.data.success) {
        setStudies(response.data.data);
        setTotalPages(response.data.totalPages);
        setTotalRecords(response.data.totalRecords);
      }
    } catch (error) {
      console.error('Error fetching studies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudies();
  }, [currentPage, searchTerm, selectedLocation]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSearch = (searchValue) => {
    setSearchTerm(searchValue);
    setCurrentPage(1);
  };

  const handleLocationChange = (location) => {
    setSelectedLocation(location);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <UniversalNavbar />
      <div className="container w-full max-w-full mx-auto p-4 pl-12 pr-12 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Lab Dashboard</h1>
          <p className="text-gray-600">Welcome, {currentUser?.firstName || 'Lab Staff'}</p>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Patient Studies</h2>
            <div className="flex space-x-2">
              <Link to="/lab/upload" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 shadow-sm flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Study
              </Link>
            </div>
          </div>
          
          <WorklistTable 
            studies={studies}
            loading={loading}
            totalRecords={totalRecords}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onSearch={handleSearch}
            onLocationChange={handleLocationChange}
            userRole="lab_staff"
          />
        </div>
      </div>
    </div>
  );
};

export default LabDashboard;