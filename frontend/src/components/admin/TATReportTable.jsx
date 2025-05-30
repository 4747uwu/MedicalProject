import React from 'react';
import { format } from 'date-fns';

const TATReportTable = ({ studies = [] }) => {
  // Helper function to format date with time
  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return format(date, 'yyyy-MM-dd HH:mm');
    } catch (error) {
      console.error('Date formatting error:', error);
      return '-';
    }
  };

  // Helper to handle potentially missing data
  const safeValue = (value, defaultVal = '-') => {
    return value || defaultVal;
  };

  // Helper to get status color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'report_finalized':
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'report_in_progress':
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'assigned_to_doctor':
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'pending_assignment':
      case 'pending':
        return 'bg-orange-100 text-orange-800';
      case 'new_study_received':
      case 'new':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="w-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
      {/* Table Header */}
      <div className="bg-gray-50 border-b border-gray-200 p-2">
        <h3 className="text-lg font-semibold text-gray-900">TAT Report Details</h3>
        <p className="text-sm text-gray-600">Total Records: {studies.length}</p>
      </div>

      {/* Table Container */}
      <div className="w-full">
        <table className="w-full border-collapse table-fixed text-xs">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[4%]">Status</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[5%]">ID</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[8%]">Name</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[3%]">Sex</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[6%]">Ref By</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[5%]">Acc #</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[7%]">Description</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[3%]">Mod</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[4%]">S/I</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[7%]">Institution</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[8%]">Study Date</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[8%]">Upload Date</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[8%]">Assign Date</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[8%]">Report Date</th>
              <th className="border border-gray-300 px-1 py-2 text-center uppercase tracking-wider w-[4%]">S-R TAT</th>
              <th className="border border-gray-300 px-1 py-2 text-center uppercase tracking-wider w-[4%]">U-R TAT</th>
              <th className="border border-gray-300 px-1 py-2 text-center uppercase tracking-wider w-[4%]">A-R TAT</th>
              <th className="border border-gray-300 px-1 py-2 text-left uppercase tracking-wider w-[6%]">Doctor</th>
              <th className="border border-gray-300 px-1 py-2 text-center uppercase tracking-wider w-[3%]">Act</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {studies.length > 0 ? (
              studies.map((study, index) => (
                <tr 
                  key={study._id || index} 
                  className={`border-b border-gray-200 hover:bg-gray-50 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <td className="border-r border-gray-200 px-1 py-2">
                    <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${getStatusColor(study.studyStatus)}`}>
                      {safeValue(study.studyStatus)
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                        .substring(0, 12)}
                    </span>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-medium truncate" title={safeValue(study.patientId)}>
                    {safeValue(study.patientId)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-medium truncate" title={safeValue(study.patientName)}>
                    {safeValue(study.patientName)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 text-center">
                    {safeValue(study.gender)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 truncate" title={safeValue(study.referredBy)}>
                    {safeValue(study.referredBy)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-mono truncate" title={safeValue(study.accessionNumber)}>
                    {safeValue(study.accessionNumber)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 truncate" title={safeValue(study.studyDescription)}>
                    {safeValue(study.studyDescription)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 text-center font-semibold">
                    {safeValue(study.modality)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 text-center font-mono">
                    {safeValue(study.series_Images)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 truncate" title={safeValue(study.institutionName)}>
                    {safeValue(study.institutionName)}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-mono">
                    {study.billedOnStudyDate ? formatDateTime(study.billedOnStudyDate) : '-'}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-mono">
                    {study.uploadDate ? formatDateTime(study.uploadDate) : '-'}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-mono">
                    {study.assignedDate ? formatDateTime(study.assignedDate) : '-'}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 font-mono">
                    {study.reportDate ? formatDateTime(study.reportDate) : '-'}
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 text-center">
                    <span className={`inline-block px-1 py-0.5 text-xs font-medium ${
                      study.diffStudyAndReportTAT !== '-' ? 'bg-blue-100 text-blue-800' : 'text-gray-500'
                    }`}>
                      {study.diffStudyAndReportTAT ? study.diffStudyAndReportTAT.replace('Minutes', 'Min') : '-'}
                    </span>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 text-center">
                    <span className={`inline-block px-1 py-0.5 text-xs font-medium ${
                      study.diffUploadAndReportTAT !== '-' ? 'bg-green-100 text-green-800' : 'text-gray-500'
                    }`}>
                      {study.diffUploadAndReportTAT ? study.diffUploadAndReportTAT.replace('Minutes', 'Min') : '-'}
                    </span>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 text-center">
                    <span className={`inline-block px-1 py-0.5 text-xs font-medium ${
                      study.diffAssignAndReportTAT !== '-' ? 'bg-purple-100 text-purple-800' : 'text-gray-500'
                    }`}>
                      {study.diffAssignAndReportTAT ? study.diffAssignAndReportTAT.replace('Minutes', 'Min') : '-'}
                    </span>
                  </td>
                  <td className="border-r border-gray-200 px-1 py-2 truncate" title={safeValue(study.reportedBy)}>
                    {safeValue(study.reportedBy)}
                  </td>
                  <td className="px-1 py-2 text-center">
                    <button 
                      className="inline-flex items-center justify-center w-6 h-6 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                      title="Download Report"
                      onClick={() => console.log('Download report for study:', study._id)}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="19" className="px-2 py-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-base font-medium text-gray-500">No studies found</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      {studies.length > 0 && (
        <div className="bg-gray-50 border-t border-gray-200 px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              Showing {studies.length} {studies.length === 1 ? 'record' : 'records'}
            </div>
            <div className="text-xs text-gray-500">
              Last updated: {format(new Date(), 'yyyy-MM-dd HH:mm')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TATReportTable;