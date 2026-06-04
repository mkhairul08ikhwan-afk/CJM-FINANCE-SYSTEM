// --- ENTERPRISE CONFIGURATION ---
const SUPABASE_URL = 'https://cxwgtqjgqcezpgmpveoq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4d2d0cWpncWNlenBnbXB2ZW9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTA4MzMsImV4cCI6MjA5NjAyNjgzM30.ENyLTDZ4gBGujXf4AJ6LIJ2TE6ecaf4l_zA_ThyquNE';
let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_KEY) {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase client initialized successfully.");
    } else {
        console.error("Supabase library not loaded. Ensure <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> is present.");
    }
}

// Cloud State
let isSupabaseOnline = false;
let lastSyncTime = localStorage.getItem('cjm_last_sync') || 'Never';
let unsyncedRecords = [];

// Session Management (Phase 12)
let lastActivity = Date.now();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function updateActivity() {
    lastActivity = Date.now();
}

function checkSession() {
    if (Date.now() - lastActivity > SESSION_TIMEOUT) {
        alert("Session expired due to inactivity.");
        handleLogout();
    }
}

document.addEventListener('mousemove', updateActivity);
document.addEventListener('keydown', updateActivity);
setInterval(checkSession, 60000); // Check every minute

// Predefined Users & Roles (Phase 13)
const ROLES = {
    ADMIN: 'Administrator',
    MANAGER: 'Manager',
    STAFF: 'Staff'
};

const users = [
    { username: "firdaus.ramlan", password: "Firdaus@CJM26", name: "Firdaus", role: ROLES.ADMIN },
    { username: "castello005", password: "Castello@CJM26", name: "Castello", role: ROLES.MANAGER },
    { username: "shukri.000", password: "Shukri@CJM26", name: "Shukri", role: ROLES.STAFF },
    { username: "kyrul.08", password: "Khairul@CJM26", name: "Khairul", role: ROLES.ADMIN }
];

// Sample Transactions
const transactions_list = [];

// API Configuration
const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
const isFile = window.location.protocol === 'file:';

// AUTO-REDIRECT: If opened from file://, redirect to localhost:3000
if (isFile) {
    console.log("[PROTOCOL CHECK] Application opened from file system. Redirecting to localhost:3000...");
    
    // Extract the filename and directory structure after the project root
    // We look for common entry points to determine where we are
    const path = window.location.pathname;
    let webPath = "/index.html"; // Default fallback
    
    if (path.includes("index.html")) webPath = "/index.html";
    else if (path.includes("accounts.html")) webPath = "/accounts.html";
    else if (path.includes("form.html/form.html")) webPath = "/form.html/form.html";
    else {
        // Generic fallback: try to find the last part of the path
        const parts = path.split(/[\\\/]/);
        const fileName = parts[parts.length - 1];
        const dirName = parts[parts.length - 2];
        if (dirName && dirName.endsWith(".html")) webPath = `/${dirName}/${fileName}`;
        else webPath = `/${fileName}`;
    }

    window.location.href = 'http://localhost:3000' + webPath;
}

const params = new URLSearchParams(window.location.search);
let origin = params.get('server') || params.get('api') || '';

if (!origin && isHttp) {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
    const isPrivateIp = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    // If we are on a production host (not local), use current origin
    if (isLocalHost || isPrivateIp) {
        origin = `http://${host}:3000`;
    } else {
        origin = window.location.origin;
    }
}

if (!isHttp && !origin) {
    origin = localStorage.getItem('cjm_server_origin') || '';
}

// Final fallback: if still no origin, assume same origin relative to current page
origin = String(origin || window.location.origin).trim();
origin = origin.replace(/\/api(\/.*)?$/i, '').replace(/\/+$/, '');

try {
    if (origin && !/^https?:\/\//i.test(origin) && origin !== 'null') origin = `http://${origin}`;
    if (origin && origin !== 'null') origin = new URL(origin).origin;
} catch (_) {
    origin = isHttp ? window.location.origin : 'http://localhost:3000';
}

const API_URL = `${origin}/api`;
const UPLOAD_URL = origin;

// Global Data State
let globalData = {
    financial_data: getInitialFinancialData(),
    transactions: [],
    receipts: [],
    recycle_bin: [],
    audit_trail: [],
    backups: [],
    login_logs: [],
    deletedTransactions: [],
    accounts: []
};
let lastServerError = "";
let currentReportMode = 'all'; // all, yearly, monthly
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth();

function getTodayISODate() {
    return new Date().toISOString().split('T')[0];
}

// --- DATA INTEGRITY CHECKER ---

function checkDataIntegrity(silent = true) {
    const data = globalData.financial_data;
    if (!data) return { healthy: false, message: "No financial data found" };

    const transactions = globalData.transactions || [];
    let calculatedIncome = 0;
    let calculatedExpenses = 0;

    transactions.forEach(t => {
        if (t.status === 'Cancelled') return;
        const amount = Math.abs(parseFloat(t.amount) || 0);
        if (t.category === 'Revenue') {
            calculatedIncome += amount;
        } else {
            calculatedExpenses += amount;
        }
    });

    const incomeMatch = Math.abs(calculatedIncome - data.totalIncome) < 0.01;
    const expenseMatch = Math.abs(calculatedExpenses - data.totalExpenses) < 0.01;
    const balanceMatch = Math.abs((calculatedIncome - calculatedExpenses) - data.balance) < 0.01;

    const healthy = incomeMatch && expenseMatch && balanceMatch;
    const status = healthy ? "🟢 Healthy" : "🔴 Integrity Warning";
    
    if (!silent && !healthy) {
        let errorMsg = "Data Integrity Check Failed:\n";
        if (!incomeMatch) errorMsg += `- Income mismatch: Calc RM ${calculatedIncome.toFixed(2)} vs Store RM ${data.totalIncome.toFixed(2)}\n`;
        if (!expenseMatch) errorMsg += `- Expense mismatch: Calc RM ${calculatedExpenses.toFixed(2)} vs Store RM ${data.totalExpenses.toFixed(2)}\n`;
        if (!balanceMatch) errorMsg += `- Balance mismatch detected\n`;
        alert(errorMsg + "\nPlease use 'Recalculate Overview' in Settings to fix this.");
    }

    return { 
        healthy, 
        status,
        incomeMatch,
        expenseMatch,
        balanceMatch,
        calculatedIncome,
        calculatedExpenses,
        calculatedBalance: calculatedIncome - calculatedExpenses
    };
}

// --- AUTHENTICATION ---

// Handle Login Form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    console.log("Login form detected on page");
    loginForm.onsubmit = async function(e) {
        e.preventDefault();
        console.log("Login form submitted via onsubmit");
        
        const userVal = document.getElementById('username').value.trim();
        const passVal = document.getElementById('password').value.trim();
        const errorMsg = document.getElementById('errorMessage');
        const loginBtn = loginForm.querySelector('button[type="submit"]');

        console.log("Attempting login for:", userVal);

        // Reset error
        if (errorMsg) {
            errorMsg.style.opacity = "0";
            errorMsg.innerText = "";
        }

        const user = users.find(u => u.username === userVal && u.password === passVal);

        if (user) {
            console.log("User found:", user.username);
            try {
                // Show loading state
                if (loginBtn) {
                    loginBtn.disabled = true;
                    loginBtn.innerText = "Redirecting...";
                }

                // Extract first name from full name or username if needed
                const firstName = user.name.split(' ')[0];
                const userData = { ...user, firstName: firstName };
                
                // Store user in localStorage - this is the "Key" to getting in
                localStorage.setItem("cjm_user", JSON.stringify(userData));
                
                console.log("Login credentials verified. Moving to main system...");

                // Log login event to server
                await logAuditToServer('Login', { name: userData.name });
                
                // CRITICAL FIX: Clear old memory data to force fresh load from Supabase/Backend
                globalData.financial_data = null;
                globalData.transactions = [];
                globalData.receipts = [];
                globalData.recycle_bin = [];
                globalData.audit_trail = [];
                globalData.backups = [];
                globalData.deletedTransactions = [];
                globalData.accounts = [];

                // Redirect IMMEDIATELY. 
                // Don't wait for server data here. Accounts will handle it.
                window.location.href = "accounts.html";
            } catch (err) {
                console.error("Login redirect error:", err);
                window.location.href = "accounts.html"; // Emergency fallback
            }
        } else {
            console.log("Login failed: Invalid credentials");
            if (errorMsg) {
                errorMsg.innerText = "Invalid username or password. Please try again.";
                errorMsg.style.opacity = "1";
            }
            // Ensure button is re-enabled if it was disabled
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerText = "Sign In";
            }
        }
        return false;
    };
}

// Check Auth on Dashboard
async function checkAuth(isSubfolder = false) {
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    const redirectPath = isSubfolder ? "../index.html" : "index.html";
    
    if (!user) {
        window.location.href = redirectPath;
        return;
    }
    
    // Set UI elements
    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.innerText = user.firstName;
    
    const isAdmin = user.username === 'firdaus.ramlan' || user.username === 'kyrul.08';
    const isKhairul = user.username === 'kyrul.08';

    // Navigation Menu Visibility Control
    const menuForm = document.getElementById('menu-form');
    const menuTransactions = document.getElementById('menu-transactions');
    const menuAccounts = document.getElementById('menu-accounts');
    const menuReceipts = document.getElementById('menu-receipts');
    const menuReports = document.getElementById('menu-reports');
    const menuRecovery = document.getElementById('menu-recovery');
    const menuSettings = document.getElementById('menu-settings');

    if (menuForm) menuForm.style.display = 'block'; // Everyone
    if (menuTransactions) menuTransactions.style.display = isAdmin ? 'block' : 'none';
    if (menuAccounts) menuAccounts.style.display = isAdmin ? 'block' : 'none';
    if (menuReceipts) menuReceipts.style.display = isAdmin ? 'block' : 'none';
    if (menuReports) menuReports.style.display = isAdmin ? 'block' : 'none';
    if (menuRecovery) menuRecovery.style.display = isAdmin ? 'block' : 'none';
    if (menuSettings) menuSettings.style.display = isKhairul ? 'block' : 'none';
    
    await loadDataFromServer();

    // Check Supabase Configuration
    checkSupabaseConfig();

    // Only run these on pages that have the elements
    if (document.getElementById('totalBalanceDisplay')) {
        populateYearSelector();
        populateDashboardSelectors();
        displayFinancialStats();
        checkDataIntegrity(true); // Check integrity SILENTLY on load
        if (typeof updateMonthlySummary === 'function') updateMonthlySummary();
        if (typeof updateYearlySummary === 'function') updateYearlySummary();
        if (typeof updateIncentiveSummary === 'function') updateIncentiveSummary();
    }
    if (document.getElementById('transactionBody') || document.getElementById('transactions-container')) {
        renderTransactions();
    }
    if (document.getElementById('loginLogBody')) {
        renderLoginLogs();
    }
}

// --- SUPABASE CLOUD SYNC ---

