// // routes/admin.routes.js
// import express from 'express';
// import {
//     registerLabAndStaff,
//     registerDoctor,
//     getAllStudiesForAdmin,
//     getPatientDetailedView,
//     getAllDoctors,
//     assignDoctorToStudy
// } from '../controllers/admin.controller.js';
// import { isAdmin } from '../middleware/adminMiddleware.js'; // Adjust path if your middleware is elsewhere

// const router = express.Router();

// // Apply isAdmin middleware to all routes in this file
// router.use(isAdmin);

// router.post('/labs/register',isAdmin, registerLabAndStaff);
// router.post('/doctors/register',isAdmin, registerDoctor);
// router.get('/studies',isAdmin, getAllStudiesForAdmin); 
// router.get('/patients/:id/detailed-view', getPatientDetailedView); // Get detailed view of a patient by ID
// router.get('/doctors',isAdmin, getAllDoctors); // Get all doctors
// router.post('/studies/:studyId/assign',isAdmin, assignDoctorToStudy); // Assign a doctor to a study

// export default router;

import express from 'express';
import {
    registerLabAndStaff,
    registerDoctor,
    getAllStudiesForAdmin,
    getPatientDetailedView,
    getAllDoctors,
    assignDoctorToStudy
} from '../controllers/admin.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Routes that require admin only
router.post('/labs/register', protect, authorize('admin'), registerLabAndStaff);
router.post('/doctors/register', protect, authorize('admin'), registerDoctor);
router.get('/studies', protect, authorize('admin'), getAllStudiesForAdmin); 
router.get('/doctors', protect, authorize('admin'), getAllDoctors); 
router.post('/studies/:studyId/assign', protect, authorize('admin'), assignDoctorToStudy); 

// Route that allows multiple roles (admin, lab_staff, doctor_account)
router.get('/patients/:id/detailed-view', protect, authorize('admin', 'lab_staff', 'doctor_account'), getPatientDetailedView);

export default router;