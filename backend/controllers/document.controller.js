import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import DicomStudy from '../models/dicomStudyModel.js';
import User from '../models/userModel.js';
import Lab from '../models/labModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentController {
  // Generate and download patient report
  static async generatePatientReport(req, res) {
    try {
      const { studyId } = req.params;
      
      // Fetch study data with populated fields based on your schema
      const study = await DicomStudy.findById(studyId)
      .populate({
        path: 'lastAssignedDoctor',
        populate: {
          path: 'userAccount',
          select: 'fullName'
        }
      })
        .populate('sourceLab', 'name')
        .populate('patient', 'firstName lastName patientNameRaw');
      
      if (!study) {
        return res.status(404).json({ 
          success: false, 
          message: 'Study not found' 
        });
      }

      // Get patient name - handle different name formats
      let patientName = 'N/A';
      if (study.patient) {
        if (study.patient.firstName && study.patient.lastName) {
          patientName = `${study.patient.firstName} ${study.patient.lastName}`;
        } else if (study.patient.patientNameRaw) {
          // Parse DICOM name format (LastName^FirstName^^^)
          const nameParts = study.patient.patientNameRaw.split('^');
          const lastName = nameParts[0] || '';
          const firstName = nameParts[1] || '';
          patientName = `${firstName} ${lastName}`.trim() || 'N/A';
        }
      }

      // Prepare template data - only the requested fields
      const templateData = {
        PatientName: patientName,
        DoctorName: study.lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
        LabName: study.sourceLab?.name || 'N/A',
        ReportDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      };

      // Generate document
      const documentBuffer = await DocumentController.generateDocument('Patient Report.docx', templateData);
      
      // Create filename using patient name
      const safePatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Patient_Report_${safePatientName}_${Date.now()}.docx`;
      
      // Save document to MongoDB
      await DocumentController.saveDocumentToStudy(studyId, documentBuffer, filename, 'patient-report');
      
      // Set response headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      
      // Send the document
      res.send(documentBuffer);
      
    } catch (error) {
      console.error('Error generating patient report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error generating report',
        error: error.message 
      });
    }
  }

  // Generic document generator function
  static async generateDocument(templateName, data) {
    try {
      // Load the template file
      const templatePath = path.join(__dirname, '../templates', templateName);
      
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templateName}`);
      }

      const content = fs.readFileSync(templatePath, 'binary');
      
      // Create a new zip instance
      const zip = new PizZip(content);
      
      // Create docxtemplater instance
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // Set the template data
      doc.setData(data);

      try {
        // Render the document
        doc.render();
      } catch (error) {
        // Handle template rendering errors
        console.error('Template rendering error:', error);
        throw new Error(`Template rendering failed: ${error.message}`);
      }

      // Generate the document buffer
      const buffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      return buffer;
      
    } catch (error) {
      console.error('Error in generateDocument:', error);
      throw error;
    }
  }

  // Save document to study's report section
  static async saveDocumentToStudy(studyId, documentBuffer, filename, reportType) {
    try {
      // Convert buffer to base64 for storage
      const base64Document = documentBuffer.toString('base64');
      
      // Create report object
      const reportDocument = {
        filename: filename,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: base64Document,
        size: documentBuffer.length,
        reportType: reportType,
        generatedAt: new Date(),
        generatedBy: 'system' // You might want to pass user info here
      };

      // Update the study with the new report
      const updatedStudy = await DicomStudy.findByIdAndUpdate(
        studyId,
        {
          $push: {
            'reports': reportDocument
          },
          $set: {
            'reportStatus': 'generated',
            'lastReportGenerated': new Date()
          }
        },
        { new: true }
      );

      if (!updatedStudy) {
        throw new Error('Failed to save document to study');
      }

      console.log(`Document ${filename} saved to study ${studyId}`);
      return reportDocument;
      
    } catch (error) {
      console.error('Error saving document to study:', error);
      throw error;
    }
  }

  // Get report from study
  static async getStudyReport(req, res) {
    try {
      const { studyId, reportIndex } = req.params;
      
      const study = await DicomStudy.findById(studyId);
      
      if (!study) {
        return res.status(404).json({ 
          success: false, 
          message: 'Study not found' 
        });
      }

      if (!study.reports || study.reports.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No reports found for this study' 
        });
      }

      const reportIdx = parseInt(reportIndex);
      if (reportIdx >= study.reports.length || reportIdx < 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Report not found' 
        });
      }

      const report = study.reports[reportIdx];
      
      // Convert base64 back to buffer
      const documentBuffer = Buffer.from(report.data, 'base64');
      
      // Set response headers
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.setHeader('Content-Type', report.contentType);
      
      // Send the document
      res.send(documentBuffer);
      
    } catch (error) {
      console.error('Error retrieving study report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving report',
        error: error.message 
      });
    }
  }

  // List reports for a study
  static async getStudyReports(req, res) {
    try {
      const { studyId } = req.params;
      
      const study = await DicomStudy.findById(studyId).select('reports');
      
      if (!study) {
        return res.status(404).json({ 
          success: false, 
          message: 'Study not found' 
        });
      }

      // Return only metadata, not the actual document data
      const reportsMetadata = study.reports?.map((report, index) => ({
        index: index,
        filename: report.filename,
        contentType: report.contentType,
        size: report.size,
        reportType: report.reportType,
        generatedAt: report.generatedAt,
        generatedBy: report.generatedBy
      })) || [];

      res.json({ 
        success: true, 
        reports: reportsMetadata,
        totalReports: reportsMetadata.length
      });
      
    } catch (error) {
      console.error('Error fetching study reports:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching reports',
        error: error.message 
      });
    }
  }

  // Delete a specific report
  static async deleteStudyReport(req, res) {
    try {
      const { studyId, reportIndex } = req.params;
      
      const study = await DicomStudy.findById(studyId);
      
      if (!study) {
        return res.status(404).json({ 
          success: false, 
          message: 'Study not found' 
        });
      }

      const reportIdx = parseInt(reportIndex);
      if (!study.reports || reportIdx >= study.reports.length || reportIdx < 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Report not found' 
        });
      }

      // Remove the report
      study.reports.splice(reportIdx, 1);
      
      // Update report status if no reports left
      if (study.reports.length === 0) {
        study.reportStatus = 'pending';
        study.lastReportGenerated = null;
      }
      
      await study.save();

      res.json({ 
        success: true, 
        message: 'Report deleted successfully',
        remainingReports: study.reports.length
      });
      
    } catch (error) {
      console.error('Error deleting study report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error deleting report',
        error: error.message 
      });
    }
  }

  // Generate lab report (using actual Lab model)
  static async generateLabReport(req, res) {
    try {
      const { labId } = req.params;
      
      // Fetch lab data using your Lab model
      const lab = await Lab.findById(labId);
      
      if (!lab) {
        return res.status(404).json({ 
          success: false, 
          message: 'Lab not found' 
        });
      }

      // Get recent studies for this lab
      const recentStudies = await DicomStudy.find({ sourceLab: labId })
        .populate('patient', 'firstName lastName patientNameRaw')
        .populate('lastAssignedDoctor', 'fullName')
        .sort({ createdAt: -1 })
        .limit(10);

      const templateData = {
        LabName: lab.name,
        LabIdentifier: lab.identifier,
        ContactPerson: lab.contactPerson || 'N/A',
        ContactEmail: lab.contactEmail || 'N/A',
        ContactPhone: lab.contactPhone || 'N/A',
        ReportDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        TotalStudies: recentStudies.length,
        Studies: recentStudies.map(study => {
          // Handle patient name
          let patientName = 'N/A';
          if (study.patient) {
            if (study.patient.firstName && study.patient.lastName) {
              patientName = `${study.patient.firstName} ${study.patient.lastName}`;
            } else if (study.patient.patientNameRaw) {
              const nameParts = study.patient.patientNameRaw.split('^');
              const lastName = nameParts[0] || '';
              const firstName = nameParts[1] || '';
              patientName = `${firstName} ${lastName}`.trim() || 'N/A';
            }
          }

          return {
            PatientName: patientName,
            DoctorName: study.lastAssignedDoctor?.fullName || 'Not Assigned',
            StudyDate: study.studyDate || 'N/A',
            Modality: study.modalitiesInStudy?.join(', ') || 'N/A'
          };
        })
      };

      const document = await DocumentController.generateDocument('lab-report-template.docx', templateData);
      
      const filename = `Lab_Report_${lab.name.replace(/\s+/g, '_')}_${Date.now()}.docx`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      
      res.send(document);
      
    } catch (error) {
      console.error('Error generating lab report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error generating lab report',
        error: error.message 
      });
    }
  }

  // List available templates
  static async getAvailableTemplates(req, res) {
    try {
      const templatesDir = path.join(__dirname, '../templates');
      
      if (!fs.existsSync(templatesDir)) {
        return res.json({ 
          success: true, 
          templates: [],
          message: 'Templates directory not found'
        });
      }

      const files = fs.readdirSync(templatesDir)
        .filter(file => file.endsWith('.docx'))
        .map(file => ({
          name: file,
          displayName: file.replace('.docx', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }));

      res.json({ 
        success: true, 
        templates: files 
      });
      
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching templates',
        error: error.message 
      });
    }
  }

  // Upload a report document for a study
  static async uploadStudyReport(req, res) {
    try {
      const { studyId } = req.params;
      const { doctorId, reportStatus } = req.body;
      
      // Check if file exists in the request
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded' 
        });
      }
      
      const study = await DicomStudy.findById(studyId);
      
      if (!study) {
        return res.status(404).json({ 
          success: false, 
          message: 'Study not found' 
        });
      }
      
      // Find doctor's details if provided
      let doctor = null;
      if (doctorId) {
        doctor = await User.findById(doctorId).select('fullName');
        if (!doctor) {
          return res.status(404).json({
            success: false,
            message: 'Doctor not found'
          });
        }
      }
      
      // Get the file from multer
      const file = req.file;
      
      // Create report object
      const reportDocument = {
        filename: file.originalname,
        contentType: file.mimetype,
        data: file.buffer.toString('base64'),
        size: file.size,
        reportType: 'uploaded-report',
        generatedAt: new Date(),
        generatedBy: doctor ? doctor.fullName : req.user ? req.user.fullName : 'Unknown',
        reportStatus: reportStatus || 'draft',
        typedBy: req.user ? req.user.fullName : 'Unknown'
      };
      
      // Update study with the new report
      const updatedStudy = await DicomStudy.findByIdAndUpdate(
        studyId,
        {
          $push: {
            'reports': reportDocument
          },
          $set: {
            'reportStatus': reportStatus || 'draft',
            'lastReportGenerated': new Date(),
            'workflowStatus': reportStatus === 'finalized' ? 'report_finalized' : 'report_in_progress'
          }
        },
        { new: true }
      );
      
      if (!updatedStudy) {
        throw new Error('Failed to save report to study');
      }
      
      res.json({
        success: true,
        message: 'Report uploaded successfully',
        report: {
          filename: reportDocument.filename,
          size: reportDocument.size,
          reportType: reportDocument.reportType,
          reportStatus: reportDocument.reportStatus,
          generatedBy: reportDocument.generatedBy,
          generatedAt: reportDocument.generatedAt
        }
      });
      
    } catch (error) {
      console.error('Error uploading study report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error uploading report',
        error: error.message 
      });
    }
  }
}

export default DocumentController;