async function checkSupabaseConfig() {
    const syncBtn = document.getElementById('syncToCloudBtn');
    const quickSyncBtn = document.getElementById('quickSyncBtn');
    const statusText = document.getElementById('supabaseStatusText');
    const cloudBadge = document.getElementById('cloudStatusBadge');
    
    if (!supabaseClient) {
        isSupabaseOnline = false;
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.style.opacity = '0.5';
            syncBtn.style.cursor = 'not-allowed';
        }
        if (statusText) {
            statusText.innerText = "Supabase Cloud Sync is not configured. Please provide SUPABASE_URL and SUPABASE_KEY in script.js.";
            statusText.style.color = "#dc2626";
        }
        if (cloudBadge) {
            cloudBadge.innerText = "🔴 Unconfigured";
            cloudBadge.style.color = "#dc2626";
        }
        return;
    }

    try {
        // Test connection
        const { data, error, status } = await supabaseClient.from('transactions').select('count', { count: 'exact', head: true });
        
        if (error) {
            if (status === 404) {
                throw new Error("Tables not found. Please run the SQL setup in Supabase Dashboard.");
            }
            throw error;
        }

        isSupabaseOnline = true;
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.style.opacity = '1';
        }
        if (statusText) {
            statusText.innerText = "Supabase Cloud is connected and ready for synchronization.";
            statusText.style.color = "#059669";
        }
        if (cloudBadge) {
            cloudBadge.innerText = "🟢 Connected";
            cloudBadge.style.color = "#059669";
        }
        
        // Update counts and check for migration
        const cloudCount = data ? data.length : 0;
        updateSyncStatusUI(cloudCount);

        if (cloudCount === 0 && globalData.transactions.length > 0) {
            if (statusText) {
                statusText.innerText = "Cloud tables are empty. Migration Ready: Click 'Sync Now' to upload your local data.";
                statusText.style.color = "#f59e0b"; // amber
            }
        }

    } catch (err) {
        console.warn("Supabase Connection Test Failed:", err.message);
        isSupabaseOnline = false;
        if (cloudBadge) {
            cloudBadge.innerText = "🔴 Supabase Offline (Using Local Storage)";
            cloudBadge.style.color = "#dc2626";
        }
        if (statusText) {
            statusText.innerText = "Connection Failed: " + err.message;
            statusText.style.color = "#dc2626";
        }
        updateSyncStatusUI();
    }
}

async function handleManualSync() {
    const syncBtn = document.getElementById('syncToCloudBtn');
    const quickSyncBtn = document.getElementById('quickSyncBtn');
    const statusText = document.getElementById('supabaseStatusText');
    
    if (!supabaseClient) {
        alert("Supabase is not configured.");
        return;
    }

    try {
        // 1. Show Progress
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerText = "Syncing...";
        }
        if (quickSyncBtn) {
            quickSyncBtn.disabled = true;
            quickSyncBtn.innerText = "Syncing...";
        }
        if (statusText) {
            statusText.innerText = "Uploading latest local data to Supabase...";
            statusText.style.color = "#2563eb";
        }

        // 2. Perform Sync (includes backup)
        const success = await saveDataToServer('Manual Cloud Sync');

        // 3. Show Result
        if (success) {
            lastSyncTime = new Date().toLocaleString();
            localStorage.setItem('cjm_last_sync', lastSyncTime);
            
            if (syncBtn) syncBtn.innerText = "Sync Complete";
            if (quickSyncBtn) quickSyncBtn.innerText = "Sync Complete";
            if (statusText) {
                statusText.innerText = "Sync Complete: Data is now safe in the Cloud.";
                statusText.style.color = "#059669";
            }
            
            updateSyncStatusUI();

            setTimeout(() => {
                if (syncBtn) {
                    syncBtn.innerText = "Sync to Cloud";
                    syncBtn.disabled = false;
                }
                if (quickSyncBtn) {
                    quickSyncBtn.innerText = "Sync Now";
                    quickSyncBtn.disabled = false;
                }
            }, 3000);
        } else {
            throw new Error(lastServerError || "Sync failed");
        }
    } catch (err) {
        if (syncBtn) {
            syncBtn.innerText = "Sync Failed";
            syncBtn.disabled = false;
        }
        if (quickSyncBtn) {
            quickSyncBtn.innerText = "Sync Failed";
            quickSyncBtn.disabled = false;
        }
        if (statusText) {
            statusText.innerText = "Error: " + err.message;
            statusText.style.color = "#dc2626";
        }
    }
}

async function initialMigration() {
    if (!supabaseClient) {
        console.error("[DEBUG] Supabase client not initialized. Migration aborted.");
        return;
    }
    
    console.log("--- [DEBUG] STARTING SUPABASE DIAGNOSTIC MIGRATION ---");
    console.log("[DEBUG] Target Table 1: 'transactions'");
    console.log("[DEBUG] Target Table 2: 'audit_logs'");
    
    try {
        // 1. Prepare and Sanitize Transactions
        const sanitizedTx = globalData.transactions.map(t => ({
            id: parseInt(t.id),
            date: t.date,
            description: t.desc || '',
            category: t.category || 'Expense',
            formtype: t.formType || 'office',
            amount: parseFloat(t.amount) || 0,
            status: t.status || 'Pending',
            hasreceipt: !!t.hasReceipt,
            filledby: t.filledBy || 'system',
            client: t.client || '',
            itemizeddata: typeof t.itemizedData === 'object' ? t.itemizedData : {},
            updatedat: new Date().toISOString()
        }));

        console.log("[DEBUG] Uploading transaction payload (first record):", sanitizedTx[0]);
        
        // EXECUTE UPSERT
        const txResponse = await supabaseClient
            .from('transactions')
            .upsert(sanitizedTx, { onConflict: 'id' })
            .select();
            
        console.log("[DEBUG] Supabase Transaction Response:", txResponse);

        if (txResponse.error) {
            console.error("[DEBUG] Supabase Transaction ERROR Object:", JSON.stringify(txResponse.error, null, 2));
            throw txResponse.error;
        }
        console.log("[DEBUG] Transaction upload success. Record count returned:", txResponse.data ? txResponse.data.length : 0);

        // 2. Prepare and Sanitize Audit Logs
        const logs = globalData.audit_trail || [];
        const sanitizedLogs = logs.map(l => ({
            id: l.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            action: l.action || 'Unknown',
            username: l.username || 'unknown',
            timestamp: l.timestamp || new Date().toISOString(),
            details: typeof l.details === 'object' ? l.details : { message: String(l.details) },
            ipaddress: l.ip || '0.0.0.0'
        }));

        console.log("[DEBUG] Uploading audit logs payload (first record):", sanitizedLogs[0]);

        const logResponse = await supabaseClient
            .from('audit_logs')
            .upsert(sanitizedLogs, { onConflict: 'id' })
            .select();

        console.log("[DEBUG] Supabase Audit Log Response:", logResponse);

        if (logResponse.error) {
            console.error("[DEBUG] Supabase Audit Log ERROR Object:", JSON.stringify(logResponse.error, null, 2));
            throw logResponse.error;
        }
        console.log("[DEBUG] Audit log upload success. Record count returned:", logResponse.data ? logResponse.data.length : 0);

        // 3. IMMEDIATE DIRECT VERIFICATION
        console.log("[DEBUG] Performing immediate post-upload verification query...");
        
        const txVerify = await supabaseClient.from('transactions').select('*', { count: 'exact', head: true });
        const logVerify = await supabaseClient.from('audit_logs').select('*', { count: 'exact', head: true });

        console.log(`--- [DEBUG] DATABASE EVIDENCE ---`);
        console.log(`Local Transactions (data.json): ${globalData.transactions.length}`);
        console.log(`Local Audit Logs (audit_logs.json): ${logs.length}`);
        console.log(`Cloud Transactions (Supabase): ${txVerify.count}`);
        console.log(`Cloud Audit Logs (Supabase): ${logVerify.count}`);
        
        if (txVerify.count === 0 && globalData.transactions.length > 0) {
            console.error("[DEBUG] CRITICAL: Supabase reports 0 records despite successful upsert response!");
        }

        lastSyncTime = new Date().toLocaleString();
        localStorage.setItem('cjm_last_sync', lastSyncTime);
        checkSupabaseConfig();
        return true;
    } catch (err) {
        console.error("[DEBUG] Migration FATAL ERROR:", err.message);
        console.error("[DEBUG] Full Error Details:", err);
        return false;
    }
}

function updateSyncStatusUI(cloudCount = null) {
    const lastSyncDisplay = document.getElementById('lastSyncDisplay');
    const localRecordCount = document.getElementById('localRecordCount');
    const cloudRecordCountDisplay = document.getElementById('cloudRecordCount');
    const lastBackupDisplay = document.getElementById('lastBackupDisplay');

    if (lastSyncDisplay) lastSyncDisplay.innerText = lastSyncTime;
    if (localRecordCount) localRecordCount.innerText = globalData.transactions.length;
    if (cloudRecordCountDisplay && cloudCount !== null) cloudRecordCountDisplay.innerText = cloudCount;
    if (lastBackupDisplay) {
        const lastBackup = globalData.backups && globalData.backups[0];
        lastBackupDisplay.innerText = lastBackup ? new Date(lastBackup.timestamp).toLocaleString() : 'Never';
    }
}

// Reset Financial Data and Receipts
async function handleResetData() {
    if (confirm("Are you sure you want to reset all financial totals, transactions, and receipts? This cannot be undone.")) {
        try {
            const user = JSON.parse(localStorage.getItem("cjm_user"));

            if (supabaseClient) {
                const txDelete = await supabaseClient.from('transactions').delete().neq('id', -1);
                if (txDelete.error) throw new Error(`Supabase reset failed (transactions): ${txDelete.error.message}`);

                const logsDelete = await supabaseClient.from('audit_logs').delete().neq('id', '');
                if (logsDelete.error) throw new Error(`Supabase reset failed (audit_logs): ${logsDelete.error.message}`);
            }

            // Preserving structural integrity while resetting values
            globalData.financial_data = getInitialFinancialData();
            globalData.transactions = [];
            globalData.receipts = [];
            globalData.recycle_bin = [];
            globalData.deletedTransactions = [];
            globalData.accounts = [];
            // audit_trail, backups, and login_logs are preserved by not being modified

            const success = await saveDataToServer('Reset System');
            if (!success) throw new Error(lastServerError || 'Local reset failed');

            await logAuditToServer('Reset System', { username: user ? user.username : 'unknown' });

            alert("System has been reset to RM 0.00 with empty transactions, reports, and recycle bin.");
            window.location.reload();
        } catch (err) {
            console.error("Failed to reset data:", err);
            alert("An error occurred while resetting data.");
        }
    }
}

// Handle Logout
function handleLogout(isSubfolder = false) {
    localStorage.removeItem("cjm_user");
    const redirectPath = isSubfolder ? "../index.html" : "index.html";
    window.location.href = redirectPath;
}

