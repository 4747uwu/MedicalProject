// // index.js
// import dotenv from 'dotenv';
// import express from 'express';
// import cors from 'cors';
// import connectDB from './config/db.js'; // Note .js extension
// import mongoose from 'mongoose'; // Import mongoose for ObjectId generation in controller
// import cookieParser from 'cookie-parser';
// import http from 'http';
// import { startDicomScp } from './dicom/dicomHandler.js'; // Note .js extension


// import orthancRoutes from './routes/orthanc.routes.js'; // Note .js extension
// import authRoutes from './routes/auth.routes.js'; // Note .js extension
// import adminRoutes from './routes/admin.routes.js'; // Note .js extension

// dotenv.config();
// connectDB();

// const app = express();

// app.use(cors({
//     origin: true, // Allow any origin, or specify your frontend URL in production
//     credentials: true, // Allow cookies to be sent with requests
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
//     allowedHeaders: ['Content-Type', 'Authorization']
//   }));
  
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

// app.get('/', (req, res) => {
//     res.json({ message: 'DICOM Workflow API (MongoDB - Day 1 - ES Modules) is alive!' });
// });


// async function startServer() {
//     // Start your HTTP/Express server
//     app.listen(HTTP_PORT, () => {
//       console.log(`HTTP server listening on port ${HTTP_PORT}`);
//       console.log(`Orthanc API (example): http://localhost:${HTTP_PORT}/api/orthanc/status`);
//     });
  
//     // Start the DICOM SCP server (runs in parallel)
//     await startDicomScp();
//   }
  
//   startServer().catch(err => {
//     console.error("Failed to start main server:", err);
//   });

// // Mount Orthanc routes
// app.use('/api/orthanc', orthancRoutes); // <<< THIS LINE REGISTERS THE ROUTES
// app.use('/api/auth', authRoutes);
// app.use('/api/admin', adminRoutes);


// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//     console.log(`Server is running as ES Module on port ${PORT}.`);
// });


// index.js
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js'; // Note .js extension
// import mongoose from 'mongoose'; // mongoose seems unused here directly, remove if not needed
import cookieParser from 'cookie-parser';
// import http from 'http'; // http module seems unused, remove if not needed
// import { startDicomScpTest } from './dicom/dicomHandler.js'; // Using the test version for now // Note .js extension

import orthancRoutes from './routes/orthanc.routes.js'; // Note .js extension
import authRoutes from './routes/auth.routes.js'; // Note .js extension
import adminRoutes from './routes/admin.routes.js'; // Note .js extension
import { createProxyMiddleware } from 'http-proxy-middleware';
import labRoutesEdit from './routes/labEdit.routes.js'; 
import lab from './routes/lab.routes.js'; // Note .js extension
import doctorRotues from './routes/doctor.routes.js'; // Note .js extension
import documentRoutes from './routes/document.routes.js'
import studyDownloadRoutes from './routes/study.download.routes.js'; // Note .js extension
import changePasswordRoutes from './routes/changePassword.routes.js';
import forgotPasswordRoutes from './routes/forgotPassword.routes.js';

dotenv.config();
// connectDB(); // Call this inside startServer to ensure it's awaited if async
connectDB(); // Connect to MongoDB before starting the server

const app = express();
const PORT = process.env.PORT || 3000; // Define PORT once, this will be our HTTP_PORT

app.use(cors({
    origin: true, // Allow any origin, or specify your frontend URL in production
    credentials: true, // Allow cookies to be sent with requests
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

app.use(express.text());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
    res.json({ message: 'DICOM Workflow API (MongoDB - Day 1 - ES Modules) is alive!' });
});

// Mount routes BEFORE starting the server (good practice, though not strictly required for listen)
app.use('/api/orthanc', orthancRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lab', labRoutesEdit);
app.use('/api/lab', lab);
app.use('/api/doctor', doctorRotues);
app.use('/api/documents', documentRoutes);
app.use('/api/orthanc-download', studyDownloadRoutes); // Assuming you have a studyDownloadRoutes.js file
app.use('/api/auth', changePasswordRoutes);
app.use('/api/forgot-password', forgotPasswordRoutes);


app.use('/dicom-web', createProxyMiddleware({ 
  
  
  target: 'http://localhost:8042',          // Your Orthanc server's base URL
  // pathRewrite: { '^/dicom-web': '/dicom-web' }, // This specific rewrite is redundant if Orthanc's DICOMweb root IS /dicom-web
  changeOrigin: true,                         // Good practice
  auth: "alice:alicePassword",                // <<< This handles Basic Auth to Orthanc!
  logLevel: 'debug',                          // For verbose proxy logging
  onProxyReq: (proxyReq, req, res) => {
    // Optional: Log the request being sent to Orthanc
    console.log(`[Proxy] Sending request to Orthanc: ${req.method} ${proxyReq.getHeader('host')}${proxyReq.path}`);
    console.log(`[Proxy] Authorization header sent: ${proxyReq.getHeader('Authorization')}`); // To confirm auth is being added
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[Proxy] Received response from Orthanc: ${proxyRes.statusCode} for ${req.originalUrl}`);
  },
  onError: (err, req, res) => {
    console.error('[Proxy] Error:', err.message);
    if (res && !res.headersSent && res.writeHead) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy error: Could not connect to Orthanc service.');
    } else if (res && res.socket && !res.socket.destroyed) {
        res.socket.end();
    }
  }
}));

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api`);
});




