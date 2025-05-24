// models/DicomStudy.model.js
import mongoose from 'mongoose';

const DicomStudySchema = new mongoose.Schema({
    // --- Core Identifiers ---
    orthancStudyID: { type: String, required: true, unique: true, index: true },
    studyInstanceUID: { type: String, required: true, unique: true, index: true },
    accessionNumber: { // From UI "Accession No" and DICOM (0008,0050)
        type: String,
        trim: true,
        index: true,
    },

    // --- Links to other entities ---
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    sourceLab: { // Corresponds to "Center's" from UI
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        required: true,
    },

    // --- Study Details from UI & DICOM ---
    examType: { type: String },
    caseType: { type: String, enum: ['ROUTINE', 'EMERGENCY', 'URGENT'], default: 'ROUTINE' },

    // For study images representation (if not already present)
    images: [{
        path: { type: String },
        description: { type: String }
    }],
    report: {
        type: String,
        trim: true
    },

    // For study description if not present
    examDescription: { type: String },

    // For report date tracking if not using reportFinalizedAt
    reportDate: { type: Date },

    procedureCode: { // From UI "Code" - New
        type: String,
        trim: true,
    },
    studyDate: { // From UI "Date" and DICOM (0008,0020) - YYYYMMDD or YYYY-MM-DD
        type: String,
        trim: true,
    },
    studyTime: { // From DICOM (0008,0030) - HHMMSS.FFFFFF
        type: String,
        trim: true,
    },
    modalitiesInStudy: [{ type: String, trim: true }], // DICOM (0008,0061)
    numberOfImages: { // From UI "Images" - New
        type: Number,
    },
    numberOfSeries: { // From UI "Series" - New
        type: Number,
    },
    // referringPhysicianName: { type: String, trim: true }, // From DICOM
    // institutionName: { type: String, trim: true }, // From DICOM

    // --- Workflow & UI Specific Fields ---
    caseType: { // From UI "Case Type" - New
        type: String,
        trim: true,
        // enum: ['ROUTINE', 'STAT', 'URGENT'], // Define if it's a fixed list
    },
    studyStatusChangeReason: { // From UI "Study status change" - New
        type: String, // This seems to be a reason/note if status is changed manually
        trim: true,
    },
    studyAttributeType: { // From UI "Study Attribute Type" - New
        type: String,
        trim: true,
        // enum: ['TYPE1', 'TYPE2'], // Define if fixed list
    },
    referralOrUrgencyNotes: { // From UI "(Select this if you need immediate Report or meet referral doctor)" - New
        type: String,
        trim: true,
    },
    recordModifiedDate: { // From UI "Modified Date" for this study/visit record - New
        type: String, // YYYY-MM-DD
    },
    recordModifiedTime: { // From UI "Time" for this study/visit record modification - New
        type: String, // HH:MM
    },

    // --- Clinical Information (Can also be in a separate Report/Note model) ---
    clinicalHistory: { // From UI "Clinical History" text area - New
        type: String,
        trim: true,
    },
    previousInjuryInfo: { // From UI "Previous Injury" text area - New
        type: String,
        trim: true,
    },
    previousSurgeryInfo: { // From UI "Previous Surgery" text area - New
        type: String,
        trim: true,
    },

    // --- Reporting Info (Might be part of the Note/Report model, but shown here) ---
    reportDate: { // From UI "ReportDate" - New
        type: String, // YYYY-MM-DD
    },
    reportTime: { // From UI "Time" associated with ReportDate - New
        type: String, // HH:MM
    },

    // --- Workflow Statuses (as defined before) ---
    workflowStatus: {
        type: String,
        enum: [
            'no_active_study',
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'report_in_progress',
            'report_finalized',
            'archived'
        ],
        default: 'new_study_received',
        index: true
    },
    lastAssignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
    lastAssignmentAt: { type: Date },

    // Track history of status changes
    statusHistory: [{
        status: {
            type: String,
            enum: [
                'no_active_study',
                'new_study_received',
                'pending_assignment',
                'assigned_to_doctor',
                'report_in_progress',
                'report_finalized',
                'archived'
            ],
            required: true
        },
        changedAt: {
            type: Date,
            required: true
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User' 
        },
        note: String
    }],

    // Timestamps for important status transitions
    reportStartedAt: Date,
    reportFinalizedAt: Date,
    archivedAt: Date,

    // Reports section
    reports: [{
        filename: {
            type: String,
            required: true
        },
        contentType: {
            type: String,
            required: true
        },
        data: {
            type: String, // base64 encoded document data
            required: true
        },
        size: {
            type: Number,
            required: true
        },
        reportType: {
            type: String,
            enum: ['patient-report', 'lab-report', 'diagnostic-report'],
            required: true
        },
        generatedAt: {
            type: Date,
            default: Date.now
        },
        generatedBy: {
            type: String,
            default: 'system'
        }
    }],
    
    reportStatus: {
        type: String,
        enum: ['pending', 'generated', 'finalized'],
        default: 'pending'
    },
    
    lastReportGenerated: {
        type: Date
    }

}, { timestamps: true }); // For when this DicomStudy record itself was created/updated in DB

// Add a pre-save hook that ensures orthancStudyID is set
DicomStudySchema.pre('save', function(next) {
    // If orthancStudyID is missing, generate a fallback value from studyInstanceUID
    if (!this.orthancStudyID && this.studyInstanceUID) {
        // Create a derived ID prefixed to identify it as a fallback
        this.orthancStudyID = `DERIVED_${this.studyInstanceUID.replace(/\./g, '_')}`;
        console.log(`Generated fallback orthancStudyID: ${this.orthancStudyID}`);
    }
    next();
});

const DicomStudy = mongoose.model('DicomStudy', DicomStudySchema);
export default DicomStudy;