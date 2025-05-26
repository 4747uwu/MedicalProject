import express from 'express';
import axios from 'axios';
import fs from 'fs/promises'; 
import path from 'path';
import mongoose from 'mongoose';
import Queue from 'bull'; // npm install bull
import Redis from 'ioredis'; // npm install ioredis

// Import Mongoose Models
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js'; 

const router = express.Router();

// --- Configuration ---
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice'; 
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePads'; 
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// --- Redis & Bull Queue Setup ---
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

// Create job queue for DICOM processing
const dicomQueue = new Queue('dicom processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  defaultJobOptions: {
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 100,    // Keep last 100 failed jobs
    attempts: 3,          // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,        // Start with 2s delay, then exponential backoff
    },
  },
});

// --- Job Processing Logic ---
dicomQueue.process('process-dicom-instance', 5, async (job) => {
  const { orthancInstanceId, requestId } = job.data;
  
  try {
    console.log(`[Queue Worker] 🚀 Starting job ${job.id} for instance: ${orthancInstanceId}`);
    console.log(`[Queue Worker] 📊 Current time: ${new Date().toISOString()}`);
    
    // Update job progress
    await job.progress(10);
    console.log(`[Queue Worker] ✅ Progress updated to 10%`);
    
    // Fetch metadata with timeout
    const metadataUrl = `${ORTHANC_BASE_URL}/instances/${orthancInstanceId}/simplified-tags`;
    console.log(`[Queue Worker] 🌐 About to fetch from: ${metadataUrl}`);
    console.log(`[Queue Worker] ⏰ Fetch started at: ${new Date().toISOString()}`);
    
    const metadataResponse = await axios.get(metadataUrl, { 
      headers: { 'Authorization': orthancAuth },
      timeout: 10000 // Reduce timeout to 10 seconds
    });
    
    console.log(`[Queue Worker] ✅ Metadata fetched successfully at: ${new Date().toISOString()}`);
    await job.progress(30);
    
    const instanceTags = metadataResponse.data;
    const sopInstanceUID = instanceTags.SOPInstanceUID;
    const seriesInstanceUID = instanceTags.SeriesInstanceUID;
    const studyInstanceUID = instanceTags.StudyInstanceUID;

    if (!studyInstanceUID) {
      throw new Error('StudyInstanceUID is missing from instance metadata.');
    }

    const orthancStudyID = `DERIVED_${studyInstanceUID.replace(/\./g, '_')}`;
    
    await job.progress(50);
    
    // Database operations
    const patientRecord = await findOrCreatePatientFromTags(instanceTags);
    const labRecord = await findOrCreateSourceLab();
    
    await job.progress(70);
    
    // Upsert DicomStudy with session for consistency
    const session = await mongoose.startSession();
    let dicomStudyDoc;
    
    try {
      await session.withTransaction(async () => {
        dicomStudyDoc = await DicomStudy.findOne({ studyInstanceUID: studyInstanceUID }).session(session);

        const modalitiesInStudySet = new Set(dicomStudyDoc?.modalitiesInStudy || []);
        if(instanceTags.Modality) modalitiesInStudySet.add(instanceTags.Modality);

        if (dicomStudyDoc) {
          console.log(`[Queue Worker] Updating existing study: ${studyInstanceUID}`);
          
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
            note: `Instance ${sopInstanceUID} processed asynchronously (Job ${job.id}).`
          });
        } else {
          console.log(`[Queue Worker] Creating new study: ${studyInstanceUID}`);
          
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
              note: `First instance ${sopInstanceUID} for new study processed asynchronously (Job ${job.id}).`
            }],
          });
        }
        
        await dicomStudyDoc.save({ session });
      });
    } finally {
      await session.endSession();
    }
    
    await job.progress(100);
    
    // Store job result in Redis for retrieval
    const result = {
      success: true,
      orthancInstanceId: orthancInstanceId,
      studyDatabaseId: dicomStudyDoc._id,
      patientId: patientRecord._id,
      sopInstanceUID: sopInstanceUID,
      studyInstanceUID: studyInstanceUID,
      processedAt: new Date(),
      metadataSummary: {
        patientName: patientRecord.patientNameRaw,
        patientId: patientRecord.patientID,
        modality: instanceTags.Modality || 'Unknown',
        studyDate: instanceTags.StudyDate || 'Unknown'
      }
    };
    
    // Store result for 1 hour
    await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(result));
    
    console.log(`[Queue Worker] Successfully processed job ${job.id} for study: ${studyInstanceUID}`);
    return result;
    
  } catch (error) {
    console.error(`[Queue Worker] ❌ Job ${job.id} failed at: ${new Date().toISOString()}`, error.message);
    
    // Store error result immediately
    const errorResult = {
      success: false,
      error: error.message,
      orthancInstanceId: orthancInstanceId,
      failedAt: new Date()
    };
    
    await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(errorResult));
    throw error;
  }
});

