const API_URL = '/api';
let itemCount = 0;
let debounceTimer;
let historyPage = 1;

// ─── Bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    updateDateTime();
    addItem();
    loadDefaults();
    attachFormListeners();
    initBulkUpload();
    selectLayout('detailed'); // initialise card selection
});

// ─── Dark Mode ───────────────────────────────────────────────
function initDarkMode() {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    updateDarkIcons();
}

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    updateDarkIcons();
}

function updateDarkIcons() {
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('iconSun').classList.toggle('hidden', !isDark);
    document.getElementById('iconMoon').classList.toggle('hidden', isDark);
}

// ─── Tabs ────────────────────────────────────────────────────
function switchTab(name) {
    ['preview', 'history', 'bulk'].forEach(t => {
        const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
        const btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        const active = t === name;
        panel.classList.toggle('hidden', !active);
        panel.classList.toggle('flex', active);
        btn.classList.toggle('tab-active', active);
    });
    if (name === 'history') loadHistory();
}

// ─── Layout Picker ───────────────────────────────────────────
const LAYOUT_NAMES = {
    'detailed':    'Detailed A4',
    'thermal':     'Thermal Receipt',
    'compact':     'Compact A4',
    'hotel-folio': 'Hotel Folio',
    'bistro':      'Bistro / Cafe',
    'fine-dining': 'Fine Dining'
};

function selectLayout(val) {
    document.querySelectorAll('.layout-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById('lc-' + val);
    if (card) card.classList.add('selected');
    document.getElementById('layout').value = val;
    const badge = document.getElementById('layoutNameBadge');
    if (badge) badge.textContent = LAYOUT_NAMES[val] || val;
    debounce(updatePreview, 400)();
}

function selectBulkLayout(val) {
    document.querySelectorAll('#bulkLayoutPills .layout-pill').forEach(p => p.classList.remove('selected'));
    const pillId = 'blp-' + (val || 'auto');
    const pill = document.getElementById(pillId);
    if (pill) pill.classList.add('selected');
    document.getElementById('bulkLayoutValue').value = val;
}

// ─── Form Listeners & Debounce ───────────────────────────────
function attachFormListeners() {
    const form = document.getElementById('invoiceForm');
    form.addEventListener('input', () => debounce(updatePreview, 1000)());
    form.addEventListener('change', () => debounce(updatePreview, 500)());
}

function debounce(func, wait) {
    return function (...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func(...args), wait);
    };
}

// ─── Date / Time ─────────────────────────────────────────────
function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById('date').value = dateStr + ' ' + timeStr;
}

// ─── Items ───────────────────────────────────────────────────
function addItem() {
    itemCount++;
    const id = itemCount;
    const container = document.getElementById('itemsContainer');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.id = `item-${id}`;
    row.innerHTML = `
        <input type="text" name="itemCode[]" placeholder="Code" class="inp">
        <input type="text" name="itemName[]" placeholder="Item Name" required class="inp">
        <input type="number" name="itemQuantity[]" value="1" min="1" onchange="calculateItemTotal(${id})" class="inp">
        <input type="number" name="itemRate[]" placeholder="0.00" step="0.01" onchange="calculateItemTotal(${id})" class="inp">
        <input type="number" name="itemAmount[]" placeholder="0.00" readonly class="inp bg-gray-100 dark:bg-gray-600">
        <button type="button" class="btn-danger" onclick="removeItem(${id})">✕</button>
    `;
    container.appendChild(row);
}

function removeItem(id) {
    const row = document.getElementById(`item-${id}`);
    if (row) { row.remove(); debounce(updatePreview, 500)(); }
}

function calculateItemTotal(id) {
    const row = document.getElementById(`item-${id}`);
    if (!row) return;
    const qty = parseFloat(row.querySelector('[name="itemQuantity[]"]').value) || 0;
    const rate = parseFloat(row.querySelector('[name="itemRate[]"]').value) || 0;
    row.querySelector('[name="itemAmount[]"]').value = (qty * rate).toFixed(2);
    debounce(updatePreview, 500)();
}

// ─── Load Defaults ───────────────────────────────────────────
async function loadDefaults() {
    try {
        const res = await fetch(`${API_URL}/defaults`);
        const result = await res.json();
        if (result.success) { populateForm(result.data); updatePreview(); }
    } catch (e) { console.error('Error loading defaults:', e); }
}

function populateForm(data) {
    const fields = [
        'companyName', 'storeName', 'storePhone', 'storeAddress', 'gstin',
        'storeId', 'posNo', 'placeOfSupply', 'invoiceNumber', 'orderNo',
        'tokenNo', 'cashierId', 'cashierName', 'customerName', 'customerPhone',
        'registeredAddress', 'stateCode', 'cin', 'fssaiNo', 'sacCode'
    ];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el && data[f]) el.value = data[f];
    });
}

