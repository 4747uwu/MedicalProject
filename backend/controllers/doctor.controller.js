import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';

// Get studies assigned to the doctor
export const getAssignedStudies = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', location = '' } = req.query;
    const skip = (page - 1) * limit;

    // Find the doctor profile for the current user
    const doctor = await Doctor.findOne({ userAccount: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }

    // Build query for studies assigned to this doctor
    let query = {
      lastAssignedDoctor: doctor._id,
      workflowStatus: { $in: ['assigned_to_doctor', 'report_in_progress', 'report_finalized'] }
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { 'patient.firstName': { $regex: search, $options: 'i' } },
        { 'patient.lastName': { $regex: search, $options: 'i' } },
        { accessionNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Add location filter (using sourceLab instead of lab)
    if (location) {
      query['sourceLab.name'] = location;
    }

    const studies = await DicomStudy.find(query)
      .populate('patient', 'firstName lastName patientID age gender dateOfBirth contactNumber')
      .populate('sourceLab', 'name identifier contactPerson')
      .populate('lastAssignedDoctor', 'fullName specialization')
      .sort({ lastAssignmentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalRecords = await DicomStudy.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    // Format the response
    const formattedStudies = studies.map(study => ({
      _id: study._id,
      patientId: study.patient?.patientID,
      patientName: study.patient ? 
        `${study.patient.firstName || ''} ${study.patient.lastName || ''}`.trim() : 
        'N/A',
      ageGender: study.patient ? 
        `${study.patient.age || 'N/A'}/${study.patient.gender || 'N/A'}` : 
        'N/A',
      description: study.examDescription || study.examType,
      modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : 'N/A',
      seriesImages: study.numberOfSeries ? `${study.numberOfSeries}/${study.numberOfImages || 'N/A'}` : 'N/A',
      studyDateTime: study.studyDate && study.studyTime ? 
        `${study.studyDate} ${study.studyTime}` : 
        study.studyDate || study.createdAt,
      uploadDateTime: study.createdAt,
      assignedAt: study.lastAssignmentAt,
      location: study.sourceLab?.name,
      accessionNumber: study.accessionNumber,
      workflowStatus: study.workflowStatus,
      priority: study.caseType, // Using caseType as priority
      instanceID: study.studyInstanceUID,
      studyType: study.examType || 'N/A',
      reportedBy: study.lastAssignedDoctor?.fullName,
      reportedDateTime: study.reportFinalizedAt,
      reportContent: study.reportContent
    }));

    res.json({
      success: true,
      data: formattedStudies,
      currentPage: parseInt(page),
      totalPages,
      totalRecords,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });

  } catch (error) {
    console.error('Error fetching assigned studies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned studies'
    });
  }
};

// Get patient detailed view for doctor
export const getPatientDetailedViewForDoctor = async (req, res) => {
  try {
    const { id: patientId } = req.params;

    // Find the doctor profile for the current user
    const doctor = await Doctor.findOne({ userAccount: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }

    // Find patient and studies
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get studies for this patient that are assigned to this doctor
    const studies = await DicomStudy.find({ 
      patient: patient._id,
      lastAssignedDoctor: doctor._id
    })
      .populate('sourceLab', 'name identifier')
      .populate('lastAssignedDoctor', 'fullName specialization')
      .sort({ studyDate: -1 });

    const responseData = {
      patientInfo: {
        patientID: patient.patientID,
        firstName: patient.firstName,
        lastName: patient.lastName,
        age: patient.age,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        contactNumber: patient.contactNumber,
        address: patient.address
      },
      clinicalInfo: patient.clinicalInfo || {},
      referralInfo: patient.referralInfo || '',
      studies: studies.map(study => ({
        _id: study._id,
        studyDateTime: study.studyDate,
        modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : 'N/A',
        description: study.examDescription || study.examType,
        workflowStatus: study.workflowStatus,
        location: study.sourceLab?.name,
        priority: study.caseType,
        assignedAt: study.lastAssignmentAt,
        reportContent: study.reportContent,
        reportFinalizedAt: study.reportFinalizedAt
      })),
      documents: patient.documents || []
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching patient details for doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient details'
    });
  }
};

// Start working on a report
export const startReport = async (req, res) => {
  try {
    const { studyId } = req.params;

    // Find the doctor profile for the current user
    const doctor = await Doctor.findOne({ userAccount: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }

    // Find the study and verify it's assigned to this doctor
    const study = await DicomStudy.findOne({ 
      _id: studyId,
      lastAssignedDoctor: doctor._id 
    });

    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found or not assigned to you'
      });
    }

    // Update workflow status to report_in_progress
    study.workflowStatus = 'report_in_progress';
    study.reportStartedAt = new Date();
    
    // Add to status history
    study.statusHistory.push({
      status: 'report_in_progress',
      changedAt: new Date(),
      changedBy: req.user._id,
      note: 'Doctor started working on report'
    });

    await study.save();

    res.json({
      success: true,
      message: 'Report started successfully'
    });

  } catch (error) {
    console.error('Error starting report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start report'
    });
  }
};

// Submit/finalize a report
export const submitReport = async (req, res) => {
  try {
    const { studyId } = req.params;
    const { reportContent, findings, impression, recommendations } = req.body;

    // Find the doctor profile for the current user
    const doctor = await Doctor.findOne({ userAccount: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }

    // Find the study and verify it's assigned to this doctor
    const study = await DicomStudy.findOne({ 
      _id: studyId,
      lastAssignedDoctor: doctor._id 
    });

    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found or not assigned to you'
      });
    }

    // Update study with report content
    study.reportContent = {
      content: reportContent,
      findings: findings,
      impression: impression,
      recommendations: recommendations,
      finalizedBy: doctor._id,
      finalizedAt: new Date()
    };

    study.workflowStatus = 'report_finalized';
    study.reportFinalizedAt = new Date();

    // Add to status history
    study.statusHistory.push({
      status: 'report_finalized',
      changedAt: new Date(),
      changedBy: req.user._id,
      note: 'Report finalized by doctor'
    });

    await study.save();

    res.json({
      success: true,
      message: 'Report submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report'
    });
  }
};

// Get doctor's dashboard stats
export const getDoctorStats = async (req, res) => {
  try {
    // Find the doctor profile for the current user
    const doctor = await Doctor.findOne({ userAccount: req.user._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }

    // Get various counts
    const totalAssigned = await DicomStudy.countDocuments({ lastAssignedDoctor: doctor._id });
    const pending = await DicomStudy.countDocuments({ 
      lastAssignedDoctor: doctor._id, 
      workflowStatus: 'assigned_to_doctor' 
    });
    const inProgress = await DicomStudy.countDocuments({ 
      lastAssignedDoctor: doctor._id, 
      workflowStatus: 'report_in_progress' 
    });
    const completed = await DicomStudy.countDocuments({ 
      lastAssignedDoctor: doctor._id, 
      workflowStatus: 'report_finalized' 
    });

    // Get urgent studies (using caseType instead of priority)
    const urgentStudies = await DicomStudy.countDocuments({ 
      lastAssignedDoctor: doctor._id, 
      caseType: { $in: ['URGENT', 'EMERGENCY'] },
      workflowStatus: { $in: ['assigned_to_doctor', 'report_in_progress'] }
    });

    res.json({
      success: true,
      data: {
        totalAssigned,
        pending,
        inProgress,
        completed,
        urgentStudies,
        assignmentStats: doctor.assignmentStats || {}
      }
    });

  } catch (error) {
    console.error('Error fetching doctor stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor statistics'
    });
  }
};