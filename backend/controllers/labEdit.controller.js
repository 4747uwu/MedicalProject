import Patient from '../models/patientModel.js';
import User from '../models/userModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import Document from '../models/documentModal.js'; // 🔧 NEW: Document model
import WasabiService from '../services/wasabi.service.js'; // 🔧 NEW: Wasabi integration
import cache from '../utils/cache.js';

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
                .select('studyInstanceUID studyDate modality accessionNumber workflowStatus caseType examDescription examType sourceLab uploadedReports')
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

        // 🔧 NEW: Extract study reports separately (don't merge)
        const studyReports = [];
        allStudies.forEach(study => {
            if (study.uploadedReports && study.uploadedReports.length > 0) {
                study.uploadedReports.forEach(report => {
                    studyReports.push({
                        _id: report._id,
                        fileName: report.filename,
                        fileType: report.reportType || 'study-report',
                        documentType: report.documentType || 'clinical',
                        contentType: report.contentType,
                        size: report.size,
                        uploadedAt: report.uploadedAt,
                        uploadedBy: report.uploadedBy,
                        storageType: report.storageType || 'wasabi',
                        wasabiKey: report.wasabiKey,
                        wasabiBucket: report.wasabiBucket,
                        reportStatus: report.reportStatus,
                        studyId: study.studyInstanceUID,
                        studyObjectId: study._id,
                        source: 'study'
                    });
                });
            }
        });

        console.log(`📋 Found ${patient.documents?.length || 0} patient documents and ${studyReports.length} study reports`);

        const responseData = {
            patientInfo: {
                patientId: patient.patientID,
                patientID: patient.patientID, // Add both for compatibility
                fullName: patient.computed?.fullName || 
                         `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown',
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                age: patient.ageString || 'N/A',
                gender: patient.gender || 'N/A',
                dateOfBirth: patient.dateOfBirth || 'N/A',
                contactPhone: patient.contactInformation?.phone || 'N/A',
                contactEmail: patient.contactInformation?.email || 'N/A',
                mrn: patient.mrn || 'N/A'
            },
            clinicalInfo: {
                clinicalHistory: patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.clinicalInfo?.previousSurgery || '',
                lastModifiedBy: patient.clinicalInfo?.lastModifiedBy || null,
                lastModifiedAt: patient.clinicalInfo?.lastModifiedAt || null
            },
            medicalHistory: {
                clinicalHistory: patient.medicalHistory?.clinicalHistory || patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.medicalHistory?.previousInjury || patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.medicalHistory?.previousSurgery || patient.clinicalInfo?.previousSurgery || ''
            },
            studyInfo: currentStudy ? {
                studyId: currentStudy.studyInstanceUID,
                studyDate: currentStudy.studyDate,
                modality: currentStudy.modality || 'N/A',
                accessionNumber: currentStudy.accessionNumber || 'N/A',
                status: currentStudy.workflowStatus,
                caseType: currentStudy.caseType || 'routine',
                workflowStatus: currentStudy.workflowStatus,
                images: []
            } : {},
            visitInfo: {
                examDescription: currentStudy?.examDescription || 'N/A',
                center: currentStudy?.sourceLab?.name || 'Default Lab',
                studyDate: currentStudy?.studyDate || 'N/A',
                caseType: currentStudy?.caseType?.toUpperCase() || 'ROUTINE'
            },
            allStudies: allStudies.map(study => ({
                studyId: study.studyInstanceUID,
                studyDate: study.studyDate,
                modality: study.modality || 'N/A',
                accessionNumber: study.accessionNumber || 'N/A',
                status: study.workflowStatus
            })),
            // 🔧 ENHANCED: Include studies array for compatibility
            studies: allStudies.map(study => ({
                _id: study._id,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber || 'N/A',
                studyDateTime: study.studyDate,
                modality: study.modality || 'N/A',
                description: study.examDescription || '',
                workflowStatus: study.workflowStatus,
                priority: study.caseType?.toUpperCase() || 'ROUTINE',
                location: study.sourceLab?.name || 'Default Lab',
                assignedDoctor: study.assignedDoctor || 'Not Assigned',
                reportFinalizedAt: study.reportFinalizedAt
            })),
            // 🔧 SEPARATE: Keep patient documents and study reports separate
            documents: patient.documents || [],
            studyReports: studyReports, // 🔧 NEW: Study reports as separate array
            referralInfo: patient.referralInfo || ''
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

// 🔧 UPDATED: Upload document to Wasabi instead of MongoDB
export const uploadDocument = async (req, res) => {
  console.log('🔧 Uploading document to Wasabi storage...', req.params);
  try {
    const { patientId } = req.params;
    const userId = req.user.id; // This is working now as we can see from logs
    const { type, studyId, documentType = 'clinical' } = req.body;
    const file = req.file;

    console.log(`📤 Uploading document for patient: ${patientId}`);
    console.log(`👤 User ID: ${userId}, Role: ${req.user.role}`);

    if (!file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log(`📁 File details:`, {
      name: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      hasBuffer: !!file.buffer
    });

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
    }

    // Validate user
    const user = await User.findById(userId).select('fullName email role');
    console.log(`🔍 Found user:`, user);
    
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    console.log(`🔐 User role: ${user.role}`);
    if (!['lab_staff', 'admin'].includes(user.role)) {
      console.log(`❌ Insufficient permissions. Role: ${user.role}`);
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: lab_staff or admin, Got: ${user.role}`
      });
    }

    // Find patient - 🔧 IMPORTANT: Don't use .lean() here since we need to save later
    const patient = await Patient.findOne({ patientID: patientId });
    console.log(`🔍 Found patient:`, patient ? 'Yes' : 'No');
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // 🔧 CRITICAL FIX: Initialize documents array if it doesn't exist
    if (!patient.documents) {
      console.log('🔧 Initializing patient.documents array (was undefined)');
      patient.documents = [];
    } else if (!Array.isArray(patient.documents)) {
      console.log('🔧 Converting patient.documents to array (was not an array)');
      patient.documents = [];
    }

    console.log(`🔍 Patient documents array:`, {
      exists: !!patient.documents,
      isArray: Array.isArray(patient.documents),
      length: patient.documents?.length || 0
    });

    // Find study if studyId provided
    let study = null;
    if (studyId && studyId !== 'general') {
      study = await DicomStudy.findOne({ studyInstanceUID: studyId });
      if (!study) {
        console.log(`⚠️ Study not found: ${studyId}, continuing without study reference`);
        // Don't fail, just continue without study reference
      }
    }

    // 🔧 Upload to Wasabi
    console.log('☁️ Uploading to Wasabi...');
    const wasabiResult = await WasabiService.uploadDocument(
      file.buffer,
      file.originalname,
      documentType,
      {
        patientId: patientId,
        studyId: studyId || 'general',
        uploadedBy: user.fullName,
        userId: userId
      }
    );

    if (!wasabiResult.success) {
      throw new Error('Failed to upload to Wasabi storage: ' + (wasabiResult.error || 'Unknown error'));
    }

    console.log('✅ Wasabi upload successful:', wasabiResult.key);

    // 🔧 Create document record in database
    const documentRecord = new Document({
      fileName: file.originalname,
      fileSize: file.size,
      contentType: file.mimetype,
      documentType: documentType,
      wasabiKey: wasabiResult.key,
      wasabiBucket: wasabiResult.bucket,
      patientId: patientId,
      studyId: study ? study._id : null,
      uploadedBy: userId
    });

    await documentRecord.save();
    console.log('✅ Document record saved to database:', documentRecord._id);

    // 🔧 FIXED: Create document reference for patient
    const documentReference = {
      _id: documentRecord._id,
      fileName: file.originalname,
      fileType: type || documentType,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
      uploadedBy: user.fullName,
      wasabiKey: wasabiResult.key,
      wasabiBucket: wasabiResult.bucket,
      storageType: 'wasabi'
    };

    // 🔧 DOUBLE CHECK: Ensure documents array is ready before pushing
    if (!Array.isArray(patient.documents)) {
      console.log('🔧 EMERGENCY FIX: Converting patient.documents to array right before push');
      patient.documents = [];
    }

    console.log('📝 Adding document reference to patient...');
    patient.documents.push(documentReference);
    
    try {
      await patient.save();
      console.log('✅ Patient document reference saved successfully');
    } catch (saveError) {
      console.error('❌ Error saving patient document reference:', saveError);
      // Don't fail the entire operation, document is already in Wasabi and Document collection
      console.log('⚠️ Continuing despite patient save error - document is still accessible via Document collection');
    }

    // 🔧 Update study if provided
    if (study) {
      try {
        if (!study.uploadedReports) {
          study.uploadedReports = [];
        }

        const studyDocumentRef = {
          _id: documentRecord._id,
          filename: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          reportType: 'uploaded-report',
          uploadedAt: new Date(),
          uploadedBy: user.fullName,
          reportStatus: 'finalized',
          wasabiKey: wasabiResult.key,
          wasabiBucket: wasabiResult.bucket,
          storageType: 'wasabi',
          documentType: documentType
        };

        study.uploadedReports.push(studyDocumentRef);
        
        // 🔧 Update study status if this is a report
        if (documentType === 'report' || documentType === 'clinical') {
          study.ReportAvailable = true;
          
          if (study.workflowStatus === 'report_in_progress') {
            study.workflowStatus = 'report_finalized';
            if (!study.statusHistory) study.statusHistory = [];
            study.statusHistory.push({
              status: 'report_finalized',
              changedAt: new Date(),
              changedBy: userId,
              note: `Report uploaded: ${file.originalname}`
            });
          }
        }
        
        // 🔧 CRITICAL FIX: Normalize caseType before saving
        if (study.caseType) {
          study.caseType = study.caseType.toLowerCase();
          console.log(`🔧 Normalized caseType from ${study.caseType.toUpperCase()} to ${study.caseType}`);
        }
        
        await study.save();
        console.log(`✅ Study ${study.studyInstanceUID} updated with document reference`);
        
      } catch (studyError) {
        console.error('❌ Error updating study:', studyError);
        // Don't fail the entire operation
      }
    }

    // 🔧 Clear cache for patient details
    const cacheKey = `patient_detail_${patientId}`;
    cache.del(cacheKey);
    console.log('🧹 Cleared patient details cache');

    console.log('✅ Document uploaded successfully to Wasabi');

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document: {
        id: documentRecord._id,
        fileName: documentRecord.fileName,
        fileType: documentType,
        size: documentRecord.fileSize,
        uploadedAt: documentRecord.uploadedAt,
        uploadedBy: user.fullName,
        wasabiLocation: wasabiResult.location || wasabiResult.key
      }
    });

  } catch (error) {
    console.error('❌ Error uploading document:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
};

// 🔧 UPDATED: Download document from Wasabi
export const downloadDocument = async (req, res) => {
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;

    console.log(`⬇️ Downloading document ${docIndex} for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId).select('role fullName');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    if (!['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
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

    const documentRef = patient.documents[documentIndex];

    // 🔧 Handle Wasabi vs Legacy storage
    if (documentRef.storageType === 'wasabi' && documentRef.wasabiKey) {
      console.log('☁️ Downloading from Wasabi...');
      
      // Download from Wasabi
      const wasabiResult = await WasabiService.downloadFile(
        documentRef.wasabiBucket,
        documentRef.wasabiKey
      );

      if (!wasabiResult.success) {
        throw new Error('Failed to download from Wasabi storage');
      }

      // Set response headers
      res.setHeader('Content-Type', documentRef.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${documentRef.fileName}"`);
      res.setHeader('Content-Length', wasabiResult.data.length);

      console.log('✅ Document download from Wasabi successful');
      
      // Send file
      res.send(wasabiResult.data);

    } else {
      // 🔧 Legacy: Download from MongoDB (backward compatibility)
      console.log('🗄️ Downloading from MongoDB (legacy)...');
      
      if (!documentRef.data) {
        return res.status(404).json({
          success: false,
          message: 'Document data not found'
        });
      }

      // Convert base64 back to buffer
      const fileBuffer = Buffer.from(documentRef.data, 'base64');

      // Set response headers
      res.setHeader('Content-Type', documentRef.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${documentRef.fileName}"`);
      res.setHeader('Content-Length', fileBuffer.length);

      console.log('✅ Document download from MongoDB successful');
      
      // Send file
      res.send(fileBuffer);
    }

  } catch (error) {
    console.error('❌ Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error.message
    });
  }
};

