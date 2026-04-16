// Predefined Users
const users = [
    { username: "firdaus.ramlan", password: "Firdaus@CJM26", name: "Firdaus" },
    { username: "castello005", password: "Castello@CJM26", name: "Castello" },
    { username: "shukri.000", password: "Shukri@CJM26", name: "Shukri" },
    { username: "kyrul.08", password: "Khairul@CJM26", name: "Khairul" }
];

// Sample Transactions
const transactions = [];

// API Configuration
const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
const params = new URLSearchParams(window.location.search);
let origin = params.get('server') || params.get('api') || '';
if (!origin && isHttp) {
    const host = window.location.hostname;
    const isLocalHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.endsWith('.local');
    const isPrivateIp =
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    origin = isLocalHost || isPrivateIp
        ? `${window.location.protocol}//${host}:3000`
        : window.location.origin;
}
if (!isHttp) {
    origin = localStorage.getItem('cjm_server_origin') || '';
    if (!origin) {
        origin = prompt('Enter server address (example: http://192.168.64.90:3000)') || '';
    }
    if (!origin) origin = 'http://localhost:3000';
}
origin = String(origin || '').trim();
origin = origin.replace(/\/api(\/.*)?$/i, '');
origin = origin.replace(/\/+$/, '');
try {
    if (!/^https?:\/\//i.test(origin)) origin = `http://${origin}`;
    origin = new URL(origin).origin;
} catch (_) {
    origin = 'http://localhost:3000';
}
if (!isHttp) localStorage.setItem('cjm_server_origin', origin);
const API_URL = `${origin}/api`;
const UPLOAD_URL = origin;

// Global Data State
let globalData = {
    financial_data: null,
    transactions: [],
    receipts: []
};
let lastServerError = "";

// --- AUTHENTICATION ---

// Handle Login Form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const userVal = document.getElementById('username').value;
        const passVal = document.getElementById('password').value;
        const errorMsg = document.getElementById('errorMessage');

        const user = users.find(u => u.username === userVal && u.password === passVal);

        if (user) {
            // Extract first name from full name or username if needed
            const firstName = user.name.split(' ')[0];
            const userData = { ...user, firstName: firstName };
            
            localStorage.setItem("cjm_user", JSON.stringify(userData));
            await loadDataFromServer(); // Initialize or load data
            window.location.href = "dashboard.html";
        } else {
            errorMsg.innerText = "Invalid username or password. Please try again.";
            errorMsg.style.opacity = "1";
        }
    });
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
    
    await loadDataFromServer();

    // Only run these on pages that have the elements
    if (document.getElementById('totalBalanceDisplay')) {
        displayFinancialStats();
    }
    if (document.getElementById('transactionBody')) {
        renderTransactions();
    }
}

