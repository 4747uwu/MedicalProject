import React, { useState } from 'react';
import ReportModal from './ReportModal';

// Update the ReportButton component to pass lastAssignedDoctor
const ReportButton = ({ study }) => {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const handleOpenReportModal = () => {
    setIsReportModalOpen(true);
  };

  const handleCloseReportModal = () => {
    setIsReportModalOpen(false);
  };

  // Prepare study data with lastAssignedDoctor information
  const studyDataWithDoctor = {
    ...study,
    lastAssignedDoctor: study.lastAssignedDoctor || null
  };

  return (
    <>
      <button
  onClick={handleOpenReportModal}
  className={`text-sm font-medium ${
    study.workflowStatus === "report_finalized" 
      ? "text-green-600 hover:text-green-800" 
      : "text-blue-600 hover:text-blue-800"
  }`}
  title={
    study.workflowStatus === "report_finalized" 
      ? "View Finalized Report" 
      : "View/Generate Report"
  }
>
  {study.workflowStatus === "report_finalized" ? (
    // Checkmark icon for finalized reports
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : (
    // Original document icon for pending reports
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )}
</button>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={handleCloseReportModal}
        studyData={studyDataWithDoctor} // Pass the study data with doctor info
      />
    </>
  );
};

export default ReportButton;