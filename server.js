require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const multer = require('multer');
const helmet = require('helmet');
const morgan = require('morgan');
const { generateInvoicePDF, DEFAULT_VALUES } = require('./pdfGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:"],
      "script-src": ["'self'", "'unsafe-inline'"], // Allow inline scripts for now if needed, but per plan we are moving them. 
    },
  },
}));
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure directories exist
const invoicesDir = path.join(__dirname, 'invoices');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir);
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer configuration for logo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = 'logo-' + Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// API Routes

// Upload logo
app.post('/api/upload-logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      path: path.join(uploadsDir, req.file.filename),
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading logo',
      error: error.message
    });
  }
});

// Get default values
app.get('/api/defaults', (req, res) => {
  res.json({
    success: true,
    data: DEFAULT_VALUES
  });
});

// Generate invoice
app.post('/api/generate-invoice', async (req, res, next) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: 'Request body is missing'
      });
    }
    const invoiceData = req.body;

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const filename = `invoice${random}${timestamp}.pdf`;
    const outputPath = path.join(invoicesDir, filename);

    // Generate PDF
    await generateInvoicePDF(invoiceData, outputPath);

    // Send response
    res.json({
      success: true,
      message: 'Invoice generated successfully',
      filename: filename,
      downloadUrl: `/api/download/${filename}`
    });

  } catch (error) {
    next(error);
  }
});

// Download invoice
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(invoicesDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({
          success: false,
          message: 'Error downloading invoice'
        });
      }
    });

  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading invoice',
      error: error.message
    });
  }
});

// View invoice in browser
app.get('/api/view/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(invoicesDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.contentType('application/pdf');
    fs.createReadStream(filePath).pipe(res);

  } catch (error) {
    console.error('Error viewing invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error viewing invoice',
      error: error.message
    });
  }
});

// List all invoices
app.get('/api/invoices', async (req, res, next) => {
  try {
    const files = await fsPromises.readdir(invoicesDir);
    const pdfFiles = files.filter(file => file.endsWith('.pdf'));

    const invoiceList = await Promise.all(pdfFiles.map(async file => {
      const stats = await fsPromises.stat(path.join(invoicesDir, file));
      return {
        filename: file,
        createdAt: stats.birthtime,
        downloadUrl: `/api/download/${file}`,
        viewUrl: `/api/view/${file}`
      };
    }));

    invoiceList.sort((a, b) => b.createdAt - a.createdAt);

    res.json({
      success: true,
      count: invoiceList.length,
      invoices: invoiceList
    });

  } catch (error) {
    next(error);
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API Documentation:`);
  console.log(`  GET  /api/health          - Health check`);
  console.log(`  GET  /api/defaults        - Get default values`);
  console.log(`  POST /api/generate-invoice - Generate new invoice`);
  console.log(`  GET  /api/download/:filename - Download invoice`);
  console.log(`  GET  /api/view/:filename    - View invoice in browser`);
  console.log(`  GET  /api/invoices        - List all invoices`);
});

module.exports = app;