// Navigation to Forms
function openForm(type) {
    localStorage.setItem("formType", type);
    const target = isHttp ? `${window.location.origin}/form.html/form.html` : "form.html/form.html";
    window.location.href = target;
}

// Receipt Logic
function toggleReceiptList(type) {
    const listContainer = document.getElementById(`receipt-list-${type}`);
    if (!listContainer) return;

    // Toggle visibility
    if (listContainer.style.display === 'block') {
        listContainer.style.display = 'none';
        return;
    }

    // Hide all other lists first
    document.querySelectorAll('.receipt-list').forEach(l => l.style.display = 'none');
    
    // Show current list
    listContainer.style.display = 'block';
    renderReceiptList(type);
}

function renderReceiptList(type) {
    const listContainer = document.getElementById(`receipt-list-${type}`);
    const receipts = globalData.receipts || [];
    const filtered = receipts.filter(r => r.formType === type);

    if (filtered.length === 0) {
        listContainer.innerHTML = '<p style="padding: 1rem; font-size: 0.875rem; color: var(--text-muted);">No receipts found.</p>';
        return;
    }

    listContainer.innerHTML = `
        <div style="padding: 0.5rem 1rem; font-size: 0.75rem; color: var(--text-muted); border-bottom: 1px solid var(--border);">
            Storage: ${filtered.length} / 1000 receipts used
        </div>
    ` + filtered.map(receipt => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border);">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;">
                <span style="font-weight: 600; display: block; font-size: 0.875rem;">${receipt.originalName}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">ID: ${receipt.transactionId}</span>
            </div>
            <a href="${UPLOAD_URL}${receipt.filePath}" target="_blank" download class="btn btn-primary" style="padding: 4px 12px; font-size: 0.75rem; text-decoration: none;">Download</a>
        </div>
    `).join('');
}

// --- REPORTING MODES ---

function populateYearSelector() {
    const selector = document.getElementById('reportYearSelector');
    if (!selector) return;

    const currentYear = new Date().getFullYear();
    const years = new Set();
    years.add(currentYear);

    // Add years from transactions
    globalData.transactions.forEach(t => {
        const year = new Date(t.date).getFullYear();
        if (!isNaN(year)) years.add(year);
    });

    const sortedYears = Array.from(years).sort((a, b) => b - a);
    selector.innerHTML = sortedYears.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('');
}

function getAvailableYearsFromTransactions() {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear]);
    const tx = Array.isArray(globalData.transactions) ? globalData.transactions : Object.values(globalData.transactions || {});
    tx.forEach(t => {
        const d = t && t.date ? new Date(t.date) : null;
        const y = d ? d.getFullYear() : NaN;
        if (!isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
}

function populateYearSelectElement(selector, years, selectedValue, includeAll = false) {
    if (!selector) return;
    const options = [];
    if (includeAll) options.push(`<option value="all">All Years</option>`);
    options.push(...years.map(y => `<option value="${y}" ${String(y) === String(selectedValue) ? 'selected' : ''}>${y}</option>`));
    selector.innerHTML = options.join('');
}

function populateDashboardSelectors() {
    const years = getAvailableYearsFromTransactions();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const monthlyYear = document.getElementById('monthlyYearSelector');
    const yearlyYear = document.getElementById('yearlyYearSelector');
    const incentiveYear = document.getElementById('incentiveYearSelector');
    const txYear = document.getElementById('txFilterYear');

    populateYearSelectElement(monthlyYear, years, currentYear);
    populateYearSelectElement(yearlyYear, years, currentYear);
    populateYearSelectElement(incentiveYear, years, currentYear);
    populateYearSelectElement(txYear, years, 'all', true);

    const monthlyMonth = document.getElementById('monthlyMonthSelector');
    if (monthlyMonth) monthlyMonth.value = String(currentMonth);
    const incentiveMonth = document.getElementById('incentiveMonthSelector');
    if (incentiveMonth) incentiveMonth.value = String(currentMonth);
}

function updateMonthlySummary() {
    const monthEl = document.getElementById('monthlyMonthSelector');
    const yearEl = document.getElementById('monthlyYearSelector');
    if (!monthEl || !yearEl) return;

    const m = parseInt(monthEl.value);
    const y = parseInt(yearEl.value);

    const tx = Array.isArray(globalData.transactions) ? globalData.transactions : Object.values(globalData.transactions || {});
    const scoped = tx.filter(t => {
        if (!t || !t.date || t.status === 'Cancelled') return false;
        const d = new Date(t.date);
        return d.getFullYear() === y && d.getMonth() === m;
    });

    const income = scoped.filter(t => t.category === 'Revenue').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const expense = scoped.filter(t => t.category !== 'Revenue').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const net = income - expense;

    const incomeEl = document.getElementById('monthlyIncomeDisplay');
    const expenseEl = document.getElementById('monthlyExpenseDisplay');
    const netEl = document.getElementById('monthlyNetDisplay');
    if (incomeEl) incomeEl.innerText = `+ RM ${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.innerText = `- RM ${expense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (netEl) netEl.innerText = `RM ${net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateYearlySummary() {
    const yearEl = document.getElementById('yearlyYearSelector');
    if (!yearEl) return;

    const y = parseInt(yearEl.value);

    const tx = Array.isArray(globalData.transactions) ? globalData.transactions : Object.values(globalData.transactions || {});
    const scoped = tx.filter(t => {
        if (!t || !t.date || t.status === 'Cancelled') return false;
        const d = new Date(t.date);
        return d.getFullYear() === y;
    });

    const income = scoped.filter(t => t.category === 'Revenue').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const expense = scoped.filter(t => t.category !== 'Revenue').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const net = income - expense;

    const incomeEl = document.getElementById('yearlyIncomeDisplay');
    const expenseEl = document.getElementById('yearlyExpenseDisplay');
    const netEl = document.getElementById('yearlyNetDisplay');
    if (incomeEl) incomeEl.innerText = `+ RM ${income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.innerText = `- RM ${expense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (netEl) netEl.innerText = `RM ${net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getIncentiveEmployeeName(t) {
    if (!t || !t.itemizedData) return 'Unknown';
    const fromDropdown = t.itemizedData["Staff Name"] || t.itemizedData["Employee Name"] || t.itemizedData["Recipient Name"] || t.itemizedData.employeeName;
    const fromManual = t.itemizedData["Other Staff Name"];
    
    const name = (fromDropdown || fromManual || '').toString().trim();
    return name || 'Unknown';
}

function updateIncentiveSummary() {
    const monthEl = document.getElementById('incentiveMonthSelector');
    const yearEl = document.getElementById('incentiveYearSelector');
    if (!monthEl || !yearEl) return;

    const m = parseInt(monthEl.value);
    const y = parseInt(yearEl.value);

    const tx = Array.isArray(globalData.transactions) ? globalData.transactions : Object.values(globalData.transactions || {});
    const incentives = tx.filter(t => {
        if (!t || !t.date || t.status === 'Cancelled') return false;
        if (t.formType === 'staff_incentive') return true;
        if (t.category === 'Staff Incentive') return true;
        return false;
    });

    const monthScoped = incentives.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === y && d.getMonth() === m;
    });
    const yearScoped = incentives.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === y;
    });

    const monthTotal = monthScoped.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const yearTotal = yearScoped.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);

    const totalMonthEl = document.getElementById('incentiveTotalMonth');
    const totalYearEl = document.getElementById('incentiveTotalYear');
    const recordCountEl = document.getElementById('incentiveRecordCount');
    if (totalMonthEl) totalMonthEl.innerText = `RM ${monthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (totalYearEl) totalYearEl.innerText = `RM ${yearTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (recordCountEl) recordCountEl.innerText = `${yearScoped.length}`;

    const byEmployee = {};
    yearScoped.forEach(t => {
        const name = getIncentiveEmployeeName(t);
        byEmployee[name] = (byEmployee[name] || 0) + Math.abs(parseFloat(t.amount) || 0);
    });

    const body = document.getElementById('incentiveByEmployeeBody');
    if (body) {
        const rows = Object.entries(byEmployee)
            .sort((a, b) => b[1] - a[1])
            .map(([name, amount]) => `
                <tr>
                    <td style="font-weight: 700;">${name}</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 700;">RM ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            `);
        body.innerHTML = rows.length > 0 ? rows.join('') : '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: #94a3b8;">No incentive records</td></tr>';
    }
}

function handleReportModeChange() {
    const mode = document.getElementById('reportModeSelector').value;
    currentReportMode = mode;

    const yearGroup = document.getElementById('yearSelectorGroup');
    const monthGroup = document.getElementById('monthSelectorGroup');

    if (mode === 'all') {
        yearGroup.style.display = 'none';
        monthGroup.style.display = 'none';
    } else if (mode === 'yearly') {
        yearGroup.style.display = 'block';
        monthGroup.style.display = 'none';
    } else if (mode === 'monthly') {
        yearGroup.style.display = 'block';
        monthGroup.style.display = 'block';
    }

    updateFilteredStats();
}

function updateFilteredStats() {
    const yearEl = document.getElementById('reportYearSelector');
    const monthEl = document.getElementById('reportMonthSelector');
    
    if (yearEl) selectedYear = parseInt(yearEl.value);
    if (monthEl) selectedMonth = parseInt(monthEl.value);

    displayFinancialStats();
    renderTransactions();
}

function getFilteredTransactions() {
    const allTransactions = Array.isArray(globalData.transactions) ? globalData.transactions : Object.values(globalData.transactions || {});
    
    const statusEl = document.getElementById('reportStatusSelector');
    const statusVal = statusEl ? statusEl.value : 'all';

    let removedInvalidDate = 0;
    const filtered = allTransactions.filter(t => {
        if (!t || !t.date) {
            removedInvalidDate += 1;
            return false;
        }

        if (statusVal !== 'all' && t.status !== statusVal) return false;

        const tDate = new Date(t.date);
        const tYear = tDate.getFullYear();
        const tMonth = tDate.getMonth();

        if (currentReportMode === 'yearly') {
            return tYear === selectedYear;
        } else if (currentReportMode === 'monthly') {
            return tYear === selectedYear && tMonth === selectedMonth;
        }
        return true;
    });

    if (allTransactions.length > 0 && filtered.length === 0) {
        console.warn("FILTER ALERT: Records exist in memory but were HIDDEN by current filter settings.");
    }
    return filtered;
}

function calculateFilteredData() {
    const filteredTransactions = getFilteredTransactions();
    const data = getInitialFinancialData();

    filteredTransactions.forEach(t => {
        if (t.status === 'Cancelled') return;

        const amount = Math.abs(t.amount);
        
        if (t.category === 'Revenue') {
            data.totalIncome += amount;
            data.balance += amount;
            if (t.status === 'Pending') {
                data.pendingIncome += amount;
            } else if (t.status === 'Completed') {
                data.completedIncome += amount;
            }
        } else {
            data.totalExpenses += amount;
            data.balance -= amount;

            if (t.formType === 'office') {
                data.officeExpenses += amount;
                // Use itemizedData if available, otherwise fallback to desc matching
                if (t.itemizedData) {
                    for (let key in t.itemizedData) {
                        if (data.officeBreakdown.hasOwnProperty(key)) {
                            data.officeBreakdown[key] += parseFloat(t.itemizedData[key] || 0);
                        }
                    }
                } else if (data.officeBreakdown.hasOwnProperty(t.desc)) {
                    data.officeBreakdown[t.desc] += amount;
                }
            } else if (t.formType === 'program') {
                data.programExpenses += amount;
                if (t.itemizedData) {
                    for (let key in t.itemizedData) {
                        if (data.programBreakdown.hasOwnProperty(key)) {
                            data.programBreakdown[key] += parseFloat(t.itemizedData[key] || 0);
                        }
                    }
                } else if (data.programBreakdown.hasOwnProperty(t.desc)) {
                    data.programBreakdown[t.desc] += amount;
                }
            } else if (t.formType === 'company') {
                data.companyExpenses += amount;
                if (t.itemizedData) {
                    for (let key in t.itemizedData) {
                        if (data.companyBreakdown.hasOwnProperty(key)) {
                            data.companyBreakdown[key] += parseFloat(t.itemizedData[key] || 0);
                        }
                    }
                } else if (data.companyBreakdown.hasOwnProperty(t.desc)) {
                    data.companyBreakdown[t.desc] += amount;
                }
            } else if (t.formType === 'staff_incentive' || t.category === 'Staff Incentive') {
                const incentiveOnly = Math.abs(parseFloat(t.itemizedData ? t.itemizedData["Incentive Amount"] : t.amount) || 0);
                
                data.staffIncentives = (data.staffIncentives || 0) + incentiveOnly;
                
                // Both go to company expenses
                data.companyExpenses += incentiveOnly;
                if (data.companyBreakdown.hasOwnProperty("Staff Incentive")) {
                    data.companyBreakdown["Staff Incentive"] += incentiveOnly;
                }
                
                // Legacy: Handle Other Commitment if it exists in old Staff Incentive records
                if (t.itemizedData && t.itemizedData["Other Commitment"]) {
                    const otherOnly = Math.abs(parseFloat(t.itemizedData["Other Commitment"]) || 0);
                    data.companyExpenses += otherOnly;
                    if (data.companyBreakdown.hasOwnProperty("Other Commitment")) {
                        data.companyBreakdown["Other Commitment"] += otherOnly;
                    }
                }
            } else if (t.formType === 'daily') {
                data.dailyExpenses += amount;
            }
        }
    });

    return data;
}

// --- FINANCIAL DATA MANAGEMENT ---

function getInitialFinancialData() {
    return {
        totalIncome: 0.00,
        pendingIncome: 0.00,
        completedIncome: 0.00,
        totalExpenses: 0.00,
        balance: 0.00,
        officeExpenses: 0.00,
        programExpenses: 0.00,
        companyExpenses: 0.00,
        staffIncentives: 0.00,
        dailyExpenses: 0.00,
        officeBreakdown: {
            "Rental": 0, "Cleaner Expenses": 0, "Water Bills": 0, "Electric Bills": 0, "WiFi & Internet": 0, "Pantry": 0, "Renovation": 0
        },
        programBreakdown: {
            "Hotel": 0, "Living Expenses": 0, "Toll": 0, "Flight Ticket": 0, "Gift/Hamper/Stationary/Other": 0, "T-Shirt": 0, "Car Rental": 0, "Car Fuel": 0, "Guest Speaker": 0, "Venue": 0, "Catering": 0
        },
        companyBreakdown: {
            "Vehicle Maintenance": 0, "Volunteer House": 0, "Program/Company Supplies": 0, "Staff Incentive": 0, "Other Commitment": 0
        }
    };
}

// Load data from backend API or Supabase
async function loadDataFromServer() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
        let dataLoaded = false;

        // 1. PRIMARY STORAGE: Supabase Cloud
        if (supabaseClient) {
            try {
                // Fetch transactions
                const { data: txData, error: txError, status: txStatus } = await supabaseClient
                    .from('transactions')
                    .select('*')
                    .order('id', { ascending: false });
                
                if (txError) {
                    console.error("[3. SUPABASE] Select Error:", txError.message, "Status:", txStatus);
                    if (txStatus === 404) throw new Error("Transactions table not found.");
                    throw txError;
                }

                if (txData) {
                    // Map Supabase fields back to local structure
                    globalData.transactions = txData.map(t => ({
                        id: t.id,
                        date: t.date,
                        desc: t.description,
                        category: t.category,
                        formType: t.formtype,
                        amount: t.amount,
                        status: t.status,
                        hasReceipt: t.hasreceipt,
                        filledBy: t.filledby ?? t.filledBy,
                        client: t.client,
                        itemizedData: t.itemizeddata
                    }));

                    console.log(`[3. SUPABASE] Loaded ${txData.length} transactions.`);
                    isSupabaseOnline = true;
                    dataLoaded = true;
                    
                    // Update the UI since we are connected
                    setTimeout(() => {
                        if (typeof checkSupabaseConfig === 'function') checkSupabaseConfig();
                    }, 100);
                }
            } catch (supaErr) {
                console.error("[3. SUPABASE] Cloud Load Failed:", supaErr.message);
                isSupabaseOnline = false;
            }
        }

        // 2. FALLBACK STORAGE: Local Backend
        if (!dataLoaded) {
            console.log(`[3. BACKEND] Fetching from: ${API_URL}/data`);
            const response = await fetch(`${API_URL}/data`, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

            const data = await response.json();
            globalData.financial_data = data.financial_data || getInitialFinancialData();
            globalData.transactions = Array.isArray(data.transactions) ? data.transactions : [];
            globalData.receipts = Array.isArray(data.receipts) ? data.receipts : [];
            globalData.login_logs = Array.isArray(data.login_logs) ? data.login_logs : [];
            globalData.recycle_bin = Array.isArray(data.recycle_bin) ? data.recycle_bin : [];
            globalData.backups = Array.isArray(data.backups) ? data.backups : [];
            globalData.deletedTransactions = Array.isArray(data.deletedTransactions) ? data.deletedTransactions : [];
            globalData.accounts = Array.isArray(data.accounts) ? data.accounts : [];
            dataLoaded = true;
            console.log(`[3. BACKEND] Loaded ${globalData.transactions.length} transactions locally.`);
        }
        
        // 3. AUDIT LOGS (Sync/Hybrid)
        try {
            const auditRes = await fetch(`${API_URL}/audit-logs`);
            if (auditRes.ok) {
                const logs = await auditRes.json();
                globalData.audit_trail = logs;
                
                // Auto-populate login_logs from audit trail
                const logins = logs.filter(l => l.action === 'Login').map(l => ({
                    name: l.details.name || l.username,
                    username: l.username,
                    date: new Date(l.timestamp).toLocaleDateString(),
                    time: new Date(l.timestamp).toLocaleTimeString()
                }));
                globalData.login_logs = logins;
            }
        } catch (auditErr) {
            console.warn("Failed to load audit logs during data load:", auditErr);
        }

        // Recalculate totals if using Supabase (since we only loaded transactions)
        if (isSupabaseOnline) {
            await recalculateAllTotals(true);
        }
        
    } catch (err) {
        console.error("[CRITICAL FAILURE] Data load failed completely!");
        globalData.financial_data = getInitialFinancialData();
    }
    
    checkSupabaseConfig();
}

// Helper to log audit to server
async function logAuditToServer(action, details = {}) {
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    const username = user ? user.username : 'unknown';

    try {
        await fetch(`${API_URL}/audit`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-Username': username
            },
            body: JSON.stringify({ action, details })
        });
    } catch (err) {
        console.warn("Failed to log audit to server:", err);
    }
}

// Save data to backend API and/or Supabase
async function saveDataToServer(actionType = 'Data Update') {
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    const username = user ? user.username : 'unknown';

    console.log(`[SYNC] Action: ${actionType} | Primary: Supabase | Fallback: Local`);

    try {
        // 1. LOCAL SAVE & BACKUP (Reliability Layer)
        // This ensures data is never lost even if cloud fails
        const localResponse = await fetch(`${API_URL}/data`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Action-Type': actionType,
                'X-User-Username': username
            },
            body: JSON.stringify(globalData)
        });
        
        if (!localResponse.ok) {
            throw new Error(`Local save failed: ${localResponse.status}`);
        }
        
        const localResult = await localResponse.json();
        console.log(`[SYNC] Local save SUCCESS. Backup created.`);

        // 2. CLOUD SAVE (Supabase)
        if (supabaseClient) {
            try {
                // Upload transactions (Upsert by ID)
                const { error: txError } = await supabaseClient
                    .from('transactions')
                    .upsert(globalData.transactions.map(t => ({
                        id: t.id,
                        date: t.date,
                        description: t.desc,
                        category: t.category,
                        formtype: t.formType,
                        amount: t.amount,
                        status: t.status,
                        hasreceipt: t.hasReceipt,
                        filledby: t.filledBy,
                        client: t.client,
                        itemizeddata: t.itemizedData,
                        updatedat: new Date().toISOString()
                    })));

                if (txError) throw txError;

                // Upload audit logs
                const { error: logError } = await supabaseClient
                    .from('audit_logs')
                    .upsert((globalData.audit_trail || []).map(l => ({
                        id: l.id,
                        action: l.action,
                        username: l.username,
                        timestamp: l.timestamp,
                        details: l.details,
                        ipaddress: l.ip || '0.0.0.0'
                    })));

                if (logError) throw logError;

                console.log(`[SYNC] Cloud save SUCCESS.`);
                isSupabaseOnline = true;
                lastSyncTime = new Date().toLocaleString();
                localStorage.setItem('cjm_last_sync', lastSyncTime);
            } catch (supaErr) {
                console.warn(`[SYNC] Cloud save FAILED: ${supaErr.message}. Data queued for auto-sync.`);
                isSupabaseOnline = false;
                // In a real app, we'd add to unsyncedRecords here
            }
        }

        checkSupabaseConfig(); // Update UI status
        return true;

    } catch (err) {
        console.error("[SYNC] Fatal Save Error:", err);
        lastServerError = err.message;
        return false;
    }
}

