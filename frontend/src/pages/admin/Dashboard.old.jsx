import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import AdminNavbar from '../../components/layout/AdminNavbar';
import WorklistTable from '../../components/admin/WorklistTable';
import { Link } from 'react-router-dom';

const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [labs, setLabs] = useState([]);
  const [studies, setStudies] = useState([]);
  const [summaryStats, setSummaryStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    completedStudies: 0,
    activeUsers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all required data in parallel
        const [usersRes, labsRes, studiesRes, statsRes] = await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/labs'),
          api.get('/admin/studies', { params: { limit: 10 } }), // Limited for preview
          api.get('/admin/statistics')
        ]);
        
        setUsers(usersRes.data.users || []);
        setLabs(labsRes.data.labs || []);
        setStudies(studiesRes.data.data || []);
        
        // Set summary statistics
        setSummaryStats({
          totalStudies: statsRes.data.totalStudies || 0,
          pendingStudies: statsRes.data.pendingStudies || 0,
          completedStudies: statsRes.data.completedStudies || 0,
          activeUsers: statsRes.data.activeUsers || 0
        });
      } catch (error) {
        console.error("Error fetching admin data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminNavbar />

      <div className="container mx-auto p-4 pt-6">
        {/* Dashboard Header */}
        <div className="mb-6 flex flex-wrap justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-gray-600">Welcome back, {currentUser?.fullName}</p>
          </div>
          
          <div className="flex space-x-2 mt-4 sm:mt-0">
            <Link to="/admin/new-study" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 shadow-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New Study
            </Link>
            <Link to="/admin/new-user" className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 shadow-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add User
            </Link>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white shadow-md rounded-lg p-4 border-l-4 border-blue-500">
            <div className="text-sm font-medium text-gray-500">Total Studies</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{summaryStats.totalStudies}</div>
            <div className="mt-1 text-xs text-blue-500">View all</div>
          </div>
          
          <div className="bg-white shadow-md rounded-lg p-4 border-l-4 border-yellow-500">
            <div className="text-sm font-medium text-gray-500">Pending Studies</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{summaryStats.pendingStudies}</div>
            <div className="mt-1 text-xs text-yellow-500">Needs attention</div>
          </div>
          
          <div className="bg-white shadow-md rounded-lg p-4 border-l-4 border-green-500">
            <div className="text-sm font-medium text-gray-500">Completed Reports</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{summaryStats.completedStudies}</div>
            <div className="mt-1 text-xs text-green-500">All finished</div>
          </div>
          
          <div className="bg-white shadow-md rounded-lg p-4 border-l-4 border-purple-500">
            <div className="text-sm font-medium text-gray-500">Active Users</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{summaryStats.activeUsers}</div>
            <div className="mt-1 text-xs text-purple-500">System users</div>
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
          
          <WorklistTable limit={5} hideFilters={true} />
        </div>

        {/* System Information Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Users Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">System Users</h2>
              <Link to="/admin/users" className="text-sm text-blue-500 hover:text-blue-700">
                Manage Users
              </Link>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">Email</th>
                      <th className="py-2 px-4 border-b">Role</th>
                      <th className="py-2 px-4 border-b">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice(0, 5).map((user) => (
                      <tr key={user._id} className="hover:bg-gray-50">
                        <td className="py-2 px-4 border-b">{user.fullName}</td>
                        <td className="py-2 px-4 border-b">{user.email}</td>
                        <td className="py-2 px-4 border-b">{user.role}</td>
                        <td className="py-2 px-4 border-b">
                          <span className={`px-2 py-1 rounded text-xs ${user.isActive ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Labs Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Registered Labs</h2>
              <Link to="/admin/labs" className="text-sm text-blue-500 hover:text-blue-700">
                Manage Labs
              </Link>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">Identifier</th>
                      <th className="py-2 px-4 border-b">Contact Person</th>
                      <th className="py-2 px-4 border-b">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labs.slice(0, 5).map((lab) => (
                      <tr key={lab._id} className="hover:bg-gray-50">
                        <td className="py-2 px-4 border-b">{lab.name}</td>
                        <td className="py-2 px-4 border-b">{lab.identifier}</td>
                        <td className="py-2 px-4 border-b">{lab.contactPerson}</td>
                        <td className="py-2 px-4 border-b">
                          <span className={`px-2 py-1 rounded text-xs ${lab.isActive ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                            {lab.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;