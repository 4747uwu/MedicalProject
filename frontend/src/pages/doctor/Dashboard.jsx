import React, { useState, useEffect } from 'react';
import WorklistTable from '../../components/admin/WorklistTable';
import UniversalNavbar from '../../components/layout/AdminNavbar';

import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const DoctorDashboard = () => {
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
      const response = await api.get('/doctor/assigned-studies', {
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
          <h1 className="text-2xl font-bold text-gray-900">Doctor Dashboard</h1>
          <p className="text-gray-600">Welcome, Dr. {currentUser?.firstName || 'Doctor'}</p>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Assigned Studies</h2>
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
            userRole="doctor"
          />
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;