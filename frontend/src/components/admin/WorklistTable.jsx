import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatTime } from '../../utils/dateUtils';
import PatientDetailModal from './patients/PatientDetailModal';
import DoctorAssignmentModal from './Doctor/DoctorAssignmentModal';
import OpenOHIFViewerButton from './ohifViewerButton';
import { useAuth } from '../../hooks/useAuth';
import ReportButton  from './ReportButton';

// Custom hook for mouse position tracking
const useMousePosition = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updateMousePosition = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', updateMousePosition);
    return () => window.removeEventListener('mousemove', updateMousePosition);
  }, []);

  return mousePosition;
};

// Custom tooltip component
const MouseTooltip = ({ children, text, visible }) => {
  const mousePosition = useMousePosition();

  if (!visible || !text) return children;

  return (
    <>
      {children}
      <div
        className="fixed pointer-events-none z-[9999] px-1 py-0.5 bg-gray-800 text-white text-xs rounded shadow-lg max-w-xs"
        style={{
          left: mousePosition.x + 10,
          top: mousePosition.y + 10,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out'
        }}
      >
        {text}
      </div>
    </>
  );
};

// Status dot component to indicate workflow status
const StatusDot = ({ status, priority }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  let color = 'bg-gray-400'; 
  let statusText = '';
  
  switch (status) {
    case 'new':
    case 'pending_assignment':
      if (priority === 'EMERGENCY' || priority === 'STAT' || priority === 'URGENT') {
        color = 'bg-red-500';
        statusText = 'Emergency - Needs immediate attention';
      } else {
        color = 'bg-gray-400';
        statusText = 'New study received, pending assignment';
      }
      break;
    case 'assigned_to_doctor':
      color = 'bg-yellow-400';
      statusText = 'Assigned to doctor for review';
      break;
    case 'report_in_progress':
    case 'doctor_opened_report':
      color = 'bg-blue-500';
      statusText = 'Doctor is working on the report';
      break;
    case 'report_finalized':
    case 'report_uploaded':
      color = 'bg-green-500';
      statusText = 'Report completed and finalized';
      break;
    default:
      color = 'bg-gray-400';
      statusText = 'Unknown status';
  }
  
  return (
    <MouseTooltip text={statusText} visible={showTooltip}>
      <span 
        className="relative flex h-3 w-3 cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}></span>
        <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`}></span>
      </span>
    </MouseTooltip>
  );
};

// Eye icon with the viewer functionality
const EyeIconOHIFButton = ({ studyInstanceUID }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const handleClick = (e) => {
    e.preventDefault();
    const proxyBaseURL = 'https://57e2-59-145-191-142.ngrok-free.app';
    const ohifViewerBaseURL = 'https://viewer.ohif.org/viewer';
    const viewerURL = `${ohifViewerBaseURL}?studyInstanceUIDs=${studyInstanceUID}&server=${encodeURIComponent(`${proxyBaseURL}/dicom-web`)}`;
    window.open(viewerURL, '_blank');
  };

  return (
    <MouseTooltip text="Open OHIF DICOM Viewer in new tab" visible={showTooltip}>
      <button 
        onClick={handleClick} 
        className="text-gray-400 hover:text-blue-500 transition-colors duration-200"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>
    </MouseTooltip>
  );
};

// New component for column configuration
const ColumnConfigModal = ({ isOpen, onClose, columns, onSave }) => {
  const [columnSettings, setColumnSettings] = useState(columns);
  
  const handleToggle = (columnName) => {
    setColumnSettings(prev => ({
      ...prev,
      [columnName]: {
        ...prev[columnName],
        visible: !prev[columnName].visible
      }
    }));
  };
  
  const handleSave = () => {
    onSave(columnSettings);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-h-[77vh] overflow-hidden flex flex-col">
        {/* Modal header with tooltip */}
        <div className="bg-gray-700 text-white py-3 px-4 flex justify-between items-center">
          <div className="relative group">
            <h3 className="text-lg font-medium cursor-help">Column Configuration</h3>
            
            {/* Header tooltip */}
            <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-60">
              Customize which columns to show/hide in the table
              <div className="absolute top-full left-4 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-900"></div>
            </div>
          </div>
          
          <div className="relative group">
            <button 
              onClick={onClose} 
              className="text-gray-300 hover:text-white transition-colors"
              title="Close modal"
            >
              <span className="text-xl">×</span>
            </button>
            
            {/* Close button tooltip */}
            <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-60">
              Close without saving
              <div className="absolute top-full right-2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        
        <div className="overflow-y-auto px-4 py-2 flex-grow">
          {Object.keys(columnSettings).map((columnName) => (
            <div key={columnName} className="py-2 border-b border-gray-200">
              <div className="relative group">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 rounded"
                    checked={columnSettings[columnName].visible}
                    onChange={() => handleToggle(columnName)}
                  />
                  <span className="text-gray-800">{columnSettings[columnName].label}</span>
                </label>
                
                {/* Column description tooltip */}
                <div className="absolute left-full top-0 ml-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-60">
                  Toggle visibility of {columnSettings[columnName].label} column
                  <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-2 border-b-2 border-r-2 border-transparent border-r-gray-800"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="bg-gray-100 px-4 py-3 flex justify-end space-x-3">
          <div className="relative group">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
              title="Cancel changes"
            >
              Cancel
            </button>
            
            {/* Cancel tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-60">
              Discard changes
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
            </div>
          </div>
          
          <div className="relative group">
            <button 
              onClick={handleSave}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              title="Save column configuration"
            >
              Save
            </button>
            
            {/* Save tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-60">
              Apply column changes
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced DownloadDropdown with tooltips (keeping your existing implementation but adding tooltips)
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
      
      console.log('Downloading study with Orthanc ID:', orthancStudyId);
      
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
      {/* Main Download Button with Tooltip */}
      <div className="relative group">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="text-gray-400 hover:text-blue-500 flex items-center transition-colors duration-200"
          title="Download Study Options"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {/* Main button tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
          Click to open download options
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
        </div>
      </div>
      
      {isOpen && (
        <>
          {/* Backdrop with tooltip */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
            title="Click to close dropdown"
          ></div>
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-20">
            <div className="py-1">
              {/* Download Button with enhanced tooltip */}
              <div className="relative group">
                <button
                  onClick={handleDownloadStudy}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                  title="Download complete study as ZIP file"
                >
                  <div className="relative group mr-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  Download Study ZIP
                </button>
                
                {/* Download button hover tooltip */}
                <div className="absolute left-full top-0 ml-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-40">
                  Downloads all DICOM files in a compressed ZIP format
                  <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-800"></div>
                </div>
              </div>
              
              <div className="border-t border-gray-100 my-1"></div>
              
              {/* Study Information Section with tooltips */}
              <div className="px-4 py-2">
                <div className="relative group inline-block">
                  <div className="text-xs text-gray-500 mb-1 cursor-help">Study Information:</div>
                  
                  <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-40">
                    Key details about this medical study
                    <div className="absolute top-full left-4 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                  </div>
                </div>
                
                <div className="text-xs text-gray-600">
                  {/* Patient info with tooltip */}
                  <div className="relative group">
                    <div className="cursor-help">Patient: {study.patientName}</div>
                    <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-40">
                      Patient's full name as recorded in DICOM
                      <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-2 border-b-2 border-r-2 border-transparent border-r-gray-800"></div>
                    </div>
                  </div>
                  
                  {/* Study ID with tooltip */}
                  <div className="relative group">
                    <div className="cursor-help">Study ID: {study.orthancStudyID?.slice(-8) || 'N/A'}</div>
                    <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-40">
                      Last 8 characters of Orthanc Study ID
                      <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-2 border-b-2 border-r-2 border-transparent border-r-gray-800"></div>
                    </div>
                  </div>
                  
                  {/* Modality with tooltip */}
                  <div className="relative group">
                    <div className="cursor-help">Modality: {study.modality}</div>
                    <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-40">
                      Medical imaging technique (e.g., CT, MRI, X-Ray)
                      <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-2 border-b-2 border-r-2 border-transparent border-r-gray-800"></div>
                    </div>
                  </div>
                  
                  {/* Series/Images with tooltip */}
                  <div className="relative group">
                    <div className="cursor-help">Series/Images: {study.seriesImages || 'N/A'}</div>
                    <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-40">
                      Number of series and total images in study
                      <div className="absolute top-1/2 right-full transform -translate-y-1/2 w-0 h-0 border-t-2 border-b-2 border-r-2 border-transparent border-r-gray-800"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const WorklistTable = ({ 
  studies = [], 
  loading = false, 
  totalRecords = 0, 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  onSearch,
  onLocationChange,
  hideFilters = false,
  userRole = 'admin',
  onAssignmentComplete
}) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    pending: 0,
    inprogress: 0,
    completed: 0
  });
  // Assignment modal state
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState(null);
  
  // Patient detail modal state
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  // Column configuration state
  const [columnConfigModalOpen, setColumnConfigModalOpen] = useState(false);
  const [columns, setColumns] = useState({
    checkbox: { label: "Select", visible: true, width: "w-10" },
    status: { label: "Status", visible: true, width: "w-10" },
    userIcon: { label: "User", visible: true, width: "w-10" },
    patientID: { label: "Patient ID", visible: true, width: "w-24" },
    patientName: { label: "Patient Name", visible: true, width: "w-36" },
    age: { label: "Age", visible: true, width: "w-16" },
    description: { label: "Description", visible: true, width: "w-28" },
    modality: { label: "Modality", visible: true, width: "w-20" },
    series: { label: "Series", visible: true, width: "w-16" },
    studyDate: { label: "Study Date", visible: true, width: "w-24" },
    uploadDate: { label: "Upload Date", visible: true, width: "w-24" },
    location: { label: "Location", visible: true, width: "w-28" },
    accessionNum: { label: "Accession#", visible: false, width: "w-24" },
    actions: { label: "Actions", visible: true, width: "w-24" },
    reportedBy: { label: "Reported By", visible: userRole === 'admin', width: "w-24" },
    reportedDate: { label: "Reported Date", visible: userRole === 'admin', width: "w-24" },
    seenBy: { label: "Seen By", visible: false, width: "w-20" },
    studyType: { label: "Study Type", visible: false, width: "w-20" },
    report: { label: "Report", visible: true, width: "w-16" },
    assignDoctor: { label: "Assign Doctor", visible: userRole === 'admin', width: "w-24" }
  });

  const canAssignDoctors = userRole === 'admin';

  // Calculate status counts when studies change
  useEffect(() => {
    const calculateStatusCounts = (studiesData) => {
      const counts = {
        all: studiesData.length,
        pending: studiesData.filter(study => 
          study.workflowStatus === 'new_study_received' || 
          study.workflowStatus === 'pending_assignment'
        ).length,
        inprogress: studiesData.filter(study => 
          study.workflowStatus === 'assigned_to_doctor' || 
          study.workflowStatus === 'report_in_progress'
        ).length,
        completed: studiesData.filter(study => 
          study.workflowStatus === 'report_finalized'
        ).length
      };
      setStatusCounts(counts);
    };

    calculateStatusCounts(studies);
  }, [studies]);

  // Open doctor assignment modal for a study (only for admin)
  const handleAssignDoctor = (studyData) => {
    if (!canAssignDoctors) {
      console.warn('User does not have permission to assign doctors');
      return;
    }

    const formattedStudy = {
      _id: studyData._id,
      patientName: studyData.patientName || 
                (studyData.patient ? 
                  `${studyData.patient.firstName || ''} ${studyData.patient.lastName || ''}`.trim() : 'N/A'),
      patientId: studyData.patientId || (studyData.patient ? studyData.patient.patientID : 'N/A'),
      modality: studyData.modality || '',
      description: studyData.description || '',
      studyDescription: studyData.studyDescription || '',
      examDescription: studyData.examDescription || '',
      modalitiesInStudy: studyData.modalitiesInStudy || [],
      lastAssignedDoctor: studyData.lastAssignedDoctor || null,
      workflowStatus: studyData.workflowStatus || 'new'
    };
    
    setSelectedStudy(formattedStudy);
    setAssignmentModalOpen(true);
  };
  
  // Open patient detail modal when clicking on a patient ID
  const handlePatientClick = (patientId) => {
    setSelectedPatientId(patientId);
    setPatientDetailModalOpen(true);
  };

  // Filter studies based on active tab
  const getFilteredStudies = () => {
    if (activeTab === 'all') return studies;
    
    return studies.filter(study => {
      switch (activeTab) {
        case 'pending':
          return study.workflowStatus === 'new_study_received' || study.workflowStatus === 'pending_assignment';
        case 'inprogress':
          return study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress';
        case 'completed':
          return study.workflowStatus === 'report_finalized';
        default:
          return true;
      }
    });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchTerm);
    }
  };

  const handleLocationFilterChange = (location) => {
    setSelectedLocation(location);
    if (onLocationChange) {
      onLocationChange(location);
    }
  };

  const handleAssignmentModalComplete = () => {
    setAssignmentModalOpen(false);
    if (onAssignmentComplete) {
      onAssignmentComplete();
    }
  };

  const handleColumnSettingsSave = (updatedColumns) => {
    setColumns(updatedColumns);
    localStorage.setItem('worklistTableColumns', JSON.stringify(updatedColumns));
  };

  const filteredStudies = getFilteredStudies();

  return (
    <div className="bg-white w-full h-[80vh] rounded-lg shadow-lg overflow-hidden flex flex-col">
      {/* Status Tabs with Tooltips */}
      <div className="flex border-b flex-shrink-0">
  {[
    {
      key: 'all',
      label: 'All',
      count: statusCounts.all,
      color: 'blue',
      description: 'View all studies regardless of status'
    },
    {
      key: 'pending',
      label: 'Pending',
      count: statusCounts.pending,
      color: 'yellow',
      description: 'Studies waiting for doctor assignment'
    },
    {
      key: 'inprogress',
      label: 'In-Progress',
      count: statusCounts.inprogress,
      color: 'orange',
      description: 'Studies currently being reviewed by doctors'
    },
    {
      key: 'completed',
      label: 'Completed',
      count: statusCounts.completed,
      color: 'green',
      description: 'Studies with finalized reports'
    }
  ].map(tab => {
    const [showTooltip, setShowTooltip] = useState(false);
    
    return (
      <div key={tab.key} className="flex-1">
        <MouseTooltip text={tab.description} visible={showTooltip}>
          <button 
            className={`w-full py-3 px-4 text-center font-medium transition-colors ${
              activeTab === tab.key 
                ? `text-${tab.color}-600 border-b-2 border-${tab.color}-600` 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab(tab.key)}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {tab.label} ({tab.count})
          </button>
        </MouseTooltip>
      </div>
    );
  })}
