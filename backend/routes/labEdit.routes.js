import express from 'express';
import { 
  updatePatientDetails,
  // uploadPatientDocument, 
  // downloadPatientDocument,
  
} from '../controllers/labEdit.controller.js'; // Changed from lab.controller.js to labEdit.controller.js
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Only image and document files are allowed');
    }
  }
});

// All routes require authentication and lab_staff role
router.use(protect);
router.use(authorize('lab_staff'));

// Update patient details (lab staff only)
router.put('/patients/:patientId', updatePatientDetails);

// Upload document for patient (with file upload middleware)
// router.post('/patients/:patientId/documents', upload.single('file'), uploadPatientDocument);

// // Download patient document
// router.get('/patients/:patientId/documents/:documentIndex/download', downloadPatientDocument);

// Delete patient document
// router.delete('/patients/:patientId/documents/:documentIndex', deletePatientDocument);

export default router;