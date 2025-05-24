import express from 'express';
import axios from 'axios';
import fs from 'fs/promises'; 
import path from 'path';
import mongoose from 'mongoose';

// Import Mongoose Models - adjust paths as necessary
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js'; 

const router = express.Router();

// --- Configuration ---
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'orthanc'; 
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'orthanc'; 
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// Comment out local storage setup
// const localHttpPulledFileStoragePath = path.resolve(process.cwd(), 'dicom_files_http_pulled');

// Comment out directory creation
// (async () => {
//   try {
//     await fs.mkdir(localHttpPulledFileStoragePath, { recursive: true });
//     console.log(`[NodeApp HTTP Pull] Local storage for pulled DICOM files: ${localHttpPulledFileStoragePath}`);
//   } catch (err) {
//     console.error(`[NodeApp HTTP Pull] Error creating storage directory ${localHttpPulledFileStoragePath}:`, err);
//   }
// })();

// --- Helper Functions for DB Interaction ---

// Find or Create Patient - function remains unchanged
async function findOrCreatePatientFromTags(instanceTags) {
  const patientIdDicom = instanceTags.PatientID;
  const patientNameDicomObj = instanceTags.PatientName;
  let patientNameString = 'Unknown Patient';
  if (patientNameDicomObj && typeof patientNameDicomObj === 'object' && patientNameDicomObj.Alphabetic) {
    patientNameString = patientNameDicomObj.Alphabetic.replace(/\^/g, ' '); // Replace ^ with space
  } else if (typeof patientNameDicomObj === 'string') { // Fallback if it's just a string
    patientNameString = patientNameDicomObj;
  }

  const patientSex = instanceTags.PatientSex;
  const patientBirthDate = instanceTags.PatientBirthDate;

  if (!patientIdDicom && !patientNameString) {
    console.warn('[NodeApp HTTP Pull] Insufficient patient info (ID and Name missing). Using placeholder.');
    let unknownPatient = await Patient.findOne({ mrn: 'UNKNOWN_HTTP_PULL' });
    if (!unknownPatient) {
        unknownPatient = await Patient.create({
            mrn: 'UNKNOWN_HTTP_PULL',
            patientID: new mongoose.Types.ObjectId().toString().slice(0,8).toUpperCase(),
            patientNameRaw: 'Unknown Patient (HTTP Pull)',
            gender: patientSex || '',
            dateOfBirth: patientBirthDate || '',
            isAnonymous: true
        });
    }
    return unknownPatient;
  }

  // First try to find patient by MRN (which is patientIdDicom in DICOM)
  let patient = await Patient.findOne({ mrn: patientIdDicom });

  if (!patient) {
    console.log(`[NodeApp HTTP Pull] Patient not found, creating new: ID=${patientIdDicom}, Name=${patientNameString}`);
    
    // Generate a unique patientID (this is your application's internal ID, not the DICOM PatientID)
    const generatedPatientID = new mongoose.Types.ObjectId().toString().slice(0,8).toUpperCase();
    
    patient = new Patient({
      mrn: patientIdDicom || `ANON_${Date.now()}`, // Store DICOM PatientID as MRN
      patientID: generatedPatientID,  // Application's internal ID (required field)
      patientNameRaw: patientNameString,
      gender: patientSex || '',
      dateOfBirth: patientBirthDate ? formatDicomDateToISO(patientBirthDate) : ''
    });
    
    await patient.save();
    console.log(`[NodeApp HTTP Pull] New patient created with DB ID: ${patient._id}, PatientID: ${patient.patientID}`);
  } else {
    console.log(`[NodeApp HTTP Pull] Found existing patient with DB ID: ${patient._id}`);
    // Optionally: Update existing patient if new info is more complete
    if (!patient.patientNameRaw && patientNameString && patientNameString !== 'Unknown Patient') {
      patient.patientNameRaw = patientNameString;
      await patient.save();
      console.log(`[NodeApp HTTP Pull] Updated existing patient with name: ${patientNameString}`);
    }
  }
  return patient;
}