// Reset Financial Data and Receipts
async function handleResetData() {
    if (confirm("Are you sure you want to reset all financial totals, transactions, and receipts? This cannot be undone.")) {
        try {
            globalData = {
                financial_data: getInitialFinancialData(),
                transactions: [],
                receipts: []
            };
            await saveDataToServer();
            alert("All system data has been reset to RM 0.00.");
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
        dailyExpenses: 0.00,
        officeBreakdown: {
            "Rental": 0, "Cleaner Expenses": 0, "Water Bills": 0, "Electric Bills": 0, "WiFi & Internet": 0, "Pantry": 0, "Renovation": 0
        },
        programBreakdown: {
            "Hotel": 0, "Living Expenses": 0, "Toll": 0, "Flight Ticket": 0, "Gift/Hamper/Stationary/Other": 0, "T-Shirt": 0, "Car Rental": 0, "Car Fuel": 0, "Guest Speaker": 0, "Venue": 0, "Catering": 0
        },
        companyBreakdown: {
            "Staff Incentive": 0, "Vehicle Maintenance": 0, "Volunteer House": 0, "Program/Company Supplies": 0
        }
    };
}

// Load data from backend API
async function loadDataFromServer() {
    try {
        const response = await fetch(`${API_URL}/data`);
        const data = await response.json();
        
        globalData.financial_data = data.financial_data || getInitialFinancialData();
        globalData.transactions = Array.isArray(data.transactions) ? data.transactions : [];
        globalData.receipts = Array.isArray(data.receipts) ? data.receipts : (Object.values(data.receipts) || []);
        
        // Migration: If pendingIncome is missing, recalculate everything silently
        if (globalData.financial_data.pendingIncome === undefined && globalData.transactions.length > 0) {
            await recalculateAllTotals(true);
        }
        
    } catch (err) {
        console.error("Error loading data from server:", err);
        // Fallback to initial data
        globalData.financial_data = getInitialFinancialData();
    }
}

// Save data to backend API
async function saveDataToServer() {
    try {
        const response = await fetch(`${API_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(globalData)
        });
        
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Server error ${response.status}${text ? `: ${text}` : ''}`);
        }
        lastServerError = "";
        return true;
    } catch (err) {
        console.error("Error saving data:", err);
        lastServerError = (err && err.message) ? err.message : String(err);
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
        // Handle potentially null amounts from broken transactions
        const amount = Math.abs(parseFloat(t.amount) || 0);
        
        if (t.category === 'Revenue') {
            data.totalIncome += amount;
            data.balance += amount;
            if (t.status === 'Pending') {
                data.pendingIncome += amount;
            } else if (t.status === 'Completed') {
                data.completedIncome += amount;
            } else if (t.status === 'Cancelled') {
                data.totalIncome -= amount;
                data.balance -= amount;
            }
        } else {
            data.totalExpenses += amount;
            data.balance -= amount;
            
            // Rebuild breakdowns from transactions
            const formType = t.formType;
            const desc = t.desc;
            
            if (formType === 'office') {
                data.officeExpenses += amount;
                if (data.officeBreakdown.hasOwnProperty(desc)) {
                    data.officeBreakdown[desc] += amount;
                }
            } else if (formType === 'program') {
                data.programExpenses += amount;
                if (data.programBreakdown.hasOwnProperty(desc)) {
                    data.programBreakdown[desc] += amount;
                }
            } else if (formType === 'company') {
                data.companyExpenses += amount;
                if (data.companyBreakdown.hasOwnProperty(desc)) {
                    data.companyBreakdown[desc] += amount;
                }
            } else if (formType === 'daily') {
                data.dailyExpenses = (data.dailyExpenses || 0) + amount;
            }
        }
    });

    globalData.financial_data = data;
    const success = await saveDataToServer();
    if (success) {
        if (!silent) alert("System totals have been successfully recalculated based on your transaction history.");
        displayFinancialStats();
    } else {
        if (!silent) alert(`Failed to save recalculated data to server.\n\nServer: ${API_URL}\nDetails: ${lastServerError || 'Unknown error'}`);
    }
}

async function updateFinancialStats(type, totalAmount, categoryName, receiptFileDataList = null, itemizedData = null, revenueStatus = 'Completed') {
    let data = getFinancialTotals();
    totalAmount = parseFloat(totalAmount);
    const user = JSON.parse(localStorage.getItem("cjm_user"));
    const fillerName = user ? user.firstName : "Unknown";
    const clientName = itemizedData && itemizedData.Client ? itemizedData.Client : "";

    // Update financial stats
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
                        data.officeBreakdown[key] += parseFloat(itemizedData[key]);
                    }
                }
            }
        }
        if (type === 'program') {
            data.programExpenses += totalAmount;
            if (itemizedData) {
                for (let key in itemizedData) {
                    if (data.programBreakdown.hasOwnProperty(key)) {
                        data.programBreakdown[key] += parseFloat(itemizedData[key]);
                    }
                }
            }
        }
        if (type === 'company') {
            data.companyExpenses += totalAmount;
            if (itemizedData) {
                for (let key in itemizedData) {
                    if (data.companyBreakdown.hasOwnProperty(key)) {
                        data.companyBreakdown[key] += parseFloat(itemizedData[key]);
                    }
                }
            }
        }
        if (type === 'daily') {
            data.dailyExpenses = (data.dailyExpenses || 0) + totalAmount;
        }
    }

    globalData.financial_data = data;
    
    // Add to transactions list
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        desc: categoryName || (type.charAt(0).toUpperCase() + type.slice(1)),
        category: type === 'income' || type === 'project_revenue' ? "Revenue" : "Expense",
        formType: type,
        amount: (type === 'income' || type === 'project_revenue') ? totalAmount : -totalAmount,
        status: (type === 'income' || type === 'project_revenue') ? revenueStatus : "Completed",
        hasReceipt: receiptFileDataList && receiptFileDataList.length > 0,
        filledBy: fillerName,
        client: clientName
    };
    
    globalData.transactions.unshift(transaction); 

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
    const success = await saveDataToServer();
    if (!success) {
        alert(`Failed to save data to the server.\n\nServer: ${API_URL}\nDetails: ${lastServerError || 'Unknown error'}\n\nMake sure you opened the system using the server link (example: ${origin}).`);
    }
    return success;
}

