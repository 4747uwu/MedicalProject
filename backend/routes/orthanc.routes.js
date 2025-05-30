import express from 'express';
import axios from 'axios';
import fs from 'fs/promises'; 
import path from 'path';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import websocketService from '../config/webSocket.js';

// Import Mongoose Models
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js'; 

const router = express.Router();

// --- Configuration ---
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice'; 
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// --- Simple Redis Setup (without Bull queue) ---
const REDIS_URL = 'rediss://default:ATDmAAIjcDFlY2U3MzZmZjIxNDQ0YmZmYmY0NmVlZTBhMjgwOTkyYnAxMA@just-pug-12518.upstash.io:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  tls: {},
  lazyConnect: true,
});

// --- Simple In-Memory Queue ---
class SimpleJobQueue {
  constructor() {
    this.jobs = new Map();
    this.processing = new Set();
    this.nextJobId = 1;
    this.isProcessing = false;
    this.concurrency = 3; // Process max 3 jobs simultaneously
  }

  async add(jobType, data) {
    const jobId = this.nextJobId++;
    const job = {
      id: jobId,
      type: jobType,
      data: data,
      status: 'waiting',
      createdAt: new Date(),
      progress: 0,
      result: null,
      error: null
    };
    
    this.jobs.set(jobId, job);
    console.log(`📝 Job ${jobId} added to queue`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return job;
  }

  async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    console.log('🚀 Queue processor started');
    
    while (this.getWaitingJobs().length > 0 || this.processing.size > 0) {
      // Process jobs up to concurrency limit
      while (this.processing.size < this.concurrency && this.getWaitingJobs().length > 0) {
        const waitingJobs = this.getWaitingJobs();
        if (waitingJobs.length > 0) {
          const job = waitingJobs[0];
          this.processJob(job);
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isProcessing = false;
    console.log('⏹️ Queue processor stopped');
  }

  async processJob(job) {
    this.processing.add(job.id);
    job.status = 'active';
    
    console.log(`🚀 Job ${job.id} started processing`);
    
    try {
      if (job.type === 'process-dicom-instance') {
        // Use the standalone function instead of class method
        job.result = await processDicomInstance(job);
        job.status = 'completed';
        console.log(`✅ Job ${job.id} completed successfully`);
      } else if (job.type === 'test-connection') {
        job.result = { success: true, processedAt: new Date() };
        job.status = 'completed';
        console.log(`✅ Test job ${job.id} completed`);
      }
      
    } catch (error) {
      job.error = error.message;
      job.status = 'failed';
      console.error(`❌ Job ${job.id} failed:`, error.message);
    } finally {
      this.processing.delete(job.id);
    }
  }

  getWaitingJobs() {
    return Array.from(this.jobs.values()).filter(job => job.status === 'waiting');
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getJobByRequestId(requestId) {
    return Array.from(this.jobs.values()).find(job => job.data.requestId === requestId);
  }
}

// FIXED: Single standalone processDicomInstance function
async function processDicomInstance(job) {
  const { orthancInstanceId, requestId } = job.data;
  const startTime = Date.now();
  
  try {
    console.log(`[Queue Worker] 🚀 Starting job ${job.id} for instance: ${orthancInstanceId}`);
    
    job.progress = 10;
    
    // Enhanced timeout for Orthanc request with retry logic
    const metadataUrl = `${ORTHANC_BASE_URL}/instances/${orthancInstanceId}/simplified-tags`;
    console.log(`[Queue Worker] 🌐 Fetching metadata from: ${metadataUrl}`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Orthanc request timeout after 8 seconds')), 8000);
    });
    
    const fetchPromise = axios.get(metadataUrl, { 
      headers: { 'Authorization': orthancAuth },
      timeout: 7000
    });
    
    const metadataResponse = await Promise.race([fetchPromise, timeoutPromise]);
    
    const elapsedTime = Date.now() - startTime;
    console.log(`[Queue Worker] ✅ Metadata fetched in ${elapsedTime}ms`);
    
    job.progress = 25;
    
    const instanceTags = metadataResponse.data;
    const sopInstanceUID = instanceTags.SOPInstanceUID;
    const studyInstanceUID = instanceTags.StudyInstanceUID;
    const seriesInstanceUID = instanceTags.SeriesInstanceUID;

    if (!studyInstanceUID) {
      throw new Error('StudyInstanceUID is missing from instance metadata.');
    }

    console.log(`[Queue Worker] 📋 Processing study: ${studyInstanceUID}`);
    console.log(`[Queue Worker] 🔍 Instance details:`, {
      sopInstanceUID,
      seriesInstanceUID,
      modality: instanceTags.Modality,
      institutionName: instanceTags.InstitutionName
    });

    job.progress = 35;

    console.log(`[Queue Worker] 🏥 Available DICOM tags for lab identification:`, {
      InstitutionName: instanceTags.InstitutionName,
      StationName: instanceTags.StationName,
      Manufacturer: instanceTags.Manufacturer,
      PerformingPhysicianName: instanceTags.PerformingPhysicianName,
      ReferringPhysicianName: instanceTags.ReferringPhysicianName
    });

    // Get the real Orthanc Study ID
    const orthancStudyID = await getOrthancStudyId(studyInstanceUID);
    
    if (!orthancStudyID) {
      console.warn(`Study ${studyInstanceUID} not found in Orthanc, saving without Orthanc Study ID`);
    }
    
    job.progress = 50;
    
    // Enhanced database operations with better lab handling
    const patientRecord = await findOrCreatePatientFromTags(instanceTags);
    
    // Pass instanceTags to the enhanced lab function
    const labRecord = await findOrCreateSourceLab(instanceTags);
    
    job.progress = 70;
    
    console.log(`[Queue Worker] 👤 Patient: ${patientRecord.patientNameRaw} (ID: ${patientRecord.patientID})`);
    console.log(`[Queue Worker] 🏥 Lab: ${labRecord.name} (ID: ${labRecord._id})`);
    
    // Enhanced study processing
    let dicomStudyDoc = await DicomStudy.findOne({ studyInstanceUID: studyInstanceUID });

    const modalitiesInStudySet = new Set(dicomStudyDoc?.modalitiesInStudy || []);
    if(instanceTags.Modality) modalitiesInStudySet.add(instanceTags.Modality);

    if (dicomStudyDoc) {
      console.log(`[Queue Worker] 📝 Updating existing study: ${studyInstanceUID}`);
      
      // Only update if we have a real Orthanc Study ID and it's not already set
      if (orthancStudyID && !dicomStudyDoc.orthancStudyID) {
        dicomStudyDoc.orthancStudyID = orthancStudyID;
      }
      
      // FIXED: Update lab assignment with proper previous lab name retrieval
      const currentLabId = dicomStudyDoc.sourceLab?.toString();
      const newLabId = labRecord._id.toString();
      
      if (currentLabId !== newLabId) {
        // Get the previous lab name for proper audit trail
        let previousLabName = 'Unknown Lab';
        if (currentLabId) {
          try {
            const previousLab = await Lab.findById(currentLabId);
            previousLabName = previousLab ? previousLab.name : 'Unknown Lab';
          } catch (labError) {
            console.warn(`Could not retrieve previous lab name for ${currentLabId}`);
          }
        }
        
        console.log(`[Queue Worker] 🔄 Lab changed from ${currentLabId} (${previousLabName}) to ${newLabId} (${labRecord.name})`);
        dicomStudyDoc.sourceLab = labRecord._id;
        
        // FIXED: Add status history entry for lab change with correct previous lab name
        dicomStudyDoc.statusHistory.push({
          status: dicomStudyDoc.workflowStatus,
          changedAt: new Date(),
          note: `Lab assignment updated from "${previousLabName}" to "${labRecord.name}" (Instance: ${sopInstanceUID}, Job: ${job.id})`
        });
      }
      
      // Update patient and study details
      dicomStudyDoc.patient = patientRecord._id;
      dicomStudyDoc.modalitiesInStudy = Array.from(modalitiesInStudySet);
      dicomStudyDoc.accessionNumber = dicomStudyDoc.accessionNumber || instanceTags.AccessionNumber;
      dicomStudyDoc.studyDate = dicomStudyDoc.studyDate || instanceTags.StudyDate;
      dicomStudyDoc.studyTime = dicomStudyDoc.studyTime || instanceTags.StudyTime;
      dicomStudyDoc.examDescription = dicomStudyDoc.examDescription || instanceTags.StudyDescription;
      
      // Update institution information if available
      if (instanceTags.InstitutionName) {
        dicomStudyDoc.institutionName = instanceTags.InstitutionName;
      }
      
      // ADD/UPDATE DICOM FILES ARRAY (without Wasabi)
      if (!dicomStudyDoc.dicomFiles) {
        dicomStudyDoc.dicomFiles = [];
      }
      
      // Check if this instance is already recorded
      const existingFileIndex = dicomStudyDoc.dicomFiles.findIndex(
        file => file.sopInstanceUID === sopInstanceUID
      );
      
      const dicomFileEntry = {
        sopInstanceUID: sopInstanceUID,
        seriesInstanceUID: seriesInstanceUID,
        orthancInstanceId: orthancInstanceId,
        modality: instanceTags.Modality || 'Unknown',
        storageType: 'orthanc', // Store in Orthanc for now
        uploadedAt: new Date()
      };
      
      if (existingFileIndex >= 0) {
        // Update existing file entry
        dicomStudyDoc.dicomFiles[existingFileIndex] = dicomFileEntry;
        console.log(`[Queue Worker] 🔄 Updated existing DICOM file entry for SOP: ${sopInstanceUID}`);
      } else {
        // Add new file entry
        dicomStudyDoc.dicomFiles.push(dicomFileEntry);
        console.log(`[Queue Worker] ➕ Added new DICOM file entry for SOP: ${sopInstanceUID}`);
      }
      
      if (dicomStudyDoc.workflowStatus === 'no_active_study') {
        dicomStudyDoc.workflowStatus = 'new_study_received';
      }
      
      dicomStudyDoc.statusHistory.push({
        status: 'instance_processed',
        changedAt: new Date(),
        note: `Instance ${sopInstanceUID} processed asynchronously (Job ${job.id}). Lab: ${labRecord.name} - Stored in Orthanc`
      });
      
    } else {
      console.log(`[Queue Worker] 🆕 Creating new study: ${studyInstanceUID}`);
      
      // CREATE DICOM FILES ARRAY FOR NEW STUDY
      const dicomFileEntry = {
        sopInstanceUID: sopInstanceUID,
        seriesInstanceUID: seriesInstanceUID,
        orthancInstanceId: orthancInstanceId,
        modality: instanceTags.Modality || 'Unknown',
        storageType: 'orthanc', // Store in Orthanc for now
        uploadedAt: new Date()
      };
      
      dicomStudyDoc = new DicomStudy({
        orthancStudyID: orthancStudyID, // This will be null if study not found in Orthanc
        studyInstanceUID: studyInstanceUID,
        accessionNumber: instanceTags.AccessionNumber || '',
        patient: patientRecord._id,
        sourceLab: labRecord._id,
        studyDate: instanceTags.StudyDate || '',
        studyTime: instanceTags.StudyTime || '',
        modalitiesInStudy: Array.from(modalitiesInStudySet),
        examDescription: instanceTags.StudyDescription || '',
        institutionName: instanceTags.InstitutionName || '',
        workflowStatus: 'new_study_received',
        dicomFiles: [dicomFileEntry], // Add the first DICOM file
        statusHistory: [{
          status: 'new_study_received',
          changedAt: new Date(),
          note: `First instance ${sopInstanceUID} for new study processed asynchronously (Job ${job.id}). Lab: ${labRecord.name} - Stored in Orthanc`
        }],
      });
    }
    
    await dicomStudyDoc.save();
    
    job.progress = 90;
    
    // Enhanced WebSocket notification with lab information
    const studyNotificationData = {
      _id: dicomStudyDoc._id,
      patientName: patientRecord.patientNameRaw,
      patientId: patientRecord.patientID,
      modality: instanceTags.Modality || 'Unknown',
      location: labRecord.name,
      labId: labRecord._id,
      institutionName: instanceTags.InstitutionName || '',
      studyDate: instanceTags.StudyDate,
      workflowStatus: dicomStudyDoc.workflowStatus,
      priority: dicomStudyDoc.caseType || 'routine',
      accessionNumber: dicomStudyDoc.accessionNumber,
      isNewLab: labRecord.createdAt > new Date(Date.now() - 5000), // Lab created in last 5 seconds
      fileCount: dicomStudyDoc.dicomFiles?.length || 0,
      storageType: 'orthanc'
    };

    // Notify admins about new study
    try {
      websocketService.notifyNewStudy(studyNotificationData);
    } catch (wsError) {
      console.warn(`[Queue Worker] ⚠️ WebSocket notification failed:`, wsError.message);
    }
    
    job.progress = 100;
    
    // Enhanced result data
    const result = {
      success: true,
      orthancInstanceId: orthancInstanceId,
      studyDatabaseId: dicomStudyDoc._id,
      patientId: patientRecord._id,
      labId: labRecord._id,
      sopInstanceUID: sopInstanceUID,
      studyInstanceUID: studyInstanceUID,
      seriesInstanceUID: seriesInstanceUID,
      processedAt: new Date(),
      elapsedTime: Date.now() - startTime,
      storage: {
        type: 'orthanc',
        orthancInstanceId: orthancInstanceId
      },
      metadataSummary: {
        patientName: patientRecord.patientNameRaw,
        patientId: patientRecord.patientID,
        modality: instanceTags.Modality || 'Unknown',
        studyDate: instanceTags.StudyDate || 'Unknown',
        labName: labRecord.name,
        institutionName: instanceTags.InstitutionName || 'Unknown',
        fileCount: dicomStudyDoc.dicomFiles?.length || 0
      }
    };
    
    // Store result for 1 hour
    await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(result));
    
    console.log(`[Queue Worker] ✅ Successfully processed job ${job.id} for study: ${studyInstanceUID}, Lab: ${labRecord.name}`);
    return result;
    
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`[Queue Worker] ❌ Job ${job.id} failed after ${elapsedTime}ms:`, error.message);
    console.error('Stack trace:', error.stack);
    
    const errorResult = {
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      elapsedTime: elapsedTime,
      orthancInstanceId: orthancInstanceId,
      failedAt: new Date()
    };
    
    await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(errorResult));
    throw error;
  }
}

