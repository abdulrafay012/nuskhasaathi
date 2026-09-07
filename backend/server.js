const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const initDB = require('./config/initDB');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const identifyMedicinesRoutes = require('./routes/identifyMedicines');
const instructionsRoutes = require('./routes/instructions');
const historyRoutes = require('./routes/history');
const reportRoutes = require('./routes/report');
const medicinesRoutes = require('./routes/medicines');
const scheduleRoutes = require('./routes/schedule');
const caregiverRoutes = require('./routes/caregiver');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files and bundled demo fixtures
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/test-assets', express.static(path.join(__dirname, '..', 'test-assets')));

// Routes
app.use('/auth', authRoutes);
app.use('/upload', uploadRoutes);
app.use('/identify-medicines', identifyMedicinesRoutes);
app.use('/instructions', instructionsRoutes);
app.use('/history', historyRoutes);
app.use('/report', reportRoutes);
app.use('/medicines', medicinesRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/caregiver', caregiverRoutes);

const { getCloudServiceStatus } = require('./services/oss');

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'NuskhaSaathi API is running', version: '1.0.0' });
});

// Alibaba Cloud Architecture Status & Health
app.get('/health/cloud', (req, res) => {
  res.json(getCloudServiceStatus());
});

// Handle upload validation errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }

  next(err);
});

// Catch unhandled application errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Initialize database and start server
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`NuskhaSaathi server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
