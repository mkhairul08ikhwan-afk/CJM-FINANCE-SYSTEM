const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
/*
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development convenience, but keep other protections
}));
*/
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

// Data file paths
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const AUDIT_LOG_FILE = path.join(__dirname, 'audit_logs.json');

if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Initialize files if they don't exist
function initializeFile(filePath, initialData) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
    }
}

initializeFile(DATA_FILE, { financial_data: null, transactions: [], receipts: {}, login_logs: [], audit_trail: [], backups: [] });
initializeFile(AUDIT_LOG_FILE, []);

// Helper to log audit actions
function logAudit(action, details, req) {
    try {
        const logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
        const newLog = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            action,
            details,
            username: req.headers['x-user-username'] || 'unknown',
            ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };
        logs.unshift(newLog);
        // Keep last 1000 logs
        if (logs.length > 1000) logs.pop();
        fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
        return newLog;
    } catch (err) {
        console.error('Audit Log Error:', err);
    }
}

// Helper to create a versioned backup
function createBackup(data, action, username) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-${timestamp}-${action.replace(/\s+/g, '_')}.json`;
        const backupPath = path.join(BACKUPS_DIR, backupName);
        
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
        
        // Add to backup index in data
        if (!data.backups) data.backups = [];
        data.backups.unshift({
            id: Date.now(),
            filename: backupName,
            timestamp: new Date().toISOString(),
            action,
            username: username || 'system'
        });
        // Keep last 50 backup records in index
        if (data.backups.length > 50) data.backups.pop();
        
        return backupName;
    } catch (err) {
        console.error('Backup Error:', err);
    }
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

// List backup files (for Recovery Center UI)
app.get('/api/backups', (req, res) => {
    try {
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.toLowerCase().endsWith('.json'))
            .map(filename => {
                const p = path.join(BACKUPS_DIR, filename);
                const stat = fs.statSync(p);
                return {
                    filename,
                    timestamp: stat.mtime.toISOString(),
                    size: stat.size
                };
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(files);
    } catch (err) {
        console.error('Failed to list backups:', err);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// Audit logging endpoint
app.post('/api/audit', (req, res) => {
    try {
        const { action, details } = req.body;
        const log = logAudit(action, details || {}, req);
        res.json({ success: true, log });
    } catch (err) {
        console.error('Audit API Error:', err);
        res.status(500).json({ error: 'Failed to log audit' });
    }
});

// Atomic write helper to prevent data corruption
function safeWriteFile(filePath, data) {
    const tempPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (err) {
        console.error('Safe Write Error:', err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return false;
    }
}

// POST endpoints
app.post('/api/data', (req, res) => {
    try {
        const newData = req.body;
        const action = req.headers['x-action-type'] || 'Data Update';
        const username = req.headers['x-user-username'] || 'unknown';

        // 1. Create a backup of the CURRENT state before overwriting
        try {
            if (fs.existsSync(DATA_FILE)) {
                const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                createBackup(currentData, `Pre-${action}`, username);
            }
        } catch (backupErr) {
            console.warn('Pre-save backup failed:', backupErr);
        }

        // 2. Log audit
        logAudit(action, { summary: 'System data state updated' }, req);

        // 3. Save to main data file (Atomic Write)
        const success = safeWriteFile(DATA_FILE, newData);
        
        if (success) {
            res.json({ success: true, message: 'Data saved and backed up successfully' });
        } else {
            res.status(500).json({ error: 'Failed to write data safely' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Audit log endpoint (Admin only check should be on frontend)
app.get('/api/audit-logs', (req, res) => {
    try {
        const logs = fs.readFileSync(AUDIT_LOG_FILE, 'utf8');
        res.json(JSON.parse(logs));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read audit logs' });
    }
});

// Restore backup endpoint
app.post('/api/restore', (req, res) => {
    try {
        const { filename } = req.body;
        const username = req.headers['x-user-username'] || 'unknown';
        const backupPath = path.join(BACKUPS_DIR, filename);

        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup file not found' });
        }

        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        
        // Before restoring, backup current state as "Pre-Restore Backup"
        const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        createBackup(currentData, 'Pre-Restore Backup', username);

        // Save restored data (Atomic Write)
        const success = safeWriteFile(DATA_FILE, backupData);
        
        if (success) {
            logAudit('Data Restore', { filename }, req);
            res.json({ success: true, message: 'System restored successfully' });
        } else {
            res.status(500).json({ error: 'Failed to restore data safely' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to restore backup' });
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
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`CJM Finance Backend Server`);
    console.log(`Status: Running`);
    console.log(`Port: ${PORT}`);
    console.log(`PID: ${process.pid}`);
    console.log(`PPID: ${process.ppid}`);
    console.log(`Endpoint: http://localhost:${PORT}`);
    console.log(`Time: ${new Date().toLocaleString()}`);
    console.log(`========================================`);
    
    // Detailed process info for debugging
    const logFile = path.join(__dirname, 'server_lifecycle.log');
    const logInfo = `[${new Date().toISOString()}] START: PID=${process.pid}, PPID=${process.ppid}, ARGV=${process.argv.join(' ')}\n`;
    fs.appendFileSync(logFile, logInfo);
});

// Lifecycle and Error Handling
process.on('uncaughtException', (err) => {
    const logFile = path.join(__dirname, 'server_lifecycle.log');
    const logInfo = `[${new Date().toISOString()}] UNCAUGHT_EXCEPTION: ${err.message}\n${err.stack}\n`;
    fs.appendFileSync(logFile, logInfo);
    console.error('CRITICAL: Uncaught Exception', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const logFile = path.join(__dirname, 'server_lifecycle.log');
    const logInfo = `[${new Date().toISOString()}] UNHANDLED_REJECTION: ${reason}\n`;
    fs.appendFileSync(logFile, logInfo);
    console.error('CRITICAL: Unhandled Rejection', reason);
});

process.on('exit', (code) => {
    const logFile = path.join(__dirname, 'server_lifecycle.log');
    const logInfo = `[${new Date().toISOString()}] EXIT: Code=${code}\n`;
    fs.appendFileSync(logFile, logInfo);
});

// Handle termination signals
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
    process.on(signal, () => {
        const logFile = path.join(__dirname, 'server_lifecycle.log');
        const logInfo = `[${new Date().toISOString()}] SIGNAL: ${signal}\n`;
        fs.appendFileSync(logFile, logInfo);
        process.exit(0);
    });
});