// --- Your existing helper functions remain the same ---
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

async function findOrCreateSourceLab() {
  const labIdentifier = 'ORTHANC_HTTP_SOURCE';
  let lab = await Lab.findOne({ identifier: labIdentifier });
  if (!lab) {
    lab = new Lab({
      name: 'Primary Orthanc Instance (HTTP Source)',
      identifier: labIdentifier,
      isActive: true,
    });
    await lab.save();
  }
  return lab;
}

// --- ASYNC ROUTE - Immediate Response ---
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
    // **IMMEDIATELY add job to queue and return response**
    const job = await dicomQueue.add('process-dicom-instance', {
      orthancInstanceId: orthancInstanceId,
      requestId: requestId,
      submittedAt: new Date()
    }, {
      priority: 1, // Higher priority for newer requests
      delay: 0     // Process immediately
    });

    console.log(`[NodeApp ${routeName}] ✅ Job ${job.id} queued for instance: ${orthancInstanceId}`);

    // **IMMEDIATE RESPONSE** - Don't wait for processing
    res.status(202).json({ // 202 = Accepted
      message: 'DICOM instance queued for asynchronous processing',
      jobId: job.id,
      requestId: requestId,
      orthancInstanceId: orthancInstanceId,
      status: 'queued',
      estimatedProcessingTime: '5-30 seconds',
      checkStatusUrl: `/orthanc/job-status/${requestId}`,
      queueInfo: {
        waiting: await dicomQueue.waiting(),
        active: await dicomQueue.active(),
        completed: await dicomQueue.completed(),
        failed: await dicomQueue.failed()
      }
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

// --- Job Status Check Route ---
router.get('/job-status/:requestId', async (req, res) => {
  const { requestId } = req.params;
  
  try {
    // Check if result is available
    const resultData = await redis.get(`job:result:${requestId}`);
    
    if (resultData) {
      const result = JSON.parse(resultData);
      res.json({
        status: result.success ? 'completed' : 'failed',
        result: result,
        requestId: requestId
      });
    } else {
      // Check if job is still in queue
      const jobs = await dicomQueue.getJobs(['waiting', 'active'], 0, -1);
      const activeJob = jobs.find(job => job.data.requestId === requestId);
      
      if (activeJob) {
        const progress = await activeJob.progress();
        res.json({
          status: activeJob.opts.jobId ? 'active' : 'waiting',
          progress: progress,
          requestId: requestId,
          jobId: activeJob.id
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

// --- Batch Processing Route ---
router.post('/new-dicom-batch', async (req, res) => {
  const { instances } = req.body;
  
  if (!Array.isArray(instances) || instances.length === 0) {
    return res.status(400).json({ error: 'Expected non-empty instances array' });
  }

  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const jobs = [];

  try {
    for (const instanceId of instances) {
      const requestId = `${batchId}_${instanceId}`;
      
      const job = await dicomQueue.add('process-dicom-instance', {
        orthancInstanceId: instanceId,
        requestId: requestId,
        batchId: batchId,
        submittedAt: new Date()
      });
      
      jobs.push({
        jobId: job.id,
        requestId: requestId,
        instanceId: instanceId
      });
    }

    res.status(202).json({
      message: `Batch of ${instances.length} instances queued for processing`,
      batchId: batchId,
      jobs: jobs,
      checkBatchStatusUrl: `/orthanc/batch-status/${batchId}`
    });

  } catch (error) {
    console.error('Error queuing batch:', error);
    res.status(500).json({
      message: 'Error queuing batch for processing',
      error: error.message
    });
  }
});

// --- Queue Monitoring Routes ---
router.get('/queue-status', async (req, res) => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      dicomQueue.waiting(),
      dicomQueue.active(),
      dicomQueue.completed(),
      dicomQueue.failed(),
      dicomQueue.delayed()
    ]);

    res.json({
      queue: 'dicom-processing',
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length
      },
      health: waiting.length < 100 ? 'healthy' : 'overloaded'
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching queue status' });
  }
});

export default router;