import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 });

// 🔧 OPTIMIZED: getAssignedStudies (same name, enhanced performance)

export const getAssignedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Cap at 100 for performance
        const skip = (page - 1) * limit;

        // 🔧 PERFORMANCE: Find doctor with lean query for better performance
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        console.log(`🔍 Searching for studies assigned to doctor: ${doctor._id}`);

        // 🔧 PERFORMANCE: Build advanced filters based on req.query
        const queryFilters = {
            // Base filter for doctor's assigned studies
            $or: [
                { lastAssignedDoctor: doctor._id },           // Legacy field
                { 'assignment.assignedTo': doctor._id }       // Modern assignment structure
            ]
        };

        const { 
            search, status, category, modality, labId, 
            startDate, endDate, priority, patientName, dateRange 
        } = req.query;

        // Search filter for patient name, accession number, or patient ID
        if (search) {
            queryFilters.$and = queryFilters.$and || [];
            queryFilters.$and.push({
                $or: [
                    { accessionNumber: { $regex: search, $options: 'i' } },
                    { studyInstanceUID: { $regex: search, $options: 'i' } }
                ]
            });
        }

        // Status-based filtering with optimizations
        if (status) {
            queryFilters.workflowStatus = status;
        } 
        // Allow filtering by category (pending, inprogress, completed)
        else if (category) {
            switch(category) {
                case 'pending':
                    queryFilters.workflowStatus = { $in: ['assigned_to_doctor'] };
                    break;
                case 'inprogress':
                    queryFilters.workflowStatus = { 
                        $in: [
                            'doctor_opened_report',
                            'report_in_progress'
                        ] 
                    };
                    break;
                case 'completed':
                    queryFilters.workflowStatus = { 
                        $in: [
                            'report_finalized',
                            'report_uploaded',
                            'report_downloaded_radiologist',
                            'report_downloaded',
                            'final_report_downloaded'
                        ] 
                    };
                    break;
            }
        }
        
        // Add currentCategory field update logic in aggregation pipeline
        const updateCategoryStage = {
            $addFields: {
                currentCategory: {
                    $cond: [
                        { $eq: ["$workflowStatus", 'assigned_to_doctor'] },
                        'pending',
                        {
                            $cond: [
                                { $in: ["$workflowStatus", [
                                    'doctor_opened_report',
                                    'report_in_progress'
                                ]] },
                                'inprogress',
                                {
                                    $cond: [
                                        { $in: ["$workflowStatus", [
                                            'report_finalized',
                                            'report_uploaded',
                                            'report_downloaded_radiologist',
                                            'report_downloaded',
                                            'final_report_downloaded'
                                        ]] },
                                        'completed',
                                        {
                                            $cond: [
                                                { $eq: ["$workflowStatus", 'archived'] },
                                                'archived',
                                                'unknown'
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        };

        // Rest of filtering code (modality, lab, priority, dates)
        if (modality) {
            queryFilters.$and = queryFilters.$and || [];
            queryFilters.$and.push({
                $or: [
                    { modality: modality },
                    { modalitiesInStudy: { $in: [modality] } }
                ]
            });
        }

        if (labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(labId);
        }

        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        // Date range filter
        if (startDate || endDate) {
            queryFilters.studyDate = {};
            if (startDate) queryFilters.studyDate.$gte = startDate;
            if (endDate) queryFilters.studyDate.$lte = endDate;
        }

        // Date range filter (alternative format)
        if (dateRange) {
            try {
                const range = JSON.parse(dateRange);
                if (range.start || range.end) {
                    queryFilters.studyDate = {};
                    if (range.start) queryFilters.studyDate.$gte = new Date(range.start);
                    if (range.end) queryFilters.studyDate.$lte = new Date(range.end);
                }
            } catch (e) {
                console.warn('Invalid dateRange format:', dateRange);
            }
        }

        // 🔧 PERFORMANCE: Use aggregation pipeline for complex queries with better performance
        const pipeline = [
            { $match: queryFilters },
            
            // Add the currentCategory field calculation
            updateCategoryStage,
            
            // 🔧 OPTIMIZED: Efficient lookups with selected fields only
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patient',
                    pipeline: [
                        {
                            $project: {
                                patientID: 1,
                                mrn: 1,
                                firstName: 1,
                                lastName: 1,
                                patientNameRaw: 1,
                                dateOfBirth: 1,
                                gender: 1,
                                ageString: 1,
                                salutation: 1,
                                currentWorkflowStatus: 1,
                                attachments: 1,
                                activeDicomStudyRef: 1,
                                'contactInformation.phone': 1,
                                'contactInformation.email': 1,
                                'medicalHistory.clinicalHistory': 1,
                                'medicalHistory.previousInjury': 1,
                                'medicalHistory.previousSurgery': 1,
                                'computed.fullName': 1
                            }
                        }
                    ]
                }
            },
            
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'sourceLab',
                    pipeline: [
                        {
                            $project: {
                                name: 1,
                                identifier: 1,
                                contactPerson: 1,
                                contactEmail: 1,
                                contactPhone: 1,
                                address: 1
                            }
                        }
                    ]
                }
            },
            
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'lastAssignedDoctor',
                    foreignField: '_id',
                    as: 'lastAssignedDoctor',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'userAccount',
                                foreignField: '_id',
                                as: 'userAccount',
                                pipeline: [
                                    {
                                        $project: {
                                            fullName: 1,
                                            email: 1,
                                            username: 1,
                                            isActive: 1,
                                            isLoggedIn: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                specialization: 1,
                                licenseNumber: 1,
                                department: 1,
                                qualifications: 1,
                                yearsOfExperience: 1,
                                contactPhoneOffice: 1,
                                isActiveProfile: 1,
                                userAccount: { $arrayElemAt: ['$userAccount', 0] }
                            }
                        }
                    ]
                }
            },
            
            // Alternative assignment lookup (if using assignment.assignedTo structure)
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'assignment.assignedTo',
                    foreignField: '_id',
                    as: 'assignedDoctor',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'userAccount',
                                foreignField: '_id',
                                as: 'userAccount',
                                pipeline: [
                                    {
                                        $project: {
                                            fullName: 1,
                                            email: 1,
                                            username: 1,
                                            isActive: 1,
                                            isLoggedIn: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                specialization: 1,
                                licenseNumber: 1,
                                department: 1,
                                qualifications: 1,
                                yearsOfExperience: 1,
                                contactPhoneOffice: 1,
                                isActiveProfile: 1,
                                userAccount: { $arrayElemAt: ['$userAccount', 0] }
                            }
                        }
                    ]
                }
            },
            
            // Additional patient name search filter (applied after lookup)
            ...(patientName ? [{
                $match: {
                    $or: [
                        { 'patient.patientNameRaw': { $regex: patientName, $options: 'i' } },
                        { 'patient.firstName': { $regex: patientName, $options: 'i' } },
                        { 'patient.lastName': { $regex: patientName, $options: 'i' } },
                        { 'patient.patientID': { $regex: patientName, $options: 'i' } }
                    ]
                }
            }] : []),
            
            // 🔧 PERFORMANCE: Sort by assignment date (newest first) for doctor relevance
            { 
                $sort: { 
                    'assignment.assignedAt': -1,
                    lastAssignmentAt: -1,
                    createdAt: -1 
                } 
            },
            
            // Pagination
            { $skip: skip },
            { $limit: limit }
        ];

        // 🔧 PERFORMANCE: Execute queries in parallel
        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // 🔧 OPTIMIZED: Format studies according to admin specification
        const formattedStudies = studies.map(study => {
            // Get patient data (handle array from lookup)
            const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
            const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
            const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
            const assignedDoctor = Array.isArray(study.assignedDoctor) ? study.assignedDoctor[0] : study.assignedDoctor;
            
            // Use either lastAssignedDoctor or assignedDoctor (fallback)
            const doctorData = lastAssignedDoctor || assignedDoctor;

            // 🔧 PERFORMANCE: Build patient display efficiently
            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            let patientAgeGenderDisplay = "N/A";

            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                               patient.patientNameRaw || 
                               `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || patient.mrn || 'N/A';

                let agePart = patient.ageString || "";
                let genderPart = patient.gender || "";
                if (agePart && genderPart) {
                    patientAgeGenderDisplay = `${agePart} / ${genderPart}`;
                } else if (agePart) {
                    patientAgeGenderDisplay = agePart;
                } else if (genderPart) {
                    patientAgeGenderDisplay = `/ ${genderPart}`;
                }
            }

            // 🔧 PERFORMANCE: Build reported by display
            let reportedByDisplay = null;
            if (doctorData && doctorData.userAccount && study.workflowStatus === 'report_finalized') {
                reportedByDisplay = doctorData.userAccount.fullName;
            }

            return {
                // === Core Identifiers ===
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,

                // === Patient Information ===
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                patientGender: patient?.gender || 'N/A',
                patientDateOfBirth: patient?.dateOfBirth || null,
                patientContactPhone: patient?.contactInformation?.phone || 'N/A',
                patientContactEmail: patient?.contactInformation?.email || 'N/A',
                patientSalutation: patient?.salutation || 'N/A',

                // === Study Basic Information ===
                description: study.studyDescription || study.examDescription || 'N/A',
                modality: study.modalitiesInStudy && study.modalitiesInStudy.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: `${study.numberOfSeries || 0}/${study.numberOfImages || 0}`,
                numberOfSeries: study.numberOfSeries || 0,
                numberOfImages: study.numberOfImages || 0,
                studyDateTime: study.studyDate && study.studyTime ? 
                              `${study.studyDate} ${study.studyTime.substring(0,6)}` : 
                              (study.studyDate || 'N/A'),
                studyDate: study.studyDate || null,
                studyTime: study.studyTime || null,
                uploadDateTime: study.createdAt,
                reportedDateTime: study.reportFinalizedAt,
                location: sourceLab?.name || 'N/A',
                institutionName: study.institutionName || sourceLab?.name || 'N/A',

                // === Clinical Information ===
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || '',
                previousInjuryInfo: study.previousInjuryInfo || patient?.medicalHistory?.previousInjury || '',
                previousSurgeryInfo: study.previousSurgeryInfo || patient?.medicalHistory?.previousSurgery || '',
                referredBy: study.referredBy || 'N/A',
                referralOrUrgencyNotes: study.referralOrUrgencyNotes || '',

                // === Study Details ===
                examType: study.examType || 'N/A',
                caseType: study.caseType || 'ROUTINE',
                procedureCode: study.procedureCode || 'N/A',
                studyAttributeType: study.studyAttributeType || 'N/A',
                studyStatusChangeReason: study.studyStatusChangeReason || '',

                // === Workflow Status ===
                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory, // Include the computed category
                studyStatus: study.studyStatus || study.workflowStatus,
                patientWorkflowStatus: patient?.currentWorkflowStatus,

                // === Assignment Information ===
                lastAssignedDoctor: doctorData?._id || study.lastAssignedDoctor,
                lastAssignmentAt: study.lastAssignmentAt || study.assignment?.assignedAt,
                reportedBy: study.reportedBy || reportedByDisplay,
                assignedDoctorName: doctorData?.userAccount?.fullName || 'Not Assigned',
                assignedDoctorSpecialization: doctorData?.specialization || 'N/A',
                assignedDoctorEmail: doctorData?.userAccount?.email || 'N/A',

                // === Date Information ===
                billedOnStudyDate: study.billedOnStudyDate || null,
                uploadDate: study.uploadDate || study.createdAt,
                assignedDate: study.assignedDate || study.lastAssignmentAt || study.assignment?.assignedAt,
                reportDate: study.reportDate || study.reportFinalizedAt,
                reportStartedAt: study.reportStartedAt || null,
                reportFinalizedAt: study.reportFinalizedAt || null,
                recordModifiedDate: study.recordModifiedDate || null,
                recordModifiedTime: study.recordModifiedTime || null,
                reportTime: study.reportTime || null,

                // === TAT (Turnaround Time) Information ===
                studyToReportTAT: study.studyToReportTAT || study.timingInfo?.studyToReportMinutes || null,
                uploadToReportTAT: study.uploadToReportTAT || study.timingInfo?.uploadToReportMinutes || null,
                assignToReportTAT: study.assignToReportTAT || study.timingInfo?.assignToReportMinutes || null,
                diffStudyAndReportTAT: study.diffStudyAndReportTAT || 
                                      (study.studyToReportTAT ? `${study.studyToReportTAT} Minutes` : 
                                       study.timingInfo?.studyToReportMinutes ? `${study.timingInfo.studyToReportMinutes} Minutes` : 'N/A'),
                diffUploadAndReportTAT: study.diffUploadAndReportTAT || 
                                       (study.uploadToReportTAT ? `${study.uploadToReportTAT} Minutes` : 
                                        study.timingInfo?.uploadToReportMinutes ? `${study.timingInfo.uploadToReportMinutes} Minutes` : 'N/A'),
                diffAssignAndReportTAT: study.diffAssignAndReportTAT || 
                                       (study.assignToReportTAT ? `${study.assignToReportTAT} Minutes` : 
                                        study.timingInfo?.assignToReportMinutes ? `${study.timingInfo.assignToReportMinutes} Minutes` : 'N/A'),

                // === Report Information ===
                ReportAvailable: study.ReportAvailable || false,
                reportStatus: study.reportStatus || 'pending',
                lastReportGenerated: study.lastReportGenerated || null,
                report: study.report || '',
                reportsCount: study.reports?.length || 0,
                uploadedReportsCount: study.uploadedReports?.length || 0,

                // === Lab Information ===
                labName: sourceLab?.name || 'N/A',
                labIdentifier: sourceLab?.identifier || 'N/A',
                labContactPerson: sourceLab?.contactPerson || 'N/A',
                labContactEmail: sourceLab?.contactEmail || 'N/A',
                labContactPhone: sourceLab?.contactPhone || 'N/A',
                labAddress: sourceLab?.address || 'N/A',

                // === Status History ===
                statusHistory: study.statusHistory || [],
                statusHistoryCount: study.statusHistory?.length || 0,

                // === Images and Files ===
                images: study.images || [],
                imagesCount: study.images?.length || 0,
                hasPatientAttachments: patient?.attachments?.length > 0,
                patientAttachmentsCount: patient?.attachments?.length || 0,

                // === Timestamps ===
                createdAt: study.createdAt,
                updatedAt: study.updatedAt,
                archivedAt: study.archivedAt || null,

                // === Additional Data for Advanced Features ===
                modalitiesInStudy: study.modalitiesInStudy || [],
                
                // === Complete Patient Data (for modals/detailed views) ===
                patientData: patient ? {
                    _id: patient._id,
                    patientID: patient.patientID,
                    mrn: patient.mrn,
                    firstName: patient.firstName,
                    lastName: patient.lastName,
                    patientNameRaw: patient.patientNameRaw,
                    dateOfBirth: patient.dateOfBirth,
                    gender: patient.gender,
                    ageString: patient.ageString,
                    salutation: patient.salutation,
                    currentWorkflowStatus: patient.currentWorkflowStatus,
                    contactInformation: patient.contactInformation || {},
                    medicalHistory: patient.medicalHistory || {},
                    attachments: patient.attachments || [],
                    computed: patient.computed || {}
                } : null,

                // === Complete Doctor Data (for modals/detailed views) ===
                doctorData: doctorData ? {
                    _id: doctorData._id,
                    specialization: doctorData.specialization,
                    licenseNumber: doctorData.licenseNumber,
                    department: doctorData.department,
                    qualifications: doctorData.qualifications,
                    yearsOfExperience: doctorData.yearsOfExperience,
                    contactPhoneOffice: doctorData.contactPhoneOffice,
                    isActiveProfile: doctorData.isActiveProfile,
                    userAccount: doctorData.userAccount || {}
                } : null,

                // === Complete Lab Data (for modals/detailed views) ===
                labData: sourceLab ? {
                    _id: sourceLab._id,
                    name: sourceLab.name,
                    identifier: sourceLab.identifier,
                    contactPerson: sourceLab.contactPerson,
                    contactEmail: sourceLab.contactEmail,
                    contactPhone: sourceLab.contactPhone,
                    address: sourceLab.address
                } : null,

                // === Reports Data ===
                reportsData: study.reports || [],
                uploadedReportsData: study.uploadedReports || [],

                // === Assignment Data (if using assignment structure) ===
                assignment: study.assignment || null,
                assignmentPriority: study.assignment?.priority || 'NORMAL',
                assignmentDueDate: study.assignment?.dueDate || null,
                
                // === Computed Fields for Performance ===
                daysSinceUpload: study.computed?.daysSinceUpload || 
                                Math.floor((Date.now() - new Date(study.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
                isOverdue: study.assignment?.dueDate ? new Date() > new Date(study.assignment.dueDate) : false,
                tatStatus: study.computed?.tatStatus || 'ON_TIME',

                // === Doctor-specific Fields ===
                priority: study.assignment?.priority || study.caseType || 'NORMAL',
                isDownloaded: ['report_downloaded_radiologist', 'report_downloaded', 'final_report_downloaded'].includes(study.workflowStatus),
                assignmentDetails: {
                    assignedAt: study.assignment?.assignedAt || study.lastAssignmentAt,
                    priority: study.assignment?.priority || 'NORMAL',
                    dueDate: study.assignment?.dueDate,
                    isOverdue: study.assignment?.dueDate ? new Date() > new Date(study.assignment.dueDate) : false
                }
            };
        });

        // Pre-calculate category counts for the frontend
        const categoryCounts = {
            all: totalStudies,
            pending: 0,
            inprogress: 0,
            completed: 0,
            archived: 0
        };

        // Calculate summary statistics with optimized aggregation that includes category
        const summaryStats = await DicomStudy.aggregate([
            { $match: queryFilters },
            {
                $facet: {
                    // Group by workflow status
                    byStatus: [
                        {
                            $group: {
                                _id: '$workflowStatus',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    // Group by category (doctor-specific categories)
                    byCategory: [
                        {
                            $addFields: {
                                category: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: { $eq: ["$workflowStatus", 'assigned_to_doctor'] },
                                                then: "pending"
                                            },
                                            {
                                                case: { $in: ["$workflowStatus", [
                                                    'doctor_opened_report',
                                                    'report_in_progress'
                                                ]] },
                                                then: "inprogress"
                                            },
                                            {
                                                case: { $in: ["$workflowStatus", [
                                                    'report_finalized',
                                                    'report_uploaded',
                                                    'report_downloaded_radiologist',
                                                    'report_downloaded',
                                                    'final_report_downloaded'
                                                ]] },
                                                then: "completed"
                                            },
                                            {
                                                case: { $eq: ["$workflowStatus", 'archived'] },
                                                then: "archived"
                                            }
                                        ],
                                        default: "unknown"
                                    }
                                }
                            }
                        },
                        {
                            $group: {
                                _id: '$category',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    // Additional doctor-specific stats
                    urgentStudies: [
                        {
                            $match: {
                                'assignment.priority': { $in: ['EMERGENCY', 'STAT', 'URGENT'] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    todayAssigned: [
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        { $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$assignment.assignedAt", "$lastAssignmentAt"] } } },
                                        { $dateToString: { format: "%Y-%m-%d", date: new Date() } }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        // Convert to usable format and populate categoryCounts
        if (summaryStats[0]?.byCategory) {
            summaryStats[0].byCategory.forEach(item => {
                if (categoryCounts.hasOwnProperty(item._id)) {
                    categoryCounts[item._id] = item.count;
                }
            });
        }

        // Add doctor-specific stats
        const urgentStudies = summaryStats[0]?.urgentStudies?.[0]?.count || 0;
        const todayAssigned = summaryStats[0]?.todayAssigned?.[0]?.count || 0;

        const processingTime = Date.now() - startTime;

        console.log(`✅ Returning ${formattedStudies.length} formatted studies for doctor`);

        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalPages: Math.ceil(totalStudies / limit),
            currentPage: page,
            totalRecords: totalStudies,
            data: formattedStudies,
            summary: {
                byStatus: summaryStats[0]?.byStatus.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                byCategory: categoryCounts,
                urgentStudies,
                todayAssigned,
                total: totalStudies
            },
            performance: {
                queryTime: processingTime,
                fromCache: false
            },
            debug: {
                doctorId: doctor._id,
                queryUsed: 'both assignment.assignedTo and lastAssignedDoctor',
                totalFound: formattedStudies.length
            }
        });

    } catch (error) {
        console.error('❌ Error fetching assigned studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching assigned studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🔧 OPTIMIZED: getPatientDetailedViewForDoctor (same name, enhanced performance)
export const getPatientDetailedViewForDoctor = async (req, res) => {
    try {
        const { id: patientId } = req.params;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Parallel queries for better performance
        const [patient, studies] = await Promise.all([
            Patient.findOne({ patientID: patientId }).lean(),
            DicomStudy.find({
                patient: { $exists: true },
                lastAssignedDoctor: doctor._id
            })
            .populate('sourceLab', 'name identifier')
            .sort({ studyDate: -1 })
            .lean()
        ]);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Format studies efficiently
        const formattedStudies = studies.map(study => ({
            _id: study._id,
            studyDateTime: study.studyDate,
            modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : 'N/A',
            description: study.examDescription || study.examType || 'N/A',
            workflowStatus: study.workflowStatus,
            location: study.sourceLab?.name || 'N/A',
            priority: study.caseType || 'ROUTINE',
            assignedAt: study.lastAssignmentAt,
            reportContent: study.reportContent,
            reportFinalizedAt: study.reportFinalizedAt
        }));

        const responseData = {
            patientInfo: {
                patientID: patient.patientID,
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                age: patient.ageString || '',
                gender: patient.gender || '',
                dateOfBirth: patient.dateOfBirth || '',
                contactNumber: patient.contactInformation?.phone || '',
                address: patient.address || ''
            },
            clinicalInfo: patient.clinicalInfo || {},
            referralInfo: patient.referralInfo || '',
            studies: formattedStudies,
            documents: patient.documents || []
        };

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error fetching patient details for doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient details'
        });
    }
};

// 🔧 OPTIMIZED: startReport (same name, enhanced performance)
export const startReport = async (req, res) => {
    try {
        const { studyId } = req.params;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Single query with update
        const study = await DicomStudy.findOneAndUpdate(
            {
                _id: studyId,
                lastAssignedDoctor: doctor._id
            },
            {
                $set: {
                    workflowStatus: 'report_in_progress',
                    reportStartedAt: new Date()
                },
                $push: {
                    statusHistory: {
                        status: 'report_in_progress',
                        changedAt: new Date(),
                        changedBy: req.user._id,
                        note: 'Doctor started working on report'
                    }
                }
            },
            { new: true }
        );

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            message: 'Report started successfully'
        });

    } catch (error) {
        console.error('Error starting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start report'
        });
    }
};

// 🔧 OPTIMIZED: submitReport (same name, enhanced performance)
export const submitReport = async (req, res) => {
    try {
        const { studyId } = req.params;
        const { reportContent, findings, impression, recommendations } = req.body;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Single atomic update
        const study = await DicomStudy.findOneAndUpdate(
            {
                _id: studyId,
                lastAssignedDoctor: doctor._id
            },
            {
                $set: {
                    reportContent: {
                        content: reportContent,
                        findings: findings,
                        impression: impression,
                        recommendations: recommendations,
                        finalizedBy: doctor._id,
                        finalizedAt: new Date()
                    },
                    workflowStatus: 'report_finalized',
                    reportFinalizedAt: new Date()
                },
                $push: {
                    statusHistory: {
                        status: 'report_finalized',
                        changedAt: new Date(),
                        changedBy: req.user._id,
                        note: 'Report finalized by doctor'
                    }
                }
            },
            { new: true }
        );

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            message: 'Report submitted successfully'
        });

    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit report'
        });
    }
};

// 🔧 OPTIMIZED: getDoctorStats (same name, enhanced performance)
export const getDoctorStats = async (req, res) => {
    try {
        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 CRITICAL: Parallel aggregation queries for performance
        const [
            totalAssigned,
            pending,
            inProgress,
            completed,
            urgentStudies
        ] = await Promise.all([
            DicomStudy.countDocuments({ lastAssignedDoctor: doctor._id }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'assigned_to_doctor'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'report_in_progress'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'report_finalized'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                caseType: { $in: ['URGENT', 'EMERGENCY'] },
                workflowStatus: { $in: ['assigned_to_doctor', 'report_in_progress'] }
            })
        ]);

        res.json({
            success: true,
            data: {
                totalAssigned,
                pending,
                inProgress,
                completed,
                urgentStudies,
                assignmentStats: doctor.assignmentStats || {}
            }
        });

    } catch (error) {
        console.error('Error fetching doctor stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctor statistics'
        });
    }
};

// export {
//     getAssignedStudies,
//     getPatientDetailedViewForDoctor,
//     startReport,
//     submitReport,
//     getDoctorStats
// };