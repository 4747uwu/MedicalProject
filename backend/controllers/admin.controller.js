import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import transporter from '../config/nodemailer.js';
import DicomStudy from '../models/dicomStudyModel.js'; 
import Patient from '../models/patientModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js'; 


const generateRandomPassword = () => {
  // Generate a random 6-digit number
  const min = 100000; // Minimum 6-digit number
  const max = 999999; // Maximum 6-digit number
  const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
  return randomNumber.toString();
};

// Helper function to send welcome email with password
const sendWelcomeEmail = async (email, fullName, username, password, role) => {
  try {
    // Determine email content based on role
    let subject, text, html;
    
    if (role === 'lab_staff') {
      subject = 'Welcome to Medical Platform - Lab Staff Account Created';
      text = `Hello ${fullName},\n\nYour lab staff account has been created successfully.\n\nUsername: ${username}\nTemporary Password: ${password}\n\nPlease login and change your password as soon as possible.\n\nRegards,\nMedical Platform Team`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Welcome to Medical Platform</h2>
          <p>Hello ${fullName},</p>
          <p>Your lab staff account has been created successfully.</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <p>Please login and change your password as soon as possible.</p>
          <p>Regards,<br>Medical Platform Team</p>
        </div>
      `;
    } else if (role === 'doctor_account') {
      subject = 'Welcome to Medical Platform - Doctor Account Created';
      text = `Hello Dr. ${fullName},\n\nYour doctor account has been created successfully.\n\nUsername: ${username}\nTemporary Password: ${password}\n\nPlease login and change your password as soon as possible.\n\nRegards,\nMedical Platform Team`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Welcome to Medical Platform</h2>
          <p>Hello Dr. ${fullName},</p>
          <p>Your doctor account has been created successfully.</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <p>Please login and change your password as soon as possible.</p>
          <p>Regards,<br>Medical Platform Team</p>
        </div>
      `;
    }

    // Send the email
    await transporter.sendMail({
      from: '"Medical Platform" <no-reply@medicalplatform.com>',
      to: email,
      subject,
      text,
      html
    });
    
    console.log(`Welcome email sent to ${email} successfully`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

export const registerLabAndStaff = async (req, res) => {
    const {
        labName, labIdentifier, contactPerson, contactEmail, contactPhone, address, labNotes, labIsActive,
        staffUsername, staffEmail, staffFullName
    } = req.body;

    // --- Lab Validation ---
    if (!labName || !labIdentifier) {
        return res.status(400).json({ success: false, message: 'Laboratory name and identifier are required.' });
    }
    if (!staffUsername || !staffEmail || !staffFullName) {
        return res.status(400).json({ success: false, message: 'Staff username, email, and full name are required.' });
    }

    // Generate random password
    const staffPassword = generateRandomPassword();

    let newLabDocument;
    try {
        const labExists = await Lab.findOne({ $or: [{ name: labName }, { identifier: labIdentifier }] });
        if (labExists) {
            return res.status(400).json({ success: false, message: 'Laboratory with this name or identifier already exists.' });
        }
        let staffUserExists = await User.findOne({ $or: [{ email: staffEmail }, { username: staffUsername }] });
        if (staffUserExists) {
            return res.status(400).json({ success: false, message: 'A user with the provided staff email or username already exists.' });
        }

        const labData = {
            name: labName, identifier: labIdentifier, contactPerson, contactEmail,
            contactPhone, address, notes: labNotes,
            isActive: labIsActive !== undefined ? labIsActive : true,
        };
        newLabDocument = await Lab.create(labData);

        const staffUser = await User.create({
            username: staffUsername, email: staffEmail, password: staffPassword,
            fullName: staffFullName, role: 'lab_staff', lab: newLabDocument._id
        });

        const staffUserResponse = staffUser.toObject();
        delete staffUserResponse.password;

        // Send welcome email to lab staff
        await sendWelcomeEmail(staffEmail, staffFullName, staffUsername, staffPassword, 'lab_staff');

        res.status(201).json({
            success: true,
            message: 'Laboratory and initial lab staff user registered successfully. A welcome email with login credentials has been sent.',
            data: { lab: newLabDocument.toObject(), staffUser: staffUserResponse }
        });
    } catch (error) {
        console.error('Error registering lab and staff:', error);
        if (newLabDocument && newLabDocument._id && error.name !== 'StaffCreationFailedSimultaneously') {
            const staffUserProbablyNotCreated = await User.findOne({ lab: newLabDocument._id }); // Check if staff user related to lab was created
            if (!staffUserProbablyNotCreated || (staffUserProbablyNotCreated && staffUserProbablyNotCreated.lab.toString() !== newLabDocument._id.toString())) {
                try { 
                    await Lab.findByIdAndDelete(newLabDocument._id); 
                    console.log(`Rolled back lab: ${newLabDocument.name}`); 
                } catch (rbError) { 
                    console.error('Lab rollback error:', rbError); 
                }
            }
        }
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        res.status(500).json({ success: false, message: 'Server error during lab and staff registration.' });
    }
};

export const registerDoctor = async (req, res) => {
    const {
        username, email, fullName, // User fields
        specialization, licenseNumber, department, qualifications, yearsOfExperience, contactPhoneOffice, isActiveProfile // Doctor fields
    } = req.body;

    if (!username || !email || !fullName || !specialization || !licenseNumber ) {
        return res.status(400).json({ success: false, message: 'Username, email, fullName, specialization, and licenseNumber are required.' });
    }

    // Generate random password
    const password = generateRandomPassword();

    let userDocument;
    try {
        let userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this email or username already exists.' });
        }
        const doctorWithLicenseExists = await Doctor.findOne({ licenseNumber });
        if (doctorWithLicenseExists) {
             return res.status(400).json({ success: false, message: 'A doctor with this license number already exists.' });
        }

        userDocument = await User.create({
            username, email, password, fullName, role: 'doctor_account'
        });

        const doctorProfileData = {
            userAccount: userDocument._id, specialization, licenseNumber, department,
            qualifications, yearsOfExperience, contactPhoneOffice,
            isActiveProfile: isActiveProfile !== undefined ? isActiveProfile : true
        };
        const doctorProfile = await Doctor.create(doctorProfileData);

        const userResponse = userDocument.toObject();
        delete userResponse.password;

        // Send welcome email to doctor
        await sendWelcomeEmail(email, fullName, username, password, 'doctor_account');

        res.status(201).json({
            success: true,
            message: 'Doctor registered successfully. A welcome email with login credentials has been sent.',
            data: { user: userResponse, doctorProfile: doctorProfile.toObject() }
        });
    } catch (error) {
        console.error('Error registering doctor:', error);
        if (userDocument && userDocument._id && error.name !== 'DoctorProfileCreationFailedSimultaneously') { // If user was created but doctor profile failed
            const doctorProfileProbablyNotCreated = await Doctor.findOne({userAccount: userDocument._id });
            if(!doctorProfileProbablyNotCreated){
                try { 
                    await User.findByIdAndDelete(userDocument._id); 
                    console.log(`Rolled back user: ${userDocument.username}`);
                } catch (rbError) { 
                    console.error('User rollback error:', rbError); 
                }
            }
        }
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        res.status(500).json({ success: false, message: 'Server error during doctor registration.' });
    }
};


export const getAllStudiesForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // Default to 10 studies per page
        const skip = (page - 1) * limit;

        // TODO: Implement advanced filters based on req.query (e.g., patientName, status, dateRange)
        const queryFilters = {}; // Build this object based on req.query

        const studies = await DicomStudy.find(queryFilters)
            .populate({
                path: 'patient',
                // Select all fields from Patient model needed for display or further processing
                select: 'patientID mrn firstName lastName patientNameRaw dateOfBirth gender ageString salutation currentWorkflowStatus attachments activeDicomStudyRef'
            })
            .populate({
                path: 'sourceLab', // This is Lab._id
                select: 'name identifier' // Select lab name for "Location"
            })
            .populate({
                path: 'lastAssignedDoctor', // This is Doctor._id
                select: 'specialization', // Select relevant fields from Doctor model
                populate: { // Nested populate for User details of the doctor
                    path: 'userAccount', // Field in Doctor model linking to User
                    select: 'fullName email' // Get User's name for "ReportedBy"
                }
            })
            .sort({ createdAt: -1 }) // Default sort: newest studies first
            .skip(skip)
            .limit(limit)
            .lean(); // Use .lean() for faster reads if not modifying Mongoose docs

        const totalStudies = await DicomStudy.countDocuments(queryFilters);

        // Prepare data for easier UI consumption based on your screenshot
        const formattedStudies = studies.map(study => {
            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            let patientAgeGenderDisplay = "N/A";

            if (study.patient) {
                patientDisplay = study.patient.patientNameRaw || `${study.patient.firstName || ''} ${study.patient.lastName || ''}`.trim();
                patientIdForDisplay = study.patient.patientID || study.patient.mrn || 'N/A'; // Prefer app ID, fallback to MRN

                let agePart = study.patient.ageString || "";
                let genderPart = study.patient.gender || "";
                if (agePart && genderPart) {
                    patientAgeGenderDisplay = `${agePart} / ${genderPart}`;
                } else if (agePart) {
                    patientAgeGenderDisplay = agePart;
                } else if (genderPart) {
                    patientAgeGenderDisplay = `/ ${genderPart}`;
                }
            }

            let reportedByDisplay = null;
            if (study.lastAssignedDoctor && study.lastAssignedDoctor.userAccount && study.workflowStatus === 'report_finalized') {
                reportedByDisplay = study.lastAssignedDoctor.userAccount.fullName;
            }

            // The frontend will use study.workflowStatus to determine the color of the status dot
            // study.patient.currentWorkflowStatus might also be relevant for a patient-level overview on UI

            return {
                _id: study._id, // DicomStudy._id, useful as a key in React lists
                orthancStudyID: study.orthancStudyID, // Needed for viewer links
                instanceID: study.studyInstanceUID,

                // Fields matching your UI screenshot columns
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay, // Combined for the "Age" column which shows "065Y / M"
                description: study.studyDescription || study.examDescription || 'N/A',
                modality: study.modalitiesInStudy && study.modalitiesInStudy.length > 0 ? study.modalitiesInStudy.join(', ') : 'N/A',
                seriesImages: `${study.numberOfSeries || 0}/${study.numberOfImages || 0}`,
                studyDateTime: study.studyDate && study.studyTime ? `${study.studyDate} ${study.studyTime.substring(0,6)}` : (study.studyDate || 'N/A'), // Format on frontend
                uploadDateTime: study.createdAt, // This is DicomStudy record creation in your DB
                reportedDateTime: study.reportFinalizedAt, // This is when DicomStudy status became 'report_finalized'
                location: study.sourceLab?.name || 'N/A',
                reportedBy: reportedByDisplay,

                lastAssignedDoctor: study.lastAssignedDoctor?._id || study.lastAssignedDoctor,
    
                // ADD THIS LINE - Include the lastAssignmentAt timestamp
                lastAssignmentAt: study.lastAssignmentAt,

                

                // Workflow and other useful data for the row
                workflowStatus: study.workflowStatus, // e.g., 'pending_assignment', 'assigned_to_doctor'
                patientWorkflowStatus: study.patient?.currentWorkflowStatus, // Patient's overall status
                hasPatientAttachments: study.patient?.attachments?.length > 0, // Boolean for UI indication
                // rawPatientData: study.patient, // Send if frontend needs more patient details for a modal, etc.
                // rawStudyData: study, // Send if frontend needs more study details
            };
        });

        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalPages: Math.ceil(totalStudies / limit),
            currentPage: page,
            totalRecords: totalStudies,
            data: formattedStudies
        });

    } catch (error) {
        console.error('Error fetching all studies for admin:', error);
        res.status(500).json({ success: false, message: 'Server error fetching studies.' });
    }
};


