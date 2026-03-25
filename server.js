require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const multer = require('multer');
const helmet = require('helmet');
const morgan = require('morgan');
const { generateInvoicePDF, DEFAULT_VALUES, LAYOUTS } = require('./pdfGenerator');
const { parseCSV } = require('./csvParser');
const archiver = require('archiver');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
      "script-src-attr": ["'unsafe-inline'"],
    },
  },
}));
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/sample', express.static(path.join(__dirname, 'sample')));

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

// Multer for CSV uploads
const csvStorage = multer.memoryStorage();
const csvUpload = multer({
  storage: csvStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      return cb(null, true);
    }
    cb(new Error('Only CSV files are allowed'));
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

// Available layouts
app.get('/api/layouts', (req, res) => {
  res.json({ success: true, layouts: LAYOUTS });
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

// List all invoices (with pagination)
app.get('/api/invoices', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

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

    const total = invoiceList.length;
    const start = (page - 1) * limit;
    const paginated = invoiceList.slice(start, start + limit);

    res.json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      count: paginated.length,
      invoices: paginated
    });

  } catch (error) {
    next(error);
  }
});

// Delete a single invoice
app.delete('/api/invoices/:filename', async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename); // prevent traversal
    if (!filename.endsWith('.pdf')) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    const filePath = path.join(invoicesDir, filename);
    try {
      await fsPromises.access(filePath);
    } catch {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    await fsPromises.unlink(filePath);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    next(error);
  }
});

// Bulk generate invoices from CSV
app.post('/api/bulk-generate', csvUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded' });
    }

    const { invoices, errors } = parseCSV(req.file.buffer);
    if (invoices.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid invoices found in CSV', errors });
    }

    const output = req.query.output === 'merged' ? 'merged' : 'zip';
    const layoutOverride = LAYOUTS.includes(req.query.layout) ? req.query.layout : null;

    // Generate all PDFs
    const generated = [];
    for (let i = 0; i < invoices.length; i++) {
      if (layoutOverride) invoices[i].layout = layoutOverride;
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000);
      const filename = `invoice${random}${timestamp}.pdf`;
      const outputPath = path.join(invoicesDir, filename);
      await generateInvoicePDF(invoices[i], outputPath);
      generated.push({ filename, outputPath });
    }

    if (output === 'merged') {
      // Merge all PDFs into one using pdf-lib
      const mergedPdf = await PDFDocument.create();
      for (const { outputPath } of generated) {
        const pdfBytes = await fsPromises.readFile(outputPath);
        const srcDoc = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      }
      const mergedBytes = await mergedPdf.save();
      const mergedFilename = `bulk-merged-${Date.now()}.pdf`;
      const mergedPath = path.join(invoicesDir, mergedFilename);
      await fsPromises.writeFile(mergedPath, mergedBytes);

      res.json({
        success: true,
        message: `Merged ${generated.length} invoices into one PDF`,
        count: generated.length,
        skipped: errors.length,
        errors,
        filename: mergedFilename,
        downloadUrl: `/api/download/${mergedFilename}`
      });
    } else {
      // ZIP mode — stream archive
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="invoices-${Date.now()}.zip"`);

      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.on('error', (err) => next(err));
      archive.pipe(res);

      for (const { filename, outputPath } of generated) {
        archive.file(outputPath, { name: filename });
      }

      await archive.finalize();
    }
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
  console.log(`  DELETE /api/invoices/:filename - Delete an invoice`);
  console.log(`  POST /api/bulk-generate   - Bulk generate from CSV`);
  console.log(`  GET  /sample/sample-invoices.csv - Download sample CSV`);
});

module.exports = app;
