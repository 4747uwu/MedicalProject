import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../../services/api';

const DoctorAssignmentModal = ({ isOpen, onClose, study, onAssignComplete }) => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [specializations, setSpecializations] = useState([]);

  // Reset selected doctor when study changes
  useEffect(() => {
    console.log("Study data received:", study);
    console.log("Last assigned doctor:", study?.lastAssignedDoctor);
    console.log("Current workflow status:", study?.workflowStatus);
    
    if (study?.lastAssignedDoctor) {
      console.log("Setting selected doctor ID to:", study.lastAssignedDoctor);
      setSelectedDoctorId(study.lastAssignedDoctor);
    } else {
      setSelectedDoctorId('');
    }
  }, [study]);

  useEffect(() => {
    if (isOpen) {
      fetchDoctors();
    }
  }, [isOpen, searchTerm, specialization]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/doctors', {
        params: {
          search: searchTerm,
          specialization,
          status: 'active'
        }
      });

      if (response.data.success) {
        setDoctors(response.data.doctors);
        console.log("Fetched doctors:", response.data.doctors);

        // If we have a lastAssignedDoctor but it's not in the current list,
        // we need to fetch that doctor's details separately
        if (study?.lastAssignedDoctor && 
            !response.data.doctors.some(doc => doc._id === study.lastAssignedDoctor || doc.id === study.lastAssignedDoctor)) {
          console.log("Previously assigned doctor not in list, fetching separately");
          console.log("Doctor IDs in list:", response.data.doctors.map(d => d._id || d.id));
          
          try {
            const doctorResponse = await api.get(`/admin/doctors/${study.lastAssignedDoctor}`);
            console.log("Fetched doctor data:", doctorResponse.data);
            
            if (doctorResponse.data.success && doctorResponse.data.doctor) {
              setDoctors(prevDoctors => {
                const alreadyExists = prevDoctors.some(
                  doc => (doc._id === study.lastAssignedDoctor || doc.id === study.lastAssignedDoctor)
                );
                
                if (!alreadyExists) {
                  console.log("Adding previously assigned doctor to list");
                  return [...prevDoctors, doctorResponse.data.doctor];
                }
                return prevDoctors;
              });
            }
          } catch (err) {
            console.error("Could not fetch assigned doctor details", err);
          }
        }

        // Extract unique specializations for filter dropdown
        const uniqueSpecializations = [...new Set(response.data.doctors.map(doc => doc.specialization))];
        setSpecializations(uniqueSpecializations);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
      toast.error('Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDoctorId) {
      toast.error('Please select a doctor');
      return;
    }

    try {
      const response = await api.post(`/admin/studies/${study._id}/assign`, {
        doctorId: selectedDoctorId,
        assignmentNote
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Study assigned successfully');
        onAssignComplete && onAssignComplete();
        onClose();
      } else {
        toast.error(response.data.message || 'Failed to assign doctor');
      }
    } catch (error) {
      console.error('Error assigning doctor:', error);
      toast.error(error.response?.data?.message || 'Failed to assign doctor');
    }
  };

  // Component for online status indicator
  const OnlineStatusIndicator = ({ isOnline }) => (
    <div className="flex items-center">
      <div className={`w-3 h-3 rounded-full mr-2 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
      <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );

  // Component for doctor specialization badge
  const SpecializationBadge = ({ specialization }) => (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      {specialization}
    </span>
  );

  // Early return if no study data
  if (!isOpen || !study) return null;

  // Extract study information with fallbacks
  const {
    patientName = 'N/A',
    patientId = 'N/A',
    modality = 'N/A',
    description = 'No description available',
    studyDescription,
    examDescription,
    modalitiesInStudy = [],
    _id: studyId
  } = study;

  // Get formatted description
  const formattedDescription = description || studyDescription || examDescription || 'N/A';
  const formattedModality = modality || (modalitiesInStudy?.length ? modalitiesInStudy.join(', ') : 'N/A');

  // Modal header title modification
  const getModalTitle = () => {
    if (study?.workflowStatus === 'assigned_to_doctor' || study?.workflowStatus === 'report_in_progress') {
      return "Reassign Doctor";
    }
    return "Assign Doctor";
  };

  // Sort doctors: online first, then by name
  const sortedDoctors = [...doctors].sort((a, b) => {
    // First sort by online status (online first)
    if (a.isLoggedIn && !b.isLoggedIn) return -1;
    if (!a.isLoggedIn && b.isLoggedIn) return 1;
    // Then sort by name
    return (a.fullName || '').localeCompare(b.fullName || '');
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl mx-4 shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Modal Header with gradient */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">{getModalTitle()}</h2>
              <p className="text-blue-100 text-sm mt-1">Select the best doctor for this study</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Study Info with improved styling */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Study Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="font-medium text-gray-600 w-20">Patient:</span>
                <span className="text-gray-900 font-medium">{patientName}</span>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-600 w-20">ID:</span>
                <span className="text-gray-900">{patientId}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="font-medium text-gray-600 w-24">Modality:</span>
                <span className="text-gray-900">{formattedModality}</span>
              </div>
              <div className="flex items-start">
                <span className="font-medium text-gray-600 w-24 flex-shrink-0">Description:</span>
                <span className="text-gray-900">{formattedDescription}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Search and Filter Section */}
        <div className="px-6 py-4 bg-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search doctors by name..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full sm:w-64">
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
              >
                <option value="">All Specializations</option>
                {specializations.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Enhanced Doctors List */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-500">Loading doctors...</p>
            </div>
          ) : sortedDoctors.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              <p className="text-gray-500 text-lg">No doctors found</p>
              <p className="text-gray-400 text-sm">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedDoctors.map((doctor) => {
                const doctorId = doctor._id || doctor.id;
                const isPreviouslyAssigned = study?.lastAssignedDoctor === doctorId;
                const isOnline = doctor.isLoggedIn;
                
                return (
                  <label
                    key={doctorId}
                    className={`block p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-lg transform hover:-translate-y-1
                      ${selectedDoctorId === doctorId 
                        ? 'border-blue-500 bg-blue-50 shadow-md' 
                        : isPreviouslyAssigned 
                          ? 'border-yellow-400 bg-yellow-50' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }
                      ${isOnline ? 'ring-2 ring-green-200' : ''}`}
                  >
                    <div className="flex items-start space-x-4">
                      <input
                        type="radio"
                        name="doctor"
                        value={doctorId}
                        checked={selectedDoctorId === doctorId}
                        onChange={() => setSelectedDoctorId(doctorId)}
                        className="mt-2 w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      
                      {/* Doctor Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {(doctor.fullName || 'Dr').split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                      </div>
                      
                      {/* Doctor Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-bold text-gray-900 text-lg">
                              {doctor.fullName}
                            </h4>
                            <OnlineStatusIndicator isOnline={isOnline} />
                            {isPreviouslyAssigned && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-200 text-yellow-800">
                                Currently Assigned
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Doctor Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div className="space-y-1">
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span className="text-gray-600">{doctor.email || 'No email provided'}</span>
                            </div>
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h1a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span className="text-gray-600">{doctor.department || 'No department'}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                              </svg>
                              <SpecializationBadge specialization={doctor.specialization} />
                            </div>
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-gray-600">{doctor.experience ? `${doctor.experience} years` : 'Experience not specified'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Enhanced Assignment Note Section */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assignment Note (Optional)
          </label>
          <textarea
            placeholder="Add any special instructions or notes for this assignment..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows="3"
            value={assignmentNote}
            onChange={(e) => setAssignmentNote(e.target.value)}
          ></textarea>
        </div>

        {/* Enhanced Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedDoctorId}
            className={`px-6 py-2 rounded-lg text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200
              ${selectedDoctorId
                ? (study?.workflowStatus === 'assigned_to_doctor' 
                  ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 shadow-lg hover:shadow-xl' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 shadow-lg hover:shadow-xl')
                : 'bg-gray-400 cursor-not-allowed'
              }`}
          >
            {study?.workflowStatus === 'assigned_to_doctor' ? 'Reassign Doctor' : 'Assign Doctor'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorAssignmentModal;