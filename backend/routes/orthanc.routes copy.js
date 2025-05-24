// import express from 'express';
// import axios from 'axios';
// import fs from 'fs';
// import path from 'path';

// const router = express.Router();

// // Make sure your DICOM storage directory exists
// const storagePath = './dicom-files';
// if (!fs.existsSync(storagePath)) {
//   fs.mkdirSync(storagePath);
// }

// router.post('/new-dicom', async (req, res) => {
//   const instanceId = req.body;
//   console.log('Received instanceId:', instanceId);  

//   try {
//     // Get the raw DICOM file from Orthanc
//     const response = await axios.get(`http://localhost:8042/instances/${instanceId}/file`, {
//       responseType: 'arraybuffer'
//     });

//     const filePath = path.join('./dicom-files',`${instanceId}.dcm`);
//     fs.writeFileSync(filePath, response.data);

//     console.log('✅ DICOM saved:',`${filePath}`);
//     res.sendStatus(200);
//   } catch (error) {
//     console.error('❌ Error fetching from Orthanc:', error.message);
//     res.status(500).json({ error: error.message });
//   }
// });

// export default router;


// File: routes/dicomReceiver.js (or whatever you named it)
// Inside your routes/orthanc.routes.js

import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// --- Existing configuration for storagePath, ORTHANC_USERNAME, ORTHANC_PASSWORD, orthancAuth ---
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');
const storagePath = './dicom-files';

if (!fs.existsSync(storagePath)) {
  try {
    fs.mkdirSync(storagePath, { recursive: true });
    console.log(`[NodeApp] Created DICOM storage directory: ${storagePath}`);
  } catch (err) {
    console.error(`[NodeApp] Error creating DICOM storage directory ${storagePath}:`, err);
  }
}
// --- End of existing configuration ---


// This should be your POST /api/orthanc/new-dicom route
router.post('/new-dicom', async (req, res) => {
  console.log(`[NodeApp /new-dicom] Received request. Raw Body Object:`, req.body);

  let instanceId = null;

  // The instanceId is the first key in the req.body object
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    instanceId = Object.keys(req.body)[0]; // Get the first key
  }

  console.log(`[NodeApp /new-dicom] Extracted instanceId (as key): '${instanceId}'`);
  console.log(`[NodeApp /new-dicom] Type of extracted instanceId: ${typeof instanceId}`);

  if (!instanceId || typeof instanceId !== 'string' || instanceId.trim() === '') {
    console.error('[NodeApp /new-dicom] ❌ Invalid or empty instanceId extracted from request body keys.');
    return res.status(400).json({ error: 'Invalid or empty instanceId extracted from request body keys.' });
  }

  try {
    const orthancInstanceUrl = `http://localhost:8042/instances/${instanceId.trim()}/file`; // Assuming Orthanc runs on 8042
    console.log(`[NodeApp /new-dicom] Fetching DICOM from Orthanc: ${orthancInstanceUrl}`);

    const response = await axios.get(orthancInstanceUrl, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': orthancAuth
      }
    });

    const filePath = path.join(storagePath, `${instanceId.trim()}.dcm`);
    fs.writeFileSync(filePath, response.data);

    console.log(`[NodeApp /new-dicom] ✅ DICOM saved: ${filePath}`);
    res.status(200).send('DICOM received and saved.');
  } catch (error) {
    let errorMessage = 'Unknown error';
    let statusCode = 500;
    if (axios.isAxiosError(error)) {
      errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
      statusCode = error.response?.status || 500;
      console.error(`[NodeApp /new-dicom] ❌ Axios error fetching from Orthanc (${statusCode}):`, errorMessage);
      console.error(`[NodeApp /new-dicom] Request was to: ${error.config?.url}`);
    } else {
      errorMessage = error.message;
      console.error('[NodeApp /new-dicom] ❌ Non-Axios error:', error.message);
    }
    res.status(statusCode).json({ error: `Failed to process DICOM: ${errorMessage}` });
  }
});

export default router;