</div>
      
      {/* Search and Filters with Tooltips */}
      {!hideFilters && (
        <div className="p-4 bg-gray-50 flex flex-wrap gap-3 items-center justify-between flex-shrink-0">
          <form onSubmit={handleSearch} className="flex w-full md:w-auto">
            <div className="relative flex-grow group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              
              {/* Search input with tooltip */}
              <MouseTooltip text="Type patient name or accession number to search" >
                <input
                  type="text"
                  placeholder="Search by Patient Name and Accession No"
                  className="pl-10 pr-3 py-2 w-full md:w-80 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onMouseEnter={() => setShowSearchTooltip(true)}
                  onMouseLeave={() => setShowSearchTooltip(false)}
                />
              </MouseTooltip>
            </div>
            
            <div className="relative group">
              <button
                type="submit"
                className="ml-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
                title="Execute search"
              >
                Search
              </button>
              
              {/* Search button tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                Click to search studies
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
              </div>
            </div>
          </form>

          <div className="flex items-center w-full md:w-auto mt-3 md:mt-0">
            <div className="relative group">
              <select
                className="block w-full md:w-64 pl-3 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                value={selectedLocation}
                onChange={(e) => handleLocationFilterChange(e.target.value)}
                title="Filter studies by location/workstation"
              >
                <option value="">All Work Stations</option>
                <option value="MITTAL LAB MOGA">MITTAL LAB MOGA</option>
                <option value="APEKSHA DIAGNOSTIC">APEKSHA DIAGNOSTIC</option>
                <option value="NAV JEEVAN HOSPITAL KANGRA">NAV JEEVAN HOSPITAL KANGRA</option>
              </select>
              
              {/* Location filter tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                Filter studies by originating location
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
              </div>
            </div>
          </div>

          <div className="relative group">
            <button
              onClick={() => setColumnConfigModalOpen(true)}
              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md flex items-center transition-colors"
              title="Configure table columns"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 0V4m6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 0V4" />
              </svg>
              Columns
            </button>
            
            {/* Column config button tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
              Show/hide table columns
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        </div>
      )}
      
      {/* Table - This will take up the remaining space */}
      <div className="flex-1  flex flex-col">
        {loading ? (
          <div className="flex justify-center items-center flex-1">
            <div className="relative group">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              
              {/* Loading tooltip */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                Loading studies from server...
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-b-2 border-transparent border-b-gray-800"></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  {columns.checkbox.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.checkbox.width}`}>
                      <div className="relative group">
                        <input 
                          type="checkbox" 
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          title="Select all studies on this page" 
                        />
                        
                        {/* Select all tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Select all visible studies
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.status.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.status.width}`}>
                      <div className="relative group cursor-help">
                        Status
                        
                        {/* Status header tooltip */}
                        <MouseTooltip text="Study workflow status indicator" >
                          <div className="absolute bottom-full left-1/2 transform translate-y-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-9999">
                            Study workflow status indicator
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                          </div>
                        </MouseTooltip>
                      </div>
                    </th>
                  )}
                  
                  {columns.userIcon.visible && (
                    <th scope="col" className={`px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.userIcon.width}`}>
                      <div className="flex flex-col items-center justify-center relative group cursor-help">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        
                        {/* User icon header tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Study priority indicator
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.patientID.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.patientID.width}`}>
                      <div className="flex items-center relative group cursor-help">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Patient ID
                        
                        {/* Patient ID header tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Unique patient identifier (clickable)
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.patientName.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.patientName.width}`}>
                      <div className="relative group cursor-help">
                        Patient Name
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Patient's full name from DICOM data
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.age.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.age.width}`}>
                      <div className="relative group cursor-help">
                        Age
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Patient age and gender
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.description.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.description.width}`}>
                      <div className="relative group cursor-help">
                        Description
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Study description or exam type
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.modality.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.modality.width}`}>
                      <div className="relative group cursor-help">
                        Modality
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Imaging modality (CT, MRI, X-Ray, etc.)
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.series.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.series.width}`}>
                      <div className="relative group cursor-help">
                        Series
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Number of series and images
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.studyDate.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.studyDate.width}`}>
                      <div className="relative group cursor-help">
                        StudyDate
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          When the study was performed
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.uploadDate.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.uploadDate.width}`}>
                      <div className="relative group cursor-help">
                        UploadDate
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          When the study was uploaded to system
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.location.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.location.width}`}>
                      <div className="relative group cursor-help">
                        Location
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Source laboratory or facility
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.accessionNum.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.accessionNum.width}`}>
                      <div className="relative group cursor-help">
                        Accession#
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Unique study accession number
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.actions.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.actions.width}`}>
                      <div className="relative group cursor-help">
                        Actions
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          View and download study options
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.reportedBy.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.reportedBy.width}`}>
                      <div className="relative group cursor-help">
                        ReportedBy
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Doctor who created the report
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.reportedDate.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.reportedDate.width}`}>
                      <div className="relative group cursor-help">
                        ReportedDate
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          When the report was finalized
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.seenBy.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.seenBy.width}`}>
                      <div className="relative group cursor-help">
                        SeenBy
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Who has viewed this study
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.studyType.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.studyType.width}`}>
                      <div className="relative group cursor-help">
                        Study Type
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Type or category of medical study
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}

                  {columns.report.visible && (
                    <th scope="col" className={`px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.report.width}`}>
                      <div className="flex flex-col items-center justify-center relative group cursor-help">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Medical report actions
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                  
                  {columns.assignDoctor.visible && (
                    <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.assignDoctor.width}`}>
                      <div className="relative group cursor-help">
                        Assign Doctor
                        
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-30">
                          Assign or reassign doctor to study
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
                        </div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStudies.length === 0 ? (
                  <tr>
                    <td colSpan="20" className="px-6 py-4 whitespace-nowrap text-center text-gray-500">
                      No studies found
                    </td>
                  </tr>
                ) : (
                  filteredStudies.map((study) => (
                    <tr key={study._id} className="hover:bg-gray-50">
                      {columns.checkbox.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <input 
                            type="checkbox" 
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" 
                          />
                        </td>
                      )}
                      
                      {columns.status.visible && (
                        <td className="px-2 py-2 whitespace-nowrap flex justify-center items-center mt-2"> 
                          <StatusDot status={study.workflowStatus}
                            priority={study.priority}
                          />
                        </td>
                      )}
                      
                      {columns.userIcon.visible && (
                        <td className="px-2 py-2 whitespace-nowrap text-gray-500">
                          <div className="flex flex-col items-center justify-center space-y-1">
                            {/* Document icon - can be colored based on study priority/urgency */}
                            <button className={`${study.priority === 'STAT' || study.priority === 'URGENT' ? 'text-red-500' : 'text-gray-400'} hover:text-blue-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
                            </button>
                          </div>
                        </td>
                      )}
                      
                      {columns.patientID.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <button 
                            onClick={() => handlePatientClick(study.patientId)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {study.patientId}
                          </button>
                        </td>
                      )}
                      
                      {columns.patientName.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs font-medium text-gray-900">{study.patientName}</div>
                        </td>
                      )}
                      
                      {columns.age.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{study.ageGender}</div>
                        </td>
                      )}
                      
                      {columns.description.visible && (
                        <td className="px-2 py-2 whitespace-nowrap truncate max-w-xs">
                          <div className="text-xs text-gray-900">{study.description}</div>
                        </td>
                      )}
                      
                      {columns.modality.visible && (
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500">
                          {study.modality}
                        </td>
                      )}
                      
                      {columns.series.visible && (
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500">
                          {study.seriesImages}
                        </td>
                      )}
                      
                      {columns.studyDate.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{formatDate(study.studyDateTime)}</div>
                          <div className="text-xs text-gray-500">{formatTime(study.studyDateTime)}</div>
                        </td>
                      )}
                      
                      {columns.uploadDate.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{formatDate(study.uploadDateTime)}</div>
                          <div className="text-xs text-gray-500">{formatTime(study.uploadDateTime)}</div>
                        </td>
                      )}
                      
                      {columns.location.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{study.location}</div>
                        </td>
                      )}
                      
                      {columns.accessionNum.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{study.accessionNumber || '-'}</div>
                        </td>
                      )}
                      
                      
                      
                      {columns.actions.visible && (
                        <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium flex justify-center items-center space-x-2">
                          <div className="flex space-x-1">
                            <EyeIconOHIFButton studyInstanceUID={study.instanceID} />
                            
                            {/* Replace the existing download button with the new dropdown */}
                            <DownloadDropdown study={study} />
                          </div>
                        </td>
                      )}
                      
                      {columns.reportedBy.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{study.reportedBy || '-'}</div>
                        </td>
                      )}
                      
                      {columns.reportedDate.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          {study.reportedDateTime && (
                            <>
                              <div className="text-xs text-gray-500">{formatDate(study.reportedDateTime)}</div>
                              <div className="text-xs text-gray-500">{formatTime(study.reportedDateTime)}</div>
                            </>
                          )}
                        </td>
                      )}
                      
                      {columns.seenBy.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{study.seenBy || '-'}</div>
                        </td>
                      )}
                      
                      {columns.studyType.visible && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-gray-500">{study.studyType || '-'}</div>
                        </td>
                      )}

                          {columns.report.visible && (
                            <td className={`px-2 py-2 whitespace-nowrap text-center ${
                              study.ReportAvailable ? 'border-2 border-red-500 bg-red-50' : ''
                            }`}>
                              <div className="flex justify-center items-center">
                                <ReportButton study={study} />
                              </div>
                            </td>
                          )}
                      
                      {columns.assignDoctor.visible && canAssignDoctors && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <button 
                            onClick={() => handleAssignDoctor(study)}
                            className={`px-2 py-1 rounded hover:bg-opacity-80 text-xs font-medium ${
                              study.workflowStatus === 'report_finalized' 
                                ? 'bg-gray-200 text-gray-700 cursor-not-allowed' 
                                : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                                  ? 'bg-yellow-600 text-white' 
                                  : 'bg-blue-100 text-blue-700'
                            }`}
                            disabled={study.workflowStatus === 'report_finalized'}
                          >
                            {study.workflowStatus === 'report_finalized' 
                              ? 'Completed' 
                              : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                                ? 'Reassign' 
                                : 'Assign'
                            }
                          </button>
                        </td>
                      )}
                      
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 flex-shrink-0">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => onPageChange && onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                currentPage === 1 ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange && onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                currentPage === totalPages ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{filteredStudies.length > 0 ? ((currentPage - 1) * 10) + 1 : 0}</span> to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * 10, totalRecords)}
                </span>{' '}
                of <span className="font-medium">{totalRecords}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => onPageChange && onPageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                    currentPage === 1 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Page numbers */}
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
                  
                  if (pageNum > 0 && pageNum <= totalPages) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => onPageChange && onPageChange(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  return null;
                })}
                
                <button
                  onClick={() => onPageChange && onPageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                    currentPage === totalPages ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar - This will stick to the bottom */}
      <div className="bg-gray-100 px-4 py-3 flex border-t border-gray-200 flex-shrink-0">
        {/* Only show assign study button for admin */}
        {canAssignDoctors && (
          <button className="mr-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            Assign Study
          </button>
        )}
        
        <button className="mr-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Dispatch Report
        </button>
        
        <button className="mr-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Bulk Zip Download
        </button>
      </div>
      
      {/* Modals */}
      {canAssignDoctors && (
        <DoctorAssignmentModal
          isOpen={assignmentModalOpen}
          onClose={() => setAssignmentModalOpen(false)}
          study={selectedStudy}
          onAssignComplete={handleAssignmentModalComplete}
        />
      )}
      
      <PatientDetailModal
        isOpen={patientDetailModalOpen}
        onClose={() => setPatientDetailModalOpen(false)}
        patientId={selectedPatientId}
      />
      
      <ColumnConfigModal 
        isOpen={columnConfigModalOpen}
        onClose={() => setColumnConfigModalOpen(false)}
        columns={columns}
        onSave={handleColumnSettingsSave}
      />
    </div>
  );
};

export default WorklistTable;