function formatDicomDateToISO(dicomDate) {
  if (!dicomDate || typeof dicomDate !== 'string' || dicomDate.length !== 8) return '';
  try {
    const year = dicomDate.substring(0, 4);
    const month = dicomDate.substring(4, 6);
    const day = dicomDate.substring(6, 8);
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

async function findOrCreateSourceLab() {
  const labIdentifier = 'ORTHANC_HTTP_SOURCE';
  let lab = await Lab.findOne({ identifier: labIdentifier });
  if (!lab) {
    console.log(`[NodeApp HTTP Pull] Lab with identifier ${labIdentifier} not found, creating new.`);
    lab = new Lab({
      name: 'Primary Orthanc Instance (HTTP Source)',
      identifier: labIdentifier,
      isActive: true,
    });
    await lab.save();
    console.log(`[NodeApp HTTP Pull] New lab created with DB ID: ${lab._id}`);
  } else {
    console.log(`[NodeApp HTTP Pull] Found existing lab with DB ID: ${lab._id}`);
  }
  return lab;
}

// --- The Route ---
router.post('/new-dicom', async (req, res) => {
  const routeName = '/new-dicom';
  console.log(`[NodeApp ${routeName}] Received request. Body:`, req.body);
  console.log(`[NodeApp ${routeName}] Type of req.body:`, typeof req.body);

  let receivedOrthancInstanceId = null;

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    if (req.body.ID) {
        receivedOrthancInstanceId = req.body.ID;
        console.log(`[NodeApp ${routeName}] Extracted ID using req.body.ID: "${receivedOrthancInstanceId}"`);
    } else if (req.body.instanceId) {
        receivedOrthancInstanceId = req.body.instanceId;
        console.log(`[NodeApp ${routeName}] Extracted ID using req.body.instanceId: "${receivedOrthancInstanceId}"`);
    } else {
        const keys = Object.keys(req.body);
        if (keys.length > 0) {
            receivedOrthancInstanceId = keys[0];
            console.log(`[NodeApp ${routeName}] Extracted ID using Object.keys(req.body)[0]: "${receivedOrthancInstanceId}"`);
        }
    }
  }

  console.log(`[NodeApp ${routeName}] Value of receivedOrthancInstanceId before validation: "${receivedOrthancInstanceId}"`);
  console.log(`[NodeApp ${routeName}] Type of receivedOrthancInstanceId before validation: ${typeof receivedOrthancInstanceId}`);

  if (!receivedOrthancInstanceId || typeof receivedOrthancInstanceId !== 'string' || receivedOrthancInstanceId.trim() === '') {
    const msg = `[NodeApp ${routeName}] Invalid or empty Orthanc Instance ID. Final extracted ID: "${receivedOrthancInstanceId}"`;
    console.error(msg);
    console.error(`[NodeApp ${routeName}] Original req.body that led to failure:`, JSON.stringify(req.body));
    return res.status(400).json({ error: msg, receivedBody: req.body });
  }

  const orthancInstanceId = receivedOrthancInstanceId.trim();
  console.log(`[NodeApp ${routeName}] Valid Orthanc Instance ID to process: ${orthancInstanceId}`);
  
  try {
    // --- Define URLs for Orthanc REST API ---
    const metadataUrl = `${ORTHANC_BASE_URL}/instances/${orthancInstanceId}/simplified-tags`;
    // Keep the file URL but we won't use it for saving
    const fileUrl = `${ORTHANC_BASE_URL}/instances/${orthancInstanceId}/file`;

    console.log(`[NodeApp ${routeName}] Fetching metadata for Orthanc ID: ${orthancInstanceId}`);
    console.log(`[NodeApp ${routeName}]   Metadata URL: ${metadataUrl}`);

    // Only fetch metadata now, comment out file fetching
    // const [metadataResponse, fileResponse] = await Promise.all([
    //   axios.get(metadataUrl, { headers: { 'Authorization': orthancAuth } }),
    //   axios.get(fileUrl, { responseType: 'arraybuffer', headers: { 'Authorization': orthancAuth } })
    // ]);
    
    // Simplified to just fetch metadata
    const metadataResponse = await axios.get(metadataUrl, { 
      headers: { 'Authorization': orthancAuth } 
    });

    // --- Process Metadata (instanceTags) ---
    const instanceTags = metadataResponse.data;
    console.log(`[NodeApp ${routeName}] Metadata fetched successfully for instance ${orthancInstanceId}.`);
    
    const sopInstanceUID = instanceTags.SOPInstanceUID;
    const seriesInstanceUID = instanceTags.SeriesInstanceUID;
    const studyInstanceUID = instanceTags.StudyInstanceUID;

    if (!studyInstanceUID) {
        throw new Error('StudyInstanceUID is missing from instance metadata.');
    }

    // SIMPLIFIED: Always create a derived ID from studyInstanceUID - no Orthanc lookup
    const orthancStudyID = `DERIVED_${studyInstanceUID.replace(/\./g, '_')}`;
    console.log(`[NodeApp ${routeName}] Using derived orthancStudyID: ${orthancStudyID}`);

    // --- Find/Create Patient and Lab ---
    const patientRecord = await findOrCreatePatientFromTags(instanceTags);
    const labRecord = await findOrCreateSourceLab();

    // --- Upsert DicomStudy document ---
    let dicomStudyDoc = await DicomStudy.findOne({ studyInstanceUID: studyInstanceUID });

    const modalitiesInStudySet = new Set(dicomStudyDoc?.modalitiesInStudy || []);
    if(instanceTags.Modality) modalitiesInStudySet.add(instanceTags.Modality);

    if (dicomStudyDoc) {
      console.log(`[NodeApp ${routeName}] Existing study found in DB for StudyInstanceUID: ${studyInstanceUID}. Updating.`);
      
      // Keep existing orthancStudyID if it's already set
      if (!dicomStudyDoc.orthancStudyID) {
        dicomStudyDoc.orthancStudyID = orthancStudyID;
      }
      
      dicomStudyDoc.patient = patientRecord._id;
      dicomStudyDoc.sourceLab = labRecord._id;
      dicomStudyDoc.modalitiesInStudy = Array.from(modalitiesInStudySet);
      dicomStudyDoc.accessionNumber = dicomStudyDoc.accessionNumber || instanceTags.AccessionNumber;
      dicomStudyDoc.studyDate = dicomStudyDoc.studyDate || instanceTags.StudyDate;
      dicomStudyDoc.studyTime = dicomStudyDoc.studyTime || instanceTags.StudyTime;
      dicomStudyDoc.examDescription = dicomStudyDoc.examDescription || instanceTags.StudyDescription;
      
      if (dicomStudyDoc.workflowStatus === 'no_active_study') {
        dicomStudyDoc.workflowStatus = 'new_study_received';
      }
      
      dicomStudyDoc.statusHistory.push({
          status: 'new_study_received',
          changedAt: new Date(),
          note: `New instance ${sopInstanceUID} metadata received via HTTP pull.`
      });
    } else {
      console.log(`[NodeApp ${routeName}] No existing study found. Creating new study for StudyInstanceUID: ${studyInstanceUID}.`);
      
      dicomStudyDoc = new DicomStudy({
        orthancStudyID: orthancStudyID,
        studyInstanceUID: studyInstanceUID,
        accessionNumber: instanceTags.AccessionNumber || '',
        patient: patientRecord._id,
        sourceLab: labRecord._id,
        studyDate: instanceTags.StudyDate || '',
        studyTime: instanceTags.StudyTime || '',
        modalitiesInStudy: Array.from(modalitiesInStudySet),
        examDescription: instanceTags.StudyDescription || '',
        workflowStatus: 'new_study_received',
        statusHistory: [{
            status: 'new_study_received',
            changedAt: new Date(),
            note: `First instance ${sopInstanceUID} metadata received for new study via HTTP pull.`
        }],
      });
    }
    await dicomStudyDoc.save();
    console.log(`[NodeApp ${routeName}] DicomStudy document upserted for StudyInstanceUID: ${studyInstanceUID}. DB ID: ${dicomStudyDoc._id}`);

    // --- Respond to Client (Orthanc Lua or other caller) ---
    res.status(200).json({
      message: 'DICOM instance metadata processed and DB updated.',
      orthancInstanceId: orthancInstanceId,
      studyDatabaseId: dicomStudyDoc._id,
      patientId: patientRecord._id,
      sopInstanceUID: sopInstanceUID,
      studyInstanceUID: studyInstanceUID,
      // No filePath since we're not saving files
      metadataSummary: {
        patientName: patientRecord.patientNameRaw,
        patientId: patientRecord.patientID,
        modality: instanceTags.Modality || 'Unknown',
        studyDate: instanceTags.StudyDate || 'Unknown'
      }
    });

  } catch (error) {
    let errorMessage = 'Error processing DICOM instance metadata from Orthanc';
    let statusCode = 500;
    let errorDetails = {};

    if (axios.isAxiosError(error)) {
      errorMessage = `Axios error fetching data from Orthanc: ${error.message}`;
      statusCode = error.response?.status || 503;
      errorDetails = {
        url: error.config?.url,
        method: error.config?.method,
        responseStatus: error.response?.status,
      };
      console.error(`[NodeApp ${routeName}] ❌ Axios Error for Orthanc ID ${orthancInstanceId}: ${errorMessage}`, errorDetails.url);
    } else if (error instanceof mongoose.Error) {
        errorMessage = `MongoDB Error: ${error.message}`;
        statusCode = 500;
        console.error(`[NodeApp ${routeName}] ❌ MongoDB Error for Orthanc ID ${orthancInstanceId}:`, error);
    } else {
      errorMessage = `Processing error: ${error.message}`;
      console.error(`[NodeApp ${routeName}] ❌ Error for Orthanc ID ${orthancInstanceId}:`, error);
    }

    res.status(statusCode).json({
      message: 'Error processing DICOM instance metadata.',
      error: errorMessage,
      orthancInstanceId: orthancInstanceId
    });
  }
});

export default router;