import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistTable from '../../components/admin/WorklistTable';
import api from '../../services/api';

const AdminDashboard = () => {
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
      const response = await api.get('/admin/studies', {
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

  const handleAssignmentComplete = () => {
    fetchStudies(); // Refresh data after assignment
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <UniversalNavbar />

      <div className="container w-full max-w-full mx-auto p-4 pl-12 pr-12 pt-6">
        <div className="mb-6 flex flex-wrap justify-between items-center max-w-8xl">
          <div className="flex space-x-2 mt-4 sm:mt-0">
            <Link to="/admin/new-lab" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 shadow-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Add Lab
            </Link>
            <Link to="/admin/new-doctor" className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 shadow-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Doctor
            </Link>
          </div>
        </div>

        {/* Reports Section - Main Focus */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Recent Reports</h2>
            <Link to="/admin/reports" className="text-blue-500 hover:text-blue-700 text-sm font-medium">
              View All Reports →
            </Link>
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
            userRole="admin"
            onAssignmentComplete={handleAssignmentComplete}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;