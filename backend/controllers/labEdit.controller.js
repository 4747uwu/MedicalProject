import Patient from '../models/patientModel.js'; // Assuming you have Patient.model.js created
import fs from 'fs';
import path from 'path';

export const updatePatientDetails = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { referralInfo, clinicalInfo } = req.body;

    // Find patient
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Update clinical information
    if (clinicalInfo) {
      patient.clinicalInfo = {
        ...patient.clinicalInfo,
        ...clinicalInfo,
        lastModifiedBy: req.user.id,
        lastModifiedAt: new Date()
      };
    }

    // Update referral info
    if (referralInfo !== undefined) {
      patient.referralInfo = referralInfo;
    }

    await patient.save();

    res.json({
      success: true,
      message: 'Patient details updated successfully',
      data: patient
    });

  } catch (error) {
    console.error('Error updating patient details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update patient details',
      error: error.message
    });
  }
};

export const uploadPatientDocument = async (req, res) => {
  try {
    const { patientId, type } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Find patient
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Create document object
    const newDocument = {
      fileName: req.file.originalname,
      fileType: type || 'Clinical',
      filePath: req.file.path,
      fileSize: req.file.size,
      uploadedBy: req.user.id,
      uploadDate: new Date()
    };

    // Add to patient documents
    if (!patient.documents) {
      patient.documents = [];
    }
    patient.documents.push(newDocument);

    await patient.save();

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: newDocument
    });

  } catch (error) {
    console.error('Error uploading document:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
};

export const deletePatientDocument = async (req, res) => {
  try {
    const { patientId, documentIndex } = req.params;

    // Find patient
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Check if document exists
    if (!patient.documents || !patient.documents[documentIndex]) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Get file path for deletion
    const documentToDelete = patient.documents[documentIndex];
    const filePath = documentToDelete.filePath;

    // Remove document from array
    patient.documents.splice(documentIndex, 1);
    await patient.save();

    // Delete physical file
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
};