import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import NodeCache from 'node-cache';

// 🔧 PERFORMANCE: Add caching for frequent queries
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// 🔧 OPTIMIZED: getAllStudiesForLab (same name, enhanced performance)
export const getAllStudiesForLab = async (req, res) => {
    try {
        const startTime = Date.now();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Cap limit
        const skip = (page - 1) * limit;

        // 🔧 PERFORMANCE: Build optimized query
        const queryFilters = {};
        
        // Lab filtering with optimized lookup
        if (req.user.role === 'lab_staff' && req.user.lab) {
            queryFilters.sourceLab = req.user.lab._id;
        }

        // 🔧 OPTIMIZED: Search with compound conditions
        const { search, location, status, modality, startDate, endDate } = req.query;
        
        if (search) {
            queryFilters.$or = [
                { patientName: { $regex: search, $options: 'i' } },
                { patientId: { $regex: search, $options: 'i' } },
                { accessionNumber: { $regex: search, $options: 'i' } },
                { examDescription: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) queryFilters.workflowStatus = status;
        if (modality) queryFilters.modality = modality;
        
        if (startDate || endDate) {
            queryFilters.studyDate = {};
            if (startDate) queryFilters.studyDate.$gte = new Date(startDate);
            if (endDate) queryFilters.studyDate.$lte = new Date(endDate);
        }

        // 🔧 CRITICAL: High-performance aggregation pipeline
        const pipeline = [
            { $match: queryFilters },
            
            // 🔧 OPTIMIZED: Efficient patient lookup
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientData',
                    pipeline: [{
                        $project: {
                            patientID: 1,
                            firstName: 1,
                            lastName: 1,
                            ageString: 1,
                            gender: 1,
                            contactInformation: 1,
                            'computed.fullName': 1
                        }
                    }]
                }
            },
            
            // 🔧 OPTIMIZED: Doctor lookup with limited fields
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'lastAssignedDoctor',
                    foreignField: '_id',
                    as: 'doctorData',
                    pipeline: [{
                        $lookup: {
                            from: 'users',
                            localField: 'userAccount',
                            foreignField: '_id',
                            as: 'userAccount'
                        }
                    }, {
                        $project: {
                            specialization: 1,
                            'userAccount.fullName': 1
                        }
                    }]
                }
            },
            
            // 🔧 PERFORMANCE: Lab lookup
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'labData',
                    pipeline: [{
                        $project: { name: 1, identifier: 1 }
                    }]
                }
            },
            
            // 🔧 OPTIMIZED: Project only needed fields
            {
                $project: {
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                    accessionNumber: 1,
                    studyDate: 1,
                    studyTime: 1,
                    modality: 1,
                    modalitiesInStudy: 1,
                    workflowStatus: 1,
                    caseType: 1,
                    examDescription: 1,
                    lastAssignmentAt: 1,
                    reportFinalizedAt: 1,
                    createdAt: 1,
                    
                    // Computed fields
                    patient: { $arrayElemAt: ['$patientData', 0] },
                    doctor: { $arrayElemAt: ['$doctorData', 0] },
                    lab: { $arrayElemAt: ['$labData', 0] }
                }
            },
            
            // 🔧 PERFORMANCE: Sort by priority and date
            { $sort: { caseType: 1, studyDate: -1 } },
            { $skip: skip },
            { $limit: limit }
        ];

        // 🔧 CRITICAL: Execute with parallel count query
        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // 🔧 OPTIMIZED: Format response efficiently
        const formattedStudies = studies.map(study => {
            const patient = study.patient || {};
            const doctor = study.doctor || {};
            const lab = study.lab || {};

            return {
                // Core identifiers
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber || 'N/A',
                
                // Patient info
                patientId: patient.patientID || 'N/A',
                patientName: patient.computed?.fullName || 
                           `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'N/A',
                ageGender: `${patient.ageString || 'N/A'}/${patient.gender || 'N/A'}`,
                
                // Study info
                description: study.examDescription || 'N/A',
                modality: Array.isArray(study.modalitiesInStudy) ? 
                         study.modalitiesInStudy.join(', ') : 
                         (study.modality || 'N/A'),
                studyDateTime: study.studyDate && study.studyTime ? 
                              `${study.studyDate} ${study.studyTime.substring(0,6)}` : 
                              (study.studyDate || 'N/A'),
                workflowStatus: study.workflowStatus,
                priority: study.caseType || 'ROUTINE',
                
                // Assignment info
                assignedAt: study.lastAssignmentAt,
                assignedDoctorName: doctor.userAccount?.[0]?.fullName || 'Not Assigned',
                assignedDoctorSpecialization: doctor.specialization || 'N/A',
                
                // Location and timing
                location: lab.name || 'N/A',
                uploadDateTime: study.createdAt,
                reportedDateTime: study.reportFinalizedAt,
                
                // Contact info
                patientContactPhone: patient.contactInformation?.phone || 'N/A',
                patientContactEmail: patient.contactInformation?.email || 'N/A'
            };
        });

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            count: formattedStudies.length,
            totalPages: Math.ceil(totalStudies / limit),
            currentPage: page,
            totalRecords: totalStudies,
            data: formattedStudies,
            performance: {
                queryTimeMs: processingTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('Error fetching lab studies:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch studies',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🔧 OPTIMIZED: getPatientDetailedViewForLab (same name, enhanced performance)
export const getPatientDetailedViewForLab = async (req, res) => {
    try {
        const { id: patientId } = req.params;
        const cacheKey = `patient_detail_lab_${patientId}`;
        
        // 🔧 PERFORMANCE: Check cache first
        let cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                fromCache: true
            });
        }

        // 🔧 OPTIMIZED: Use lean queries for better performance
        const patient = await Patient.findOne({ patientID: patientId })
            .populate('clinicalInfo.lastModifiedBy', 'fullName')
            .lean();

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 PERFORMANCE: Parallel study queries
        const [allStudies, activeStudy] = await Promise.all([
            DicomStudy.find({ patientId: patientId })
                .populate('sourceLab', 'name identifier')
                .populate('lastAssignedDoctor', 'specialization userAccount')
                .populate('lastAssignedDoctor.userAccount', 'fullName')
                .sort({ studyDate: -1 })
                .lean(),
            DicomStudy.findById(patient.activeDicomStudyRef)
                .populate('sourceLab', 'name')
                .lean()
        ]);

        // 🔧 OPTIMIZED: Format studies efficiently
        const formattedStudies = allStudies.map(study => ({
            _id: study._id,
            studyInstanceUID: study.studyInstanceUID,
            accessionNumber: study.accessionNumber || 'N/A',
            studyDateTime: study.studyDate,
            modality: study.modality || 'N/A',
            description: study.examDescription || study.studyDescription || 'N/A',
            workflowStatus: study.workflowStatus,
            priority: study.caseType || 'ROUTINE',
            location: study.sourceLab?.name || 'N/A',
            assignedDoctor: study.lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
            reportFinalizedAt: study.reportFinalizedAt
        }));

        const responseData = {
            patientInfo: {
                patientID: patient.patientID,
                patientId: patient.patientID,
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                fullName: patient.computed?.fullName || 
                         `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
                age: patient.ageString || '',
                gender: patient.gender || '',
                dateOfBirth: patient.dateOfBirth || '',
                contactNumber: patient.contactInformation?.phone || '',
                email: patient.contactInformation?.email || '',
                address: patient.address || '',
                salutation: patient.salutation || '',
                mrn: patient.mrn || ''
            },
            
            clinicalInfo: {
                clinicalHistory: patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.clinicalInfo?.previousSurgery || '',
                lastModifiedBy: patient.clinicalInfo?.lastModifiedBy?.fullName || '',
                lastModifiedAt: patient.clinicalInfo?.lastModifiedAt || ''
            },
            
            medicalHistory: patient.medicalHistory || {
                clinicalHistory: '',
                previousInjury: '',
                previousSurgery: ''
            },
            
            referralInfo: patient.referralInfo || '',
            studies: formattedStudies,
            
            studyInfo: activeStudy ? {
                accessionNumber: activeStudy.accessionNumber,
                workflowStatus: activeStudy.workflowStatus,
                caseType: activeStudy.caseType,
                images: []
            } : {},
            
            visitInfo: activeStudy ? {
                examDescription: activeStudy.examDescription,
                center: activeStudy.sourceLab?.name || 'Default Lab',
                studyDate: activeStudy.studyDate,
                caseType: activeStudy.caseType,
                examType: activeStudy.examType
            } : {},
            
            documents: [...(patient.attachments || []), ...(patient.documents || [])]
        };

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, responseData, 180); // 3 minutes

        res.json({
            success: true,
            data: responseData,
            fromCache: false
        });

    } catch (error) {
        console.error('Error fetching patient details for lab:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🔧 OPTIMIZED: updatePatientInfo (same name, enhanced performance)
export const updatePatientInfo = async (req, res) => {
    try {
        const { id: patientId } = req.params;
        const updateData = req.body;
        const startTime = Date.now();

        // 🔧 PERFORMANCE: Use lean query for initial lookup
        const patient = await Patient.findOne({ patientID: patientId }).lean();
        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Build update object efficiently
        const patientUpdateData = {};

        // Handle patient info updates
        if (updateData.patientInfo) {
            const allowedFields = ['firstName', 'lastName', 'age', 'gender', 'dateOfBirth', 'salutation'];
            allowedFields.forEach(field => {
                if (updateData.patientInfo[field] !== undefined) {
                    if (field === 'age') {
                        patientUpdateData.ageString = updateData.patientInfo[field];
                    } else {
                        patientUpdateData[field] = updateData.patientInfo[field];
                    }
                }
            });

            // Handle contact information
            if (updateData.patientInfo.contactNumber || updateData.patientInfo.email) {
                patientUpdateData.contactInformation = {
                    phone: updateData.patientInfo.contactNumber || patient.contactInformation?.phone || '',
                    email: updateData.patientInfo.email || patient.contactInformation?.email || ''
                };
            }

            if (updateData.patientInfo.address !== undefined) {
                patientUpdateData.address = updateData.patientInfo.address;
            }
        }

        // Handle clinical information with optimized structure
        if (updateData.clinicalInfo) {
            patientUpdateData.clinicalInfo = {
                ...patient.clinicalInfo,
                clinicalHistory: updateData.clinicalInfo.clinicalHistory || '',
                previousInjury: updateData.clinicalInfo.previousInjury || '',
                previousSurgery: updateData.clinicalInfo.previousSurgery || '',
                lastModifiedBy: req.user._id,
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
            patientUpdateData.referralInfo = updateData.referralInfo;
        }

        // 🔧 PERFORMANCE: Single atomic update
        const updatedPatient = await Patient.findOneAndUpdate(
            { patientID: patientId },
            { $set: patientUpdateData },
            { new: true, lean: true }
        );

        // 🔧 PERFORMANCE: Update related studies only if necessary
        if (updateData.clinicalInfo || updateData.studyInfo) {
            const studyUpdateData = {};
            
            if (updateData.clinicalInfo?.clinicalHistory) {
                studyUpdateData.clinicalHistory = updateData.clinicalInfo.clinicalHistory;
            }
            if (updateData.studyInfo?.workflowStatus) {
                studyUpdateData.workflowStatus = updateData.studyInfo.workflowStatus;
            }
            if (updateData.studyInfo?.caseType) {
                studyUpdateData.caseType = updateData.studyInfo.caseType;
            }

            if (Object.keys(studyUpdateData).length > 0) {
                await DicomStudy.updateMany(
                    { patient: patient._id },
                    { $set: studyUpdateData }
                );
            }
        }

        // 🔧 PERFORMANCE: Clear cache
        cache.del(`patient_detail_lab_${patientId}`);

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            message: 'Patient information updated successfully',
            data: {
                patientId: updatedPatient.patientID,
                updatedFields: Object.keys(patientUpdateData)
            },
            performance: {
                processingTimeMs: processingTime
            }
        });

    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update patient',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// export {
//     getAllStudiesForLab,
//     getPatientDetailedViewForLab,
//     updatePatientInfo
// };