// Update Transaction Status
async function updateTransactionStatus(transactionId, newStatus) {
    const transaction = globalData.transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    if (confirm(`Are you sure you want to change this transaction status to ${newStatus}?`)) {
        const oldStatus = transaction.status;
        const amount = Math.abs(transaction.amount); // amount is already signed (+ for revenue)
        let data = getFinancialTotals();

        // 1. Remove effect of old status
        if (oldStatus === 'Pending') {
            data.pendingIncome -= amount;
        } else if (oldStatus === 'Completed') {
            data.completedIncome -= amount;
        } else if (oldStatus === 'Cancelled') {
            // Restore original totals before adding new status effect
            data.totalIncome += amount;
            data.balance += amount;
        }

        // 2. Add effect of new status
        if (newStatus === 'Pending') {
            data.pendingIncome += amount;
        } else if (newStatus === 'Completed') {
            data.completedIncome += amount;
        } else if (newStatus === 'Cancelled') {
            // Remove from main totals
            data.totalIncome -= amount;
            data.balance -= amount;
        }

        transaction.status = newStatus;
        globalData.financial_data = data;

        const success = await saveDataToServer();
        if (success) {
            alert(`Status updated to ${newStatus}.`);
            renderTransactions();
            if (document.getElementById('totalBalanceDisplay')) {
                displayFinancialStats();
            }
        } else {
            alert(`Failed to update status on server.\n\nServer: ${API_URL}\nDetails: ${lastServerError || 'Unknown error'}`);
        }
    }
}

