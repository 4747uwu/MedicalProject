import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';

/**
 * Updates workflow status across all relevant models
 * @param {Object} options - Options for status update
 * @param {string} options.studyId - DicomStudy ID
 * @param {string} options.status - New workflow status
 * @param {string} [options.doctorId] - Doctor ID (if applicable)
 * @param {string} [options.note] - Optional note about status change
 * @param {Object} [options.user] - User making the change
 * @returns {Promise<Object>} - Updated study and patient objects
 */
export const updateWorkflowStatus = async (options) => {
  const { studyId, status, doctorId, note, user } = options;
  
  // Validate status against allowed workflow statuses
  const validStatuses = [
    'no_active_study',
    'new_study_received',
    'pending_assignment',
    'assigned_to_doctor',
    'report_in_progress',
    'report_finalized',
    'archived'
  ];
  
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid workflow status: ${status}`);
  }
  
  // Find the study
  const study = await DicomStudy.findById(studyId);
  if (!study) {
    throw new Error(`Study not found: ${studyId}`);
  }
  
  // Update study status
  const oldStatus = study.workflowStatus;
  study.workflowStatus = status;
  
  // Record status change timestamp and note
  const timestamp = new Date();
  study.statusHistory = study.statusHistory || [];
  study.statusHistory.push({
    status,
    changedAt: timestamp,
    changedBy: user?._id,
    note
  });
  
  // Update additional fields based on status
  switch (status) {
    case 'assigned_to_doctor':
      if (doctorId) {
        study.lastAssignedDoctor = doctorId;
        study.lastAssignmentAt = timestamp;
      }
      break;
    case 'report_in_progress':
      study.reportStartedAt = study.reportStartedAt || timestamp;
      break;
    case 'report_finalized':
      study.reportFinalizedAt = timestamp;
      break;
    case 'archived':
      study.archivedAt = timestamp;
      break;
  }
  
  await study.save();
  
  // Update patient status
  if (study.patient) {
    const patient = await Patient.findById(study.patient);
    if (patient) {
      patient.currentWorkflowStatus = status;
      patient.activeDicomStudyRef = study._id;
      
      // Optional: Add status note to patient
      if (note) {
        patient.statusNotes = note;
      }
      
      await patient.save();
    }
  }
  
  // Update doctor's assignment data if applicable
  if (doctorId && ['assigned_to_doctor', 'report_in_progress'].includes(status)) {
    const doctor = await Doctor.findById(doctorId);
    if (doctor) {
      // ENSURE activeAssignments is initialized as an array
      if (!Array.isArray(doctor.activeAssignments)) {
        doctor.activeAssignments = [];
      }
      
      // Check if assignment already exists
      const existingAssignmentIndex = doctor.activeAssignments.findIndex(
        assignment => assignment.study.toString() === studyId
      );
      
      if (existingAssignmentIndex >= 0) {
        // Update existing assignment
        doctor.activeAssignments[existingAssignmentIndex].status = 
          status === 'report_in_progress' ? 'in_progress' : 'assigned';
      } else {
        // Add new assignment to doctor's active assignments
        doctor.activeAssignments.push({
          study: studyId,
          patient: study.patient,
          assignedAt: timestamp,
          status: status === 'report_in_progress' ? 'in_progress' : 'assigned',
          priority: options.priority || 'routine'
        });
        
        // Update doctor's assignment stats
        doctor.assignmentStats = doctor.assignmentStats || {};
        doctor.assignmentStats.totalAssigned = (doctor.assignmentStats.totalAssigned || 0) + 1;
        doctor.assignmentStats.lastAssignmentDate = timestamp;
      }
      
      await doctor.save();
    }
  }
  
  // Handle completed reports - move from active to completed assignments
  if (status === 'report_finalized' && study.lastAssignedDoctor) {
    const doctor = await Doctor.findById(study.lastAssignedDoctor);
    
    if (doctor) {
      // ENSURE both arrays are initialized
      if (!Array.isArray(doctor.activeAssignments)) {
        doctor.activeAssignments = [];
      }
      if (!Array.isArray(doctor.completedAssignments)) {
        doctor.completedAssignments = [];
      }
      
      const assignmentIndex = doctor.activeAssignments.findIndex(
        assignment => assignment.study.toString() === studyId
      );
      
      if (assignmentIndex !== -1) {
        const assignment = doctor.activeAssignments[assignmentIndex];
        
        // Create completed assignment record
        doctor.completedAssignments.push({
          study: assignment.study,
          patient: assignment.patient,
          assignedAt: assignment.assignedAt,
          completedAt: timestamp,
        });
        
        // Remove from active assignments
        doctor.activeAssignments.splice(assignmentIndex, 1);
        
        // Update doctor stats
        doctor.assignmentStats = doctor.assignmentStats || {};
        doctor.assignmentStats.totalCompleted = (doctor.assignmentStats.totalCompleted || 0) + 1;
        doctor.assignmentStats.lastCompletionDate = timestamp;
        
        // Calculate average reporting time
        if (assignment.assignedAt) {
          const timeToComplete = (timestamp - assignment.assignedAt) / (1000 * 60); // minutes
          
          if (doctor.assignmentStats.totalCompleted === 1) {
            doctor.assignmentStats.averageReportTime = timeToComplete;
          } else {
            // Moving average calculation
            doctor.assignmentStats.averageReportTime = 
              (doctor.assignmentStats.averageReportTime * (doctor.assignmentStats.totalCompleted - 1) + timeToComplete) / 
              doctor.assignmentStats.totalCompleted;
          }
        }
        
        await doctor.save();
      }
    }
  }
  
  // Return updated objects
  return {
    studyId: study._id,
    patientId: study.patient,
    previousStatus: oldStatus,
    currentStatus: status,
    updatedAt: timestamp
  };
};