export const getPatientDetailedView = async (req, res) => {
    console.log('Fetching detailed view for patient:', req.params);
    try {
      const  patientId  = req.params.id;
      console.log('Patient ID:', patientId);
      
      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: 'Patient ID is required'
        });
      }
      
      // Find patient by their patientID (uppercase "ID" matches your model field)
      const patient = await Patient.findOne({ patientID: patientId });
      
      if (!patient) {
        return res.status(404).json({
          success: false,
          message: 'Patient not found'
        });
      }
      
      // Get all studies for this patient
      // Note: Based on getAllStudiesForAdmin, it looks like studies reference patient by _id
      const studies = await DicomStudy.find({ patient: patient._id })
        .populate({
          path: 'lastAssignedDoctor', // Changed from assignedDoctor to lastAssignedDoctor based on your model
          select: 'userAccount specialization licenseNumber',
          populate: {
            path: 'userAccount',
            select: 'fullName email'
          }
        })
        .populate('sourceLab', 'name identifier contactPerson contactEmail'); // Changed from lab to sourceLab
      
      // Get latest study (most recent one)
      const latestStudy = studies.length > 0 ? 
        studies.sort((a, b) => {
          // Use studyDate if available, otherwise fall back to createdAt
          const dateA = a.studyDate ? new Date(a.studyDate) : new Date(a.createdAt);
          const dateB = b.studyDate ? new Date(b.studyDate) : new Date(b.createdAt);
          return dateB - dateA;
        })[0] : null;
      
      // Construct full name from firstName and lastName, or use patientNameRaw
      const fullName = patient.patientNameRaw || 
                      `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 
                      'N/A';
      
      // Extract clinical information from patient record
      // These will come from patient.medicalHistory if it exists, otherwise empty strings
      const clinicalInfo = {
        clinicalHistory: patient.medicalHistory?.clinicalHistory || '',
        previousInjury: patient.medicalHistory?.previousInjury || '',
        previousSurgery: patient.medicalHistory?.previousSurgery || ''
      };
      
      // Get study visit information
      const visitInfo = latestStudy ? {
        examType: latestStudy.examType || latestStudy.modalitiesInStudy?.join(', ') || 'N/A',
        examDescription: latestStudy.examDescription || latestStudy.studyDescription || 'N/A',
        caseType: latestStudy.caseType || 'ROUTINE', // Default to ROUTINE if not specified
        studyStatus: latestStudy.workflowStatus || 'pending', // Use workflowStatus instead of status
        referringPhysician: latestStudy.referringPhysicianName || 'N/A',
        center: latestStudy.sourceLab ? latestStudy.sourceLab.name : 'N/A',
        orderDate: latestStudy.createdAt, // Use createdAt as orderDate
        studyDate: latestStudy.studyDate,
        reportDate: latestStudy.reportFinalizedAt // Use reportFinalizedAt as reportDate
      } : null;
      
      // Get documents related to patient
      // Use patient.attachments if they exist, otherwise empty array
      const documents = patient.attachments?.map(doc => ({
        fileName: doc.fileName || 'Unnamed Document',
        fileUrl: doc.storageIdentifier || '#',
        documentType: doc.fileTypeOrCategory || 'other',
        uploadDate: doc.uploadedAt || new Date()
      })) || [];
      
      // Compile all information
      const patientDetails = {
        patientInfo: {
          patientId: patient.patientID || patient.mrn || 'N/A',
          fullName: fullName,
          gender: patient.gender || 'N/A',
          age: patient.ageString || 'N/A',
          dateOfBirth: patient.dateOfBirth || 'N/A',
          contactPhone: patient.contactInformation?.phone || 'N/A',
          contactEmail: patient.contactInformation?.email || 'N/A'
        },
        studyInfo: latestStudy ? {
          studyId: latestStudy.studyInstanceUID || latestStudy._id.toString(),
          accessionNumber: latestStudy.accessionNumber || 'N/A',
          studyDate: latestStudy.studyDate,
          modality: latestStudy.modalitiesInStudy?.join(', ') || 'N/A',
          status: latestStudy.workflowStatus || 'pending',
          images: latestStudy.images || latestStudy.instances?.map(instance => ({
            url: instance.imageUrl || '#',
            description: instance.description || ''
          })) || []
        } : null,
        clinicalInfo,
        visitInfo,
        documents,
        allStudies: studies.map(study => ({
          studyId: study.studyInstanceUID || study._id.toString(),
          studyDate: study.studyDate,
          modality: study.modalitiesInStudy?.join(', ') || 'N/A',
          status: study.workflowStatus || 'pending',
          accessionNumber: study.accessionNumber || 'N/A'
        }))
      };
      
      res.status(200).json({
        success: true,
        data: patientDetails
      });
      
    } catch (error) {
      console.error('Error fetching patient detailed view:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching patient details',
        error: error.message
      });
    }
  };


export const getAllDoctors = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const searchTerm = req.query.search || '';
      const specialization = req.query.specialization || '';
      const status = req.query.status || '';
      
      // Build filter object
      const filter = {};
      
      // Add filters based on query parameters
      if (specialization) {
        filter.specialization = specialization;
      }
      
      if (status !== '') {
        filter.isActiveProfile = status === 'active';
      }
      
      // Search implementation
      let userSearchQuery = {};
      if (searchTerm) {
        userSearchQuery = { 
          $or: [
            { fullName: { $regex: searchTerm, $options: 'i' } },
            { email: { $regex: searchTerm, $options: 'i' } },
            { username: { $regex: searchTerm, $options: 'i' } }
          ]
        };
      }
      
      // Get doctors with populated user accounts - ADD isLoggedIn to select
      let doctorQuery = Doctor.find(filter)
        .populate({
          path: 'userAccount',
          select: 'fullName email username isActive isLoggedIn', // Added isLoggedIn here
          match: userSearchQuery
        })
        .sort({ 'updatedAt': -1 })
        .skip(skip)
        .limit(limit);
        
      const doctors = await doctorQuery;
      
      // Filter out doctors whose userAccount didn't match the search
      const filteredDoctors = doctors.filter(doctor => doctor.userAccount);
      
      // Get total count for pagination
      const totalDoctors = await Doctor.countDocuments(filter);
      
      // Get unique specializations for filter dropdown
      const specializations = await Doctor.distinct('specialization');
      
      res.status(200).json({
        success: true,
        count: filteredDoctors.length,
        totalPages: Math.ceil(totalDoctors / limit),
        currentPage: page,
        totalRecords: totalDoctors,
        specializations,
        doctors: filteredDoctors.map(doctor => ({
          _id: doctor._id, // Use _id instead of id for consistency
          userId: doctor.userAccount._id,
          fullName: doctor.userAccount.fullName,
          email: doctor.userAccount.email,
          username: doctor.userAccount.username,
          specialization: doctor.specialization,
          licenseNumber: doctor.licenseNumber,
          department: doctor.department || 'N/A',
          experience: doctor.yearsOfExperience ? `${doctor.yearsOfExperience} years` : 'N/A',
          qualifications: doctor.qualifications?.join(', ') || 'N/A',
          contactPhone: doctor.contactPhoneOffice || 'N/A',
          isActive: doctor.isActiveProfile && doctor.userAccount.isActive,
          isLoggedIn: doctor.userAccount.isLoggedIn, // Add this line
          createdAt: doctor.createdAt,
          updatedAt: doctor.updatedAt
        }))
      });
      
    } catch (error) {
      console.error('Error fetching doctors:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching doctors',
        error: error.message
      });
    }
  };


  
  /**
   * Admin controller to assign doctors to studies
   */
  export const assignDoctorToStudy = async (req, res) => {
    console.log('Assigning doctor to study:', req.params, req.body);
    try {
        const { studyId } = req.params;
        const { doctorId, assignmentNote, priority = 'routine' } = req.body;
        
        if (!studyId || !doctorId) {
            return res.status(400).json({
                success: false,
                message: 'Both study ID and doctor ID are required'
            });
        }
        
        // Verify the study exists
        const study = await DicomStudy.findById(studyId);
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Verify the doctor exists and is active
        const doctor = await Doctor.findById(doctorId).populate('userAccount', 'fullName isActive');
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }
        
        // Check if doctor is active
        if (!doctor.isActiveProfile || !doctor.userAccount.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Cannot assign study to inactive doctor'
            });
        }
        
        // Check if study is already assigned to this doctor
        const isAlreadyAssigned = doctor.assignedStudies.some(
            assignment => assignment.study.toString() === studyId
        );
        
        if (isAlreadyAssigned) {
            return res.status(400).json({
                success: false,
                message: 'Study is already assigned to this doctor'
            });
        }
        
        // Add study to doctor's assignedStudies array
        doctor.assignedStudies.push({
            study: studyId,
            patient: study.patient, // Assuming study has patient reference
            assignedDate: new Date(),
            status: 'assigned'
        });
        
        await doctor.save();
        
        // Update study's workflow status
        study.workflowStatus = 'assigned_to_doctor';
        study.lastAssignedDoctor = doctorId;
        study.lastAssignmentAt = new Date();
        
        await study.save();
        
        // Update patient's workflow status if needed
        const patient = await Patient.findById(study.patient);
        if (patient) {
            patient.currentWorkflowStatus = 'assigned_to_doctor';
            await patient.save();
        }
        
        res.status(200).json({
            success: true,
            message: `Study successfully assigned to Dr. ${doctor.userAccount.fullName}`,
            data: {
                study: {
                    id: studyId,
                    description: study.studyDescription || study.examDescription || 'Medical study',
                    status: 'assigned_to_doctor'
                },
                doctor: {
                    id: doctorId,
                    name: doctor.userAccount.fullName,
                    specialization: doctor.specialization
                },
                assignment: {
                    date: new Date(),
                    status: 'assigned'
                }
            }
        });
        
    } catch (error) {
        console.error('Error assigning doctor to study:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Server error while assigning doctor',
            error: error.message
        });
    }
};

export const getDoctorById = async (req, res) => {
    try {
        const { doctorId } = req.params;
        
        const doctor = await Doctor.findById(doctorId)
            .populate({
                path: 'userAccount',
                select: 'fullName email username isActive isLoggedIn'
            });
            
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }
        
        if (!doctor.userAccount) {
            return res.status(404).json({
                success: false,
                message: 'Doctor user account not found'
            });
        }
        
        res.status(200).json({
            success: true,
            doctor: {
                _id: doctor._id,
                userId: doctor.userAccount._id,
                fullName: doctor.userAccount.fullName,
                email: doctor.userAccount.email,
                username: doctor.userAccount.username,
                specialization: doctor.specialization,
                licenseNumber: doctor.licenseNumber,
                department: doctor.department || 'N/A',
                experience: doctor.yearsOfExperience || 'N/A',
                yearsOfExperience: doctor.yearsOfExperience || 0,
                qualifications: doctor.qualifications?.join(', ') || 'N/A',
                contactPhone: doctor.contactPhoneOffice || 'N/A',
                isActive: doctor.isActiveProfile && doctor.userAccount.isActive,
                isLoggedIn: doctor.userAccount.isLoggedIn, 
                createdAt: doctor.createdAt,
                updatedAt: doctor.updatedAt
            }
        });
        
    } catch (error) {
        console.error('Error fetching doctor by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctor details',
            error: error.message
        });
    }
};


