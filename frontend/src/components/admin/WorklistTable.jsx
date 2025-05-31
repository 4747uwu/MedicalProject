import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { 
  formatDate,
  formatTime,
  formatMonthDay, 
  formatMonthDayYear, 
  formatAbbrevMonthDay, 
  formatRelativeDate,
  formatMonthDayTime,
  formatMonthDayShort
} from '../../utils/dateUtils';
import PatientDetailModal from './patients/PatientDetailModal';
import DoctorAssignmentModal from './Doctor/DoctorAssignmentModal';
import OpenOHIFViewerButton from './ohifViewerButton';
import { useAuth } from '../../hooks/useAuth';
import ReportButton from './ReportButton';
import ColumnConfigurator from './ColumnConfigurator';
import PatientReport  from './patients/PatientDetail';
import DiscussionButton from './patients/DiscussionButton';
import StudySeries from './patients/StudySeries';
import StatusLegend from './StatusLegend';

// Status dot component to indicate workflow status
const StatusDot = React.memo(({ status, priority }) => {
  let color = 'bg-gray-400'; 
  let showEmergencyIcon = false;
  let tooltipText = '';
  
  // Handle emergency cases first
  if (priority === 'EMERGENCY' || priority === 'STAT' || priority === 'URGENT') {
    showEmergencyIcon = true;
    tooltipText = `${priority} Priority - Requires immediate attention`;
  } else {
    // Handle normal priority cases based on status
    switch (status) {
      case 'new_study_received':
      case 'new':
        color = 'bg-red-500';
        tooltipText = 'New Study Received - Awaiting processing';
        break;
      case 'pending_assignment':
        color = 'bg-yellow-500';
        tooltipText = 'Pending Assignment - Waiting for doctor assignment';
        break;
      case 'assigned_to_doctor':
        color = 'bg-yellow-500';
        tooltipText = 'Assigned to Doctor - Radiologist assigned, awaiting review';
        break;
      case 'doctor_opened_report':
      case 'report_in_progress':
        color = 'bg-orange-500';
        tooltipText = 'Report in Progress - Doctor is reviewing study';
        break;
      case 'report_finalized':
      case 'report_uploaded':
        color = 'bg-blue-500';
        tooltipText = 'Report Finalized - Report completed and ready for download';
        break;
      case 'report_downloaded_radiologist':
        color = 'bg-amber-600';
        tooltipText = 'Downloaded by Radiologist - Study downloaded by assigned doctor';
        break;
      case 'report_downloaded':
        color = 'bg-gray-500';
        tooltipText = 'Report Downloaded - Study downloaded by staff';
        break;
      case 'final_report_downloaded':
        color = 'bg-green-500';
        tooltipText = 'Final Report Downloaded - Report downloaded by lab/admin';
        break;
      case 'archived':
        color = 'bg-gray-400';
        tooltipText = 'Archived - Study has been archived';
        break;
      default:
        color = 'bg-gray-400';
        tooltipText = 'Unknown Status';
    }
  }
  
  if (showEmergencyIcon) {
    return (
      <div 
        className="relative flex items-center justify-center"
        title={tooltipText}
      >
        <svg width="24" height="24" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="greenGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a8e063"/>
              <stop offset="100%" stopColor="#56ab2f"/>
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="url(#greenGrad)" />
          <rect x="30" y="18" width="4" height="28" fill="#fff"/>
          <rect x="18" y="30" width="28" height="4" fill="#fff"/>
        </svg>
      </div>
    );
  }
  
  return (
    <div 
      className="relative flex items-center justify-center"
      title={tooltipText}
    >
      <div className={`w-3 h-3 rounded-full ${color}`} />
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.status === nextProps.status && prevProps.priority === nextProps.priority;
});

// Eye icon with the viewer functionality
// Update the EyeIconOHIFButton component:

const EyeIconOHIFButton = React.memo(({ studyInstanceUID }) => {
  const handleClick = useCallback((e) => {
    e.preventDefault();
    
    // Use Orthanc Stone Web Viewer URL format
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    const viewerURL = `${orthancBaseURL}/stone-webviewer/index.html?study=${studyInstanceUID}`;
    
    console.log('Opening Stone Web Viewer with URL:', viewerURL);
    window.open(viewerURL, '_blank');
  }, [studyInstanceUID]);

  return (
    <button 
      onClick={handleClick} 
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-1 hover:bg-blue-50 rounded"
      title={`View study in Stone Web Viewer: ${studyInstanceUID}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );
});

// Enhanced DownloadDropdown
const DownloadDropdown = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  
  const handleDownloadStudy = async () => {
    try {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        alert('Orthanc Study ID not found');
        return;
      }
      
      const downloadUrl = `${backendUrl}/api/orthanc-download/study/${orthancStudyId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading study:', error);
      alert('Failed to download study: ' + error.message);
    } finally {
      setIsOpen(false);
    }
  };
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-green-600 hover:text-green-800 transition-colors duration-200 p-1 hover:bg-green-50 rounded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="py-1">
              <button
                onClick={handleDownloadStudy}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download ZIP
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// New Download Button Component
const DownloadButton = React.memo(({ study }) => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  
  const handleDownload = useCallback(async () => {
    try {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        alert('Orthanc Study ID not found');
        return;
      }
      
      const downloadUrl = `${backendUrl}/api/orthanc-download/study/${orthancStudyId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading study:', error);
      alert('Failed to download study: ' + error.message);
    }
  }, [study.orthancStudyID, backendUrl]);

  return (
    <button onClick={handleDownload} className="text-green-600 hover:text-green-800 transition-colors duration-200 p-1 hover:bg-green-50 rounded">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </button>
  );
});

const UserButton = ({ study }) => {
  const hasClinicalHistory = study.clinicalHistory && study.clinicalHistory.trim() !== '';
  
  const handleUserClick = () => {
    console.log('User button clicked for study:', study._id);
  };

  return (
    <div className="flex items-center justify-center">
      <button 
        onClick={handleUserClick}
        className={`transition-colors duration-200 p-1 hover:bg-blue-50 rounded ${
          hasClinicalHistory 
            ? 'text-blue-600 hover:text-blue-800' 
            : 'text-gray-400 hover:text-gray-500'
        }`}
        title={hasClinicalHistory ? "Clinical history available" : "No clinical history"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
      
      {hasClinicalHistory && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
    </div>
  );
};

// Random Emoji Button Component - Single Emoji
const RandomEmojiButton = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleEmojiClick = () => {
    setIsOpen(true);
  };

  return (
    <>
      <button 
        onClick={handleEmojiClick}
        className="hover:scale-110 transition-transform duration-200 p-1 hover:bg-gray-50 rounded"
        title="View study series"
      >
        <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <rect x="6" y="6" width="12" height="12" fill="#4D4D4D"/>
          <line x1="12" y1="18" x2="12" y2="24" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="24" x2="12" y2="38" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="26" x2="22" y2="26" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="36" x2="22" y2="36" stroke="#999999" strokeWidth="2"/>
          <rect x="22" y="20" width="12" height="12" fill="#F90"/>
          <rect x="22" y="30" width="12" height="12" fill="#F90"/>
        </svg>
      </button>

      {isOpen && (
        <StudySeries
          study={study}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

const WorklistTable = React.memo(({ 
  studies = [], 
  loading = false, 
  totalRecords = 0, 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  userRole = 'admin',
  onAssignmentComplete,
  filters = {},
  isReportPage = false
}) => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedStudies, setSelectedStudies] = useState([]);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    checkbox: true,
    status: true,
    randomEmoji: true,
    user: true,
    downloadBtn: true,
    discussion: true,
    patientId: true,
    patientName: true,
    ageGender: true,
    description: true,
    series: true,
    modality: true,
    location: true,
    studyDate: true,
    uploadDate: true,
    reportedDate: true,
    reportedBy: true,
    accession: true,
    seenBy: true,
    actions: true,
    report: true,
    assignDoctor: true
  });
  
  // Modal states
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientDetail, setPatientDetail] = useState(false);
  
  const canAssignDoctors = userRole === 'admin';

  // 🔧 MEMOIZE FILTERED STUDIES
  const filteredStudies = useMemo(() => {
    if (!studies || studies.length === 0) return [];
    
    switch (activeTab) {
      case 'pending':
        return studies.filter(study => study.currentCategory === 'pending');
      case 'inprogress':
        return studies.filter(study => study.currentCategory === 'inprogress');
      case 'completed':
        return studies.filter(study => study.currentCategory === 'completed');
      case 'archived':
        return studies.filter(study => study.currentCategory === 'archived');
      case 'all':
      default:
        return studies;
    }
  }, [studies, activeTab]);

  // 🔧 MEMOIZE STATUS COUNTS
  const statusCounts = useMemo(() => {
    return {
      all: studies.length,
      pending: studies.filter(study => study.currentCategory === 'pending').length,
      inprogress: studies.filter(study => study.currentCategory === 'inprogress').length,
      completed: studies.filter(study => study.currentCategory === 'completed').length,
      archived: studies.filter(study => study.currentCategory === 'archived').length || 0
    };
  }, [studies]);

  // 🔧 MEMOIZED CALLBACKS
  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      const allStudyIds = filteredStudies.map(study => study._id);
      setSelectedStudies(allStudyIds);
    } else {
      setSelectedStudies([]);
    }
  }, [filteredStudies]);

  const handleSelectStudy = useCallback((studyId) => {
    setSelectedStudies(prev => {
      if (prev.includes(studyId)) {
        return prev.filter(id => id !== studyId);
      } else {
        return [...prev, studyId];
      }
    });
  }, []);

  const handleColumnChange = useCallback((column, visible) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: visible
    }));
  }, []);

  const handlePatientClick = useCallback((patientId) => {
    setSelectedPatientId(patientId);
    setPatientDetailModalOpen(true);
  }, []);

  const handlePatienIdClick = useCallback((patientId, study) => {
    setSelectedPatientId(patientId);
    setSelectedStudy(study);
    setPatientDetail(true);
  }, []);

  const handleAssignDoctor = useCallback((study) => {
    setSelectedStudy(study);
    setAssignmentModalOpen(true);
  }, []);

  // Clear selections when tab changes
  useEffect(() => {
    setSelectedStudies([]);
  }, [activeTab]);

  // Footer functionality functions (keeping existing logic)
  const handleAssignStudy = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to assign');
      return;
    }
    
    try {
      toast.loading('Preparing assignment modal...');
      
      const studyToAssign = studies.find(study => study._id === selectedStudies[0]);
      
      if (!studyToAssign) {
        toast.dismiss();
        toast.error('Selected study not found');
        return;
      }
      
      toast.dismiss();
      
      const formattedStudy = {
        _id: studyToAssign._id,
        patientName: studyToAssign.patientName || 'N/A',
        patientId: studyToAssign.patientId || 'N/A',
        modality: studyToAssign.modality || '',
        description: studyToAssign.description || '',
        studyDescription: studyToAssign.studyDescription || '',
        examDescription: studyToAssign.examDescription || '',
        modalitiesInStudy: studyToAssign.modalitiesInStudy || [],
        lastAssignedDoctor: studyToAssigned.lastAssignedDoctor || null,
        workflowStatus: studyToAssign.workflowStatus || 'new',
        additionalStudies: selectedStudies.length - 1
      };
      
      setSelectedStudy(formattedStudy);
      setAssignmentModalOpen(true);
    } catch (error) {
      toast.dismiss();
      console.error('Error preparing assignment:', error);
      toast.error('Failed to prepare assignment. Please try again.');
    }
  };
  
  const handleUnauthorized = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to mark as unauthorized');
      return;
    }
    
    const confirmation = window.confirm(
      `Are you sure you want to mark ${selectedStudies.length} ${
        selectedStudies.length === 1 ? 'study' : 'studies'
      } as unauthorized? This action cannot be undone.`
    );
    
    if (!confirmation) return;
    
    try {
      toast.loading('Marking studies as unauthorized...');
      
      const response = await api.post('/api/footer/unauthorized', {
        studyIds: selectedStudies,
        reason: 'Marked as unauthorized via worklist'
      });
      
      toast.dismiss();
      
      if (response.data.success) {
        toast.success(`Marked ${selectedStudies.length} ${
          selectedStudies.length === 1 ? 'study' : 'studies'
        } as unauthorized`);
        
        setSelectedStudies([]);
        
        if (onAssignmentComplete) {
          onAssignmentComplete();
        }
      } else {
        toast.error(response.data.message || 'Failed to update study status');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error marking studies as unauthorized:', error);
      toast.error('Failed to update study status. Please try again.');
    }
  };
  
  const handleExportWorklist = async () => {
    try {
      toast.loading('Preparing worklist export...');
      
      const queryParams = new URLSearchParams();
      
      if (selectedStudies.length > 0) {
        queryParams.append('studyIds', selectedStudies.join(','));
      } else {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            queryParams.append(key, value);
          }
        });
      }
      
      const response = await api.get(`/footer/export?${queryParams.toString()}`, {
        responseType: 'blob'
      });
      
      toast.dismiss();
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      
      link.setAttribute('download', `Worklist_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Export completed successfully');
    } catch (error) {
      toast.dismiss();
      console.error('Error exporting worklist:', error);
      toast.error('Failed to export worklist. Please try again.');
    }
  };
  
  const handleDispatchReport = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to dispatch report');
      return;
    }
    
    try {
      const studiesWithoutReports = studies
        .filter(study => selectedStudies.includes(study._id) && !study.ReportAvailable)
        .map(study => study.patientId || study.accessionNumber || study._id);
      
      if (studiesWithoutReports.length > 0) {
        toast.error(`${studiesWithoutReports.length} studies have no reports available`, {
          duration: 5000
        });
        
        if (studiesWithoutReports.length <= 5) {
          toast(`Missing reports for: ${studiesWithoutReports.join(', ')}`, {
            duration: 7000
          });
        }
        
        return;
      }
      
      toast.loading('Dispatching reports...');
      
      const response = await api.post('/footer/reports/dispatch', {
        studyIds: selectedStudies,
        emailTemplate: 'standard'
      });
      
      toast.dismiss();
      
      if (response.data.success) {
        const { results } = response.data;
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        
        if (failCount === 0) {
          toast.success(`Successfully dispatched ${successCount} ${
            successCount === 1 ? 'report' : 'reports'
          }`);
        } else {
          toast.success(`Dispatched ${successCount} reports, ${failCount} failed`);
          
          if (failCount <= 3) {
            const failureReasons = results
              .filter(r => !r.success)
              .map(r => r.message)
              .join('; ');
            
            toast(`Failed reports: ${failureReasons}`, {
              duration: 7000
            });
          }
        }
        
        setSelectedStudies([]);
        
        if (onAssignmentComplete) {
          onAssignmentComplete();
        }
      } else {
        toast.error(response.data.message || 'Failed to dispatch reports');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error dispatching reports:', error);
      toast.error('Failed to dispatch reports. Please try again.');
    }
  };
  
  const handleBulkZipDownload = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to download');
      return;
    }

    if (selectedStudies.length > 20) {
      const confirmation = window.confirm(
        `You are about to download ${selectedStudies.length} studies, which may take a long time. Do you want to continue?`
      );
      
      if (!confirmation) return;
    }
    
    try {
      toast.loading(`Preparing ${selectedStudies.length} studies for download...`, {
        duration: 10000
      });
      
      const queryParams = `studyIds=${selectedStudies.join(',')}`;
      
      const response = await api.get(`/footer/download-zip?${queryParams}`, {
        responseType: 'blob'
      });
      
      toast.dismiss();
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      
      link.setAttribute('download', `Studies_${dateStr}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Download started successfully');
    } catch (error) {
      toast.dismiss();
      console.error('Error downloading zip:', error);
      toast.error('Failed to download studies. Please try again.');
    }
  };

  const handleAssignmentModalComplete = async (doctorId, priority, note) => {
    setAssignmentModalOpen(false);
    
    if (doctorId) {
      try {
        toast.loading(`Assigning ${selectedStudies.length} studies to doctor...`);
        
        const response = await api.post('/footer/assign', {
          studyIds: selectedStudies,
          doctorId,
          priority,
          assignmentNote: note
        });
        
        toast.dismiss();
        
        if (response.data.success) {
          toast.success(`Successfully assigned ${selectedStudies.length} studies`);
          setSelectedStudies([]);
          
          if (onAssignmentComplete) {
            onAssignmentComplete();
          }
        } else {
          toast.error(response.data.message || 'Failed to assign studies');
        }
      } catch (error) {
        toast.dismiss();
        console.error('Error assigning studies:', error);
        toast.error('Failed to assign studies. Please try again.');
      }
    }
  };
  
  // 🔧 MEMOIZED TABLE HEADER
  const tableHeader = useMemo(() => (
    <thead className="sticky top-0 z-10">
      <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
        {visibleColumns.checkbox && (
          <th className="w-8 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            <input 
              type="checkbox" 
              className="rounded border-gray-300 w-4 h-4"
              checked={filteredStudies.length > 0 && selectedStudies.length === filteredStudies.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
          </th>
        )}
        {visibleColumns.status && (
          <th className="w-12 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Status
          </th>
        )}
        {visibleColumns.randomEmoji && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
         🌲
          </th>
        )}
        {visibleColumns.user && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            👤
          </th>
        )}
        {visibleColumns.downloadBtn && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            ⬇️
          </th>
        )}
        {visibleColumns.discussion && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            💬
          </th>
        )}
        {visibleColumns.patientId && (
          <th className="w-20 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Patient ID
          </th>
        )}
        {visibleColumns.patientName && (
          <th className="min-w-32 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Patient Name
          </th>
        )}
        {visibleColumns.ageGender && (
          <th className="w-16 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Age/Sex
          </th>
        )}
        {visibleColumns.description && (
          <th className="min-w-40 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Description
          </th>
        )}
        {visibleColumns.series && (
          <th className="w-12 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Series
          </th>
        )}
        {visibleColumns.modality && (
          <th className="w-16 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Modality
          </th>
        )}
        {visibleColumns.location && (
          <th className="min-w-28 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Location
          </th>
        )}
        {visibleColumns.studyDate && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Study Date
          </th>
        )}
        {visibleColumns.uploadDate && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Upload Date
          </th>
        )}
        {visibleColumns.reportedDate && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Reported Date
          </th>
        )}
        {visibleColumns.reportedBy && (
          <th className="w-24 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Reported By
          </th>
        )}
        {visibleColumns.accession && (
          <th className="w-24 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Accession
          </th>
        )}
        {visibleColumns.seenBy && (
          <th className="w-24 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Seen By
          </th>
        )}
        {visibleColumns.actions && (
          <th className="w-20 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Actions
          </th>
        )}
        {visibleColumns.report && (
          <th className="w-16 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Report
          </th>
        )}
        {canAssignDoctors && visibleColumns.assignDoctor && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
            Assign Doctor
          </th>
        )}
      </tr>
    </thead>
  ), [visibleColumns, filteredStudies.length, selectedStudies.length, handleSelectAll]);

  // 🔧 MEMOIZED TABLE BODY
  const tableBody = useMemo(() => (
    <tbody>
      {filteredStudies.length === 0 ? (
        <tr>
          <td colSpan="20" className="px-6 py-12 text-center text-gray-500 bg-gray-50">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">No studies found</p>
            <p className="text-sm">Try adjusting your search or filter criteria</p>
          </td>
        </tr>
      ) : (
        filteredStudies.map((study, index) => (
          <StudyRow
            key={study._id}
            study={study}
            index={index}
            visibleColumns={visibleColumns}
            selectedStudies={selectedStudies}
            onSelectStudy={handleSelectStudy}
            onPatientClick={handlePatientClick}
            onPatienIdClick={handlePatienIdClick}
            onAssignDoctor={handleAssignDoctor}
            canAssignDoctors={canAssignDoctors}
          />
        ))
      )}
    </tbody>
  ), [
    filteredStudies, 
    visibleColumns, 
    selectedStudies, 
    handleSelectStudy, 
    handlePatientClick, 
    handlePatienIdClick, 
    handleAssignDoctor, 
    canAssignDoctors
  ]);

  return (
    <div className="bg-white w-full h-[85vh] rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header with Status Tabs */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        <div className="bg-gray-400 text-white p-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg text-black font-bold tracking-wide">WORKLIST</h1>
            <div className="flex items-center space-x-2">
              {/* Status Tabs */}
              <div className="flex">
                <button
                  className={`px-3 py-1 rounded-l ${activeTab === 'all' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('all')}
                >
                  ALL({statusCounts.all})
                </button>
                <button
                  className={`px-3 py-1 ${activeTab === 'pending' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('pending')}
                >
                  Pending({statusCounts.pending})
                </button>
                <button
                  className={`px-3 py-1 ${activeTab === 'inprogress' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('inprogress')}
                >
                  Inprogress({statusCounts.inprogress})
                </button>
                <button
                  className={`px-3 py-1 rounded-r ${activeTab === 'completed' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('completed')}
                >
                  Completed({statusCounts.completed})
                </button>
              </div>

              {/* Status Legend */}
              <StatusLegend />

              {/* Column Configurator */}
              <ColumnConfigurator 
                visibleColumns={visibleColumns}
                onColumnChange={handleColumnChange}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Table Container */}
      <div className="flex-1 overflow-hidden pb-16">
        {loading ? (
          <div className="flex justify-center items-center h-full bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Loading studies...</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full overflow-auto">
            <table className="w-full border-collapse min-w-full">
              {tableHeader}
              {tableBody}
            </table>
          </div>
        )}
      </div>
      
      {/* Excel-style Footer with Pagination */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <p className="text-sm text-gray-700 font-medium">
            Showing <span className="font-bold text-blue-600">{filteredStudies.length > 0 ? ((currentPage - 1) * 10) + 1 : 0}</span> to{' '}
            <span className="font-bold text-blue-600">{Math.min(currentPage * 10, totalRecords)}</span> of{' '}
            <span className="font-bold text-blue-600">{totalRecords}</span> results
          </p>
        </div>
        
        {/* Pagination Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange && onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPage === 1 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
            }`}
          >
            Previous
          </button>
          
          {/* Page Numbers */}
          <div className="flex space-x-1">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange && onPageChange(pageNum)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === pageNum 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => onPageChange && onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPage === totalPages 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
            }`}
          >
            Next
          </button>
        </div>
      </div>

      {/* Fixed Footer with Action Buttons */}
      <div className="bg-gray-800 text-white w-full py-2 px-3 flex items-center justify-between border-t border-gray-700 fixed bottom-0 left-0 right-0 z-30">
        <div className="flex items-center">
          {/* Logo */}
          <div className="pr-4 flex items-center">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 mr-2 text-gray-300" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 18V12M12 12L15 9M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="uppercase font-semibold tracking-wider text-md">XCENTIC</span>
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-1">
            <button 
              onClick={handleAssignStudy}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Assign Study
            </button>
            
            <button 
              onClick={handleUnauthorized}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Unauthorized
            </button>
            
            <button 
              onClick={handleExportWorklist}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded"
            >
              Export Worklist
            </button>
            
            <button 
              onClick={handleDispatchReport}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Dispatch Report
            </button>
            
            <button 
              onClick={handleBulkZipDownload}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Bulk Zip Download
            </button>
          </div>
        </div>
        
        {/* Total Count and Selection Info */}
        <div className="flex items-center mr-4 space-x-4">
          {selectedStudies.length > 0 && (
            <span className="text-sm text-yellow-300">
              Selected: {selectedStudies.length}
            </span>
          )}
          <span className="text-sm">Total: {totalRecords}</span>
        </div>
      </div>
      
      {/* Assignment Modal */}
      {assignmentModalOpen && selectedStudy && (
        <DoctorAssignmentModal
          study={selectedStudy}
          isOpen={assignmentModalOpen}
          onClose={() => setAssignmentModalOpen(false)}
          onAssignmentComplete={handleAssignmentModalComplete}
          isBulkAssignment={selectedStudies.length > 1}
          totalSelected={selectedStudies.length}
        />
      )}
      
      {/* Patient Detail Modal */}
      {patientDetailModalOpen && selectedPatientId && (
        <PatientDetailModal
          patientId={selectedPatientId}
          isOpen={patientDetailModalOpen}
          onClose={() => setPatientDetailModalOpen(false)}
        />
      )}

      {patientDetail && selectedPatientId && (
        <PatientReport
          patientId={selectedPatientId}
          study={selectedStudy}
          isOpen={patientDetail}
          onClose={() => setPatientDetail(false)}
        />
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.studies.length === nextProps.studies.length &&
    prevProps.loading === nextProps.loading &&
    prevProps.currentPage === nextProps.currentPage &&
    JSON.stringify(prevProps.studies) === JSON.stringify(nextProps.studies)
  );
});

// 🔧 StudyRow component with enhanced date formatting
const StudyRow = React.memo(({ 
  study, 
  index, 
  visibleColumns, 
  selectedStudies, 
  onSelectStudy, 
  onPatientClick,
  onPatienIdClick,
  onAssignDoctor,
  canAssignDoctors 
}) => {
  const isSelected = selectedStudies.includes(study._id);
  
  const handleSelectStudy = useCallback(() => {
    onSelectStudy(study._id);
  }, [study._id, onSelectStudy]);

  const handlePatientClick = useCallback(() => {
    onPatientClick(study.patientId);
  }, [study.patientId, onPatientClick]);

  const handlePatienIdClick = useCallback(() => {
    onPatienIdClick(study.patientId, study);
  }, [study.patientId, study, onPatienIdClick]);

  const handleAssignDoctor = useCallback(() => {
    onAssignDoctor(study);
  }, [study, onAssignDoctor]);

  return (
    <tr 
      className={`
        ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} 
        hover:bg-blue-100 transition-colors duration-150 border-b border-gray-200
        ${isSelected ? 'bg-blue-50' : ''}
      `}
    >
      {visibleColumns.checkbox && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <input 
            type="checkbox" 
            className="rounded border-gray-300 w-4 h-4"
            checked={isSelected}
            onChange={handleSelectStudy}
          />
        </td>
      )}
      
      {visibleColumns.status && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <div className="flex justify-center">
            <StatusDot status={study.workflowStatus} priority={study.priority} />
          </div>
        </td>
      )}

      {visibleColumns.randomEmoji && (
        <td className="px-1 py-2 text-center border-r border-gray-200">
          <RandomEmojiButton study={study} />
        </td>
      )}

      {visibleColumns.user && (
        <td className="px-1 py-2 text-center border-r border-gray-200">
          <button 
            onClick={handlePatientClick}
            className="text-sm font-semibold hover:text-blue-800 hover:underline flex items-center justify-center"
            title={study.clinicalHistory ? "Clinical history available" : "No clinical history"}
          >
            <UserButton study={study} />
          </button>
        </td>
      )}

      {visibleColumns.downloadBtn && (
        <td className="px-1 py-2 text-center border-r border-gray-200">
          <DownloadButton study={study} />
        </td>
      )}

      {visibleColumns.discussion && (
        <td className="px-1 py-2 text-center border-r border-gray-200">
          <DiscussionButton study={study} />
        </td>
      )}
      
      {visibleColumns.patientId && (
        <td className="px-2 py-2 border-r border-gray-200">
          <button 
            onClick={handlePatienIdClick}
            className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium truncate"
            title="Click to view patient details"
          >
            {study.patientId}
          </button>
        </td>
      )}
      
      {visibleColumns.patientName && (
        <td className="px-2 py-2 border-r border-gray-200">
          <div className="text-sm font-medium text-gray-900 truncate" title={study.patientName}>
            {study.patientName}
          </div>
        </td>
      )}
      
      {visibleColumns.ageGender && (
        <td className="px-1 py-2 text-center border-r border-gray-200">
          <div className="text-xs text-gray-600">{study.ageGender}</div>
        </td>
      )}
      
      {visibleColumns.description && (
        <td className="px-2 py-2 border-r border-gray-200">
          <div className="text-xs text-gray-900 truncate max-w-40" title={study.description}>
            {study.description}
          </div>
        </td>
      )}
      
      {visibleColumns.series && (
        <td className="px-1 py-2 text-center border-r border-gray-200">
          <div className="text-xs text-gray-600">{study.seriesImages}</div>
        </td>
      )}
      
      {visibleColumns.modality && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
            {study.modality}
          </span>
        </td>
      )}
      
      {visibleColumns.location && (
        <td className="px-2 py-2 border-r border-gray-200">
          <div className="text-xs text-gray-600 truncate max-w-28" title={study.location}>
            {study.location}
          </div>
        </td>
      )}
      
      {/* ✨ UPDATED: Study Date with new date formatting */}
      {visibleColumns.studyDate && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <div className="text-xs text-gray-600">
            <div className="font-medium" title={formatMonthDayYear(study.studyDateTime)}>
              {formatMonthDay(study.studyDateTime)}
            </div>
            <div className="text-gray-500">{formatTime(study.studyDateTime)}</div>
          </div>
        </td>
      )}
      
      {/* ✨ UPDATED: Upload Date with new date formatting */}
      {visibleColumns.uploadDate && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <div className="text-xs text-gray-600">
            <div className="font-medium" title={formatMonthDayYear(study.uploadDateTime)}>
              {formatRelativeDate(study.uploadDateTime)}
            </div>
            <div className="text-gray-500">{formatTime(study.uploadDateTime)}</div>
          </div>
        </td>
      )}
      
      {/* ✨ UPDATED: Reported Date with enhanced date formatting and fallback logic */}
{/* ✨ UPDATED: Reported Date with enhanced date formatting and fallback logic */}
{visibleColumns.reportedDate && (
  <td className="px-2 py-2 text-center border-r border-gray-200">
    <div className="text-xs text-gray-600">
      {(() => {
        // Check multiple possible date fields for when a report was completed
        const reportedDate = study.reportedDateTime || 
                           study.reportFinalizedAt || 
                           study.reportDate ||
                           (study.uploadedReportsData && study.uploadedReportsData.length > 0 ? 
                            study.uploadedReportsData[study.uploadedReportsData.length - 1].uploadedAt : null);
        
        if (reportedDate) {
          return (
            <>
              <div className="font-medium" title={formatMonthDayYear(reportedDate)}>
                {formatAbbrevMonthDay(reportedDate)}
              </div>
              <div className="text-gray-500">{formatTime(reportedDate)}</div>
            </>
          );
        } else if (study.uploadedReportsCount > 0) {
          // If there are reports but no specific date, show report count
          return (
            <div className="text-blue-600 font-medium">
              {study.uploadedReportsCount} report{study.uploadedReportsCount > 1 ? 's' : ''}
            </div>
          );
        } else if (study.workflowStatus === 'report_in_progress' || 
                  study.workflowStatus === 'doctor_opened_report') {
          return (
            <div className="text-orange-500 font-medium">
              In Progress
            </div>
          );
        } else {
          return (
            <div className="text-gray-400">Not reported</div>
          );
        }
      })()}
    </div>
  </td>
)}
      
      {visibleColumns.reportedBy && (
        <td className="px-2 py-2 border-r border-gray-200">
          <div className="text-xs text-gray-900 truncate" title={study.reportedBy || 'N/A'}>
            {study.reportedBy || 'N/A'}
          </div>
        </td>
      )}

      {visibleColumns.accession && (
        <td className="px-2 py-2 border-r border-gray-200">
          <div className="text-xs text-gray-900 truncate" title={study.accessionNumber || 'N/A'}>
            {study.accessionNumber || 'N/A'}
          </div>
        </td>
      )}

      {visibleColumns.seenBy && (
        <td className="px-2 py-2 border-r border-gray-200">
          <div className="text-xs text-gray-900 truncate" title={study.seenBy || 'Not Assigned'}>
            {study.seenBy || 'Not Assigned'}
          </div>
        </td>
      )}
      
      {visibleColumns.actions && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <div className="flex justify-center items-center space-x-1">
            <EyeIconOHIFButton studyInstanceUID={study.instanceID} />
            <DownloadDropdown study={study} />
          </div>
        </td>
      )}
      
      {visibleColumns.report && (
        <td className="px-2 py-2 text-center border-r border-gray-200">
          <div className="flex justify-center">
            <ReportButton study={study} />
          </div>
        </td>
      )}
      
      {canAssignDoctors && visibleColumns.assignDoctor && (
        <td className="px-2 py-2 text-center">
          <button 
            onClick={handleAssignDoctor}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              study.workflowStatus === 'report_finalized' 
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600' 
                  : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            disabled={study.workflowStatus === 'final_report_downloaded'}
          >
            {study.workflowStatus === 'final_report_downloaded' 
              ? 'Done' 
              : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                ? 'Reassign' 
                : 'Assign'
            }
          </button>
        </td>
      )}
    </tr>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.study._id === nextProps.study._id &&
    prevProps.index === nextProps.index &&
    JSON.stringify(prevProps.visibleColumns) === JSON.stringify(nextProps.visibleColumns) &&
    JSON.stringify(prevProps.selectedStudies) === JSON.stringify(nextProps.selectedStudies)
  );
});

export default WorklistTable;