// ─── Collect Form Data ───────────────────────────────────────
async function collectFormData() {
    const data = {};
    document.querySelectorAll('#invoiceForm input:not([type="file"]), #invoiceForm select').forEach(input => {
        if (input.name && input.value && !input.name.includes('[')) data[input.name] = input.value;
    });

    // Logo upload
    const logoInput = document.getElementById('logo');
    if (logoInput.files[0]) {
        const fd = new FormData();
        fd.append('logo', logoInput.files[0]);
        try {
            const r = await fetch(`${API_URL}/upload-logo`, { method: 'POST', body: fd });
            const j = await r.json();
            if (j.success) data.logoPath = j.path;
        } catch (e) { console.error(e); }
    }

    // Items
    const codes = document.getElementsByName('itemCode[]');
    const names = document.getElementsByName('itemName[]');
    const qtys = document.getElementsByName('itemQuantity[]');
    const rates = document.getElementsByName('itemRate[]');
    data.items = [];
    for (let i = 0; i < names.length; i++) {
        if (names[i].value.trim()) {
            data.items.push({
                code: codes[i].value || `H${String(i + 1).padStart(5, '0')}`,
                name: names[i].value.toUpperCase(),
                quantity: parseInt(qtys[i].value) || 1,
                rate: parseFloat(rates[i].value) || 0,
                hsnSac: '996331'
            });
        }
    }
    return data;
}

// ─── Preview ─────────────────────────────────────────────────
async function updatePreview() {
    const data = await collectFormData();
    try {
        const res = await fetch(`${API_URL}/generate-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('previewFrame').src = `${API_URL}/view/${result.filename}?t=${Date.now()}`;
        }
    } catch (e) { console.error('Preview error:', e); }
}

async function generateFinal() {
    await updatePreview();
    const iframe = document.getElementById('previewFrame');
    if (iframe.src && iframe.src !== 'about:blank') window.open(iframe.src, '_blank');
}

// ─── Invoice History ─────────────────────────────────────────
async function loadHistory() {
    historyPage = 1;
    document.getElementById('historyList').innerHTML = '';
    await fetchHistoryPage();
}

async function loadHistoryMore() {
    historyPage++;
    await fetchHistoryPage();
}

async function fetchHistoryPage() {
    try {
        const res = await fetch(`${API_URL}/invoices?page=${historyPage}&limit=20`);
        const data = await res.json();
        if (!data.success) return;
        const list = document.getElementById('historyList');
        data.invoices.forEach(inv => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.id = `hist-${inv.filename}`;
            const date = new Date(inv.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            card.innerHTML = `
                <div>
                    <p class="text-gray-100 font-medium">${inv.filename}</p>
                    <p class="text-xs text-gray-400">${date}</p>
                </div>
                <div class="actions-row">
                    <a href="${inv.viewUrl}" target="_blank">View</a>
                    <a href="${inv.downloadUrl}">Download</a>
                    <button class="del-btn" onclick="deleteInvoice('${inv.filename}')">Delete</button>
                </div>`;
            list.appendChild(card);
        });
        document.getElementById('historyLoadMore').classList.toggle('hidden', historyPage >= data.pages);
    } catch (e) { console.error('History error:', e); }
}

async function deleteInvoice(filename) {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
        const res = await fetch(`${API_URL}/invoices/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            const card = document.getElementById(`hist-${filename}`);
            if (card) card.remove();
        }
    } catch (e) { console.error('Delete error:', e); }
}

// ─── Bulk Upload ─────────────────────────────────────────────
function initBulkUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            handleCSVUpload(fileInput.files[0]);
            fileInput.value = ''; // allow re-upload of same file
        }
    });

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('border-brand-400'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-brand-400'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('border-brand-400');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) handleCSVUpload(file);
    });
}

async function handleCSVUpload(file) {
    const output = document.querySelector('input[name="bulkOutput"]:checked').value;
    const progress = document.getElementById('bulkProgress');
    const bar = document.getElementById('bulkProgressBar');
    const statusText = document.getElementById('bulkStatusText');
    const countText = document.getElementById('bulkCountText');
    const resultDiv = document.getElementById('bulkResult');
    const errorDiv = document.getElementById('bulkError');

    // Reset UI fully
    resultDiv.classList.add('hidden');
    resultDiv.innerHTML = '';
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
    bar.classList.remove('bg-red-500');
    bar.classList.add('bg-brand-500');
    bar.style.width = '10%';
    progress.classList.remove('hidden');
    statusText.textContent = 'Uploading CSV…';
    countText.textContent = file.name;

    const fd = new FormData();
    fd.append('file', file);

    try {
        bar.style.width = '40%';
        statusText.textContent = 'Generating invoices…';

        let url = `${API_URL}/bulk-generate?output=${output}`;
        const bulkLayout = document.getElementById('bulkLayoutValue').value;
        if (bulkLayout) url += `&layout=${bulkLayout}`;

        const res = await fetch(url, { method: 'POST', body: fd });

        bar.style.width = '90%';

        if (output === 'zip') {
            // ZIP comes as binary stream
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoices-${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            bar.style.width = '100%';
            statusText.textContent = 'Done!';
            resultDiv.textContent = `ZIP downloaded successfully.`;
            resultDiv.classList.remove('hidden');
        } else {
            // Merged — JSON response with download URL
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Unknown error');

            bar.style.width = '100%';
            statusText.textContent = 'Done!';
            resultDiv.innerHTML = `${data.message} — <a href="${data.downloadUrl}" class="underline" download>Download merged PDF</a>`;
            resultDiv.classList.remove('hidden');

            if (data.errors && data.errors.length) {
                errorDiv.textContent = `Skipped rows: ${data.errors.map(e => `Row ${e.row}: ${e.message}`).join('; ')}`;
                errorDiv.classList.remove('hidden');
            }
        }
    } catch (err) {
        bar.style.width = '100%';
        bar.classList.remove('bg-brand-500');
        bar.classList.add('bg-red-500');
        statusText.textContent = 'Error';
        errorDiv.textContent = err.message || 'Upload failed';
        errorDiv.classList.remove('hidden');
    }
}
