import express from 'express';
import DocumentController from '../controllers/document.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';

const router = express.Router();

// Configure multer for memory storage (files will be in req.file as buffer)
const upload = multer({ storage: multer.memoryStorage() });

// Generate patient report
router.get('/patient-report/:studyId', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'),
  DocumentController.generatePatientReport
);

// Generate lab report
router.get('/lab-report/:labId', 
  protect, 
  authorize('admin', 'doctor_account'),
  DocumentController.generateLabReport
);

// Get study reports list
router.get('/study/:studyId/reports', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'),
  DocumentController.getStudyReports
);

// Download specific report
router.get('/study/:studyId/reports/:reportIndex/download', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'),
  DocumentController.getStudyReport
);

// Delete specific report
router.delete('/study/:studyId/reports/:reportIndex', 
  protect, 
  authorize('admin'),
  DocumentController.deleteStudyReport
);

// Get available templates
router.get('/templates', 
  protect, 
  authorize('admin'),
  DocumentController.getAvailableTemplates
);

// Upload report for study
router.post('/study/:studyId/upload', 
  protect,
  authorize('admin', 'doctor_account'),
  upload.single('report'),
  DocumentController.uploadStudyReport
);

export default router;