// Get totals from memory
function getFinancialTotals() {
    if (!globalData.financial_data) {
        globalData.financial_data = getInitialFinancialData();
    }
    
    // Safety check: ensure all fields from initial exist in current data
    const initial = getInitialFinancialData();
    for (const key in initial) {
        if (globalData.financial_data[key] === undefined) {
            globalData.financial_data[key] = initial[key];
        }
    }

    // Safety check: ensure breakdown keys exist + migrate old program key
    if (!globalData.financial_data.officeBreakdown || typeof globalData.financial_data.officeBreakdown !== 'object') {
        globalData.financial_data.officeBreakdown = {};
    }
    for (const k in initial.officeBreakdown) {
        if (globalData.financial_data.officeBreakdown[k] === undefined) {
            globalData.financial_data.officeBreakdown[k] = initial.officeBreakdown[k];
        }
    }

    if (!globalData.financial_data.programBreakdown || typeof globalData.financial_data.programBreakdown !== 'object') {
        globalData.financial_data.programBreakdown = {};
    }
    if (globalData.financial_data.programBreakdown["Hotel & Living"] !== undefined) {
        const oldVal = parseFloat(globalData.financial_data.programBreakdown["Hotel & Living"]) || 0;
        globalData.financial_data.programBreakdown["Hotel"] = (parseFloat(globalData.financial_data.programBreakdown["Hotel"]) || 0) + oldVal;
        delete globalData.financial_data.programBreakdown["Hotel & Living"];
    }
    for (const k in initial.programBreakdown) {
        if (globalData.financial_data.programBreakdown[k] === undefined) {
            globalData.financial_data.programBreakdown[k] = initial.programBreakdown[k];
        }
    }

    if (!globalData.financial_data.companyBreakdown || typeof globalData.financial_data.companyBreakdown !== 'object') {
        globalData.financial_data.companyBreakdown = {};
    }
    if (globalData.financial_data.companyBreakdown["Program Supplies"] !== undefined) {
        const oldVal = parseFloat(globalData.financial_data.companyBreakdown["Program Supplies"]) || 0;
        globalData.financial_data.companyBreakdown["Program/Company Supplies"] = (parseFloat(globalData.financial_data.companyBreakdown["Program/Company Supplies"]) || 0) + oldVal;
        delete globalData.financial_data.companyBreakdown["Program Supplies"];
    }
    for (const k in initial.companyBreakdown) {
        if (globalData.financial_data.companyBreakdown[k] === undefined) {
            globalData.financial_data.companyBreakdown[k] = initial.companyBreakdown[k];
        }
    }
    
    return globalData.financial_data;
}

