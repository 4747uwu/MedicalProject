// models/Patient.model.js
import mongoose from 'mongoose';

// Simple embedded schema for attachments (for development phase)
const EmbeddedAttachmentSchema = new mongoose.Schema({
    fileName: { type: String, required: true, trim: true },
    fileTypeOrCategory: { type: String, required: true, trim: true }, // e.g., "Clinical", "Referral"
    storageIdentifier: { type: String, required: true }, // Could be a path or a key to an object store
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true }); // Give embedded attachments their own _id for easier array manipulation

const PatientSchema = new mongoose.Schema({
    // --- Identifiers ---
    patientID: { // Application's internal Patient ID (as seen in UI)
        type: String,
        required: [true, 'Application Patient ID is required'],
        trim: true,
        index: true,
        unique: true,
    },
    mrn: { // Medical Record Number from DICOM (0010,0020)
        type: String,
        trim: true,
        index: true,
        // sparse: true, // Use if MRN can be absent but must be unique if present
    },
    issuerOfPatientID: { // (0010,0021) Issuer of Patient ID (for MRN)
        type: String,
        trim: true,
    },

    // --- Demographics ---
    salutation: {
        type: String,
        trim: true,
        enum: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Master', 'Miss', ''],
    },
    firstName: {
        type: String,
        trim: true,
    },
    lastName: {
        type: String,
        trim: true,
    },
    patientNameRaw: { // Raw DICOM Patient's Name string
        type: String,
        trim: true,
    },
    dateOfBirth: { // YYYY-MM-DD
        type: String,
        trim: true,
    },
    gender: {
        type: String,
        trim: true,
        uppercase: true,
        enum: ['M', 'F', 'O', ''],
    },
    ageString: { // e.g., "065Y"
        type: String,
        trim: true,
    },
    // patientWeightKg: { type: Number }, // Uncomment if needed
    // patientHeightM: { type: Number },  // Uncomment if needed
    // ethnicGroup: { type: String, trim: true }, // Uncomment if needed
    // patientComments: { type: String, trim: true }, // From DICOM (0010,4000) - usually study specific

    // --- Embedded Attachments (for development phase) ---
    attachments: [EmbeddedAttachmentSchema],

    // --- Embedded Workflow Status (for development phase) ---
    // This status reflects the patient's most recent/active study's general state.
    // Requires careful logic to keep synchronized if you also have statuses on DicomStudy/Assignment.
    currentWorkflowStatus: {
        type: String,
        enum: [
            'no_active_study',      // No current studies being processed for this patient
            'new_study_received',   // New DICOM study received, pending processing/assignment
            'pending_assignment',   // Processed study ready for doctor assignment
            'assigned_to_doctor',   // Patient's active study is assigned
            'report_in_progress',   // Doctor is working on the report for the active study
            'report_finalized',     // Report for the active study is done
            'archived'              // All known studies for patient are archived/complete
        ],
        default: 'no_active_study',
        index: true,
    },
    // Reference to the DicomStudy that currentWorkflowStatus is primarily tracking
    activeDicomStudyRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DicomStudy'
    },
    
    documents: [{
        fileName: String,
        fileType: String,
        filePath: String,
        fileSize: Number,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        uploadDate: {
          type: Date,
          default: Date.now
        }
      }],
      
      clinicalInfo: {
        clinicalHistory: String,
        previousInjury: String,
        previousSurgery: String,
        lastModifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        lastModifiedAt: Date
      },
      
      referralInfo: String,

    medicalHistory: {
        clinicalHistory: { type: String, default: '' },
        previousInjury: { type: String, default: '' },
        previousSurgery: { type: String, default: '' }
      },
      
      // Add contact information fields (if they don't exist)
      contactInformation: {
        phone: { type: String, default: '' },
        email: { type: String, default: '' }
      }
    // Optional: A brief note associated with the current patient status
    // statusNotes: {
    //     type: String,
    //     trim: true
    // }

}, { timestamps: true });

// Pre-save hook to parse patientNameRaw into firstName and lastName, or vice-versa
PatientSchema.pre('save', function(next) {
    if (this.isModified('patientNameRaw') && this.patientNameRaw) {
        const parts = this.patientNameRaw.split('^');
        this.lastName = parts[0] || this.lastName || undefined;
        this.firstName = parts[1] || this.firstName || undefined;
    } else if ((this.isModified('firstName') || this.isModified('lastName')) && !this.patientNameRaw) {
        const familyName = this.lastName || '';
        const givenName = this.firstName || '';
        this.patientNameRaw = `${familyName}^${givenName}^^^`; // Basic DICOM PN format
    }
    next();
});

// Ensure patientID (application's ID) is unique
// If MRN should also be unique (and not always the same as patientID), add a unique index for it too.
// PatientSchema.index({ mrn: 1 }, { unique: true, sparse: true });


const Patient = mongoose.model('Patient', PatientSchema);
export default Patient;