

import React, { useState } from 'react';
import ReportModal from './ReportModal';

const ReportButton = ({ study }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Get report status indicator color
  const getStatusColor = (status) => {
    if (!status) return 'bg-gray-200 text-gray-700';
    
    switch (status.toLowerCase()) {
      case 'finalized':
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
      case 'generated':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-200 text-gray-700';
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex flex-col items-center justify-center"
        title="Manage Reports"
      >
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(study.reportStatus)}`}>
          {study.reportStatus || '--'}
        </span>
      </button>
      
      <ReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        studyData={study}
      />
    </>
  );
};

export default ReportButton;