import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatDate, formatTime } from '../../utils/dateUtils';
import PatientDetailModal from './patients/PatientDetailModal';
import DoctorAssignmentModal from './Doctor/DoctorAssignmentModal';
import OpenOHIFViewerButton from './ohifViewerButton';

// Status dot component to indicate workflow status
const StatusDot = ({ status, priority }) => {
  let color = 'bg-gray-400'; 
  
  switch (status) {
    case 'new':
    case 'pending_assignment':
      // Check if it's emergency priority
      if (priority === 'EMERGENCY' || priority === 'STAT' || priority === 'URGENT') {
        color = 'bg-red-500'; // Emergency study is red
      } else {
        color = 'bg-gray-400'; // New study is gray
      }
      break;
    case 'assigned_to_doctor':
      color = 'bg-yellow-400'; // Assigned to doctor is yellow
      break;
    case 'report_in_progress':
    case 'doctor_opened_report':
      color = 'bg-blue-500'; // Doctor opened the report is blue
      break;
    case 'report_finalized':
    case 'report_uploaded':
      color = 'bg-green-500'; // Doctor uploaded the final report is green
      break;
    default:
      color = 'bg-gray-400'; 
  }
  
  return (
    <span className="relative flex h-3 w-3">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}></span>
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`}></span>
    </span>
  );
};


// eye icon with the viewer functionality
const EyeIconOHIFButton = ({ studyInstanceUID }) => {
  const handleClick = (e) => {
    e.preventDefault();
    const proxyBaseURL = 'https://57e2-59-145-191-142.ngrok-free.app';
    const ohifViewerBaseURL = 'https://viewer.ohif.org/viewer';
    const viewerURL = `${ohifViewerBaseURL}?studyInstanceUIDs=${studyInstanceUID}&server=${encodeURIComponent(`${proxyBaseURL}/dicom-web`)}`;
    window.open(viewerURL, '_blank');
  };

  return (
    <button onClick={handleClick} className="text-gray-400 hover:text-blue-500">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
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
      <div className="bg-white rounded-lg shadow-xl w-96 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="bg-gray-700 text-white py-3 px-4 flex justify-between items-center">
          <h3 className="text-lg font-medium">Column Configuration</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white">
            <span className="text-xl">×</span>
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-2 flex-grow">
          {Object.keys(columnSettings).map((columnName) => (
            <div key={columnName} className="py-2 border-b border-gray-200">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 rounded"
                  checked={columnSettings[columnName].visible}
                  onChange={() => handleToggle(columnName)}
                />
                <span className="text-gray-800">{columnSettings[columnName].label}</span>
              </label>
            </div>
          ))}
        </div>
        <div className="bg-gray-100 px-4 py-3 flex justify-end space-x-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const WorklistTable = ({ limit = 10, hideFilters = false }) => {
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
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

  // New state for column configuration
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
    reportedBy: { label: "Reported By", visible: true, width: "w-24" },
    reportedDate: { label: "Reported Date", visible: true, width: "w-24" },
    seenBy: { label: "Seen By", visible: false, width: "w-20" },
    studyType: { label: "Study Type", visible: false, width: "w-20" },
    assignDoctor: { label: "Assign Doctor", visible: true, width: "w-24" }
  });
  
  // Calculate counts for each tab
  const calculateStatusCounts = (studiesData) => {
    const counts = {
      all: studiesData.length,
      pending: studiesData.filter(study => 
        study.workflowStatus === 'new' || 
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

  // Open doctor assignment modal for a study
  const handleAssignDoctor = (studyData) => {
    console.log("Opening assignment modal for study:", studyData);
    
    // Make sure we have the needed properties
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
      
      // Make sure we're passing these important fields
      lastAssignedDoctor: studyData.lastAssignedDoctor || null,
      workflowStatus: studyData.workflowStatus || 'new'
    };
    
    console.log("Formatted study for modal:", formattedStudy);
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
          return study.workflowStatus === 'new' || study.workflowStatus === 'pending_assignment';
        case 'inprogress':
          return study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress';
        case 'completed':
          return study.workflowStatus === 'report_finalized';
        default:
          return true;
      }
    });
  };

  // Fetch studies data
  useEffect(() => {
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
          calculateStatusCounts(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching studies:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudies();
  }, [currentPage, searchTerm, selectedLocation, limit]);

  // Handle assignment completion - refresh the data
  const handleAssignmentComplete = async () => {
    try {
      const response = await api.get('/admin/studies', {
        params: {
          page: currentPage,
          limit,
          search: searchTerm,
          location: selectedLocation
        }
      });
      
      
      if (response.data.success) {
        console.log(response.data.data)
        setStudies(response.data.data);
        calculateStatusCounts(response.data.data);
      }
    } catch (error) {
      console.error('Error refreshing studies data:', error);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    // The search will be triggered by the useEffect when searchTerm changes
    setCurrentPage(1); // Reset to first page when searching
  };

  const filteredStudies = getFilteredStudies();

  // Add handleColumnSettingsSave function
  const handleColumnSettingsSave = (updatedColumns) => {
    setColumns(updatedColumns);
    // Optionally save to localStorage if you want to persist these settings
    localStorage.setItem('worklistTableColumns', JSON.stringify(updatedColumns));
  };

  return (
    <div className="bg-white w-full rounded-lg shadow-lg overflow-hidden">
      {/* Status Tabs */}
      <div className="flex border-b">
        <button 
          className={`flex-1 py-3 px-4 text-center font-medium ${
            activeTab === 'all' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('all')}
        >
          All ({statusCounts.all})
        </button>
        <button 
          className={`flex-1 py-3 px-4 text-center font-medium ${
            activeTab === 'pending' 
              ? 'text-yellow-600 border-b-2 border-yellow-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({statusCounts.pending})
        </button>
        <button 
          className={`flex-1 py-3 px-4 text-center font-medium ${
            activeTab === 'inprogress' 
              ? 'text-orange-600 border-b-2 border-orange-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('inprogress')}
        >
          In-Progress ({statusCounts.inprogress})
        </button>
        <button 
          className={`flex-1 py-3 px-4 text-center font-medium ${
            activeTab === 'completed' 
              ? 'text-green-600 border-b-2 border-green-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('completed')}
        >
          Completed ({statusCounts.completed})
        </button>
      </div>
      
      {/* Search and Filters */}
      {!hideFilters && (
        <div className="p-4 bg-gray-50 flex flex-wrap gap-3 items-center justify-between">
          <form onSubmit={handleSearch} className="flex w-full md:w-auto">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by Patient Name and Accession No"
              className="pl-10 pr-3 py-2 w-full md:w-80 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="ml-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            Search
          </button>
        </form>

        <div className="flex items-center w-full md:w-auto mt-3 md:mt-0">
          <select
            className="block w-full md:w-64 pl-3 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">All Work Stations</option>
            <option value="MITTAL LAB MOGA">MITTAL LAB MOGA</option>
            <option value="APEKSHA DIAGNOSTIC">APEKSHA DIAGNOSTIC</option>
            <option value="NAV JEEVAN HOSPITAL KANGRA">NAV JEEVAN HOSPITAL KANGRA</option>
            {/* Add more options dynamically */}
          </select>
        </div>

        {/* Add column configuration button */}
        <button
          onClick={() => setColumnConfigModalOpen(true)}
          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 0V4m6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 0V4" />
          </svg>
          Columns
        </button>
      </div>
      )}
      
      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                {columns.checkbox.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.checkbox.width}`}>
                    <input type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                  </th>
                )}
                
                {columns.status.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.status.width}`}>
                    Status
                  </th>
                )}
                
                {columns.userIcon.visible && (
                  <th scope="col" className={`px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.userIcon.width}`}>
                    <div className="flex flex-col items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {/* <span className="text-[10px]">Files</span> */}
                    </div>
                  </th>
                )}
                
                {columns.patientID.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.patientID.width}`}>
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Patient ID
                    </div>
                  </th>
                )}
                
                {columns.patientName.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.patientName.width}`}>
                    Patient Name
                  </th>
                )}
                
                {columns.age.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.age.width}`}>
                    Age
                  </th>
                )}
                
                {columns.description.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.description.width}`}>
                    Description
                  </th>
                )}
                
                {columns.modality.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.modality.width}`}>
                    Modality
                  </th>
                )}
                
                {columns.series.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.series.width}`}>
                    Series
                  </th>
                )}
                
                {columns.studyDate.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.studyDate.width}`}>
                    StudyDate
                  </th>
                )}
                
                {columns.uploadDate.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.uploadDate.width}`}>
                    UploadDate
                  </th>
                )}
                
                {columns.location.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.location.width}`}>
                    Location
                  </th>
                )}
                
                {columns.accessionNum.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.accessionNum.width}`}>
                    Accession#
                  </th>
                )}
                
                {columns.actions.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.actions.width}`}>
                    Actions
                  </th>
                )}
                
                {columns.reportedBy.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.reportedBy.width}`}>
                    ReportedBy
                  </th>
                )}
                
                {columns.reportedDate.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.reportedDate.width}`}>
                    ReportedDate
                  </th>
                )}
                
                {columns.seenBy.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.seenBy.width}`}>
                    SeenBy
                  </th>
                )}
                
                {columns.studyType.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.studyType.width}`}>
                    Study Type
                  </th>
                )}
                
                {columns.assignDoctor.visible && (
                  <th scope="col" className={`px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${columns.assignDoctor.width}`}>
                    Assign Doctor
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
                          
                          <button className="text-gray-400 hover:text-blue-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          
                          
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
                    
                    {columns.assignDoctor.visible && (
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
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => setCurrentPage(currentPage > 1 ? currentPage - 1 : 1)}
            disabled={currentPage === 1}
            className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
              currentPage === 1 ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(currentPage < totalPages ? currentPage + 1 : totalPages)}
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
                onClick={() => setCurrentPage(currentPage > 1 ? currentPage - 1 : 1)}
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
                // Logic to show pages around current page
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
                
                // Only render if pageNum is valid
                if (pageNum > 0 && pageNum <= totalPages) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
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
                onClick={() => setCurrentPage(currentPage < totalPages ? currentPage + 1 : totalPages)}
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

      {/* Bottom Action Bar */}
      <div className="bg-gray-100 px-4 py-3 flex items-center border-t border-gray-200">
        <button className="mr-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          Assign Study
        </button>
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
      <DoctorAssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        study={selectedStudy}
        onAssignComplete={handleAssignmentComplete}
      />
      
      <PatientDetailModal
        isOpen={patientDetailModalOpen}
        onClose={() => setPatientDetailModalOpen(false)}
        patientId={selectedPatientId}
      />
      
      {/* Column Configuration Modal */}
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