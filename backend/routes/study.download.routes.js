import express from 'express';
import axios from 'axios';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Orthanc configuration
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// Download complete study as ZIP
router.get('/study/:orthancStudyId/download', protect, authorize('admin', 'lab_staff', 'doctor_account'), async (req, res) => {
  try {
    const { orthancStudyId } = req.params;
    
    console.log(`Downloading study: ${orthancStudyId}`);
    
    // Get study metadata for filename
    const metadataResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}`, {
      headers: { 'Authorization': orthancAuth }
    });
    
    const studyMetadata = metadataResponse.data;
    const patientName = studyMetadata.PatientMainDicomTags?.PatientName || 'Unknown';
    const patientId = studyMetadata.PatientMainDicomTags?.PatientID || 'Unknown';
    const studyDate = studyMetadata.MainDicomTags?.StudyDate || '';
    
    // Download the study archive
    const downloadResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}/archive`, {
      headers: { 'Authorization': orthancAuth },
      responseType: 'stream'
    });
    
    // Set headers for file download
    const filename = `Study_${patientName.replace(/[^a-zA-Z0-9]/g, '_')}_${patientId}_${studyDate}_${orthancStudyId}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    
    // 🔧 FIX: Only set Content-Length if it exists and is valid
    const contentLength = downloadResponse.headers['content-length'];
    if (contentLength && contentLength !== 'undefined') {
      res.setHeader('Content-Length', contentLength);
    }
    
    // Log response headers for debugging
    console.log('Download response headers:', downloadResponse.headers);
    console.log('Content-Length value:', contentLength);
    
    // Pipe the stream directly to response
    downloadResponse.data.pipe(res);
    
  } catch (error) {
    console.error('Error downloading study:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download study',
      error: error.message
    });
  }
});

export default router;