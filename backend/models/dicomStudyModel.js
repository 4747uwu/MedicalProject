// models/DicomStudy.model.js
import mongoose from 'mongoose';

const DicomStudySchema = new mongoose.Schema({
    studyInstanceUID: {
        type: String,
        required: true,
        unique: true,
        index: true // Primary lookup
    },
    
    // 🔧 CRITICAL: Optimized patient reference
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true,
        index: true
    },
    patientId: { 
        type: String, 
        required: true,
        index: true // Backward compatibility
    },
    
    // 🔧 PERFORMANCE: Denormalized patient data for faster queries
    patientInfo: {
        patientID: String,
        patientName: String,
        age: String,
        gender: String
    },
    
    // 🔧 OPTIMIZED: Study metadata with indexes
    studyDate: { type: Date, index: true },
    modality: { 
        type: String, 
        index: true,
        enum: ['CT', 'MRI', 'XR', 'US', 'DX', 'CR', 'MG', 'NM', 'PT']
    },
    accessionNumber: { type: String, index: true },
    
    // 🔧 CRITICAL: Workflow management
    workflowStatus: {
        type: String,
        enum: [
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'doctor_opened_report',
            'report_in_progress',
            'report_finalized',
            'report_uploaded',
            'report_downloaded_radiologist',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ],
        default: 'new_study_received',
        index: true
    },

    currentCategory: {
        type: String,
        enum: [
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'doctor_opened_report',
            'report_in_progress',
            'report_finalized',
            'report_uploaded',
            'report_downloaded_radiologist',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ],
        default: 'new_study_received',
        index: true
    },
    
    // 🔧 PERFORMANCE: Assignment tracking
    assignment: {
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true
        },
        assignedAt: { type: Date, index: true },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        dueDate: { type: Date, index: true },
        priority: {
            type: String,
            enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
            default: 'NORMAL',
            index: true
        }
    },
    
    // 🔧 OPTIMIZED: Status history with size limit
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String
    }],
    
    // 🔧 PERFORMANCE: Report tracking
    reportInfo: {
        startedAt: Date,
        finalizedAt: Date,
        downloadedAt: Date,
        reporterName: String,
        reportContent: String
    },
    
    // 🔧 OPTIMIZED: TAT tracking
    timingInfo: {
        uploadToAssignmentMinutes: Number,
        assignmentToReportMinutes: Number,
        reportToDownloadMinutes: Number,
        totalTATMinutes: Number
    },
    
    // 🔧 PERFORMANCE: Lab information
    sourceLab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        index: true
    },
    ReportAvailable: {
        type: Boolean,
        default: false,
        index: true, 
        required: false
    },
    
    // 🔧 CRITICAL: Search optimization
    searchText: { type: String, index: 'text' },
    
    // 🔧 ADDED: Report storage
    uploadedReports: [{
        filename: String,
        contentType: String,
        data: String, // base64 encoded
        size: Number,
        reportType: {
            type: String,
            enum: ['uploaded-report', 'generated-template'],
            default: 'uploaded-report'
        },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: String,
        reportStatus: {
            type: String,
            enum: ['draft', 'finalized'],
            default: 'finalized'
        },
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor'
        }
    }]
    
}, { 
    timestamps: true,
    // 🔧 PERFORMANCE: Optimize collection settings
    
});

// 🔧 CRITICAL: High-performance compound indexes
DicomStudySchema.index({ workflowStatus: 1, studyDate: -1 }); // Status dashboard
DicomStudySchema.index({ 'assignment.assignedTo': 1, workflowStatus: 1 }); // Doctor workload
DicomStudySchema.index({ patient: 1, studyDate: -1 }); // Patient history
DicomStudySchema.index({ sourceLab: 1, workflowStatus: 1, studyDate: -1 }); // Lab dashboard
DicomStudySchema.index({ modality: 1, studyDate: -1 }); // Modality reports
DicomStudySchema.index({ 'assignment.priority': 1, workflowStatus: 1 }); // Priority queue
DicomStudySchema.index({ studyDate: -1, createdAt: -1 }); // Time-based queries

// 🔧 PERFORMANCE: Limit status history to prevent document bloat
DicomStudySchema.pre('save', function(next) {
    // Limit status history to last 50 entries
    if (this.statusHistory && this.statusHistory.length > 50) {
        this.statusHistory = this.statusHistory.slice(-50);
    }
    
    // Update search text for full-text search
    this.searchText = `${this.patientInfo?.patientName || ''} ${this.patientInfo?.patientID || ''} ${this.accessionNumber || ''} ${this.modality || ''}`.toLowerCase();
    
    next();
});

export default mongoose.model('DicomStudy', DicomStudySchema);