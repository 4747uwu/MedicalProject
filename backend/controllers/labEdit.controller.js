import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import User from '../models/userModel.js';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 });

// 🔧 WORKFLOW STATUS MAPPING (same as existing)
const WORKFLOW_STATUS_MAPPING = {
    'NEW': 'new_study_received',
    'PENDING': 'pending_assignment',
    'ASSIGNED': 'assigned_to_doctor',
    'IN_PROGRESS': 'report_in_progress',
    'COMPLETED': 'report_finalized',
    'DOWNLOADED': 'report_downloaded',
    'new_study_received': 'new_study_received',
    'pending_assignment': 'pending_assignment',
    'assigned_to_doctor': 'assigned_to_doctor',
    'report_in_progress': 'report_in_progress',
    'report_downloaded_radiologist': 'report_downloaded_radiologist',
    'report_finalized': 'report_finalized',
    'report_downloaded': 'report_downloaded',
    'final_report_downloaded': 'final_report_downloaded',
    'archived': 'archived'
};

const normalizeWorkflowStatus = (status) => {
    if (!status) return 'new_study_received';
    return WORKFLOW_STATUS_MAPPING[status] || 'new_study_received';
};

const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input.trim();
    }
    return input;
};

// 🔧 OPTIMIZED: getPatientDetailedView (same name, enhanced performance)
export const getPatientDetailedView = async (req, res) => {
    try {
        const { patientId } = req.params;
        const userId = req.user.id;

        console.log(`🔍 Fetching detailed view for patient: ${patientId} by user: ${userId}`);

        // 🔧 PERFORMANCE: Check cache first
        const cacheKey = `patient_detail_${patientId}`;
        let cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                fromCache: true
            });
        }

        // 🔧 OPTIMIZED: Parallel queries for better performance
        const [patient, allStudies] = await Promise.all([
            Patient.findOne({ patientID: patientId })
                .populate('clinicalInfo.lastModifiedBy', 'fullName email')
                .lean(),
            DicomStudy.find({ patientId: patientId })
                .select('studyInstanceUID studyDate modality accessionNumber workflowStatus caseType examDescription examType sourceLab')
                .populate('sourceLab', 'name')
                .sort({ createdAt: -1 })
                .lean()
        ]);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Get current study efficiently
        const currentStudy = allStudies.length > 0 ? allStudies[0] : null;

        const responseData = {
            patientInfo: {
                patientId: patient.patientID,
                fullName: patient.computed?.fullName || 
                         `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown',
                age: patient.ageString || 'N/A',
                gender: patient.gender || 'N/A',
                dateOfBirth: patient.dateOfBirth || 'N/A',
                contactPhone: patient.contactInformation?.phone || 'N/A',
                contactEmail: patient.contactInformation?.email || 'N/A'
            },
            clinicalInfo: {
                clinicalHistory: patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.clinicalInfo?.previousSurgery || '',
                lastModifiedBy: patient.clinicalInfo?.lastModifiedBy || null,
                lastModifiedAt: patient.clinicalInfo?.lastModifiedAt || null
            },
            studyInfo: currentStudy ? {
                studyId: currentStudy.studyInstanceUID,
                studyDate: currentStudy.studyDate,
                modality: currentStudy.modality || 'N/A',
                accessionNumber: currentStudy.accessionNumber || 'N/A',
                status: currentStudy.workflowStatus
            } : {},
            visitInfo: {
                caseType: currentStudy?.caseType || 'ROUTINE',
                center: currentStudy?.sourceLab?.name || 'Default Lab',
                examType: currentStudy?.examType || 'N/A',
                examDescription: currentStudy?.examDescription || 'N/A',
                orderDate: currentStudy?.createdAt || patient.createdAt,
                studyDate: currentStudy?.studyDate || 'N/A',
                studyStatus: currentStudy?.workflowStatus || 'new_study_received'
            },
            allStudies: allStudies.map(study => ({
                studyId: study.studyInstanceUID,
                studyDate: study.studyDate,
                modality: study.modality || 'N/A',
                accessionNumber: study.accessionNumber || 'N/A',
                status: study.workflowStatus
            })),
            documents: patient.documents || []
        };

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, responseData, 180); // 3 minutes

        console.log('✅ Patient detailed view fetched successfully');

        res.json({
            success: true,
            data: responseData,
            fromCache: false
        });

    } catch (error) {
        console.error('❌ Error fetching patient detailed view:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// 🔧 OPTIMIZED: updatePatientDetails (same name, enhanced performance)
export const updatePatientDetails = async (req, res) => {
    try {
        const { patientId } = req.params;
        const userId = req.user.id;
        const updateData = req.body;
        const startTime = Date.now();

        console.log(`=== PATIENT UPDATE REQUEST ===`);
        console.log(`👤 Patient ID: ${patientId}`);
        console.log(`🔧 Updated by: ${userId}`);

        // 🔧 PERFORMANCE: Validate user permissions efficiently
        const user = await User.findById(userId).select('role fullName email').lean();
        if (!user || !['lab_staff', 'admin'].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to edit patient data'
            });
        }

        // 🔧 OPTIMIZED: Find patient with lean query
        const patient = await Patient.findOne({ patientID: patientId }).lean();
        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 STEP 1: Collect name changes efficiently
        let newFirstName = patient.firstName || '';
        let newLastName = patient.lastName || '';
        let nameChanged = false;

        if (updateData.patientInfo) {
            if (updateData.patientInfo.firstName !== undefined) {
                newFirstName = sanitizeInput(updateData.patientInfo.firstName);
                nameChanged = true;
            }
            if (updateData.patientInfo.lastName !== undefined) {
                newLastName = sanitizeInput(updateData.patientInfo.lastName);
                nameChanged = true;
            }
        }

        // 🔧 STEP 2: Build complete update object
        const patientUpdateData = {};

        if (nameChanged) {
            patientUpdateData.firstName = newFirstName;
            patientUpdateData.lastName = newLastName;
            patientUpdateData.patientNameRaw = `${newFirstName} ${newLastName}`.trim();
            
            // Update computed fields
            patientUpdateData['computed.fullName'] = `${newFirstName} ${newLastName}`.trim();
            patientUpdateData.searchName = `${newFirstName} ${newLastName} ${patientId}`.toLowerCase();
        }

        // Handle other patient info fields
        if (updateData.patientInfo) {
            if (updateData.patientInfo.age !== undefined) {
                patientUpdateData.ageString = sanitizeInput(updateData.patientInfo.age);
            }
            if (updateData.patientInfo.gender !== undefined) {
                patientUpdateData.gender = sanitizeInput(updateData.patientInfo.gender);
            }
            if (updateData.patientInfo.dateOfBirth !== undefined) {
                patientUpdateData.dateOfBirth = sanitizeInput(updateData.patientInfo.dateOfBirth);
            }
            
            // Handle contact information
            if (updateData.patientInfo.contactNumber !== undefined || updateData.patientInfo.contactEmail !== undefined) {
                patientUpdateData.contactInformation = {
                    phone: sanitizeInput(updateData.patientInfo.contactNumber) || patient.contactInformation?.phone || '',
                    email: sanitizeInput(updateData.patientInfo.contactEmail) || patient.contactInformation?.email || ''
                };
            }
        }

        // Handle clinical information
        if (updateData.clinicalInfo) {
            patientUpdateData.clinicalInfo = {
                ...patient.clinicalInfo,
                clinicalHistory: sanitizeInput(updateData.clinicalInfo.clinicalHistory) || '',
                previousInjury: sanitizeInput(updateData.clinicalInfo.previousInjury) || '',
                previousSurgery: sanitizeInput(updateData.clinicalInfo.previousSurgery) || '',
                lastModifiedBy: userId,
                lastModifiedAt: new Date()
            };

            // Update denormalized medical history
            patientUpdateData.medicalHistory = {
                clinicalHistory: patientUpdateData.clinicalInfo.clinicalHistory,
                previousInjury: patientUpdateData.clinicalInfo.previousInjury,
                previousSurgery: patientUpdateData.clinicalInfo.previousSurgery
            };
        }

        if (updateData.referralInfo !== undefined) {
            patientUpdateData.referralInfo = sanitizeInput(updateData.referralInfo);
        }

        if (updateData.studyInfo?.workflowStatus) {
            const normalizedStatus = normalizeWorkflowStatus(updateData.studyInfo.workflowStatus);
            patientUpdateData.currentWorkflowStatus = normalizedStatus;
        }

        // Update computed fields
        patientUpdateData['computed.lastActivity'] = new Date();

        // 🔧 STEP 3: Execute single atomic update
        console.log('💾 Executing patient update...');

        const updatedPatient = await Patient.findOneAndUpdate(
            { patientID: patientId },
            { $set: patientUpdateData },
            { new: true, lean: true }
        );

        if (!updatedPatient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found during update'
            });
        }

        // 🔧 PERFORMANCE: Update related studies efficiently
        if (updateData.studyInfo || nameChanged) {
            const studyUpdateData = {};
            
            if (nameChanged) {
                studyUpdateData['patientInfo.patientName'] = `${newFirstName} ${newLastName}`.trim();
                studyUpdateData.patientName = `${newFirstName} ${newLastName}`.trim();
            }

            if (updateData.studyInfo?.workflowStatus) {
                const normalizedStatus = normalizeWorkflowStatus(updateData.studyInfo.workflowStatus);
                studyUpdateData.workflowStatus = normalizedStatus;
            }

            if (updateData.studyInfo?.caseType) {
                studyUpdateData.caseType = sanitizeInput(updateData.studyInfo.caseType);
            }

            if (updateData.clinicalInfo?.clinicalHistory) {
                studyUpdateData.clinicalHistory = sanitizeInput(updateData.clinicalInfo.clinicalHistory);
            }

            if (Object.keys(studyUpdateData).length > 0) {
                await DicomStudy.updateMany(
                    { patient: patient._id },
                    { $set: studyUpdateData }
                );
            }
        }

        // 🔧 PERFORMANCE: Clear cache
        cache.del(`patient_detail_${patientId}`);

        const processingTime = Date.now() - startTime;

        console.log('✅ Patient updated successfully');

        const responseData = {
            patientInfo: {
                patientID: updatedPatient.patientID,
                firstName: updatedPatient.firstName || '',
                lastName: updatedPatient.lastName || '',
                age: updatedPatient.ageString || '',
                gender: updatedPatient.gender || '',
                dateOfBirth: updatedPatient.dateOfBirth || '',
                contactNumber: updatedPatient.contactInformation?.phone || '',
                email: updatedPatient.contactInformation?.email || ''
            },
            clinicalInfo: {
                clinicalHistory: updatedPatient.clinicalInfo?.clinicalHistory || '',
                previousInjury: updatedPatient.clinicalInfo?.previousInjury || '',
                previousSurgery: updatedPatient.clinicalInfo?.previousSurgery || '',
                lastModifiedBy: updatedPatient.clinicalInfo?.lastModifiedBy || null,
                lastModifiedAt: updatedPatient.clinicalInfo?.lastModifiedAt || null
            },
            medicalHistory: {
                clinicalHistory: updatedPatient.medicalHistory?.clinicalHistory || '',
                previousInjury: updatedPatient.medicalHistory?.previousInjury || '',
                previousSurgery: updatedPatient.medicalHistory?.previousSurgery || ''
            },
            referralInfo: updatedPatient.referralInfo || '',
            physicianInfo: updateData.physicianInfo || {}
        };

        console.log('📤 Sending response:', JSON.stringify(responseData, null, 2));
        console.log('=== UPDATE COMPLETE ===');

        res.json({
            success: true,
            message: 'Patient information updated successfully',
            data: responseData
        });

    } catch (error) {
        console.error('❌ Error updating patient details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// 🔧 UPLOAD DOCUMENT
export const uploadDocument = async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.id;
    const { type } = req.body;
    const file = req.file;

    console.log(`📤 Uploading document for patient: ${patientId}`);

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate user
    const user = await User.findById(userId).select('fullName email');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Convert file to base64
    const fileData = file.buffer.toString('base64');

    // Create document object
    const document = {
      fileName: file.originalname,
      fileType: type || 'Clinical',
      contentType: file.mimetype,
      data: fileData,
      size: file.size,
      uploadedAt: new Date(),
      uploadedBy: user.fullName
    };

    // Add document to patient
    patient.documents.push(document);
    await patient.save();

    console.log('✅ Document uploaded successfully');

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document: {
        fileName: document.fileName,
        fileType: document.fileType,
        uploadedAt: document.uploadedAt,
        uploadedBy: document.uploadedBy
      }
    });

  } catch (error) {
    console.error('❌ Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 DELETE DOCUMENT
export const deleteDocument = async (req, res) => {
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ Deleting document ${docIndex} for patient: ${patientId}`);

    // Validate user permissions
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Validate document index
    const documentIndex = parseInt(docIndex);
    if (isNaN(documentIndex) || documentIndex < 0 || documentIndex >= patient.documents.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document index'
      });
    }

    // Remove document
    patient.documents.splice(documentIndex, 1);
    await patient.save();

    console.log('✅ Document deleted successfully');

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 DOWNLOAD DOCUMENT
export const downloadDocument = async (req, res) => {
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;

    console.log(`⬇️ Downloading document ${docIndex} for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Validate document index
    const documentIndex = parseInt(docIndex);
    if (isNaN(documentIndex) || documentIndex < 0 || documentIndex >= patient.documents.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document index'
      });
    }

    const document = patient.documents[documentIndex];

    // Convert base64 back to buffer
    const fileBuffer = Buffer.from(document.data, 'base64');

    // Set response headers
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    console.log('✅ Document download initiated');

    // Send file
    res.send(fileBuffer);

  } catch (error) {
    console.error('❌ Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 UPDATE STUDY WORKFLOW STATUS
export const updateStudyStatus = async (req, res) => {
  try {
    const { studyId } = req.params;
    const { workflowStatus, note } = req.body;
    const userId = req.user.id;

    console.log(`🔄 Updating study status: ${studyId} to ${workflowStatus}`);

    // Validate user permissions
    const user = await User.findById(userId).select('role fullName');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Normalize status
    const normalizedStatus = normalizeWorkflowStatus(workflowStatus);

    // Update study
    const study = await DicomStudy.findOneAndUpdate(
      { studyInstanceUID: studyId },
      {
        $set: { workflowStatus: normalizedStatus },
        $push: {
          statusHistory: {
            status: normalizedStatus,
            changedAt: new Date(),
            changedBy: userId,
            note: note || `Status updated to ${normalizedStatus} by ${user.fullName}`
          }
        }
      },
      { new: true, runValidators: true }
    );

    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    // Update patient workflow status to match
    await Patient.findOneAndUpdate(
      { patientID: study.patientId },
      {
        $set: {
          currentWorkflowStatus: normalizedStatus,
          activeDicomStudyRef: study._id
        }
      }
    );

    console.log('✅ Study status updated successfully');

    res.json({
      success: true,
      message: 'Study status updated successfully',
      data: {
        studyId: study.studyInstanceUID,
        newStatus: study.workflowStatus,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Error updating study status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 GET ALL PATIENTS (LAB VIEW)
export const getAllPatients = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, search = '', status = '' } = req.query;

    console.log(`📋 Fetching patients for lab user: ${userId}`);

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { patientID: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.currentWorkflowStatus = normalizeWorkflowStatus(status);
    }

    // Execute query with pagination
    const patients = await Patient.find(query)
      .populate('clinicalInfo.lastModifiedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Patient.countDocuments(query);

    // Format response
    const formattedPatients = patients.map(patient => ({
      patientId: patient.patientID,
      fullName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      age: patient.ageString || 'N/A',
      gender: patient.gender || 'N/A',
      status: patient.currentWorkflowStatus,
      lastModified: patient.clinicalInfo?.lastModifiedAt || patient.updatedAt,
      hasDocuments: patient.documents && patient.documents.length > 0
    }));

    res.json({
      success: true,
      data: {
        patients: formattedPatients,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 🔧 BULK UPDATE STUDIES
export const bulkUpdateStudies = async (req, res) => {
  try {
    const { studyIds, updateData } = req.body;
    const userId = req.user.id;

    console.log(`🔄 Bulk updating ${studyIds.length} studies`);

    // Validate user permissions
    const user = await User.findById(userId).select('role fullName');
    if (!user || !['lab_staff', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid study IDs provided'
      });
    }

    // Prepare update data
    const bulkUpdateData = {};
    
    if (updateData.workflowStatus) {
      bulkUpdateData.workflowStatus = normalizeWorkflowStatus(updateData.workflowStatus);
    }
    
    if (updateData.caseType) {
      bulkUpdateData.caseType = sanitizeInput(updateData.caseType);
    }

    // Add status history entry
    if (updateData.workflowStatus) {
      bulkUpdateData.$push = {
        statusHistory: {
          status: bulkUpdateData.workflowStatus,
          changedAt: new Date(),
          changedBy: userId,
          note: `Bulk status update by ${user.fullName}`
        }
      };
    }

    // Execute bulk update
    const updateResult = await DicomStudy.updateMany(
      { studyInstanceUID: { $in: studyIds } },
      bulkUpdateData,
      { runValidators: true }
    );

    console.log(`✅ Bulk updated ${updateResult.modifiedCount} studies`);

    res.json({
      success: true,
      message: `Successfully updated ${updateResult.modifiedCount} studies`,
      data: {
        modifiedCount: updateResult.modifiedCount,
        matchedCount: updateResult.matchedCount
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export default {
  getPatientDetailedView,
  updatePatientDetails,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  updateStudyStatus,
  getAllPatients,
  bulkUpdateStudies
};