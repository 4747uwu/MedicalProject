import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';

// Get all studies for lab staff (without doctor information)
export const getAllStudiesForLab = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', location = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build query based on lab staff's lab
    let query = {};
    
    // If user is lab staff, filter by their lab
    if (req.user.role === 'lab_staff' && req.user.lab) {
      query.sourceLab = req.user.lab._id;
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { 'patient.firstName': { $regex: search, $options: 'i' } },
        { 'patient.lastName': { $regex: search, $options: 'i' } },
        { accessionNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Add location filter
    if (location) {
      query['sourceLab.name'] = location;
    }

    const studies = await DicomStudy.find(query)
      .populate('patient', 'firstName lastName patientID age gender dateOfBirth contactNumber')
      .populate('sourceLab', 'name identifier contactPerson')
      .select('-lastAssignedDoctor -reportContent') // Exclude doctor information
      .sort({ createdAt: -1 })
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
      location: study.sourceLab?.name,
      accessionNumber: study.accessionNumber,
      workflowStatus: study.workflowStatus,
      priority: study.caseType,
      instanceID: study.studyInstanceUID,
      studyType: study.examType || 'N/A'
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
    console.error('Error fetching studies for lab:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch studies'
    });
  }
};

// Get patient detailed view for lab staff
export const getPatientDetailedViewForLab = async (req, res) => {
  try {
    const { id: patientId } = req.params;

    // Find patient and studies
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get studies for this patient (without doctor information)
    let studyQuery = { patient: patient._id };
    
    // If user is lab staff, only show studies from their lab
    if (req.user.role === 'lab_staff' && req.user.lab) {
      studyQuery.sourceLab = req.user.lab._id;
    }

    const studies = await DicomStudy.find(studyQuery)
      .populate('sourceLab', 'name identifier')
      .select('-lastAssignedDoctor -reportContent')
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
        priority: study.caseType
      })),
      documents: patient.documents || []
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching patient details for lab:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient details'
    });
  }
};

// Update patient information (lab staff can update basic patient info)
export const updatePatientInfo = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const updateData = req.body;

    // Only allow certain fields to be updated by lab staff
    const allowedFields = [
      'firstName', 'lastName', 'age', 'gender', 'dateOfBirth', 
      'contactNumber', 'address', 'clinicalInfo', 'referralInfo'
    ];

    const sanitizedData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        sanitizedData[field] = updateData[field];
      }
    });

    const patient = await Patient.findOneAndUpdate(
      { patientID: patientId },
      sanitizedData,
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    res.json({
      success: true,
      message: 'Patient information updated successfully',
      data: patient
    });

  } catch (error) {
    console.error('Error updating patient info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update patient information'
    });
  }
};