function displayFinancialStats() {
    const data = getFinancialTotals();
    const balanceEl = document.getElementById('totalBalanceDisplay');
    const incomeEl = document.getElementById('totalIncomeDisplay');
    const pendingIncomeEl = document.getElementById('pendingIncomeDisplay');
    const completedIncomeEl = document.getElementById('completedIncomeDisplay');
    const expenseEl = document.getElementById('totalExpenseDisplay');
    
    // Split displays
    const officeEl = document.getElementById('officeExpenseDisplay');
    const programEl = document.getElementById('programExpenseDisplay');
    const companyEl = document.getElementById('companyExpenseDisplay');

    // Itemized containers
    const officeList = document.getElementById('officeItemList');
    const programList = document.getElementById('programItemList');
    const companyList = document.getElementById('companyItemList');

    if (balanceEl) balanceEl.innerText = `RM ${data.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (incomeEl) incomeEl.innerText = `+ RM ${data.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (pendingIncomeEl) pendingIncomeEl.innerText = `RM ${data.pendingIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (completedIncomeEl) completedIncomeEl.innerText = `RM ${data.completedIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (expenseEl) expenseEl.innerText = `- RM ${data.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    if (officeEl) officeEl.innerText = `RM ${data.officeExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (programEl) programEl.innerText = `RM ${data.programExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (companyEl) companyEl.innerText = `RM ${data.companyExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    const dailyDisplay = document.getElementById('dailyExpenseTotalDisplay');
    if (dailyDisplay) dailyDisplay.innerText = `RM ${(data.dailyExpenses || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    // Render breakdowns
    if (officeList && data.officeBreakdown) {
        officeList.innerHTML = Object.entries(data.officeBreakdown).map(([key, val]) => `
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                <span>${key}</span>
                <span>RM ${val.toFixed(2)}</span>
            </div>
        `).join('') + `<div style="border-top: 1px solid #eee; margin-top: 0.5rem; padding-top: 0.5rem; font-weight: bold; display: flex; justify-content: space-between;"><span>Total</span><span>RM ${data.officeExpenses.toFixed(2)}</span></div>`;
    }

    if (programList && data.programBreakdown) {
        programList.innerHTML = Object.entries(data.programBreakdown).map(([key, val]) => `
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                <span>${key}</span>
                <span>RM ${val.toFixed(2)}</span>
            </div>
        `).join('') + `<div style="border-top: 1px solid #eee; margin-top: 0.5rem; padding-top: 0.5rem; font-weight: bold; display: flex; justify-content: space-between;"><span>Total</span><span>RM ${data.programExpenses.toFixed(2)}</span></div>`;
    }

    if (companyList && data.companyBreakdown) {
        companyList.innerHTML = Object.entries(data.companyBreakdown).map(([key, val]) => `
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                <span>${key}</span>
                <span>RM ${val.toFixed(2)}</span>
            </div>
        `).join('') + `<div style="border-top: 1px solid #eee; margin-top: 0.5rem; padding-top: 0.5rem; font-weight: bold; display: flex; justify-content: space-between;"><span>Total</span><span>RM ${data.companyExpenses.toFixed(2)}</span></div>`;
    }
}

// --- DASHBOARD UI ---

function renderTransactions() {
    const container = document.getElementById('transactions-container');
    if (!container) return;

    const savedTransactions = globalData.transactions || [];
    
    if (savedTransactions.length === 0) {
        container.innerHTML = '<div class="table-container" style="text-align: center; padding: 2rem; color: var(--text-muted);">No transactions yet.</div>';
        return;
    }

    const groups = {
        income: { title: "Project Revenue Transactions", items: [] },
        office: { title: "Office Expense Transactions", items: [] },
        program: { title: "Program Expense Transactions", items: [] },
        company: { title: "Company Expense Transactions", items: [] },
        daily: { title: "Daily Expense Transactions", items: [] }
    };

    savedTransactions.forEach(t => {
        if (groups[t.formType]) {
            groups[t.formType].items.push(t);
        } else {
            // Fallback for old data or unmapped types
            const mappedType = t.category === 'Revenue' ? 'income' : 'office';
            groups[mappedType].items.push(t);
        }
    });

    container.innerHTML = Object.entries(groups).map(([type, group]) => {
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
                            ${type === 'income' ? '<th>Actions</th>' : ''}
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
                                    <span class="status-badge status-${t.status.toLowerCase()}">${t.status}</span>
                                </td>
                                ${type === 'income' ? `
                                    <td>
                                        <div style="display: flex; gap: 0.5rem;">
                                            ${t.status === 'Pending' ? `
                                                <button onclick="updateTransactionStatus(${t.id}, 'Completed')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--success);">Complete</button>
                                                <button onclick="updateTransactionStatus(${t.id}, 'Cancelled')" class="btn btn-logout" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--danger); color: white;">Cancel</button>
                                            ` : t.status === 'Completed' ? `
                                                <button onclick="updateTransactionStatus(${t.id}, 'Pending')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: #f59e0b;">Pending</button>
                                                <button onclick="updateTransactionStatus(${t.id}, 'Cancelled')" class="btn btn-logout" style="padding: 4px 8px; font-size: 0.7rem; background-color: var(--danger); color: white;">Cancel</button>
                                            ` : `
                                                <button onclick="updateTransactionStatus(${t.id}, 'Pending')" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; background-color: #f59e0b;">Restore</button>
                                            `}
                                        </div>
                                    </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');
}
