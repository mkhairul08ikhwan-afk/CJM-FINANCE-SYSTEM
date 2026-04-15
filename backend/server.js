const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Middleware
app.use(cors());
app.options(/.*/, cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true, limit: '1000mb' }));
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

// Serve uploaded files statically
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve frontend static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

// Data file path
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data.json if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        financial_data: null,
        transactions: [],
        receipts: {}
    }, null, 2));
}

// Multer storage configuration for receipts
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Append timestamp to prevent filename conflicts
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1000 * 1024 * 1024 } // 1000MB limit
});

// GET endpoints
app.get('/api/data', (req, res) => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// POST endpoints
app.post('/api/data', (req, res) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true, message: 'Data saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// File upload endpoint
app.post('/api/upload', upload.array('receipts', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        const files = req.files.map(file => ({
            filePath: `/uploads/${file.filename}`,
            originalName: file.originalname,
            mimeType: file.mimetype
        }));

        res.json({ 
            success: true, 
            files: files
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upload files' });
    }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`CJM Finance System Server is running!`);
    console.log(`--------------------------------------------------`);
    console.log(`Access on this computer: http://localhost:${PORT}`);
    
    // Attempt to show local IP address for other devices
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`Access on other devices: http://${net.address}:${PORT}`);
            }
        }
    }
    console.log(`==================================================\n`);
});