// Recalculate all financial totals from transaction history
async function recalculateAllTotals(silent = false) {
    const transactions = globalData.transactions || [];
    const data = getInitialFinancialData();
    
    transactions.forEach(t => {
        // Skip cancelled transactions as they should not contribute to any financial totals
        if (t.status === 'Cancelled') return;

        // Handle potentially null amounts from broken transactions
        const amount = Math.abs(parseFloat(t.amount) || 0);
        
        if (t.category === 'Revenue') {
            data.totalIncome += amount;
            data.balance += amount;
            if (t.status === 'Pending') {
                data.pendingIncome += amount;
            } else if (t.status === 'Completed') {
                data.completedIncome += amount;
            }
        } else {
            data.totalExpenses += amount;
            data.balance -= amount;
            
            // Rebuild breakdowns from transactions
            const formType = t.formType;
            const desc = t.desc;
            
            if (formType === 'office') {
                data.officeExpenses += amount;
                if (t.itemizedData) {
                    for (let key in t.itemizedData) {
                        if (data.officeBreakdown.hasOwnProperty(key)) {
                            data.officeBreakdown[key] += parseFloat(t.itemizedData[key] || 0);
                        }
                    }
                } else if (data.officeBreakdown.hasOwnProperty(desc)) {
                    data.officeBreakdown[desc] += amount;
                }
            } else if (formType === 'program') {
                data.programExpenses += amount;
                if (t.itemizedData) {
                    for (let key in t.itemizedData) {
                        if (data.programBreakdown.hasOwnProperty(key)) {
                            data.programBreakdown[key] += parseFloat(t.itemizedData[key] || 0);
                        }
                    }
                } else if (data.programBreakdown.hasOwnProperty(desc)) {
                    data.programBreakdown[desc] += amount;
                }
            } else if (formType === 'company') {
                data.companyExpenses += amount;
                if (t.itemizedData) {
                    for (let key in t.itemizedData) {
                        if (data.companyBreakdown.hasOwnProperty(key)) {
                            data.companyBreakdown[key] += parseFloat(t.itemizedData[key] || 0);
                        }
                    }
                } else if (data.companyBreakdown.hasOwnProperty(desc)) {
                    data.companyBreakdown[desc] += amount;
                }
            } else if (formType === 'staff_incentive' || t.category === 'Staff Incentive') {
                const incentiveOnly = Math.abs(parseFloat(t.itemizedData ? t.itemizedData["Incentive Amount"] : t.amount) || 0);
                
                data.staffIncentives = (data.staffIncentives || 0) + incentiveOnly;
                
                // Both go to company expenses
                data.companyExpenses += incentiveOnly;
                if (data.companyBreakdown.hasOwnProperty("Staff Incentive")) {
                    data.companyBreakdown["Staff Incentive"] += incentiveOnly;
                }
                
                // Handle Other Commitment (Subset of total amount, already in totalExpenses)
                if (t.itemizedData && t.itemizedData["Other Commitment"]) {
                    const otherOnly = Math.abs(parseFloat(t.itemizedData["Other Commitment"]) || 0);
                    data.companyExpenses += otherOnly;
                    if (data.companyBreakdown.hasOwnProperty("Other Commitment")) {
                        data.companyBreakdown["Other Commitment"] += otherOnly;
                    }
                    // FIXED: removed data.totalExpenses += otherOnly which caused double counting
                 }
            } else if (formType === 'daily') {
                 data.dailyExpenses = (data.dailyExpenses || 0) + amount;
            }
        }
    });

    globalData.financial_data = data;
    const success = await saveDataToServer('Recalculate Totals');
    if (success) {
        if (!silent) alert("System totals have been successfully recalculated based on your transaction history.");
        displayFinancialStats();
        renderTransactions();
    } else {
        console.warn("Background recalculation save failed. This is expected if the server is offline.");
    }
}