// Create the simple queue instance
const jobQueue = new SimpleJobQueue();

// Redis connection listeners
redis.on('connect', () => {
  console.log('✅ Redis connected successfully to Upstash');
});

redis.on('ready', () => {
  console.log('✅ Redis is ready for operations');
});

redis.on('error', (error) => {
  console.error('❌ Redis connection error:', error.message);
});

// Test Redis connection
console.log('🧪 Testing Redis connection...');
redis.ping()
  .then(() => {
    console.log('✅ Redis ping successful - connection working');
    return redis.set('startup-test', 'hello-world');
  })
  .then(() => {
    console.log('✅ Redis write test successful');
    return redis.get('startup-test');
  })
  .then((value) => {
    console.log('✅ Redis read test successful, value:', value);
    return redis.del('startup-test');
  })
  .then(() => {
    console.log('✅ All Redis tests passed');
  })
  .catch(error => {
    console.error('❌ Redis test failed:', error.message);
  });

// --- Routes ---
router.get('/test-connection', async (req, res) => {
  try {
    // Test Redis
    await redis.set('test-key', `test-${Date.now()}`);
    const redisResult = await redis.get('test-key');
    await redis.del('test-key');
    
    // Test queue
    const testJob = await jobQueue.add('test-connection', {
      message: 'connection test',
      timestamp: new Date()
    });
    
    res.json({
      redis: 'working',
      redisValue: redisResult,
      queue: 'working', 
      testJobId: testJob.id,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Connection test failed:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// --- ASYNC ROUTE ---
router.post('/new-dicom', async (req, res) => {
  const routeName = '/new-dicom';
  console.log(`[NodeApp ${routeName}] Received async request. Body:`, req.body);

  let receivedOrthancInstanceId = null;

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    if (req.body.ID) {
        receivedOrthancInstanceId = req.body.ID;
    } else if (req.body.instanceId) {
        receivedOrthancInstanceId = req.body.instanceId;
    } else {
        const keys = Object.keys(req.body);
        if (keys.length > 0) {
            receivedOrthancInstanceId = keys[0];
        }
    }
  }

  if (!receivedOrthancInstanceId || typeof receivedOrthancInstanceId !== 'string' || receivedOrthancInstanceId.trim() === '') {
    return res.status(400).json({ 
      error: 'Invalid or empty Orthanc Instance ID',
      receivedBody: req.body 
    });
  }

  const orthancInstanceId = receivedOrthancInstanceId.trim();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Add job to simple queue
    const job = await jobQueue.add('process-dicom-instance', {
      orthancInstanceId: orthancInstanceId,
      requestId: requestId,
      submittedAt: new Date()
    });

    console.log(`[NodeApp ${routeName}] ✅ Job ${job.id} queued for instance: ${orthancInstanceId}`);

    // Immediate response
    res.status(202).json({
      message: 'DICOM instance queued for asynchronous processing',
      jobId: job.id,
      requestId: requestId,
      orthancInstanceId: orthancInstanceId,
      status: 'queued',
      estimatedProcessingTime: '5-30 seconds',
      checkStatusUrl: `/orthanc/job-status/${requestId}`
    });

  } catch (error) {
    console.error(`[NodeApp ${routeName}] ❌ Error queuing job:`, error);
    res.status(500).json({
      message: 'Error queuing DICOM instance for processing',
      error: error.message,
      orthancInstanceId: orthancInstanceId
    });
  }
});

// --- Job Status Route ---
router.get('/job-status/:requestId', async (req, res) => {
  const { requestId } = req.params;
  
  try {
    // Check Redis first
    const resultData = await redis.get(`job:result:${requestId}`);
    
    if (resultData) {
      const result = JSON.parse(resultData);
      res.json({
        status: result.success ? 'completed' : 'failed',
        result: result,
        requestId: requestId
      });
    } else {
      // Check in-memory queue
      const job = jobQueue.getJobByRequestId(requestId);
      
      if (job) {
        res.json({
          status: job.status,
          progress: job.progress,
          requestId: requestId,
          jobId: job.id,
          createdAt: job.createdAt,
          error: job.error
        });
      } else {
        res.status(404).json({
          status: 'not_found',
          message: 'Job not found or expired',
          requestId: requestId
        });
      }
    }
  } catch (error) {
    console.error('Error checking job status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error checking job status',
      error: error.message
    });
  }
});

// --- Keep all your existing helper functions ---
async function findOrCreatePatientFromTags(instanceTags) {
  const patientIdDicom = instanceTags.PatientID;
  const patientNameDicomObj = instanceTags.PatientName;
  let patientNameString = 'Unknown Patient';
  if (patientNameDicomObj && typeof patientNameDicomObj === 'object' && patientNameDicomObj.Alphabetic) {
    patientNameString = patientNameDicomObj.Alphabetic.replace(/\^/g, ' ');
  } else if (typeof patientNameDicomObj === 'string') {
    patientNameString = patientNameDicomObj;
  }

  const patientSex = instanceTags.PatientSex;
  const patientBirthDate = instanceTags.PatientBirthDate;

  if (!patientIdDicom && !patientNameString) {
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

  let patient = await Patient.findOne({ mrn: patientIdDicom });

  if (!patient) {
    const generatedPatientID = new mongoose.Types.ObjectId().toString().slice(0,8).toUpperCase();
    
    patient = new Patient({
      mrn: patientIdDicom || `ANON_${Date.now()}`,
      patientID: generatedPatientID,
      patientNameRaw: patientNameString,
      gender: patientSex || '',
      dateOfBirth: patientBirthDate ? formatDicomDateToISO(patientBirthDate) : ''
    });
    
    await patient.save();
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

// 🔧 ENHANCED: Better DICOM lab name processing
function extractLabInformation(instanceTags) {
  const possibleLabSources = [
    instanceTags.InstitutionName,           
    instanceTags.InstitutionAddress,        
    instanceTags.StationName,               
    instanceTags.Manufacturer,              
    instanceTags.ManufacturerModelName,     
    instanceTags.PerformingPhysicianName,   
    instanceTags.ReferringPhysicianName,    
    instanceTags.RequestingPhysician,       
    instanceTags.SendingAETitle,            
    instanceTags.SourceApplicationEntityTitle 
  ];

  // 🔧 ENHANCED: Better processing for DICOM-style names
  for (const source of possibleLabSources) {
    if (source && typeof source === 'string' && source.trim().length > 0) {
      const rawName = source.trim();
      
      // 🔧 NEW: Handle different DICOM naming patterns
      let processedName = rawName;
      let identifier = rawName;
      
      // Check if it's a DICOM study description pattern (like your example)
      if (isDicomStudyDescriptionPattern(rawName)) {
        // For study descriptions, use a more readable format
        processedName = formatDicomStudyDescription(rawName);
        identifier = rawName.toUpperCase(); // Keep original format for identifier
      } else {
        // For institution names, clean but preserve readability
        processedName = cleanInstitutionName(rawName);
        identifier = processedName.toUpperCase().replace(/\s+/g, '_');
      }
      
      if (processedName.length >= 3) {
        return {
          name: processedName,
          identifier: identifier,
          sourceTag: 'DICOM_EXTRACTED',
          originalValue: rawName,
          sourceField: getSourceFieldName(instanceTags, source)
        };
      }
    }
  }

  return null;
}

// 🔧 NEW: Detect if string is a DICOM study description pattern
function isDicomStudyDescriptionPattern(text) {
  // Pattern: Contains underscores, mixed case, protocol-like naming
  const patterns = [
    /_[A-Z]{2,}\d+_/, // Like "_HN20_", "_SP32ch"
    /^[A-Za-z]+_[A-Z]{2,}_/, // Like "Carotids_CE_"
    /_different_|_various_|_position/i, // Common study description words
    /[A-Z]{2,}\d+[a-z]{2,}$/ // Like "SP32ch" at the end
  ];
  
  return patterns.some(pattern => pattern.test(text));
}

// 🔧 NEW: Format DICOM study descriptions for readability
function formatDicomStudyDescription(text) {
  return text
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capitals
    .replace(/\b([A-Z]{2,})(\d+)\b/g, '$1 $2') // Space between letters and numbers
    .replace(/\s+/g, ' ') // Clean up multiple spaces
    .trim();
}

// 🔧 NEW: Clean institution names while preserving meaning
function cleanInstitutionName(text) {
  return text
    .replace(/[^a-zA-Z0-9\s\-_&]/g, '') // Remove special chars except common ones
    .replace(/_/g, ' ') // Convert underscores to spaces for readability
    .replace(/\s+/g, ' ') // Clean up spaces
    .trim();
}

// 🔧 NEW: Identify which DICOM field provided the lab name
function getSourceFieldName(instanceTags, sourceValue) {
  const fieldMap = {
    [instanceTags.InstitutionName]: 'InstitutionName',
    [instanceTags.StationName]: 'StationName',
    [instanceTags.Manufacturer]: 'Manufacturer',
    [instanceTags.ManufacturerModelName]: 'ManufacturerModelName',
    [instanceTags.PerformingPhysicianName]: 'PerformingPhysicianName',
    [instanceTags.ReferringPhysicianName]: 'ReferringPhysicianName'
  };
  
  return fieldMap[sourceValue] || 'Unknown';
}

// 🔧 ENHANCED: Better lab finder with flexible matching
async function findOrCreateSourceLab(instanceTags = null) {
  const DEFAULT_LAB = {
    name: 'Primary Orthanc Instance (HTTP Source)',
    identifier: 'ORTHANC_HTTP_SOURCE',
    isActive: true,
  };

  try {
    let labInfo = null;
    if (instanceTags) {
      labInfo = extractLabInformation(instanceTags);
    }

    if (labInfo) {
      console.log(`🏥 Extracted lab info from DICOM: ${labInfo.name} (${labInfo.identifier})`);
      console.log(`🔍 Original value: "${labInfo.originalValue}" from field: ${labInfo.sourceField}`);
      
      // 🔧 ENHANCED: Multiple search strategies
      let lab = await findLabByMultipleStrategies(labInfo);

      if (lab) {
        console.log(`✅ Found existing lab: ${lab.name} (ID: ${lab._id})`);
        
        // 🔧 NEW: Update lab with additional information if available
        await updateLabWithDicomInfo(lab, instanceTags, labInfo);
        
        return lab;
      }

      // 🔧 ENHANCED: Create new lab with better metadata
      console.log(`🆕 Creating new lab: ${labInfo.name}`);
      lab = new Lab({
        name: labInfo.name,
        identifier: labInfo.identifier,
        isActive: true,
        notes: `Auto-created from DICOM ${labInfo.sourceField} field on ${new Date().toISOString()}. Original value: "${labInfo.originalValue}"`,
        contactPerson: instanceTags.PerformingPhysicianName || instanceTags.ReferringPhysicianName || '',
        metadata: {
          sourceField: labInfo.sourceField,
          originalDicomValue: labInfo.originalValue,
          extractionPattern: isDicomStudyDescriptionPattern(labInfo.originalValue) ? 'study_description' : 'institution_name',
          createdFromInstance: true
        },
        // Add institution address if available
        address: instanceTags.InstitutionAddress ? {
          street: instanceTags.InstitutionAddress,
          city: '',
          state: '',
          zipCode: '',
          country: ''
        } : undefined
      });

      await lab.save();
      console.log(`✅ Created new lab: ${lab.name} (ID: ${lab._id})`);
      return lab;
    }

    // Fallback to default lab
    console.log(`🔄 No lab info found in DICOM tags, using default lab`);
    let defaultLab = await Lab.findOne({ identifier: DEFAULT_LAB.identifier });
    
    if (!defaultLab) {
      console.log(`🆕 Creating default lab: ${DEFAULT_LAB.name}`);
      defaultLab = new Lab(DEFAULT_LAB);
      await defaultLab.save();
    }

    return defaultLab;

  } catch (error) {
    console.error('❌ Error in findOrCreateSourceLab:', error);
    
    // Emergency fallback
    try {
      let emergencyLab = await Lab.findOne({ isActive: true });
      if (!emergencyLab) {
        emergencyLab = new Lab({
          ...DEFAULT_LAB,
          name: 'Emergency Default Lab',
          identifier: 'EMERGENCY_DEFAULT'
        });
        await emergencyLab.save();
      }
      return emergencyLab;
    } catch (emergencyError) {
      console.error('❌ Emergency lab creation failed:', emergencyError);
      throw new Error('Failed to create or find any lab');
    }
  }
}

// 🔧 NEW: Multiple search strategies for finding labs
async function findLabByMultipleStrategies(labInfo) {
  // Strategy 1: Exact name match (case-insensitive)
  let lab = await Lab.findOne({ 
    name: { $regex: new RegExp(`^${escapeRegex(labInfo.name)}$`, 'i') }
  });
  if (lab) return lab;

  // Strategy 2: Exact identifier match
  lab = await Lab.findOne({ 
    identifier: labInfo.identifier 
  });
  if (lab) return lab;

  // Strategy 3: Original value match in metadata
  lab = await Lab.findOne({ 
    'metadata.originalDicomValue': labInfo.originalValue 
  });
  if (lab) return lab;

  // Strategy 4: Fuzzy name matching (for similar institution names)
  const nameParts = labInfo.name.split(' ').filter(part => part.length > 2);
  if (nameParts.length > 0) {
    const fuzzyPattern = nameParts.map(part => `(?=.*${escapeRegex(part)})`).join('');
    lab = await Lab.findOne({
      name: { $regex: new RegExp(fuzzyPattern, 'i') }
    });
    if (lab) {
      console.log(`🔍 Found lab via fuzzy matching: ${lab.name}`);
      return lab;
    }
  }

  return null;
}

// 🔧 NEW: Escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 🔧 NEW: Update existing lab with new DICOM information
async function updateLabWithDicomInfo(lab, instanceTags, labInfo) {
  try {
    let updated = false;
    
    // Update contact person if not set and available
    if (!lab.contactPerson && (instanceTags.PerformingPhysicianName || instanceTags.ReferringPhysicianName)) {
      lab.contactPerson = instanceTags.PerformingPhysicianName || instanceTags.ReferringPhysicianName;
      updated = true;
    }
    
    // Update metadata if not present
    if (!lab.metadata) {
      lab.metadata = {
        sourceField: labInfo.sourceField,
        originalDicomValue: labInfo.originalValue,
        extractionPattern: isDicomStudyDescriptionPattern(labInfo.originalValue) ? 'study_description' : 'institution_name',
        lastSeenInInstance: new Date()
      };
      updated = true;
    } else {
      // Update last seen timestamp
      lab.metadata.lastSeenInInstance = new Date();
      updated = true;
    }
    
    if (updated) {
      await lab.save();
      console.log(`🔄 Updated lab metadata for: ${lab.name}`);
    }
    
  } catch (error) {
    console.warn(`⚠️ Could not update lab metadata:`, error.message);
  }
}

export default router;