// 🔧 UPDATED: Delete document from Wasabi and database
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

    const documentRef = patient.documents[documentIndex];

    // 🔧 Delete from Wasabi if it's stored there
    if (documentRef.storageType === 'wasabi' && documentRef.wasabiKey) {
      console.log('☁️ Deleting from Wasabi...');
      
      try {
        await WasabiService.deleteFile(
          documentRef.wasabiBucket,
          documentRef.wasabiKey,
          true // permanent deletion
        );
        console.log('✅ File deleted from Wasabi');
      } catch (wasabiError) {
        console.warn('⚠️ Failed to delete from Wasabi:', wasabiError.message);
        // Continue with database cleanup even if Wasabi deletion fails
      }

      // Delete from Document collection
      if (documentRef._id) {
        try {
          await Document.findByIdAndDelete(documentRef._id);
          console.log('✅ Document record deleted from database');
        } catch (dbError) {
          console.warn('⚠️ Failed to delete document record:', dbError.message);
        }
      }
    }

    // Remove document reference from patient
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
      message: 'Failed to delete document',
      error: error.message
    });
  }
};

// 🔧 NEW: Get presigned URL for direct download (for admin/doctor dashboard)
export const getDocumentDownloadUrl = async (req, res) => {
  try {
    const { patientId, docIndex } = req.params;
    const userId = req.user.id;
    const { expiresIn = 3600 } = req.query; // Default 1 hour

    console.log(`🔗 Getting download URL for document ${docIndex} for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
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

    const documentRef = patient.documents[documentIndex];

    // 🔧 Generate presigned URL for Wasabi storage
    if (documentRef.storageType === 'wasabi' && documentRef.wasabiKey) {
      const urlResult = await WasabiService.generatePresignedUrl(
        documentRef.wasabiBucket,
        documentRef.wasabiKey,
        parseInt(expiresIn),
        'GetObject'
      );

      if (!urlResult.success) {
        throw new Error('Failed to generate download URL');
      }

      res.json({
        success: true,
        downloadUrl: urlResult.url,
        expiresAt: urlResult.expiresAt,
        fileName: documentRef.fileName,
        fileSize: documentRef.size,
        contentType: documentRef.contentType
      });

    } else {
      // For legacy MongoDB storage, return API endpoint
      res.json({
        success: true,
        downloadUrl: `/api/lab/patients/${patientId}/documents/${docIndex}/download`,
        expiresAt: new Date(Date.now() + (parseInt(expiresIn) * 1000)),
        fileName: documentRef.fileName,
        fileSize: documentRef.size,
        contentType: documentRef.contentType,
        storageType: 'legacy'
      });
    }

  } catch (error) {
    console.error('❌ Error getting download URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate download URL',
      error: error.message
    });
  }
};

// 🔧 NEW: List patient documents with metadata
export const getPatientDocuments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.id;

    console.log(`📋 Getting documents for patient: ${patientId}`);

    // Validate user
    const user = await User.findById(userId).select('role');
    if (!user || !['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
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

    // Format documents response
    const documents = patient.documents.map((doc, index) => ({
      index: index,
      id: doc._id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      contentType: doc.contentType,
      size: doc.size,
      sizeFormatted: WasabiService.formatBytes(doc.size),
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
      storageType: doc.storageType || 'legacy',
      canDownload: true,
      canDelete: ['lab_staff', 'admin'].includes(user.role)
    }));

    res.json({
      success: true,
      data: {
        patientId: patientId,
        documentsCount: documents.length,
        documents: documents
      }
    });

  } catch (error) {
    console.error('❌ Error getting patient documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient documents',
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

// 🔧 FIXED: Download study report - fetch Wasabi info from Document collection
export const downloadStudyReport = async (req, res) => {
  console.log('🔧 Starting downloadStudyReport...', req.params);
  
  try {
    const { studyId, reportId } = req.params;
    const userId = req.user.id;

    console.log(`⬇️ Downloading study report ${reportId} from study: ${studyId}`);

    // Validate user
    const user = await User.findById(userId).select('role fullName');
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`✅ User validated: ${user.fullName} (${user.role})`);

    // Check permissions
    if (!['lab_staff', 'admin', 'doctor_account'].includes(user.role)) {
      console.log(`❌ Insufficient permissions: ${user.role}`);
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    console.log('✅ Permissions validated');

    // Find study
    console.log(`🔍 Looking for study: ${studyId}`);
    const study = await DicomStudy.findOne({ studyInstanceUID: studyId });
    if (!study) {
      console.log(`❌ Study not found: ${studyId}`);
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    console.log(`✅ Study found: ${study._id}`);
    console.log(`📋 Study has ${study.uploadedReports?.length || 0} uploaded reports`);

    // Find report in study
    const report = study.uploadedReports?.find(r => r._id.toString() === reportId);
    if (!report) {
      console.log(`❌ Report not found in study: ${reportId}`);
      console.log(`📋 Available reports:`, study.uploadedReports?.map(r => ({
        id: r._id.toString(),
        filename: r.filename
      })) || []);
      return res.status(404).json({
        success: false,
        message: 'Report not found in study'
      });
    }

    console.log(`✅ Report found in study: ${report.filename}`);
    console.log(`📁 Study report details:`, {
      filename: report.filename,
      contentType: report.contentType,
      size: report.size,
      reportId: report._id.toString()
    });

    // 🔧 CRITICAL FIX: Get complete document info from Document collection
    console.log(`🔍 Fetching complete document info from Document collection...`);
    const documentRecord = await Document.findById(reportId);
    
    if (!documentRecord) {
      console.log(`❌ Document record not found in Document collection: ${reportId}`);
      return res.status(404).json({
        success: false,
        message: 'Document record not found'
      });
    }

    console.log(`✅ Document record found:`, {
      fileName: documentRecord.fileName,
      fileSize: documentRecord.fileSize,
      contentType: documentRecord.contentType,
      wasabiKey: documentRecord.wasabiKey,
      wasabiBucket: documentRecord.wasabiBucket,
      hasWasabiInfo: !!(documentRecord.wasabiKey && documentRecord.wasabiBucket)
    });

    // 🔧 Download from Wasabi using Document collection info
    if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
      console.log('☁️ Downloading study report from Wasabi...');
      console.log(`📂 Bucket: ${documentRecord.wasabiBucket}, Key: ${documentRecord.wasabiKey}`);
      
      try {
        const wasabiResult = await WasabiService.downloadFile(
          documentRecord.wasabiBucket,
          documentRecord.wasabiKey
        );

        console.log(`📥 Wasabi download result:`, {
          success: wasabiResult.success,
          dataLength: wasabiResult.data?.length || 0,
          error: wasabiResult.error
        });

        if (!wasabiResult.success) {
          console.log(`❌ Wasabi download failed: ${wasabiResult.error}`);
          throw new Error('Failed to download from Wasabi storage: ' + wasabiResult.error);
        }

        console.log('✅ File downloaded from Wasabi successfully');

        // Set response headers using Document collection data
        res.setHeader('Content-Type', documentRecord.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName}"`);
        res.setHeader('Content-Length', wasabiResult.data.length);
        res.setHeader('Cache-Control', 'no-cache');

        console.log('📤 Sending file to client...');
        
        // Send file
        res.send(wasabiResult.data);
        
        console.log('✅ Study report download completed successfully');

      } catch (wasabiError) {
        console.error('❌ Wasabi download error:', wasabiError);
        return res.status(500).json({
          success: false,
          message: 'Failed to download file from storage',
          error: wasabiError.message
        });
      }

    } else {
      // 🔧 FALLBACK: Try legacy storage if no Wasabi info
      console.log('🗄️ No Wasabi info found, checking for legacy storage...');
      
      if (documentRecord.fileData) {
        console.log('📁 Found legacy file data, downloading from MongoDB...');
        
        try {
          // Convert base64 back to buffer
          const fileBuffer = Buffer.from(documentRecord.fileData, 'base64');

          // Set response headers
          res.setHeader('Content-Type', documentRecord.contentType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName}"`);
          res.setHeader('Content-Length', fileBuffer.length);
          res.setHeader('Cache-Control', 'no-cache');

          console.log('📤 Sending legacy file to client...');
          
          // Send file
          res.send(fileBuffer);
          
          console.log('✅ Study report download from legacy storage completed successfully');

        } catch (legacyError) {
          console.error('❌ Legacy storage download error:', legacyError);
          return res.status(500).json({
            success: false,
            message: 'Failed to download file from legacy storage',
            error: legacyError.message
          });
        }

      } else {
        console.log('❌ No file data found in any storage');
        console.log(`📋 Document storage info:`, {
          hasWasabiKey: !!documentRecord.wasabiKey,
          hasWasabiBucket: !!documentRecord.wasabiBucket,
          hasFileData: !!documentRecord.fileData,
          isActive: documentRecord.isActive
        });
        
        return res.status(404).json({
          success: false,
          message: 'Document file not found in any storage system',
          details: {
            documentId: reportId,
            hasWasabiKey: !!documentRecord.wasabiKey,
            hasWasabiBucket: !!documentRecord.wasabiBucket,
            hasFileData: !!documentRecord.fileData,
            isActive: documentRecord.isActive
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ Error downloading study report:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Make sure we always send a response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to download study report',
        error: error.message
      });
    }
  }
};

export default {
  getPatientDetailedView,
  updatePatientDetails,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  getDocumentDownloadUrl, // 🔧 NEW
  getPatientDocuments, // 🔧 NEW
  updateStudyStatus,
  getAllPatients,
  bulkUpdateStudies,
  downloadStudyReport // 🔧 NEW
};