async function updateFinancialStats(type, totalAmount, categoryName, receiptFileDataList = null, itemizedData = null, revenueStatus = 'Completed', transactionDate = null) {
    let data = getFinancialTotals();
    totalAmount = parseFloat(totalAmount);
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    const fillerName = user ? user.firstName : "Unknown";
    const clientName = itemizedData && itemizedData.Client ? itemizedData.Client : "";
    
    // Priority logic: Dropdown (Staff Name) > Manual Entry (Other Staff Name)
    let staffName = "";
    if (itemizedData) {
        const fromDropdown = itemizedData["Staff Name"] || itemizedData["Employee Name"];
        const fromManual = itemizedData["Other Staff Name"];
        staffName = (fromDropdown || fromManual || "").toString().trim();
    }
    
    const finalTransactionDate = transactionDate || getTodayISODate();

    // Update financial stats
    if (revenueStatus !== 'Cancelled') {
        if (type === 'income' || type === 'project_revenue') {
            data.totalIncome += totalAmount;
            data.balance += totalAmount;
            if (revenueStatus === 'Pending') {
                data.pendingIncome += totalAmount;
            } else if (revenueStatus === 'Completed') {
                data.completedIncome += totalAmount;
            }
        } else {
            data.totalExpenses += totalAmount;
            data.balance -= totalAmount;
            
            if (type === 'office') {
                data.officeExpenses += totalAmount;
                if (itemizedData) {
                    for (let key in itemizedData) {
                        if (data.officeBreakdown.hasOwnProperty(key)) {
                            data.officeBreakdown[key] += parseFloat(itemizedData[key] || 0);
                        }
                    }
                }
            }
            if (type === 'program') {
                data.programExpenses += totalAmount;
                if (itemizedData) {
                    for (let key in itemizedData) {
                        if (data.programBreakdown.hasOwnProperty(key)) {
                            data.programBreakdown[key] += parseFloat(itemizedData[key] || 0);
                        }
                    }
                }
            }
            if (type === 'company') {
                data.companyExpenses += totalAmount;
                if (itemizedData) {
                    for (let key in itemizedData) {
                        if (data.companyBreakdown.hasOwnProperty(key)) {
                            data.companyBreakdown[key] += parseFloat(itemizedData[key] || 0);
                        }
                    }
                }
            }
            if (type === 'staff_incentive') {
                const incentiveOnly = Math.abs(parseFloat(itemizedData["Incentive Amount"]) || 0);
                
                data.staffIncentives = (data.staffIncentives || 0) + incentiveOnly;
                
                // Both go to company expenses
                data.companyExpenses += incentiveOnly;
                if (data.companyBreakdown.hasOwnProperty("Staff Incentive")) {
                    data.companyBreakdown["Staff Incentive"] += incentiveOnly;
                }
            }
            if (type === 'daily') {
                data.dailyExpenses = (data.dailyExpenses || 0) + totalAmount;
            }
        }
    }

    globalData.financial_data = data;
    
    // Add to transactions list
    const transaction = {
        id: Date.now(),
        date: finalTransactionDate,
        desc: type === 'staff_incentive'
            ? `Staff Incentive: ${((itemizedData && (itemizedData["Staff Name"] || itemizedData["Employee Name"] || itemizedData["Recipient Name"] || itemizedData["Other Staff Name"])) || '').toString().trim() || 'Unknown'}`
            : (categoryName || (type.charAt(0).toUpperCase() + type.slice(1))),
        category: type === 'income' || type === 'project_revenue' ? "Revenue" : (type === 'staff_incentive' ? "Staff Incentive" : (type === 'company' ? "Company Expense" : "Expense")),
        formType: type,
        amount: (type === 'income' || type === 'project_revenue') ? totalAmount : -totalAmount,
        status: revenueStatus || "Completed",
        hasReceipt: receiptFileDataList && receiptFileDataList.length > 0,
        filledBy: fillerName,
        client: clientName,
        itemizedData: itemizedData // Store itemized breakdown in the transaction
    };

    // Add subcategory if type is company and only one item exists
    if (type === 'company' && itemizedData) {
        const activeItems = Object.entries(itemizedData).filter(([k, v]) => typeof v === 'number' && v > 0);
        if (activeItems.length === 1) {
            transaction.subcategory = activeItems[0][0];
        }
    }
    
    globalData.transactions.unshift(transaction); 

    await logAuditToServer('Add Transaction', {
        transactionId: transaction.id,
        transactionDate: transaction.date,
        formType: transaction.formType,
        category: transaction.category,
        amount: transaction.amount,
        desc: transaction.desc
    });

    // Handle Receipt Storage
    if (receiptFileDataList && receiptFileDataList.length > 0) {
        const count = globalData.receipts.filter(r => r.formType === type).length;

        if (count + receiptFileDataList.length > 1000) {
            alert(`Storage Limit Warning: Adding these ${receiptFileDataList.length} receipts will exceed the maximum of 1000 receipts for ${categoryName}. Only the transaction was recorded.`);
            transaction.hasReceipt = false;
        } else {
            try {
                // Upload the files to the backend
                const formData = new FormData();
                receiptFileDataList.forEach(file => {
                    formData.append('receipts', file);
                });
                
                const uploadRes = await fetch(`${API_URL}/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (!uploadRes.ok) {
                    const text = await uploadRes.text().catch(() => '');
                    throw new Error(`Upload failed ${uploadRes.status}${text ? `: ${text}` : ''}`);
                }

                const uploadResult = await uploadRes.json();
                
                if (uploadResult.success) {
                    uploadResult.files.forEach(fileInfo => {
                        globalData.receipts.unshift({
                            transactionId: transaction.id,
                            formType: type,
                            filePath: fileInfo.filePath,
                            originalName: fileInfo.originalName,
                            fileType: fileInfo.mimeType
                        });
                    });
                } else {
                    alert("Failed to upload receipt images to server.");
                    transaction.hasReceipt = false;
                }
            } catch (err) {
                console.error("Upload error:", err);
                alert(`Upload error. Make sure you opened the system using the server link (example: ${origin}).\n\nDetails: ${err && err.message ? err.message : err}`);
                transaction.hasReceipt = false;
            }
        }
    }
    
    // Save everything to the server
    const success = await saveDataToServer('Add Transaction');
    if (!success) {
        console.warn("Server save failed. Data is currently only saved in browser memory.");
        // Return false so the UI knows persistence failed
        return false;
    }
    return true; 
}

// Update Transaction Status
async function updateTransactionStatus(transactionId, newStatus) {
    const transaction = globalData.transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    if (confirm(`Are you sure you want to change this transaction status to ${newStatus}?`)) {
        // Source of Truth: Update status in object then let recalculate handle all arithmetic
        transaction.status = newStatus;

        // Force a full system recalculation to ensure totals, categories, and breakdowns are perfectly synced
        await recalculateAllTotals(true);
        
        // Log the change
        await logAuditToServer('Status Change', { id: transactionId, newStatus });
        
        alert(`Status successfully updated to ${newStatus}.`);
    }
}

// Soft Delete Transaction (Recycle Bin)
async function softDeleteTransaction(transactionId) {
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    if (user.role !== ROLES.ADMIN) {
        alert("Only Administrators can delete transactions.");
        return;
    }

    const index = globalData.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return;

    if (confirm("Move this transaction to the Recycle Bin? it will be recoverable for 30 days.")) {
        const transaction = globalData.transactions.splice(index, 1)[0];
        
        // Add to recycle bin with metadata
        transaction.deletedAt = new Date().toISOString();
        transaction.deletedBy = user.firstName;
        
        if (!Array.isArray(globalData.recycle_bin)) {
            globalData.recycle_bin = [];
        }
        globalData.recycle_bin.unshift(transaction);

        // Force a full system recalculation to ensure totals are corrected
        await recalculateAllTotals(true);

        // Log to audit trail
        await logAuditToServer('Delete Transaction', { id: transactionId, desc: transaction.desc });
        
        alert("Transaction moved to Recycle Bin.");
    }
}

// Restore from Recycle Bin
async function restoreFromRecycleBin(transactionId) {
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.MANAGER) {
        alert("Permission denied.");
        return;
    }

    const index = globalData.recycle_bin.findIndex(t => t.id === transactionId);
    if (index === -1) return;

    if (confirm("Restore this transaction?")) {
        const transaction = globalData.recycle_bin.splice(index, 1)[0];
        delete transaction.deletedAt;
        delete transaction.deletedBy;

        globalData.transactions.unshift(transaction);
        
        const success = await saveDataToServer('Restore Transaction');
        if (success) {
            alert("Transaction restored successfully.");
            await recalculateAllTotals(true);
        }
    }
}

function displayFinancialStats() {
    const data = calculateFilteredData();
    const balanceEl = document.getElementById('totalBalanceDisplay');
    const incomeEl = document.getElementById('totalIncomeDisplay');
    const pendingIncomeEl = document.getElementById('pendingIncomeDisplay');
    const completedIncomeEl = document.getElementById('completedIncomeDisplay');
    const expenseEl = document.getElementById('totalExpenseDisplay');
    const dailyExpenseEl = document.getElementById('dailyExpenseTotalDisplay');
    
    // Split displays
    const officeEl = document.getElementById('officeExpenseDisplay');
    const programEl = document.getElementById('programExpenseDisplay');
    const companyEl = document.getElementById('companyExpenseDisplay');

    // Itemized containers
    const officeList = document.getElementById('officeItemList');
    const programList = document.getElementById('programItemList');
    const companyList = document.getElementById('companyItemList');
    const dailyList = document.getElementById('dailyItemList');

    if (balanceEl) balanceEl.innerText = `RM ${data.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (incomeEl) incomeEl.innerText = `+ RM ${data.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (pendingIncomeEl) pendingIncomeEl.innerText = `RM ${data.pendingIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (completedIncomeEl) completedIncomeEl.innerText = `RM ${data.completedIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (expenseEl) expenseEl.innerText = `- RM ${data.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (dailyExpenseEl) dailyExpenseEl.innerText = `RM ${(data.dailyExpenses || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    if (officeEl) officeEl.innerText = `RM ${data.officeExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (programEl) programEl.innerText = `RM ${data.programExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (companyEl) companyEl.innerText = `RM ${data.companyExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    const renderBreakdown = (container, breakdown, total, totalColor) => {
        if (!container || !breakdown) return;
        container.innerHTML = Object.entries(breakdown).map(([key, val]) => `
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem; color: var(--text-main);">
                <span>${key}</span>
                <span style="font-family: monospace; font-weight: 600;">RM ${val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
        `).join('') + `<div style="border-top: 1px solid #eee; margin-top: 0.5rem; padding-top: 0.5rem; font-weight: bold; display: flex; justify-content: space-between; color: ${totalColor};"><span>Total</span><span>RM ${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>`;
    };

    renderBreakdown(officeList, data.officeBreakdown, data.officeExpenses, 'var(--primary)');
    renderBreakdown(programList, data.programBreakdown, data.programExpenses, 'var(--success)');
    renderBreakdown(companyList, data.companyBreakdown, data.companyExpenses, '#8b5cf6');

    if (dailyList) {
        const dailyTransactions = getFilteredTransactions().filter(t => t.formType === 'daily' && t.status !== 'Cancelled');
        if (dailyTransactions.length === 0) {
            dailyList.innerHTML = '<div style="text-align: center; color: #b45309; font-size: 0.8rem;">No daily expenses recorded for this period.</div>';
        } else {
            dailyList.innerHTML = dailyTransactions.map(t => `
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem; color: #92400e;">
                    <span>${t.desc} (${t.date})</span>
                    <span style="font-family: monospace; font-weight: 600;">RM ${Math.abs(t.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
            `).join('');
        }
    }

    // Analytics
    renderAnalytics(data);
}

// --- VISUAL ANALYTICS (Phase 5 & 6) ---

let expensePieChart = null;
let incomeVsExpenseChart = null;
let trendChart = null;

function renderAnalytics(data) {
    const ctxPie = document.getElementById('expensePieChart');
    const ctxBar = document.getElementById('incomeExpenseBarChart');
    const ctxTrend = document.getElementById('financialTrendChart');
    
    if (!ctxPie || !ctxBar || !ctxTrend) return;

    // 1. Expense Breakdown Pie Chart
    // ... (rest of the pie chart code)
    const expenseLabels = ['Office', 'Program', 'Company', 'Daily'];
    const expenseValues = [data.officeExpenses, data.programExpenses, data.companyExpenses, data.dailyExpenses];
    
    if (expensePieChart) expensePieChart.destroy();
    expensePieChart = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: expenseLabels,
            datasets: [{
                data: expenseValues,
                backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // 2. Income vs Expense Bar Chart
    if (incomeVsExpenseChart) incomeVsExpenseChart.destroy();
    incomeVsExpenseChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Revenue', 'Expenses'],
            datasets: [{
                label: 'Financial Comparison',
                data: [data.totalIncome, data.totalExpenses],
                backgroundColor: ['#10b981', '#ef4444'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // 3. Monthly Financial Trend Chart (Phase 5)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyData = months.map((_, i) => {
        const filtered = globalData.transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === i && d.getFullYear() === selectedYear && t.status !== 'Cancelled';
        });
        const income = filtered.filter(t => t.category === 'Revenue').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const expense = filtered.filter(t => t.category !== 'Revenue').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        return { income, expense };
    });

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Income',
                    data: monthlyData.map(m => m.income),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Expenses',
                    data: monthlyData.map(m => m.expense),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // 4. Executive Summary (Phase 6)
    renderExecutiveSummary(data);
}

function renderExecutiveSummary(data) {
    const summaryContainer = document.getElementById('executiveSummaryContent');
    if (!summaryContainer) return;

    const netBalance = data.totalIncome - data.totalExpenses;
    const health = netBalance > 0 ? { text: 'Healthy', color: '#059669', icon: '🟢' } : 
                   netBalance > -100 ? { text: 'Warning', color: '#d97706', icon: '🟡' } : 
                   { text: 'Critical', color: '#dc2626', icon: '🔴' };

    // Find highest expense category
    const expenses = {
        'Office': data.officeExpenses,
        'Program': data.programExpenses,
        'Company': data.companyExpenses,
        'Daily': data.dailyExpenses
    };
    const highestExpense = Object.entries(expenses).reduce((a, b) => a[1] > b[1] ? a : b);

    summaryContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div class="summary-item">
                <span style="display: block; font-size: 0.75rem; color: #64748b; font-weight: 700;">STATUS</span>
                <span style="font-size: 1.25rem; font-weight: 800; color: ${health.color};">${health.icon} ${health.text}</span>
            </div>
            <div class="summary-item">
                <span style="display: block; font-size: 0.75rem; color: #64748b; font-weight: 700;">NET BALANCE</span>
                <span style="font-size: 1.25rem; font-weight: 800; color: ${netBalance >= 0 ? '#059669' : '#dc2626'};">RM ${netBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div class="summary-item">
                <span style="display: block; font-size: 0.75rem; color: #64748b; font-weight: 700;">TOP EXPENSE</span>
                <span style="font-size: 1.25rem; font-weight: 800; color: #1e293b;">${highestExpense[0]}</span>
                <span style="display: block; font-size: 0.7rem; color: #64748b;">RM ${highestExpense[1].toFixed(2)}</span>
            </div>
            <div class="summary-item">
                <span style="display: block; font-size: 0.75rem; color: #64748b; font-weight: 700;">SAVINGS RATE</span>
                <span style="font-size: 1.25rem; font-weight: 800; color: #2563eb;">${data.totalIncome > 0 ? ((netBalance / data.totalIncome) * 100).toFixed(1) : 0}%</span>
            </div>
        </div>
    `;
}

// --- DASHBOARD UI ---

function getAllTransactionsList() {
    return Array.isArray(globalData.transactions) ? globalData.transactions : Object.values(globalData.transactions || {});
}

function isStaffIncentiveTransaction(t) {
    if (!t) return false;
    if (t.formType === 'staff_incentive') return true;
    if (t.category === 'Staff Incentive') return true;
    return false;
}

function getTransactionCategoryLabel(t) {
    if (!t) return '-';
    if (isStaffIncentiveTransaction(t)) return 'Staff Incentive';
    if (t.category === 'Revenue') return 'Revenue';
    if (t.formType === 'office') return 'Office Expense';
    if (t.formType === 'program') return 'Program Expense';
    if (t.formType === 'company') return 'Company Expense';
    if (t.formType === 'daily') return 'Daily Expense';
    return t.category || 'Expense';
}

function getTransactionHistoryFilteredList() {
    const monthEl = document.getElementById('txFilterMonth');
    const yearEl = document.getElementById('txFilterYear');
    const categoryEl = document.getElementById('txFilterCategory');
    const statusEl = document.getElementById('txFilterStatus');

    const monthVal = monthEl ? monthEl.value : 'all';
    const yearVal = yearEl ? yearEl.value : 'all';
    const categoryVal = categoryEl ? categoryEl.value : 'all';
    const statusVal = statusEl ? statusEl.value : 'all';

    const tx = getAllTransactionsList();
    if (!Array.isArray(tx)) return [];

    return tx.filter(t => {
        if (!t || !t.date) return false;
        
        try {
            const d = new Date(t.date);
            if (isNaN(d.getTime())) return false; // Invalid date

            if (yearVal !== 'all' && d.getFullYear() !== parseInt(yearVal)) return false;
            if (monthVal !== 'all' && d.getMonth() !== parseInt(monthVal)) return false;

            if (categoryVal === 'Revenue') {
                if (t.category !== 'Revenue') return false;
            } else if (categoryVal === 'Expense') {
                if (t.category === 'Revenue' || isStaffIncentiveTransaction(t)) return false;
            } else if (categoryVal === 'Staff Incentive') {
                if (!isStaffIncentiveTransaction(t)) return false;
            }

            if (statusVal !== 'all' && t.status !== statusVal) return false;

            return true;
        } catch (e) {
            return false;
        }
    });
}

function applyTransactionFilters() {
    renderTransactions();
}

function getTransactionActionsHTML(t, user) {
    if (!t) return '';
    const isAdmin = user && user.role === ROLES.ADMIN;
    const status = String(t.status || 'Completed');
    
    let buttons = '';
    if (status === 'Pending') {
        buttons = `
            <button onclick="updateTransactionStatus(${t.id}, 'Completed')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--success);">Complete</button>
            <button onclick="updateTransactionStatus(${t.id}, 'Cancelled')" class="btn btn-logout" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--danger); color: white;">Cancel</button>
        `;
    } else if (status === 'Completed') {
        buttons = `
            <button onclick="updateTransactionStatus(${t.id}, 'Pending')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: #f59e0b;">Pending</button>
            <button onclick="updateTransactionStatus(${t.id}, 'Cancelled')" class="btn btn-logout" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--danger); color: white;">Cancel</button>
        `;
    } else { // Cancelled
        buttons = `
            <button onclick="updateTransactionStatus(${t.id}, 'Pending')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: #f59e0b;">Restore</button>
        `;
    }

    const deleteBtn = isAdmin ? `
        <button onclick="softDeleteTransaction(${t.id})" class="btn" style="padding: 4px 8px; font-size: 0.7rem; background-color: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">Delete</button>
    ` : '';

    return `<div style="display: flex; gap: 0.5rem;">${buttons}${deleteBtn}</div>`;
}

function renderTransactions() {
    const container = document.getElementById('transactions-container');
    const body = document.getElementById('transactionBody');
    const dashBody = document.getElementById('dashTransactionBody');
    if (!container && !body && !dashBody) return;

    const reportTransactions = getFilteredTransactions();
    const reportList = Array.isArray(reportTransactions) ? reportTransactions : Object.values(reportTransactions || {});
    const historyList = getTransactionHistoryFilteredList();
    const txList = container ? reportList : historyList;
    
    const user = JSON.parse(localStorage.getItem("cjm_user"));

    if (historyList.length === 0 && reportList.length === 0) {
        console.warn("RENDER: No transactions to display in table.");
        if (container) {
            container.innerHTML = '<div class="table-container" style="text-align: center; padding: 2rem; color: var(--text-muted);">No transactions yet.</div>';
        }
        if (body) {
            body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No transactions yet.</td></tr>';
        }
        if (dashBody) {
            dashBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No transactions yet.</td></tr>';
        }
        return;
    }

    if (body) {
        body.innerHTML = historyList.map(t => {
            if (!t) return '';
            const amount = parseFloat(t.amount) || 0;
            const status = String(t.status || 'Completed');
            return `
                <tr>
                    <td>${t.date || '-'}</td>
                    <td style="font-weight: 600;">${t.desc || '-'}</td>
                    <td>${getTransactionCategoryLabel(t)}</td>
                    <td>${t.filledBy || 'Unknown'}</td>
                    <td class="${amount > 0 ? 'text-success' : 'text-danger'}" style="font-weight: 700;">
                        ${amount > 0 ? '+' : ''} RM ${Math.abs(amount).toFixed(2)}
                    </td>
                    <td>
                        <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                    </td>
                    <td>
                        ${getTransactionActionsHTML(t, user)}
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (dashBody) {
        const recent = historyList.slice(0, 10);
        dashBody.innerHTML = recent.map(t => {
            if (!t) return '';
            const amount = parseFloat(t.amount) || 0;
            const status = String(t.status || 'Completed');
            return `
                <tr>
                    <td>${t.date || '-'}</td>
                    <td style="font-weight: 600;">${t.desc || '-'}</td>
                    <td>${getTransactionCategoryLabel(t)}</td>
                    <td>${t.filledBy || 'Unknown'}</td>
                    <td class="${amount > 0 ? 'text-success' : 'text-danger'}" style="font-weight: 700;">
                        ${amount > 0 ? '+' : ''} RM ${Math.abs(amount).toFixed(2)}
                    </td>
                    <td>
                        <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                    </td>
                    <td>
                        ${getTransactionActionsHTML(t, user)}
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (!container) return;

    const groups = {
        income: { title: "Project Revenue Transactions", items: [] },
        office: { title: "Office Expense Transactions", items: [] },
        program: { title: "Program Expense Transactions", items: [] },
        company: { title: "Company Expense Transactions", items: [] },
        staff_incentive: { title: "Staff Incentive Transactions", items: [] },
        daily: { title: "Daily Expense Transactions", items: [] }
    };

    reportList.forEach(t => {
        if (groups[t.formType]) {
            groups[t.formType].items.push(t);
        } else {
            // Fallback for old data or unmapped types
            const mappedType = t.category === 'Revenue' ? 'income' : (isStaffIncentiveTransaction(t) ? 'staff_incentive' : 'office');
            groups[mappedType].items.push(t);
        }
    });

    let html = '';
    try {
        html = Object.entries(groups).map(([type, group]) => {
            if (group.items.length === 0) return '';

            return `
            <div class="table-container">
                <div class="card-header" style="background: #f8fafc; border-bottom: 1px solid var(--border);">
                    <h2 style="font-size: 1.1rem; color: var(--text-main);">${group.title}</h2>
                </div>
                <table class="transaction-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Client</th>
                            <th>User</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${group.items.map(t => `
                            <tr>
                                <td>${t.date}</td>
                                <td style="font-weight: 600;">${t.desc}</td>
                                <td>${t.client || '-'}</td>
                                <td>${t.filledBy || 'Unknown'}</td>
                                <td class="${t.amount > 0 ? 'text-success' : 'text-danger'}" style="font-weight: 700;">
                                    ${t.amount > 0 ? '+' : ''} RM ${Math.abs(t.amount).toFixed(2)}
                                </td>
                                <td>
                                    <span class="status-badge status-${String(t.status || 'Completed').toLowerCase()}">${t.status || 'Completed'}</span>
                                </td>
                                <td>
                                    ${getTransactionActionsHTML(t, user)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        }).join('');
    } catch (err) {
        throw err;
    }

    if (html.trim() === '') {
        container.innerHTML = `
            <div class="table-container">
                <div class="card-header" style="background: #f8fafc; border-bottom: 1px solid var(--border);">
                    <h2 style="font-size: 1.1rem; color: var(--text-main);">All Transactions</h2>
                </div>
                <table class="transaction-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Client</th>
                            <th>User</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${txList.map(t => `
                            <tr>
                                <td>${t.date || '-'}</td>
                                <td style="font-weight: 600;">${t.desc || '-'}</td>
                                <td>${t.client || '-'}</td>
                                <td>${t.filledBy || 'Unknown'}</td>
                                <td class="${t.amount > 0 ? 'text-success' : 'text-danger'}" style="font-weight: 700;">
                                    ${t.amount > 0 ? '+' : ''} RM ${Math.abs(parseFloat(t.amount) || 0).toFixed(2)}
                                </td>
                                <td>
                                    <span class="status-badge status-${String(t.status || 'Completed').toLowerCase()}">${t.status || 'Completed'}</span>
                                </td>
                                <td>
                                    ${getTransactionActionsHTML(t, user)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        return;
    }

    container.innerHTML = html;
}

function exportToPDF() {
    const data = calculateFilteredData();
    const transactions = getFilteredTransactions();
    
    let periodText = "";
    let reportTitle = "";
    
    if (currentReportMode === 'monthly') {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        periodText = `${monthNames[selectedMonth]} ${selectedYear}`;
        reportTitle = "CJM Finance Monthly Financial Statement";
    } else if (currentReportMode === 'yearly') {
        periodText = `January ${selectedYear} - December ${selectedYear}`;
        reportTitle = "CJM Finance Annual Financial Statement";
    } else {
        periodText = "All Available Records";
        reportTitle = "CJM Finance Complete Financial Statement";
    }

    const printWindow = window.open('', '_blank');
    
    // Helper to generate breakdown rows
    const generateBreakdownRows = (breakdown) => {
        return Object.entries(breakdown).map(([name, amount]) => `
                <tr>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; color: #475569;">${name}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-weight: 600;">RM ${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
            `).join('');
    };

    // Filter transactions for Daily Expenses
    const dailyTransactions = transactions.filter(t => t.formType === 'daily' && t.status !== 'Cancelled');
    const incentiveRecords = transactions.filter(t => isStaffIncentiveTransaction(t) && t.status !== 'Cancelled');
    const incentiveTotal = incentiveRecords.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
    const incentiveByEmployee = {};
    incentiveRecords.forEach(t => {
        const name = getIncentiveEmployeeName(t);
        incentiveByEmployee[name] = (incentiveByEmployee[name] || 0) + Math.abs(parseFloat(t.amount) || 0);
    });
    const incentiveByEmployeeRows = Object.entries(incentiveByEmployee)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => `
            <tr>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; color: #475569; font-weight: 700;">${name}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-weight: 600;">RM ${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
        `).join('');
    const incentiveDetailRows = incentiveRecords.map(t => `
        <tr>
            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9;">${t.date}</td>
            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; font-weight: 700;">${getIncentiveEmployeeName(t)}</td>
            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9;">${(t.itemizedData && (t.itemizedData.Notes || t.itemizedData["Notes"])) ? String(t.itemizedData.Notes || t.itemizedData["Notes"]) : '-'}</td>
            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-weight: 700;">RM ${Math.abs(parseFloat(t.amount) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
    `).join('');

    printWindow.document.write(`
        <html>
        <head>
            <title>${reportTitle}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.5; padding: 2rem; max-width: 1000px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1.5rem; }
                .report-info { display: flex; justify-content: space-between; margin-bottom: 2rem; }
                .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 2.5rem; }
                .stat-box { background: #f8fafc; padding: 1.25rem; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; }
                .stat-label { font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
                .stat-value { font-size: 1.5rem; font-weight: 800; }
                .section-title { font-size: 1.25rem; font-weight: 800; margin: 2.5rem 0 1rem 0; color: #0f172a; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }
                .section-total { font-size: 1.1rem; color: #2563eb; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; background: white; }
                th { background: #f8fafc; text-align: left; padding: 0.85rem 1rem; font-size: 0.875rem; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; }
                td { padding: 0.75rem 1rem; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
                .category-row { background: #f1f5f9; font-weight: 700; color: #1e293b; }
                .category-total-row { font-weight: 800; background: #f8fafc; border-top: 2px solid #e2e8f0; }
                .text-success { color: #059669; }
                .text-danger { color: #dc2626; }
                .footer { text-align: center; font-size: 0.75rem; color: #94a3b8; margin-top: 4rem; border-top: 1px solid #e2e8f0; padding-top: 1.5rem; }
                @media print {
                    body { padding: 1rem; }
                    .stat-box { border: 1px solid #ddd; }
                    .section-title { border-bottom: 2px solid #333; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1 style="margin: 0; font-size: 1.75rem; color: #0f172a;">${reportTitle}</h1>
                <p style="margin: 0.5rem 0 0 0; color: #64748b; font-weight: 500;">Period: ${periodText}</p>
            </div>

            <!-- Summary Grid -->
            <div class="stat-grid">
                <div class="stat-box">
                    <div class="stat-label">Total Balance</div>
                    <div class="stat-value">RM ${data.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Total Income</div>
                    <div class="stat-value text-success">RM ${data.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Total Expenses</div>
                    <div class="stat-value text-danger">RM ${data.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </div>
            </div>

            <!-- Detailed Expense Breakdown -->
            <div style="margin-bottom: 3rem;">
                <h2 style="font-size: 1.5rem; font-weight: 800; border-left: 5px solid #2563eb; padding-left: 1rem; margin-bottom: 2rem; color: #0f172a;">Financial Breakdown</h2>

                <!-- Office Expenses -->
                <div class="section-title">
                    <span>OFFICE EXPENSES</span>
                    <span class="section-total">Total: RM ${data.officeExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Sub-Category</th>
                            <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateBreakdownRows(data.officeBreakdown)}
                        <tr style="background: #f1f5f9; font-weight: 800;">
                            <td style="padding: 1rem; color: #1e293b;">Total Office Expenses</td>
                            <td style="padding: 1rem; text-align: right; color: #2563eb; font-family: monospace;">RM ${data.officeExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- Program Expenses -->
                <div class="section-title">
                    <span>PROGRAM EXPENSES</span>
                    <span class="section-total">Total: RM ${data.programExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Sub-Category</th>
                            <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateBreakdownRows(data.programBreakdown)}
                        <tr style="background: #f1f5f9; font-weight: 800;">
                            <td style="padding: 1rem; color: #1e293b;">Total Program Expenses</td>
                            <td style="padding: 1rem; text-align: right; color: #2563eb; font-family: monospace;">RM ${data.programExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- Company Expenses -->
                <div class="section-title">
                    <span>COMPANY EXPENSES</span>
                    <span class="section-total">Total: RM ${data.companyExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Sub-Category</th>
                            <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateBreakdownRows(data.companyBreakdown)}
                        <tr style="background: #f1f5f9; font-weight: 800;">
                            <td style="padding: 1rem; color: #1e293b;">Total Company Expenses</td>
                            <td style="padding: 1rem; text-align: right; color: #2563eb; font-family: monospace;">RM ${data.companyExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- Staff Incentives -->
                <div class="section-title">
                    <span>STAFF INCENTIVES</span>
                    <span class="section-total">Total: RM ${incentiveTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Employee</th>
                            <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${incentiveByEmployeeRows || '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: #94a3b8;">No incentive records for this period.</td></tr>'}
                        <tr style="background: #f1f5f9; font-weight: 800;">
                            <td style="padding: 1rem; color: #1e293b;">Total Incentives</td>
                            <td style="padding: 1rem; text-align: right; color: #2563eb; font-family: monospace;">RM ${incentiveTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Date</th>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Employee</th>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Notes</th>
                            <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${incentiveDetailRows || '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #94a3b8;">No incentive records for this period.</td></tr>'}
                    </tbody>
                </table>

                <!-- Daily Expenses -->
                <div class="section-title">
                    <span>DAILY EXPENSES</span>
                    <span class="section-total">Total: RM ${data.dailyExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                            <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dailyTransactions.length > 0 ? dailyTransactions.map(t => `
                            <tr>
                                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; color: #475569;">${t.desc} (${t.date})</td>
                                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-weight: 600;">RM ${Math.abs(t.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: #94a3b8;">No daily expenses recorded for this period.</td></tr>'}
                        <tr style="background: #f1f5f9; font-weight: 800;">
                            <td style="padding: 1rem; color: #1e293b;">Total Daily Expenses</td>
                            <td style="padding: 1rem; text-align: right; color: #2563eb; font-family: monospace;">RM ${data.dailyExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="section-title">COMPLETE TRANSACTION LOG</div>
            <table style="width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <thead style="background: #f8fafc;">
                    <tr>
                        <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Date</th>
                        <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Description</th>
                        <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Client</th>
                        <th style="text-align: right; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Amount</th>
                        <th style="text-align: left; padding: 1rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(t => `
                        <tr>
                            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9;">${t.date}</td>
                            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${t.desc}</td>
                            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9;">${t.client || '-'}</td>
                            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-weight: 700;" class="${t.amount > 0 ? 'text-success' : 'text-danger'}">
                                ${t.amount > 0 ? '+' : ''} RM ${Math.abs(t.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                            <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9;">
                                <span style="padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: ${t.status === 'Completed' ? '#dcfce7' : (t.status === 'Pending' ? '#fef9c3' : '#fee2e2')}; color: ${t.status === 'Completed' ? '#166534' : (t.status === 'Pending' ? '#854d0e' : '#991b1b')}; text-transform: uppercase;">
                                    ${t.status}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                Generated on ${new Date().toLocaleString()} | CJM Finance System
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function renderLoginLogs() {
    const body = document.getElementById('loginLogBody');
    if (!body) return;

    const logs = globalData.login_logs || [];
    if (logs.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1rem;">No login logs available.</td></tr>';
        return;
    }

    body.innerHTML = logs.map(log => `
        <tr>
            <td style="font-weight: 600;">${log.name}</td>
            <td>${log.username}</td>
            <td>${log.date}</td>
            <td>${log.time}</td>
        </tr>
    `).join('');
}

// --- RECOVERY CENTER ---

async function renderRecoveryCenter() {
    // 1. Check Integrity
    const integrity = checkDataIntegrity();
    const healthStatusEl = document.getElementById('healthStatus');
    const healthIconEl = document.getElementById('healthIcon');
    if (healthStatusEl) healthStatusEl.innerText = integrity.status;
    if (healthIconEl) healthIconEl.style.background = integrity.healthy ? '#dcfce7' : '#fee2e2';

    // 2. Recycle Bin
    const binBody = document.getElementById('recycleBinBody');
    const binCountEl = document.getElementById('recycleBinCount');
    const binItems = globalData.recycle_bin || [];
    if (binCountEl) binCountEl.innerText = `${binItems.length} Items`;
    if (binBody) {
        if (binItems.length === 0) {
            binBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">Recycle Bin is empty</td></tr>';
        } else {
            binBody.innerHTML = binItems.map(t => `
                <tr>
                    <td>${new Date(t.deletedAt).toLocaleString()}</td>
                    <td>${t.date}</td>
                    <td style="font-weight: 600;">${t.desc}</td>
                    <td class="${t.amount > 0 ? 'text-success' : 'text-danger'}">RM ${Math.abs(t.amount).toFixed(2)}</td>
                    <td>${t.deletedBy}</td>
                    <td>
                        <button onclick="restoreFromRecycleBin(${t.id})" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--success);">Restore</button>
                    </td>
                </tr>
            `).join('');
        }
    }

    // 3. Backups
    const backupsBody = document.getElementById('backupsBody');
    const lastBackupEl = document.getElementById('lastBackupTime');
    try {
        const res = await fetch(`${API_URL}/backups`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const backups = await res.json();

        if (lastBackupEl) lastBackupEl.innerText = backups.length > 0 ? new Date(backups[0].timestamp).toLocaleString() : 'No backups';
        if (backupsBody) {
            if (backups.length === 0) {
                backupsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #94a3b8;">No backups found</td></tr>';
            } else {
                backupsBody.innerHTML = backups.map(b => `
                    <tr>
                        <td>${new Date(b.timestamp).toLocaleString()}</td>
                        <td style="font-weight: 600;">Backup File</td>
                        <td style="font-family: monospace; font-size: 0.75rem;">${b.filename}</td>
                        <td>
                            <button onclick="restoreBackup('${b.filename}')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: #f59e0b;">Restore System</button>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        if (lastBackupEl) lastBackupEl.innerText = 'Failed to load backups';
        if (backupsBody) {
            backupsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load backups: ${err.message}</td></tr>`;
        }
    }

    // 4. Audit Trail (Recent)
    await loadAuditLogs();
}

async function loadAuditLogs() {
    const body = document.getElementById('auditTrailBody');
    if (!body) return;

    try {
        const response = await fetch(`${API_URL}/audit-logs`);
        const logs = await response.json();
        
        if (logs.length === 0) {
            body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #94a3b8;">No audit logs found</td></tr>';
        } else {
            body.innerHTML = logs.slice(0, 50).map(l => `
                <tr>
                    <td style="font-size: 0.75rem;">${new Date(l.timestamp).toLocaleString()}</td>
                    <td style="font-weight: 600; color: var(--primary);">${l.action}</td>
                    <td>${l.username}</td>
                    <td style="font-size: 0.75rem; color: var(--text-muted);">${JSON.stringify(l.details)}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Failed to load audit logs</td></tr>';
    }
}

async function restoreBackup(filename) {
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    if (user.role !== ROLES.ADMIN) {
        alert("Only Administrators can restore system backups.");
        return;
    }

    if (confirm("CRITICAL WARNING: This will overwrite ALL current system data with the state from this backup. A new backup of your current state will be created first. Proceed?")) {
        try {
            const response = await fetch(`${API_URL}/restore`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-User-Username': user.username
                },
                body: JSON.stringify({ filename })
            });
            
            const result = await response.json();
            if (result.success) {
                alert("System restored successfully! The page will now reload.");
                window.location.reload();
            } else {
                alert("Restore failed: " + result.error);
            }
        } catch (err) {
            alert("Network error during restore: " + err.message);
        }
    }
}

function exportBackupJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(globalData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `CJM_Finance_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
