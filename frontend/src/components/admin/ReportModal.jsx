import React, { useState, useEffect } from 'react';
// import { Tab } from '@headlessui/react';
import api from '../../services/api';
import { formatDate } from '../../utils/dateUtils';
import { toast } from 'react-toastify';
// import ReportModal from './ReportModal';

const ReportModal = ({ isOpen, onClose, studyData }) => {
    
  const [activeTab, setActiveTab] = useState(0);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [reportStatus, setReportStatus] = useState('draft');
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    if (isOpen && studyData) {
      fetchReports();
      fetchDoctors();
    }
  }, [isOpen, studyData]);

  const fetchReports = async () => {
    if (!studyData?._id) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/documents/study/${studyData._id}/reports`);
      if (response.data.success) {
        setReports(response.data.reports || []);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  // Update the fetchDoctors function to get the proper doctor data with populated userAccount
  const fetchDoctors = async () => {
    try {
      // Update the API call to get doctors with populated user accounts
      const response = await api.get('/admin/doctors');
      if (response.data.success) {
        // Map the doctors to include the fullName from userAccount
        const doctorsWithNames = response.data.doctors.map(doctor => ({
          _id: doctor._id,
          fullName: doctor.userAccount?.fullName || 'Unknown Doctor',
          specialization: doctor.specialization || 'General',
          department: doctor.department || 'Not Specified'
        }));
        
        setDoctors(doctorsWithNames);
        
        // If a doctor is assigned to the study, preselect them
        if (studyData?.lastAssignedDoctor?._id) {
          setSelectedDoctor(studyData.lastAssignedDoctor._id);
        }
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
    }
  };

  const handleGenerateReport = async () => {
    if (!studyData?._id) return;
    
    setGenerating(true);
    try {
      // Call the report generation API endpoint
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
      
      toast.success("Report generated successfully");
      // Refresh reports list
      fetchReports();
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
      toast.error("Please select a file and doctor");
      return;
    }
    
    setUploading(true);
    try {
      // Create form data
      const formData = new FormData();
      formData.append('report', selectedFile);
      formData.append('doctorId', selectedDoctor);
      formData.append('reportStatus', reportStatus);
      
      // Upload the report
      await api.post(`/documents/study/${studyData._id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success("Report uploaded successfully");
      setSelectedFile(null);
      // Reset file input
      document.getElementById('report-file-input').value = '';
      
      // Refresh reports list
      fetchReports();
      // Switch to view reports tab
      setActiveTab(0);
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
      
      // Try to get filename from headers or use default
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
      
      // Refresh reports list
      fetchReports();
    } catch (error) {
      console.error("Error deleting report:", error);
      toast.error("Failed to delete report");
    }
  };

  if (!isOpen) return null;

  // Get patient name
  const patientName = studyData?.patientName || 
    (studyData?.patient ? 
      `${studyData.patient.firstName || ''} ${studyData.patient.lastName || ''}`.trim() : 'N/A');
      
  const patientId = studyData?.patientId || (studyData?.patient ? studyData.patient.patientID : 'N/A');

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gray-700 text-white py-4 px-6 flex justify-between items-center">
          <h3 className="text-lg font-medium">
            View Report : {patientName} {studyData?.ageGender ? `(${studyData.ageGender})` : ''}
          </h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white">
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button 
            className={`py-3 px-6 font-medium ${activeTab === 0 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab(0)}
          >
            VIEW REPORT(S)
          </button>
          <button 
            className={`py-3 px-6 font-medium ${activeTab === 1 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab(1)}
          >
            GENERATE REPORT
          </button>
          <button 
            className={`py-3 px-6 font-medium ${activeTab === 2 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab(2)}
          >
            UPLOAD REPORT
          </button>
          <button 
            className={`py-3 px-6 font-medium ${activeTab === 3 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab(3)}
          >
            FINDINGS
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-grow overflow-auto p-6">
          {/* View Reports Tab */}
          {activeTab === 0 && (
            <div className="h-full">
              {loading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        S.No
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reported By
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reported Date
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Report Type
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Report Status
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Typed By
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        View
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Download
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Delete
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reports.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-4 text-sm text-center text-gray-500">
                          No Reports Available
                        </td>
                      </tr>
                    ) : (
                      reports.map((report, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                            {index + 1}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {report.generatedBy || 'N/A'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(report.generatedAt)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {report.reportType}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${report.reportStatus === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {report.reportStatus || 'draft'}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {report.typedBy || 'System'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleDownloadReport(report.index)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View
                            </button>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleDownloadReport(report.index)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Download
                            </button>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleDeleteReport(report.index)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Generate Report Tab */}
          {activeTab === 1 && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-700">
                  Generate a report for patient {patientName} (ID: {patientId}).<br/>
                  This will use the template to create a downloadable document with patient information.
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleGenerateReport}
                  disabled={generating}
                  className={`px-6 py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    generating ? 'opacity-75 cursor-not-allowed' : ''
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
                    'Generate Report'
                  )}
                </button>
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Report will include:</h4>
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                  <li>Patient Name: {patientName}</li>
                  <li>Doctor Name: {studyData?.lastAssignedDoctor?.fullName || 'Not Assigned'}</li>
                  <li>Lab Name: {studyData?.sourceLab?.name || 'N/A'}</li>
                  <li>Generated Date: {new Date().toLocaleDateString()}</li>
                </ul>
              </div>
            </div>
          )}

          {/* Upload Report Tab */}
          {activeTab === 2 && (
            <div>
              <div className="italic text-sm text-gray-600 mb-4">
                (Select a file from the local pc and click upload attachments)
              </div>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="doctor-select" className="block text-sm font-medium text-gray-700">
                    {/* Changed from hardcoded "Radiologist" to "Doctor/Radiologist" */}
                    Doctor/Radiologist
                  </label>
                  <select
                    id="doctor-select"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    value={selectedDoctor}
                    onChange={(e) => setSelectedDoctor(e.target.value)}
                  >
                    <option value="">Select a doctor</option>
                    {doctors.map((doctor) => (
                      <option key={doctor._id} value={doctor._id}>
                        {/* Show doctor name and specialization */}
                        {doctor.fullName} - {doctor.specialization}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="italic text-sm text-gray-600 mb-2">
                  {/* Updated instruction text to be more generic */}
                  (Select Reporting Doctor, choose the status and click upload attachments)
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex-grow">
                    <label htmlFor="report-file-input" className="block text-sm font-medium text-gray-700">
                      File Upload
                    </label>
                    <input
                      type="file"
                      id="report-file-input"
                      onChange={handleFileChange}
                      className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  
                  <div className="w-48">
                    <label htmlFor="report-status" className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <select
                      id="report-status"
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      value={reportStatus}
                      onChange={(e) => setReportStatus(e.target.value)}
                    >
                      <option value="draft">Draft</option>
                      <option value="finalized">Finalized</option>
                    </select>
                  </div>
                  
                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={handleUploadReport}
                      disabled={!selectedFile || uploading }
                      className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                        !selectedFile || uploading ? 'opacity-50 cursor-not-allowed' : ''
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
                        'Upload Attachments'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Findings Tab */}
          {activeTab === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Clinical Findings</h3>
              <textarea 
                rows={10}
                className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter clinical findings and observations..."
              ></textarea>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Save Findings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;