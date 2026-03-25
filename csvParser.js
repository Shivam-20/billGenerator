const { parse } = require('csv-parse/sync');

// CSV columns → invoiceData field mapping
const COLUMN_MAP = {
  'invoice_number': 'invoiceNumber',
  'date': 'date',
  'layout': 'layout',
  'company_name': 'companyName',
  'store_name': 'storeName',
  'store_address': 'storeAddress',
  'store_phone': 'storePhone',
  'gstin': 'gstin',
  'registered_address': 'registeredAddress',
  'state_code': 'stateCode',
  'cin': 'cin',
  'fssai_no': 'fssaiNo',
  'store_id': 'storeId',
  'pos_no': 'posNo',
  'place_of_supply': 'placeOfSupply',
  'sac_code': 'sacCode',
  'customer_name': 'customerName',
  'customer_phone': 'customerPhone',
  'order_no': 'orderNo',
  'token_no': 'tokenNo',
  'cashier_id': 'cashierId',
  'cashier_name': 'cashierName',
  'payment_method': 'paymentMethod',
  'transaction_ref_no': 'transactionRefNo',
  'serial_no': 'serialNo',
  // Item columns (pipe-delimited within a cell for multiple items)
  'item_codes': '_itemCodes',
  'item_names': '_itemNames',
  'item_quantities': '_itemQuantities',
  'item_rates': '_itemRates',
  'item_hsn_sac': '_itemHsnSac',
};

const MAX_ROWS = 200;

/**
 * Parse CSV buffer into an array of invoice data objects.
 * Returns { invoices: object[], errors: { row: number, message: string }[] }
 */
function parseCSV(buffer) {
  const errors = [];

  let records;
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    return { invoices: [], errors: [{ row: 0, message: `CSV parse error: ${err.message}` }] };
  }

  if (records.length === 0) {
    return { invoices: [], errors: [{ row: 0, message: 'CSV file is empty or has no data rows' }] };
  }

  if (records.length > MAX_ROWS) {
    return { invoices: [], errors: [{ row: 0, message: `CSV exceeds maximum of ${MAX_ROWS} rows (got ${records.length})` }] };
  }

  const invoices = [];

  records.forEach((row, index) => {
    const rowNum = index + 2; // +2 because row 1 is header, data starts at 2
    try {
      const invoice = {};

      // Map simple fields
      for (const [csvCol, fieldName] of Object.entries(COLUMN_MAP)) {
        if (csvCol in row && row[csvCol] !== '' && !fieldName.startsWith('_')) {
          invoice[fieldName] = row[csvCol];
        }
      }

      // Parse pipe-delimited item columns
      const names = (row['item_names'] || '').split('|').map(s => s.trim()).filter(Boolean);
      if (names.length === 0) {
        // No items — pdfGenerator will use defaults
        invoices.push(invoice);
        return;
      }

      const codes = (row['item_codes'] || '').split('|').map(s => s.trim());
      const quantities = (row['item_quantities'] || '').split('|').map(s => s.trim());
      const rates = (row['item_rates'] || '').split('|').map(s => s.trim());
      const hsnSacs = (row['item_hsn_sac'] || '').split('|').map(s => s.trim());

      invoice.items = names.map((name, i) => {
        const qty = parseInt(quantities[i], 10) || 1;
        const rate = parseFloat(rates[i]) || 0;
        return {
          code: codes[i] || `H${String(i + 1).padStart(5, '0')}`,
          name: name.toUpperCase(),
          quantity: qty,
          rate: rate,
          hsnSac: hsnSacs[i] || '996331',
        };
      });

      invoices.push(invoice);
    } catch (err) {
      errors.push({ row: rowNum, message: err.message });
    }
  });

  return { invoices, errors };
}

module.exports = { parseCSV, MAX_ROWS };
