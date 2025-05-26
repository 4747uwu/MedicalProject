import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/dateUtils';
import { toast } from 'react-toastify';

const ReportModal = ({ isOpen, onClose, studyData }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [reportStatus, setReportStatus] = useState('draft');

  useEffect(() => {
    if (isOpen && studyData) {
      fetchReports();
    }
  }, [isOpen, studyData]);

  const fetchReports = async () => {
    if (!studyData?._id) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/documents/study/${studyData._id}/reports`);
      if (response.data.success) {
        setReports(response.data.reports || []);
        console.log('Current workflow status:', response.data.workflowStatus);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!studyData?._id) return;
    
    setGenerating(true);
    try {
      const response = await api.get(`/documents/patient-report/${studyData._id}`, {
        responseType: 'blob'
      });
      
      // Create a download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Try to get filename from headers
      const contentDisposition = response.headers['content-disposition'];
      let filename = `Patient_Report_${studyData.patientName || 'Unknown'}_${Date.now()}.docx`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Report generated and downloaded successfully!");
      
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUploadReport = async () => {
    if (!selectedFile || !studyData?._id) {
      toast.error("Please select a file");
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('report', selectedFile);
      // Use the already assigned doctor
      if (studyData.lastAssignedDoctor?._id) {
        formData.append('doctorId', studyData.lastAssignedDoctor._id);
      }
      formData.append('reportStatus', reportStatus);
      
      const response = await api.post(`/documents/study/${studyData._id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success("Report uploaded successfully!");
      setSelectedFile(null);
      document.getElementById('report-file-input').value = '';
      
      fetchReports();
      setActiveTab(0); // Switch to view reports tab
    } catch (error) {
      console.error("Error uploading report:", error);
      toast.error("Failed to upload report");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadReport = async (reportIndex) => {
    if (!studyData?._id) return;
    
    try {
      const response = await api.get(
        `/documents/study/${studyData._id}/reports/${reportIndex}/download`, 
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = `Report_${reportIndex}_${Date.now()}.docx`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading report:", error);
      toast.error("Failed to download report");
    }
  };

  const handleDeleteReport = async (reportIndex) => {
    if (!window.confirm("Are you sure you want to delete this report?")) {
      return;
    }
    
    if (!studyData?._id) return;
    
    try {
      await api.delete(`/documents/study/${studyData._id}/reports/${reportIndex}`);
      toast.success("Report deleted successfully");
      fetchReports();
    } catch (error) {
      console.error("Error deleting report:", error);
      toast.error("Failed to delete report");
    }
  };

  if (!isOpen) return null;

  // Get patient and study info
  const patientName = studyData?.patientName || 'N/A';
  const patientId = studyData?.patientId || 'N/A';
  const assignedDoctor = studyData?.lastAssignedDoctor;

  // Get workflow status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'report_finalized':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'report_in_progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'assigned_to_doctor':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Enhanced Header with Patient & Doctor Info */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-6 px-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">
                Medical Report - {patientName}
              </h3>
              
              {/* Patient & Study Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {/* Patient Info */}
                <div className="bg-white bg-opacity-10 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-100 mb-1">Patient Information</h4>
                  <p className="text-white text-sm">
                    <span className="font-medium">Name:</span> {patientName}
                  </p>
                  <p className="text-white text-sm">
                    <span className="font-medium">ID:</span> {patientId}
                  </p>
                  <p className="text-white text-sm">
                    <span className="font-medium">Age/Gender:</span> {studyData?.ageGender || 'N/A'}
                  </p>
                </div>

                {/* Assigned Doctor Info */}
                <div className="bg-white bg-opacity-10 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-100 mb-1">Assigned Doctor</h4>
                  {assignedDoctor ? (
                    <>
                      <p className="text-white text-sm">
                        <span className="font-medium">Name:</span> {assignedDoctor.fullName}
                      </p>
                      <p className="text-white text-sm">
                        <span className="font-medium">Specialization:</span> {assignedDoctor.specialization}
                      </p>
                      <p className="text-white text-sm">
                        <span className="font-medium">Department:</span> {assignedDoctor.department}
                      </p>
                    </>
                  ) : (
                    <p className="text-blue-200 text-sm italic">No doctor assigned</p>
                  )}
                </div>

                {/* Study Info */}
                <div className="bg-white bg-opacity-10 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-blue-100 mb-1">Study Information</h4>
                  <p className="text-white text-sm">
                    <span className="font-medium">Modality:</span> {studyData?.modality || 'N/A'}
                  </p>
                  <p className="text-white text-sm">
                    <span className="font-medium">Study Date:</span> {studyData?.studyDateTime || 'N/A'}
                  </p>
                  <p className="text-white text-sm">
                    <span className="font-medium">Status:</span> 
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(studyData?.workflowStatus)}`}>
                      {studyData?.workflowStatus?.replace(/_/g, ' ')?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            
            <button onClick={onClose} className="text-blue-100 hover:text-white ml-4">
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Enhanced Tabs */}
        <div className="flex border-b bg-gray-50">
          {[
            {
              id: 0,
              name: 'VIEW REPORTS',
              icon: '📋'
            },
            {
              id: 1,
              name: 'GENERATE REPORT',
              icon: '📄'
            },
            {
              id: 2,
              name: 'UPLOAD REPORT',
              icon: '📤'
            },
            {
              id: 3,
              name: 'FINDINGS',
              icon: '🔍'
            }
          ].map((tab) => (
            <button 
              key={tab.id}
              className={`py-4 px-6 font-medium text-sm transition-all duration-200 border-b-2 ${
                activeTab === tab.id 
                  ? 'text-blue-600 border-blue-600 bg-white' 
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-grow overflow-auto p-6 bg-gray-50">
          {/* View Reports Tab */}
          {activeTab === 0 && (
            <div className="bg-white rounded-lg shadow-sm">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {[
                          'S.No',
                          'Reported By',
                          'Reported Date',
                          'Report Type', 
                          'Report Status',
                          'Typed By',
                          'Actions'
                        ].map((header) => (
                          <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reports.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                            <div className="flex flex-col items-center">
                              <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <p className="text-lg font-medium">No Reports Available</p>
                              <p className="text-sm text-gray-400">Generate or upload a report to get started</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        reports.map((report, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {index + 1}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {report.generatedBy || assignedDoctor?.fullName || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(report.generatedAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {report.reportType}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                                ${report.reportStatus === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {report.reportStatus || 'draft'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {report.typedBy || 'System'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleDownloadReport(report.index)}
                                  className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors"
                                >
                                  Download
                                </button>
                                <button
                                  onClick={() => handleDeleteReport(report.index)}
                                  className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Generate Report Tab */}
          {activeTab === 1 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-700 font-medium">Generate Report Template</p>
                      <p className="text-sm text-blue-600 mt-1">
                        Create a standardized report template for <strong>{patientName}</strong> (ID: {patientId}).
                        The template will include patient information, assigned doctor details, and study data.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center py-8">
                  <button
                    onClick={handleGenerateReport}
                    disabled={generating}
                    className={`px-8 py-4 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 ${
                      generating ? 'opacity-75 cursor-not-allowed' : 'hover:shadow-xl transform hover:-translate-y-1'
                    }`}
                  >
                    {generating ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Report...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate & Download Report
                      </span>
                    )}
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Report will include:</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Patient: {patientName}
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Doctor: {assignedDoctor?.fullName || 'Not Assigned'}
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Specialization: {assignedDoctor?.specialization || 'N/A'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Location: {studyData?.location || 'N/A'}
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Generated: {new Date().toLocaleDateString()}
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Format: Microsoft Word (.docx)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upload Report Tab */}
          {activeTab === 2 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="space-y-6">
                {/* Doctor Info Display */}
                {assignedDoctor && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-700 mb-2">📋 Assigned Doctor Information</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-green-600 font-medium">Name:</span>
                        <p className="text-green-700">{assignedDoctor.fullName}</p>
                      </div>
                      <div>
                        <span className="text-green-600 font-medium">Specialization:</span>
                        <p className="text-green-700">{assignedDoctor.specialization}</p>
                      </div>
                      <div>
                        <span className="text-green-600 font-medium">Department:</span>
                        <p className="text-green-700">{assignedDoctor.department}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="mt-4">
                      <label htmlFor="report-file-input" className="cursor-pointer">
                        <span className="mt-2 block text-sm font-medium text-gray-900">
                          Upload completed report file
                        </span>
                        <input
                          type="file"
                          id="report-file-input"
                          onChange={handleFileChange}
                          className="sr-only"
                          accept=".pdf,.doc,.docx,.txt"
                        />
                        <span className="mt-2 block text-xs text-gray-500">
                          PDF, DOC, DOCX up to 10MB
                        </span>
                      </label>
                    </div>
                  </div>
                  
                  {selectedFile && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm text-blue-700 font-medium">{selectedFile.name}</span>
                        <span className="text-xs text-blue-500 ml-2">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="report-status" className="block text-sm font-medium text-gray-700 mb-2">
                      Report Status
                    </label>
                    <select
                      id="report-status"
                      className="block w-48 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      value={reportStatus}
                      onChange={(e) => setReportStatus(e.target.value)}
                    >
                      <option value="draft">Draft</option>
                      <option value="finalized">Finalized</option>
                    </select>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleUploadReport}
                    disabled={!selectedFile || uploading}
                    className={`px-6 py-3 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 ${
                      !selectedFile || uploading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg transform hover:-translate-y-1'
                    }`}
                  >
                    {uploading ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Uploading...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Upload Report
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Findings Tab */}
          {activeTab === 3 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">Clinical Findings</h3>
                  <span className="text-sm text-gray-500">
                    Assigned to: {assignedDoctor?.fullName || 'Unassigned'}
                  </span>
                </div>
                
                <textarea 
                  rows={12}
                  className="w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Enter detailed clinical findings, observations, and diagnostic impressions..."
                ></textarea>
                
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Last updated: Never
                  </div>
                  <button
                    type="button"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    Save Findings
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Footer */}
        <div className="bg-white border-t px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Study ID: {studyData?._id?.slice(-8) || 'N/A'} | 
            Status: <span className="font-medium">{studyData?.workflowStatus?.replace(/_/g, ' ')?.toUpperCase()}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;