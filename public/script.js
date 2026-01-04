const API_URL = '/api';
let itemCount = 0;
let debounceTimer;

document.addEventListener('DOMContentLoaded', () => {
    // Set initial date/time
    updateDateTime();

    // Add first item
    addItem();

    // Load defaults
    loadDefaults();

    // Attach event listeners for live preview
    attachFormListeners();
});

function attachFormListeners() {
    const form = document.getElementById('invoiceForm');
    form.addEventListener('input', () => {
        debounce(updatePreview, 1000)();
    });

    form.addEventListener('change', () => {
        debounce(updatePreview, 500)();
    });
}

function debounce(func, wait) {
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(debounceTimer);
            func(...args);
        };
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(later, wait);
    };
}

function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById('date').value = dateStr + ' ' + timeStr;
}

function addItem() {
    itemCount++;
    const container = document.getElementById('itemsContainer');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.id = `item-${itemCount}`;
    row.innerHTML = `
        <div class="form-group" style="margin-bottom:0">
            <input type="text" name="itemCode[]" placeholder="Code">
        </div>
        <div class="form-group" style="margin-bottom:0">
            <input type="text" name="itemName[]" placeholder="Item Name" required>
        </div>
        <div class="form-group" style="margin-bottom:0">
            <input type="number" name="itemQuantity[]" value="1" min="1" onchange="calculateItemTotal(${itemCount})">
        </div>
        <div class="form-group" style="margin-bottom:0">
            <input type="number" name="itemRate[]" placeholder="0.00" step="0.01" onchange="calculateItemTotal(${itemCount})">
        </div>
        <div class="form-group" style="margin-bottom:0">
            <input type="number" name="itemAmount[]" placeholder="0.00" readonly>
        </div>
        <button type="button" class="btn btn-danger" onclick="removeItem(${itemCount})">✕</button>
    `;
    container.appendChild(row);
}

function removeItem(id) {
    const row = document.getElementById(`item-${id}`);
    if (row) {
        row.remove();
        debounce(updatePreview, 500)();
    }
}

function calculateItemTotal(id) {
    const row = document.getElementById(`item-${id}`);
    if (row) {
        const qty = parseFloat(row.querySelector('input[name="itemQuantity[]"]').value) || 0;
        const rate = parseFloat(row.querySelector('input[name="itemRate[]"]').value) || 0;
        const amount = qty * rate;
        row.querySelector('input[name="itemAmount[]"]').value = amount.toFixed(2);
        debounce(updatePreview, 500)();
    }
}

async function loadDefaults() {
    try {
        const res = await fetch(`${API_URL}/defaults`);
        const result = await res.json();
        if (result.success) {
            populateForm(result.data);
            updatePreview();
        }
    } catch (error) {
        console.error('Error loading defaults:', error);
    }
}

function populateForm(data) {
    const fields = [
        'companyName', 'storeName', 'storePhone', 'storeAddress', 'gstin',
        'storeId', 'posNo', 'placeOfSupply', 'invoiceNumber', 'orderNo',
        'tokenNo', 'cashierId', 'cashierName', 'customerName', 'customerPhone',
        'registeredAddress', 'stateCode', 'cin', 'fssaiNo', 'sacCode'
    ];

    fields.forEach(field => {
        const el = document.getElementById(field);
        if (el && data[field]) el.value = data[field];
    });

    // Add default items if any? Maybe not, keep manual control or default logic
}

async function collectFormData() {
    const data = {};

    // Simple fields
    const inputs = document.querySelectorAll('#invoiceForm input:not([type="file"]), #invoiceForm select');
    inputs.forEach(input => {
        if (input.name && input.value && !input.name.includes('[')) {
            data[input.name] = input.value;
        }
    });

    // Logo
    const logoInput = document.getElementById('logo');
    if (logoInput.files[0]) {
        const formData = new FormData();
        formData.append('logo', logoInput.files[0]);
        try {
            const res = await fetch(`${API_URL}/upload-logo`, { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) data.logoPath = result.path;
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
                hsnSac: '996331' // default
            });
        }
    }

    return data;
}

async function updatePreview() {
    // Show spinner if we had one, or just update silently 
    const data = await collectFormData();

    try {
        const res = await fetch(`${API_URL}/generate-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        if (result.success) {
            const iframe = document.getElementById('previewFrame');
            // Timestamp to prevent caching
            iframe.src = `${API_URL}/view/${result.filename}?t=${Date.now()}`;
        }
    } catch (error) {
        console.error('Preview error:', error);
    }
}

async function generateFinal() {
    await updatePreview();
    const iframe = document.getElementById('previewFrame');
    // Open in new tab for print
    if (iframe.src && iframe.src !== 'about:blank') {
        window.open(iframe.src, '_blank');
    }
}
