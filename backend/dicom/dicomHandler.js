import Patient from '../models/patientModel.js';
import User from '../models/userModel.js';
import DicomStudy from '../models/dicomStudyModel.js'; // Add this import
import fs from 'fs';
import path from 'path';
import multer from 'multer';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and documents are allowed.'), false);
    }
  }
}).single('file');

export const updatePatientDetails = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const updateData = req.body;

    console.log('=== UPDATE PATIENT DETAILS ===');
    console.log('Patient ID:', patientId);
    console.log('Update Data:', JSON.stringify(updateData, null, 2));
    console.log('User:', req.user?.fullName, 'ID:', req.user?._id);

    // Find patient by patientID field
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      console.log('❌ Patient not found with patientID:', patientId);
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    console.log('✅ Found patient:', patient._id, 'with patientID:', patient.patientID);

    // Build update object step by step
    const updateFields = {};

    // Basic patient information
    if (updateData.patientInfo) {
      console.log('📝 Processing patient info updates...');
      
      Object.keys(updateData.patientInfo).forEach(key => {
        const value = updateData.patientInfo[key];
        console.log(`  - ${key}: "${value}"`);
        
        switch(key) {
          case 'firstName':
            if (value !== undefined) updateFields.firstName = value;
            break;
          case 'lastName':
            if (value !== undefined) updateFields.lastName = value;
            break;
          case 'age':
            if (value !== undefined) updateFields.ageString = value;
            break;
          case 'gender':
            if (value !== undefined) updateFields.gender = value;
            break;
          case 'dateOfBirth':
            if (value !== undefined) updateFields.dateOfBirth = value;
            break;
          case 'salutation':
            if (value !== undefined) updateFields.salutation = value;
            break;
          case 'address':
            if (value !== undefined) updateFields.address = value;
            break;
          case 'contactNumber':
          case 'email':
            // Handle contact info separately below
            break;
        }
      });

      // Handle contact information
      if (updateData.patientInfo.contactNumber !== undefined || updateData.patientInfo.email !== undefined) {
        updateFields.contactInformation = {
          phone: updateData.patientInfo.contactNumber || patient.contactInformation?.phone || '',
          email: updateData.patientInfo.email || patient.contactInformation?.email || ''
        };
        console.log('📞 Contact info update:', updateFields.contactInformation);
      }
    }

    // Clinical information
    if (updateData.clinicalInfo) {
      console.log('🏥 Processing clinical info updates...');
      
      const clinicalUpdate = {
        clinicalHistory: updateData.clinicalInfo.clinicalHistory || '',
        previousInjury: updateData.clinicalInfo.previousInjury || '',
        previousSurgery: updateData.clinicalInfo.previousSurgery || '',
        lastModifiedBy: req.user._id,
        lastModifiedAt: new Date()
      };

      updateFields.clinicalInfo = clinicalUpdate;
      
      // Also update medicalHistory for consistency
      updateFields.medicalHistory = {
        clinicalHistory: updateData.clinicalInfo.clinicalHistory || '',
        previousInjury: updateData.clinicalInfo.previousInjury || '',
        previousSurgery: updateData.clinicalInfo.previousSurgery || ''
      };
      
      console.log('Clinical update:', clinicalUpdate);
    }

    // Referral information
    if (updateData.referralInfo !== undefined) {
      updateFields.referralInfo = updateData.referralInfo;
      console.log('📋 Referral info update:', updateData.referralInfo);
    }

    // Physician information
    if (updateData.physicianInfo) {
      console.log('👨‍⚕️ Processing physician info updates...');
      
      updateFields.physicianInfo = {
        referringPhysician: updateData.physicianInfo.referringPhysician || false,
        referringPhysicianInfo: updateData.physicianInfo.referringPhysicianInfo || '',
        requestingPhysician: updateData.physicianInfo.requestingPhysician || '',
        email: updateData.physicianInfo.email || '',
        mobile: updateData.physicianInfo.mobile || '',
        technologistName: updateData.physicianInfo.technologistName || '',
        technologistMobile: updateData.physicianInfo.technologistMobile || ''
      };
      
      console.log('Physician update:', updateFields.physicianInfo);
    }

    console.log('🔄 Final update fields:', JSON.stringify(updateFields, null, 2));

    // Perform the update
    let updatedPatient = null;
    if (Object.keys(updateFields).length > 0) {
      console.log('💾 Executing database update...');
      
      updatedPatient = await Patient.findOneAndUpdate(
        { patientID: patientId },
        { $set: updateFields },
        { 
          new: true,
          runValidators: true,
          upsert: false
        }
      ).populate('clinicalInfo.lastModifiedBy', 'fullName email');

      if (updatedPatient) {
        console.log('✅ Patient updated successfully');
      } else {
        console.log('❌ Patient update failed - no document returned');
      }
    } else {
      console.log('ℹ️ No fields to update, fetching existing patient...');
      updatedPatient = await Patient.findOne({ patientID: patientId })
        .populate('clinicalInfo.lastModifiedBy', 'fullName email');
    }

    // Update related study if needed
    if (updateData.clinicalInfo || updateData.studyInfo) {
      console.log('🔄 Updating related study information...');
      
      try {
        let studyQuery = { patient: patient._id };
        
        if (req.user.role === 'lab_staff' && req.user.lab) {
          studyQuery.sourceLab = req.user.lab._id;
        }

        const study = await DicomStudy.findOne(studyQuery).sort({ createdAt: -1 });
        
        if (study) {
          const studyUpdateFields = {};
          
          if (updateData.clinicalInfo?.clinicalHistory !== undefined) {
            studyUpdateFields.clinicalHistory = updateData.clinicalInfo.clinicalHistory;
          }
          if (updateData.clinicalInfo?.previousInjury !== undefined) {
            studyUpdateFields.previousInjuryInfo = updateData.clinicalInfo.previousInjury;
          }
          if (updateData.clinicalInfo?.previousSurgery !== undefined) {
            studyUpdateFields.previousSurgeryInfo = updateData.clinicalInfo.previousSurgery;
          }
          if (updateData.studyInfo?.workflowStatus) {
            studyUpdateFields.workflowStatus = updateData.studyInfo.workflowStatus;
          }
          if (updateData.studyInfo?.caseType) {
            studyUpdateFields.caseType = updateData.studyInfo.caseType;
          }

          if (Object.keys(studyUpdateFields).length > 0) {
            await DicomStudy.findByIdAndUpdate(
              study._id,
              { $set: studyUpdateFields },
              { new: true, runValidators: true }
            );
            console.log('✅ Study updated successfully');
          }
        } else {
          console.log('ℹ️ No study found to update');
        }
      } catch (studyError) {
        console.error('❌ Error updating study:', studyError);
        // Don't fail the main update if study update fails
      }
    }

    // Prepare response
    const responseData = {
      patientInfo: {
        patientID: updatedPatient.patientID,
        firstName: updatedPatient.firstName || '',
        lastName: updatedPatient.lastName || '',
        age: updatedPatient.ageString || '',
        gender: updatedPatient.gender || '',
        dateOfBirth: updatedPatient.dateOfBirth || '',
        contactNumber: updatedPatient.contactInformation?.phone || '',
        email: updatedPatient.contactInformation?.email || '',
        address: updatedPatient.address || '',
        salutation: updatedPatient.salutation || ''
      },
      clinicalInfo: updatedPatient.clinicalInfo || {},
      medicalHistory: updatedPatient.medicalHistory || {},
      referralInfo: updatedPatient.referralInfo || '',
      physicianInfo: updatedPatient.physicianInfo || {}
    };

    console.log('📤 Sending response:', JSON.stringify(responseData, null, 2));
    console.log('=== UPDATE COMPLETE ===');

    res.json({
      success: true,
      message: 'Patient information updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error updating patient info:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to update patient information',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Keep your other functions (uploadPatientDocument, deletePatientDocument, etc.) as they are
// but fix the patientId references to use patientID

export const uploadPatientDocument = async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      const { patientId, type = 'Clinical' } = req.body;

      // Find patient - FIXED: use patientID instead of patientId
      const patient = await Patient.findOne({ patientID: patientId });
      if (!patient) {
        return res.status(404).json({
          success: false,
          message: 'Patient not found'
        });
      }

      // Create document object
      const document = {
        fileName: req.file.originalname,
        fileType: type,
        filePath: `uploads/documents/${req.file.originalname}`,
        fileSize: req.file.size,
        uploadedBy: req.user._id, // FIXED: use _id instead of id
        uploadDate: new Date()
      };

      // Add document to patient
      if (!patient.documents) {
        patient.documents = [];
      }
      
      patient.documents.push(document);

      // Also create an attachment entry
      const attachment = {
        fileName: req.file.originalname,
        fileTypeOrCategory: type,
        storageIdentifier: req.file.buffer.toString('base64'),
        uploadedAt: new Date(),
        uploadedBy: req.user._id // FIXED: use _id instead of id
      };

      if (!patient.attachments) {
        patient.attachments = [];
      }
      
      patient.attachments.push(attachment);
      await patient.save();

      res.json({
        success: true,
        message: 'Document uploaded successfully',
        data: {
          fileName: document.fileName,
          fileType: document.fileType,
          uploadedAt: document.uploadDate,
          uploadedBy: req.user.fullName || req.user.email,
          size: document.fileSize
        }
      });
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const deletePatientDocument = async (req, res) => {
  try {
    const { patientId, documentIndex } = req.params;

    // Find patient - FIXED: use patientID instead of patientId
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const index = parseInt(documentIndex);

    // Remove from attachments if exists
    if (patient.attachments && patient.attachments[index]) {
      patient.attachments.splice(index, 1);
    }

    // Remove from documents if exists
    if (patient.documents && patient.documents[index]) {
      patient.documents.splice(index, 1);
    }

    await patient.save();

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document'
    });
  }
};

export const downloadPatientDocument = async (req, res) => {
  try {
    const { patientId, documentIndex } = req.params;

    // Find patient - FIXED: use patientID instead of patientId
    const patient = await Patient.findOne({ patientID: patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Try to get document from attachments first (with base64 data)
    if (patient.attachments && patient.attachments[documentIndex]) {
      const attachment = patient.attachments[documentIndex];
      
      // Convert base64 back to buffer
      const buffer = Buffer.from(attachment.storageIdentifier, 'base64');
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
      res.setHeader('Content-Length', buffer.length);
      
      return res.send(buffer);
    }

    // Fallback to documents array
    if (patient.documents && patient.documents[documentIndex]) {
      const document = patient.documents[documentIndex];
      
      return res.status(404).json({
        success: false,
        message: 'Document file not found on server'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Document not found'
    });

  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document'
    });
  }
};