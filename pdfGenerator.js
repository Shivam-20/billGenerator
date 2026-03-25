const PDFDocument = require('pdfkit');
const fs = require('fs');
const QRCode = require('qrcode');

// Default values matching Haldiram's invoice format
const DEFAULT_VALUES = {
  invoiceNumber: '435/2526/131636',
  date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),

  // Restaurant/Company Details
  companyName: 'Haldiram Manufacturing Company Private Limited',
  storeName: 'AIRIA MALL',
  storeAddress: 'Unit NO. FF 5A, 5B, 5C - 5D, 1st Floor, AIRIA MALL, Sector 68, , Gurugram, Haryana, 122001',
  storePhone: '9911655288',
  gstin: '06AAACH3170K1ZP',
  registeredAddress: 'Village Kherki Daula, Delhi Jaipur Highway, Gurugram- 122001',
  stateCode: '06',
  cin: 'U74899HR1994PTC122349',
  fssaiNo: '10823005001112',
  storeId: 'RO435',
  posNo: '43503',
  placeOfSupply: 'HR(06)',
  sacCode: '996331',

  // Customer Details
  customerName: 'Guest Customer',
  customerPhone: '9876543210',

  // Order Details
  orderNo: 'C001',
  tokenNo: '001',
  cashierId: '4006239',
  cashierName: 'CASHIER',
  returnedAgainst: 'null',

  // Items
  items: [
    { code: 'H000073', name: 'MASALA DOSA', quantity: 1, rate: 230.00, hsnSac: '996331' },
    { code: 'H000051', name: 'CHOLEY BHATURE', quantity: 1, rate: 184.00, hsnSac: '996331' }
  ],

  // Tax
  cgstRate: 2.50,
  sgstRate: 2.50,

  // Payment
  paymentMethod: 'Cash',
  transactionRefNo: '',
  serialNo: '',

  // Terms
  termsAndConditions: [
    'All disputes are subject to Delhi Jurisdiction.',
    'Goods once sold will not be taken back or exchanged.',
    'All Bengali sweets must be kept in refrigerator & consumed on the same day.',
    'All Chat items, Dhokla, Khandvi, Rabri, Rasmalai & all thalis must be consumed within three hours of purchase.',
    'All Khoya sweets will last for three days from the date of Purchase.',
    'Khoya, Kaju, Badaam, items must not be kept in refrigerator.',
    'Lal Ladoo must be consumed within two days.',
    'All government levied taxes extra as applicable.',
    'Guests are requested to provide digital / physical invoice to collect food item(s) from the counter.',
    'Total Invoice amount is rounded off to next nearest rupees for cash transaction'
  ],

  customerCarePhone: '011-47685219',
  customerCareEmail: 'CustomerCare@haldiram.com'
};

// Available layouts
const LAYOUTS = ['detailed', 'thermal', 'compact', 'hotel-folio', 'bistro', 'fine-dining'];

/**
 * Prepare common invoice data: merge defaults, calculate taxes/totals
 */
function prepareInvoiceData(data) {
  const invoiceData = {
    ...DEFAULT_VALUES,
    ...data,
    items: data.items && data.items.length > 0 ? data.items : DEFAULT_VALUES.items,
    termsAndConditions: data.termsAndConditions || DEFAULT_VALUES.termsAndConditions
  };

  invoiceData.items = invoiceData.items.map(item => {
    const amount = item.quantity * item.rate;
    const taxableAmount = amount;
    const cgst = taxableAmount * (invoiceData.cgstRate / 100);
    const sgst = taxableAmount * (invoiceData.sgstRate / 100);
    return {
      ...item,
      amount,
      cgst,
      sgst,
      taxableAmount,
      totalLineAmount: taxableAmount + cgst + sgst
    };
  });

  const totalTaxableAmount = invoiceData.items.reduce((sum, item) => sum + item.taxableAmount, 0);
  const totalCGST = invoiceData.items.reduce((sum, item) => sum + item.cgst, 0);
  const totalSGST = invoiceData.items.reduce((sum, item) => sum + item.sgst, 0);
  const totalItems = invoiceData.items.reduce((sum, item) => sum + item.quantity, 0);
  const grandTotal = totalTaxableAmount + totalCGST + totalSGST;

  invoiceData.totalAmount = grandTotal;
  invoiceData.totalTaxableAmount = totalTaxableAmount;
  invoiceData.totalCGST = totalCGST;
  invoiceData.totalSGST = totalSGST;
  invoiceData.totalItems = totalItems;
  invoiceData.amountPayable = grandTotal;

  return invoiceData;
}

/**
 * Route to the correct layout generator based on data.layout
 */
async function generateInvoicePDF(data = {}, outputPath) {
  const layout = (data.layout || 'detailed').toLowerCase();

  switch (layout) {
    case 'thermal':
      return generateThermalPDF(data, outputPath);
    case 'compact':
      return generateCompactPDF(data, outputPath);
    case 'hotel-folio':
      return generateHotelFolioPDF(data, outputPath);
    case 'bistro':
      return generateBistroPDF(data, outputPath);
    case 'fine-dining':
      return generateFineDiningPDF(data, outputPath);
    case 'detailed':
    default:
      return generateDetailedPDF(data, outputPath);
  }
}

/**
 * Layout: Detailed — A4 Haldiram-style Tax Invoice with bordered sections
 */
async function generateDetailedPDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const invoiceData = prepareInvoiceData(data);

      const doc = new PDFDocument({
        margin: 30,
        size: 'A4',
        bufferPages: true
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let currentY = 30;

      currentY = drawLogoAndTitle(doc, invoiceData, currentY);
      currentY = drawSellerBox(doc, invoiceData, currentY);
      currentY = drawCustomerBox(doc, invoiceData, currentY);
      currentY = drawOrderBox(doc, invoiceData, currentY);
      currentY = drawItemsAndTotalsBox(doc, invoiceData, currentY);
      currentY = drawPaymentBox(doc, invoiceData, currentY);
      currentY = drawTermsAndConditions(doc, invoiceData, currentY);
      await drawFooter(doc, invoiceData, currentY);

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Layout: Thermal — 80mm receipt-style invoice (narrow, monospace, dashed separators)
 */
async function generateThermalPDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const d = prepareInvoiceData(data);
      const W = 226; // 80mm at 72 DPI
      const M = 10;  // margin
      const CW = W - M * 2; // content width

      const doc = new PDFDocument({ margin: M, size: [W, 800], bufferPages: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let y = M;
      const dash = '-'.repeat(38);
      const font = (bold) => doc.font(bold ? 'Courier-Bold' : 'Courier');
      const line = (text, size, bold, opts) => {
        font(bold || false).fontSize(size || 7);
        doc.text(text, M, y, { width: CW, ...opts });
        y += doc.heightOfString(text, { width: CW, ...opts }) + 1;
      };
      const center = (text, size, bold) => line(text, size, bold, { align: 'center' });
      const sep = () => { font(false).fontSize(6); doc.text(dash, M, y, { width: CW, align: 'center' }); y += 8; };

      // Header
      center(d.companyName, 8, true);
      center(d.storeName, 7, true);
      y += 2;
      center(d.storeAddress, 6);
      center(`Ph: ${d.storePhone}`, 6);
      center(`GSTIN: ${d.gstin}`, 6);
      center(`FSSAI: ${d.fssaiNo}`, 6);
      sep();

      // Invoice info
      center('TAX INVOICE', 8, true);
      sep();
      line(`Inv#  : ${d.invoiceNumber}`, 6);
      line(`Date  : ${d.date}`, 6);
      line(`Order : ${d.orderNo}   Token: ${d.tokenNo}`, 6);
      line(`POS   : ${d.posNo}   Store: ${d.storeId}`, 6);
      sep();

      // Customer
      line(`Customer: ${d.customerName}`, 6);
      if (d.customerPhone) line(`Phone   : ${d.customerPhone}`, 6);
      line(`Cashier : ${d.cashierName} (${d.cashierId})`, 6);
      sep();

      // Items header
      font(true).fontSize(6);
      doc.text('Item', M, y, { width: CW * 0.5 });
      doc.text('Qty', M + CW * 0.5, y, { width: CW * 0.15, align: 'right' });
      doc.text('Rate', M + CW * 0.65, y, { width: CW * 0.17, align: 'right' });
      doc.text('Amt', M + CW * 0.82, y, { width: CW * 0.18, align: 'right' });
      y += 9;
      sep();

      // Items
      d.items.forEach(item => {
        font(false).fontSize(6);
        const nameH = doc.heightOfString(item.name, { width: CW * 0.5 });
        doc.text(item.name, M, y, { width: CW * 0.5 });
        doc.text(String(item.quantity), M + CW * 0.5, y, { width: CW * 0.15, align: 'right' });
        doc.text(item.rate.toFixed(2), M + CW * 0.65, y, { width: CW * 0.17, align: 'right' });
        doc.text(item.amount.toFixed(2), M + CW * 0.82, y, { width: CW * 0.18, align: 'right' });
        y += Math.max(nameH, 8) + 1;
      });
      sep();

      // Totals
      const rightVal = (label, val, bold) => {
        font(bold || false).fontSize(7);
        doc.text(label, M, y, { width: CW * 0.6 });
        doc.text(val, M + CW * 0.6, y, { width: CW * 0.4, align: 'right' });
        y += 9;
      };

      rightVal('Subtotal', `₹${d.totalTaxableAmount.toFixed(2)}`);
      rightVal(`CGST @ ${d.cgstRate}%`, `₹${d.totalCGST.toFixed(2)}`);
      rightVal(`SGST @ ${d.sgstRate}%`, `₹${d.totalSGST.toFixed(2)}`);
      sep();
      rightVal('TOTAL', `₹${d.totalAmount.toFixed(2)}`, true);
      y += 2;
      center(`(${convertToWords(d.amountPayable)})`, 5);
      sep();

      // Payment
      line(`Payment: ${d.paymentMethod}`, 6, true);
      if (d.transactionRefNo) line(`Ref: ${d.transactionRefNo}`, 6);
      line(`Items: ${d.totalItems}`, 6);
      sep();

      // Footer
      y += 2;
      center('Thank you for visiting!', 7, true);
      center(`Call: ${d.customerCarePhone}`, 5);
      center(d.customerCareEmail, 5);
      y += 4;
      center('System generated invoice', 5);
      center('No signature required', 5);

      // Trim page height
      const finalH = y + M;
      doc.page.height = finalH;

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Layout: Compact — A4 clean invoice without heavy boxes, modern feel
 */
async function generateCompactPDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const d = prepareInvoiceData(data);

      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const W = doc.page.width - 80; // content width
      let y = 40;

      const hLine = () => {
        doc.moveTo(40, y).lineTo(40 + W, y).lineWidth(0.5).strokeColor('#cccccc').stroke();
        y += 6;
      };

      // Title block
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#b91c1c')
        .text(d.companyName, 40, y, { width: W, align: 'center' });
      y += 22;
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
        .text(d.storeName, 40, y, { width: W, align: 'center' });
      y += 14;
      doc.fontSize(8).fillColor('#666666')
        .text(d.storeAddress, 40, y, { width: W, align: 'center' });
      y += doc.heightOfString(d.storeAddress, { width: W }) + 4;
      doc.text(`Ph: ${d.storePhone} | GSTIN: ${d.gstin} | FSSAI: ${d.fssaiNo}`, 40, y, { width: W, align: 'center' });
      y += 14;
      hLine();

      // Invoice header — two columns
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000')
        .text('TAX INVOICE', 40, y, { width: W, align: 'center' });
      y += 18;

      const col1 = 40, col2 = 40 + W / 2;
      const infoLine = (label, val, x) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#666666').text(label, x, y);
        doc.font('Helvetica').fillColor('#333333').text(val, x + 80, y);
      };

      infoLine('Invoice No:', d.invoiceNumber, col1);
      infoLine('Date:', d.date, col2);
      y += 13;
      infoLine('Order No:', d.orderNo, col1);
      infoLine('Token No:', d.tokenNo, col2);
      y += 13;
      infoLine('Customer:', d.customerName, col1);
      infoLine('Phone:', d.customerPhone, col2);
      y += 13;
      infoLine('Cashier:', `${d.cashierName} (${d.cashierId})`, col1);
      infoLine('Payment:', d.paymentMethod, col2);
      y += 16;
      hLine();

      // Items table
      const cols = [0, W * 0.05, W * 0.45, W * 0.58, W * 0.72, W * 0.86];
      const drawRow = (vals, bold, bg) => {
        if (bg) {
          doc.rect(40, y - 2, W, 14).fillColor(bg).fill();
        }
        const f = bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.font(f).fontSize(8).fillColor(bold ? '#ffffff' : '#333333');
        doc.text(vals[0], 40 + cols[0], y, { width: cols[1] - cols[0] });
        doc.text(vals[1], 40 + cols[1], y, { width: cols[2] - cols[1] });
        doc.text(vals[2], 40 + cols[2], y, { width: cols[3] - cols[2], align: 'right' });
        doc.text(vals[3], 40 + cols[3], y, { width: cols[4] - cols[3], align: 'right' });
        doc.text(vals[4], 40 + cols[4], y, { width: cols[5] - cols[4], align: 'right' });
        doc.text(vals[5], 40 + cols[5], y, { width: W - cols[5], align: 'right' });
        y += 14;
      };

      drawRow(['#', 'Item', 'HSN', 'Qty', 'Rate', 'Amount'], true, '#b91c1c');
      y += 2;

      d.items.forEach((item, i) => {
        const bg = i % 2 === 0 ? '#f9fafb' : null;
        drawRow([
          String(i + 1),
          item.name,
          item.hsnSac || d.sacCode,
          String(item.quantity),
          item.rate.toFixed(2),
          item.amount.toFixed(2)
        ], false, bg);
      });

      y += 4;
      hLine();

      // Totals
      const totalLine = (label, val, bold) => {
        const f = bold ? 'Helvetica-Bold' : 'Helvetica';
        const sz = bold ? 10 : 8;
        doc.font(f).fontSize(sz).fillColor('#333333');
        doc.text(label, 40, y, { width: W * 0.7, align: 'right' });
        doc.text(val, 40 + W * 0.7, y, { width: W * 0.3, align: 'right' });
        y += bold ? 16 : 12;
      };

      totalLine('Taxable Amount:', `₹${d.totalTaxableAmount.toFixed(2)}`);
      totalLine(`CGST @ ${d.cgstRate}%:`, `₹${d.totalCGST.toFixed(2)}`);
      totalLine(`SGST @ ${d.sgstRate}%:`, `₹${d.totalSGST.toFixed(2)}`);
      y += 2;
      hLine();
      totalLine('Total Payable:', `₹${d.amountPayable.toFixed(2)}`, true);

      doc.font('Helvetica').fontSize(7).fillColor('#999999')
        .text(convertToWords(d.amountPayable), 40, y, { width: W, align: 'right' });
      y += 20;
      hLine();

      // Footer
      y += 10;
      doc.font('Helvetica').fontSize(7).fillColor('#999999')
        .text('System generated invoice — no signature required', 40, y, { width: W, align: 'center' });
      y += 10;
      doc.text(`Customer Care: ${d.customerCarePhone} | ${d.customerCareEmail}`, 40, y, { width: W, align: 'center' });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

// Logo and Title (no box)
function drawLogoAndTitle(doc, data, startY) {
  let currentY = startY;

  // Logo
  const logoPath = data.logoPath || require('path').join(__dirname, 'haldiram-logo.png');
  try {
    const logoX = (doc.page.width - 278) / 2;
    doc.image(logoPath, logoX, currentY);
    currentY += 77;
  } catch (err) {
    doc.fillColor('#D32F2F').fontSize(12).font('Courier-Bold')
      .text('Haldirams', 30, currentY, { align: 'center', width: 535 });
    currentY += 28;
  }

  // Title - Centered
  doc.fillColor('#000000').fontSize(10).font('Courier-Bold')
    .text('Restaurant Service(Tax-Invoice)', 30, currentY, { align: 'center', width: 535 });
  currentY += 20;

  return currentY;
}

// BOX 1: Seller Information
function drawSellerBox(doc, data, startY) {
  let currentY = startY;
  const boxTop = currentY;
  const boxX = 30;
  const contentX = 40;

  // Content
  doc.fontSize(9).font('Courier-Bold').text(data.companyName, contentX, currentY + 5);
  currentY += 12;

  doc.fontSize(8).font('Courier-Bold').text(data.storeName, contentX, currentY + 5);
  currentY += 11;

  doc.fontSize(7).font('Courier').text(data.storeAddress, contentX, currentY + 5, { width: 520 });
  currentY += doc.heightOfString(data.storeAddress, { width: 520 }) + 2;

  doc.text(`Ph No. : ${data.storePhone}`, contentX, currentY + 5);
  currentY += 10;

  doc.font('Courier-Bold').text(`GSTIN No. ${data.gstin}`, contentX, currentY + 5);
  currentY += 12;

  doc.font('Courier-Bold').fontSize(7).text('Registered Address:', contentX, currentY + 5);
  doc.font('Courier').text(data.registeredAddress, contentX + 90, currentY + 5, { width: 400 });
  currentY += 10;

  doc.text(`State Code: ${data.stateCode}`, contentX, currentY + 5);
  currentY += 10;
  doc.text(`CIN: ${data.cin}`, contentX, currentY + 5);
  currentY += 10;
  doc.text(`FSSAI NO: ${data.fssaiNo}`, contentX, currentY + 5);
  currentY += 20;

  // Draw box around entire section
  doc.rect(boxX, boxTop, 535, currentY - boxTop).stroke();
  currentY += 8; // Gap before next box

  return currentY;
}

// BOX 2: Customer Information
function drawCustomerBox(doc, data, startY) {
  let currentY = startY;
  const boxTop = currentY;
  const boxX = 30;
  const contentX = 40;

  doc.fontSize(7).font('Courier');
  doc.text(`Customer Name: ${data.customerName}`, contentX, currentY + 5);
  currentY += 10;
  doc.text(`Customer No.: ${data.customerPhone}`, contentX, currentY + 5);
  currentY += 18;

  // Draw box
  doc.rect(boxX, boxTop, 535, currentY - boxTop).stroke();
  currentY += 8; // Gap before next box

  return currentY;
}

// BOX 3: Order Information
function drawOrderBox(doc, data, startY) {
  let currentY = startY;
  const boxTop = currentY;
  const boxX = 30;
  const col1X = 40;
  const col2X = 350;

  doc.fontSize(7).font('Courier');

  // Row 1
  doc.text(`ORDER NO.: ${data.orderNo}`, col1X, currentY + 5);
  currentY += 10;
  doc.text(`INVOICE NO.: ${data.invoiceNumber}`, col1X, currentY + 5);
  currentY += 10;

  // Row 2
  doc.text(`TOKEN NO.: ${data.tokenNo}`, col1X, currentY + 5);
  currentY += 10;
  doc.text(`Store ID: ${data.storeId}`, col1X, currentY + 5);
  currentY += 10;
  doc.text(`POS NO.: ${data.posNo}`, col1X, currentY + 5);
  currentY += 10;

  // Row 3
  doc.text(`SAC CODE.: ${data.sacCode}`, col1X, currentY + 5);
  currentY += 10;
  doc.text(data.date, col1X, currentY + 5);
  currentY += 10;

  // Row 4
  doc.text(`Returned Against: ${data.returnedAgainst}`, col1X, currentY + 5);
  currentY += 10;
  doc.text(`Place of supply. : ${data.placeOfSupply}`, col1X, currentY + 5);
  currentY += 10;

  // Row 5
  doc.text(`Cashier ID: ${data.cashierId}`, col2X, currentY - 55);
  currentY += 10;
  // Row 6
  doc.text(`Cashier Name: ${data.cashierName}`, col2X, currentY - 55);

  // Draw box
  doc.rect(boxX, boxTop, 535, currentY - boxTop).stroke();
  currentY += 10; // Gap before next box

  return currentY;
}

// BOX 4: Items, Totals, and Tax Breakdown (ONE LARGE BOX)
function drawItemsAndTotalsBox(doc, data, startY) {
  let currentY = startY;
  const boxTop = currentY;
  const boxX = 30;

  // Table Headers (NO column separators - just text positioning)
  doc.fontSize(7).font('Courier-Bold');
  doc.text('ITEM_NAME', 40, currentY + 5);
  doc.text('DISCOUNT_DESCRIPTION', 130, currentY + 5);
  doc.text('TAX', 280, currentY + 5);
  doc.text('QTY', 400, currentY + 5, { width: 30, align: 'right' });
  doc.text('RATE', 450, currentY + 5, { width: 50, align: 'right' });
  doc.text('AMOUNT', 510, currentY + 5, { width: 50, align: 'right' });
  currentY += 12;

  // Items (4-line blocks, no row borders)
  doc.font('Courier').fontSize(7);
  data.items.forEach((item) => {
    // Line 1: Item Code
    doc.font('Courier-Bold').text(item.code || 'H000000', 40, currentY + 5);
    currentY += 10;

    // Line 2: Item Name + Qty + Rate + Amount
    doc.font('Courier').text(item.name, 40, currentY + 5);
    doc.text(item.quantity.toString(), 400, currentY + 5, { width: 30, align: 'right' });
    doc.text(item.rate.toFixed(2), 450, currentY + 5, { width: 50, align: 'right' });
    doc.text(item.amount.toFixed(2), 510, currentY + 5, { width: 50, align: 'right' });
    currentY += 10;

    // Line 3: Tax details
    const cgstText = `CGST(${data.cgstRate.toFixed(2)}%) ${item.cgst.toFixed(2)} SGST(${data.sgstRate.toFixed(2)}%) ${item.sgst.toFixed(2)}`;
    doc.text(cgstText, 40, currentY + 5);
    currentY += 10;

    // Line 4: HSN/SAC (Bold)
    doc.font('Courier-Bold').text(`HSN/SAC: ${item.hsnSac || data.sacCode}`, 40, currentY + 5);
    currentY += 15;
  });

  // INTERNAL LINE A: Separator between items and totals
  currentY += 5;
  doc.moveTo(boxX, currentY + 5).lineTo(boxX + 535, currentY + 5).stroke();
  currentY += 10;

  // Totals Section (inside box)
  doc.fontSize(9).font('Courier-Bold');
  doc.text('Total Bill Amount', 40, currentY + 5);
  doc.text(`INR ${data.totalAmount.toFixed(1)}`, 480, currentY + 5, { width: 75, align: 'right' });
  currentY += 14;

  doc.text('Amount Payable', 40, currentY + 5);
  doc.text(`INR ${data.amountPayable.toFixed(2)}`, 480, currentY + 5, { width: 75, align: 'right' });
  currentY += 14;

  // Amount in words
  doc.font('Courier').fontSize(8);
  doc.text('Amount in words', 40, currentY + 5);
  doc.text(convertToWords(data.amountPayable), 130, currentY + 5, { width: 420 });
  currentY += 15;

  // INTERNAL LINE B: Separator before tax breakdown
  currentY += 5;
  doc.moveTo(boxX, currentY + 5).lineTo(boxX + 535, currentY + 5).stroke();
  currentY += 10;

  // Tax Breakdown (inside box, no vertical lines)
  doc.fontSize(7).font('Courier-Bold');
  doc.text('TAX', 40, currentY + 5);
  doc.text('TAXABLE AMT', 170, currentY + 5);
  doc.text('RATE', 350, currentY + 5);
  doc.text('TAX AMOUNT', 500, currentY + 5);
  currentY += 10;

  // CGST
  doc.font('Courier').fontSize(7);
  doc.text('CGST', 40, currentY + 5);
  doc.text(data.totalTaxableAmount.toFixed(2), 170, currentY + 5);
  doc.text(`${data.cgstRate.toFixed(2)}%`, 350, currentY + 5);
  doc.text(data.totalCGST.toFixed(2), 500, currentY + 5);
  currentY += 12;

  // SGST
  doc.text('SGST', 40, currentY + 5);
  doc.text(data.totalTaxableAmount.toFixed(2), 170, currentY + 5);
  doc.text(`${data.sgstRate.toFixed(2)}%`, 350, currentY + 5);
  doc.text(data.totalSGST.toFixed(2), 500, currentY + 5);
  currentY += 14;

  // Draw box around entire Items/Totals/Tax section
  doc.rect(boxX, boxTop, 535, currentY - boxTop).stroke();
  currentY += 8; // Gap before next box

  return currentY;
}

// BOX 5: Payment Section
function drawPaymentBox(doc, data, startY) {
  let currentY = startY;
  const boxTop = currentY;
  const boxX = 30;

  // Headers (no vertical lines)
  doc.fontSize(7).font('Courier-Bold');
  doc.text('Tender', 40, currentY + 5);
  doc.text('Amount', 120, currentY + 5);
  doc.text('Serial No.', 200, currentY + 5);
  doc.text('Transaction Ref No.', 300, currentY + 5);
  doc.text('Item Purchased', 480, currentY + 5);
  currentY += 10;

  // Internal horizontal line
  doc.moveTo(boxX, currentY + 5).lineTo(boxX + 535, currentY + 5).stroke();
  currentY += 5;

  // Payment details
  doc.font('Courier').fontSize(7);
  doc.text(data.paymentMethod, 40, currentY + 5);
  doc.text(data.amountPayable.toFixed(2), 120, currentY + 5);
  doc.text(data.serialNo || '', 200, currentY + 5);
  doc.text(data.transactionRefNo || '', 300, currentY + 5);
  doc.text(data.totalItems.toString(), 510, currentY + 5);
  currentY += 12;

  // Draw box
  doc.rect(boxX, boxTop, 535, currentY - boxTop).stroke();
  currentY += 10;

  return currentY;
}

function drawTermsAndConditions(doc, data, startY) {
  let currentY = startY;

  // Customer care info
  doc.fontSize(7).font('Courier');
  doc.text(`For any queries, please call Customer Care or email us- ${data.customerCarePhone}`, 30, currentY + 5, { align: 'center', width: 535 });
  currentY += 10;
  doc.text(data.customerCareEmail, 30, currentY + 5, { align: 'center', width: 535 });
  currentY += 12;

  // Terms header
  doc.font('Courier-Bold').fontSize(7);
  doc.text('Terms and Conditions', 35, currentY);
  currentY += 10;

  // Terms list
  doc.font('Courier').fontSize(6);
  data.termsAndConditions.forEach((term) => {
    doc.text(term, 40, currentY + 5, { width: 520 });
    currentY += 8;
  });

  currentY += 5;
  return currentY;
}

async function drawFooter(doc, data, startY) {
  let currentY = startY;

  if (currentY > 680) {
    doc.addPage();
    currentY = 50;
  }

  // QR Code text
  doc.fontSize(7).font('Courier');
  // doc.text('Scan below QR to get bill info', 30, currentY + 5, { align: 'center', width: 535 });
  // currentY += 10;

  // QR code
  const qrSize = 60;
  const qrX = (doc.page.width - qrSize) / 2;
  const qrData = `Invoice: ${data.invoiceNumber}\nDate: ${data.date}\nAmount: INR ${data.amountPayable}\nStore: ${data.storeId}`;

  try {
    const qrBuffer = await QRCode.toBuffer(qrData, {
      width: qrSize,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    //doc.image(qrBuffer, qrX, currentY + 5, { width: qrSize, height: qrSize });
  } catch (err) {
    doc.rect(qrX, currentY + 5, qrSize, qrSize).stroke();
  }

  // currentY += qrSize + 10;

  doc.fontSize(7).font('Courier-Bold');
  doc.text('This is a system-generated Invoice and does not require any signature.', 30, currentY + 5, { align: 'center', width: 535 });
  currentY += 10;

  doc.font('Courier').fontSize(7);
  doc.text('Whether the tax is payable on reverse charge. Yes/No', 30, currentY + 5, { align: 'center', width: 535 });
}

// Convert number to words (Indian format)
function convertToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  function convertHundreds(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertHundreds(n % 100) : '');
  }

  function convert(n) {
    if (n === 0) return 'Zero';
    if (n < 1000) return convertHundreds(n);
    if (n < 100000) return convertHundreds(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convertHundreds(n % 1000) : '');
    if (n < 10000000) return convertHundreds(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convertHundreds(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  let result = 'Rupees ' + convert(rupees);
  if (paise > 0) {
    result += ' and Paise ' + convert(paise);
  }
  result += 'Only';

  return result;
}

/**
 * Layout: Hotel Folio — Hotel-style guest bill with room/table, service charge
 */
async function generateHotelFolioPDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const d = prepareInvoiceData(data);
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const W = doc.page.width - 80;
      let y = 40;

      // ── Header ───────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e')
        .text(d.companyName, 40, y, { width: W, align: 'center' });
      y += 26;
      doc.font('Helvetica').fontSize(9).fillColor('#555555')
        .text(d.storeName, 40, y, { width: W, align: 'center' });
      y += 13;
      doc.fontSize(8).fillColor('#777777')
        .text(d.storeAddress, 40, y, { width: W, align: 'center' });
      y += doc.heightOfString(d.storeAddress, { width: W }) + 4;
      doc.text(`Tel: ${d.storePhone}  |  GSTIN: ${d.gstin}  |  FSSAI: ${d.fssaiNo}`, 40, y, { width: W, align: 'center' });
      y += 16;

      // thick rule
      doc.rect(40, y, W, 2).fillColor('#1a1a2e').fill();
      y += 10;

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e')
        .text('GUEST FOLIO', 40, y, { width: W, align: 'center' });
      y += 20;
      doc.rect(40, y, W, 1).fillColor('#cccccc').fill();
      y += 10;

      // ── Guest info grid ──────────────────────────────────────
      const infoBox = (label, val, x, w) => {
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#888888').text(label.toUpperCase(), x, y, { width: w });
        doc.font('Helvetica').fontSize(9).fillColor('#111111').text(val, x, y + 10, { width: w });
      };

      const c1 = 40, c2 = 40 + W * 0.34, c3 = 40 + W * 0.67;
      infoBox('Guest Name', d.customerName, c1, W * 0.32);
      infoBox('Folio / Invoice No', d.invoiceNumber, c2, W * 0.31);
      infoBox('Date & Time', d.date, c3, W * 0.33);
      y += 30;
      infoBox('Room / Table', d.tokenNo || 'Table 01', c1, W * 0.32);
      infoBox('Order No', d.orderNo, c2, W * 0.31);
      infoBox('Cashier', `${d.cashierName} (${d.cashierId})`, c3, W * 0.33);
      y += 30;

      doc.rect(40, y, W, 1).fillColor('#cccccc').fill();
      y += 12;

      // ── Items table header ────────────────────────────────────
      doc.rect(40, y, W, 16).fillColor('#1a1a2e').fill();
      const hcols = [0, W * 0.46, W * 0.60, W * 0.72, W * 0.84];
      const hdrs = ['Description', 'HSN/SAC', 'Qty', 'Rate', 'Amount'];
      hdrs.forEach((h, i) => {
        const align = i === 0 ? 'left' : 'right';
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
          .text(h, 40 + hcols[i] + (i === 0 ? 5 : 0), y + 4,
            { width: (hcols[i + 1] || W) - hcols[i] - (i === 0 ? 5 : 4), align });
      });
      y += 18;

      // ── Item rows ─────────────────────────────────────────────
      d.items.forEach((item, idx) => {
        const bg = idx % 2 === 0 ? '#f0f4ff' : '#ffffff';
        doc.rect(40, y - 1, W, 14).fillColor(bg).fill();
        doc.font('Helvetica').fontSize(8).fillColor('#222222');
        doc.text(item.name, 45, y + 2, { width: hcols[1] - 5 });
        doc.text(item.hsnSac || d.sacCode, 40 + hcols[1], y + 2, { width: hcols[2] - hcols[1] - 4, align: 'right' });
        doc.text(String(item.quantity), 40 + hcols[2], y + 2, { width: hcols[3] - hcols[2] - 4, align: 'right' });
        doc.text(item.rate.toFixed(2), 40 + hcols[3], y + 2, { width: hcols[4] - hcols[3] - 4, align: 'right' });
        doc.text(item.amount.toFixed(2), 40 + hcols[4], y + 2, { width: W - hcols[4] - 4, align: 'right' });
        y += 14;
      });

      doc.rect(40, y, W, 1).fillColor('#aaaaaa').fill();
      y += 10;

      // ── Totals ────────────────────────────────────────────────
      const totLine = (label, val, bold, highlight) => {
        if (highlight) doc.rect(40, y - 2, W, 16).fillColor('#e8eeff').fill();
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 10 : 8)
          .fillColor('#222222')
          .text(label, 40, y, { width: W * 0.75, align: 'right' });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 10 : 8)
          .text(val, 40 + W * 0.75, y, { width: W * 0.25, align: 'right' });
        y += bold ? 16 : 13;
      };

      totLine('Taxable Amount', `₹${d.totalTaxableAmount.toFixed(2)}`);
      totLine(`CGST @ ${d.cgstRate}%`, `₹${d.totalCGST.toFixed(2)}`);
      totLine(`SGST @ ${d.sgstRate}%`, `₹${d.totalSGST.toFixed(2)}`);
      y += 4;
      doc.rect(40, y, W, 1).fillColor('#1a1a2e').fill();
      y += 6;
      totLine('TOTAL AMOUNT', `₹${d.amountPayable.toFixed(2)}`, true, true);
      y += 4;
      doc.font('Helvetica').fontSize(7).fillColor('#777777')
        .text(`( ${convertToWords(d.amountPayable)} )`, 40, y, { width: W, align: 'right' });
      y += 16;

      // ── Payment & Signature ───────────────────────────────────
      doc.rect(40, y, W, 1).fillColor('#cccccc').fill();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333')
        .text(`Payment Mode: ${d.paymentMethod}`, 40, y);
      if (d.transactionRefNo)
        doc.font('Helvetica').fontSize(8).text(`Ref No: ${d.transactionRefNo}`, 40 + W * 0.35, y);
      doc.font('Helvetica').fontSize(8).text('Authorised Signature: _______________', 40 + W * 0.6, y, { width: W * 0.4, align: 'right' });
      y += 20;

      // ── Footer ────────────────────────────────────────────────
      doc.rect(40, y, W, 1).fillColor('#cccccc').fill();
      y += 8;
      doc.font('Helvetica').fontSize(7).fillColor('#999999')
        .text(`Customer Care: ${d.customerCarePhone}  |  ${d.customerCareEmail}`, 40, y, { width: W, align: 'center' });
      y += 10;
      doc.text('Thank you for your visit. We hope to see you again!', 40, y, { width: W, align: 'center' });
      y += 10;
      doc.text('System generated — no signature required.', 40, y, { width: W, align: 'center' });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (error) { reject(error); }
  });
}

/**
 * Layout: Bistro — Casual cafe bill with dotted leaders, friendly tone
 */
async function generateBistroPDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const d = prepareInvoiceData(data);
      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const W = doc.page.width - 100;
      let y = 50;

      // ── Header arc decoration ─────────────────────────────────
      // Top curved banner simulation via filled rect
      doc.rect(50, y, W, 56).fillColor('#fff8f0').fill();
      doc.rect(50, y, W, 56).lineWidth(1.5).strokeColor('#e8804a').stroke();
      y += 10;

      doc.font('Helvetica-Bold').fontSize(20).fillColor('#c0392b')
        .text(d.companyName, 50, y, { width: W, align: 'center' });
      y += 26;
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#777777')
        .text(`${d.storeName}  ·  Good Food, Good Mood`, 50, y, { width: W, align: 'center' });
      y += 20;

      // ── Bill meta ─────────────────────────────────────────────
      y += 10;
      const meta = (label, val) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text(label, 50, y, { continued: true });
        doc.font('Helvetica').fillColor('#222222').text('  ' + val);
        y += 13;
      };
      meta('Bill No :', `#${d.invoiceNumber}`);
      meta('Date    :', d.date);
      meta('Table   :', d.tokenNo || 'T-01');
      meta('Server  :', d.cashierName);
      meta('Guest   :', d.customerName + (d.customerPhone ? `  ·  ${d.customerPhone}` : ''));
      y += 6;

      // ── dotted separator ──────────────────────────────────────
      const dotSep = () => {
        doc.font('Helvetica').fontSize(7).fillColor('#bbbbbb')
          .text('· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·', 50, y, { width: W, align: 'center' });
        y += 12;
      };
      dotSep();

      // ── Items with dot leaders ─────────────────────────────────
      d.items.forEach(item => {
        const name = item.name;
        const qty = `×${item.quantity}`;
        const amt = `₹${item.amount.toFixed(0)}`;

        // dots fill the gap
        const lineWidth = W;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222').text(name, 50, y);
        const nameW = doc.widthOfString(name);

        doc.font('Helvetica').fontSize(9).fillColor('#aaaaaa');
        const dotsW = lineWidth - nameW - doc.widthOfString(qty + '  ' + amt) - 20;
        let dots = '';
        const dotUnit = doc.widthOfString('. ');
        for (let px = 0; px < dotsW; px += dotUnit) dots += '. ';
        doc.text(dots, 50 + nameW + 4, y + 1, { lineBreak: false });

        doc.font('Helvetica').fontSize(9).fillColor('#555555').text(qty, 50, y, { width: W - doc.widthOfString(amt) - 4, align: 'right', lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222').text(amt, 50, y, { width: W, align: 'right' });
        y += 16;
      });
      dotSep();

      // ── Totals ────────────────────────────────────────────────
      const tl = (label, val, highlight) => {
        const fnt = highlight ? 'Helvetica-Bold' : 'Helvetica';
        const sz = highlight ? 12 : 9;
        const clr = highlight ? '#c0392b' : '#444444';
        doc.font(fnt).fontSize(sz).fillColor(clr).text(label, 50, y);
        doc.font(fnt).fontSize(sz).fillColor(clr).text(val, 50, y, { width: W, align: 'right' });
        y += highlight ? 18 : 13;
      };
      tl('Subtotal', `₹${d.totalTaxableAmount.toFixed(2)}`);
      tl(`Tax (CGST ${d.cgstRate}% + SGST ${d.sgstRate}%)`, `₹${(d.totalCGST + d.totalSGST).toFixed(2)}`);
      dotSep();
      tl('TOTAL', `₹${d.totalAmount.toFixed(0)}`, true);

      y += 6;
      // ── Payment ───────────────────────────────────────────────
      doc.font('Helvetica').fontSize(8).fillColor('#555555')
        .text(`Paid: ${d.paymentMethod}${d.transactionRefNo ? '  (Ref: ' + d.transactionRefNo + ')' : ''}`, 50, y);
      y += 20;
      dotSep();

      // ── Friendly footer ───────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#c0392b')
        .text('Thank you! Come back soon ☕', 50, y, { width: W, align: 'center' });
      y += 16;
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#aaaaaa')
        .text(`${d.customerCarePhone}  ·  ${d.customerCareEmail}`, 50, y, { width: W, align: 'center' });
      y += 12;
      doc.font('Helvetica').fontSize(7).fillColor('#cccccc')
        .text('System generated invoice', 50, y, { width: W, align: 'center' });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (error) { reject(error); }
  });
}

/**
 * Layout: Fine Dining — Elegant minimal A4, centered, generous whitespace
 */
async function generateFineDiningPDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const d = prepareInvoiceData(data);
      const doc = new PDFDocument({ margin: 60, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const W = doc.page.width - 120;
      const CX = 60; // left margin
      let y = 60;

      // top thin gold rule
      doc.rect(CX, y, W, 0.5).fillColor('#c9a84c').fill();
      y += 16;

      // Restaurant name
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a1a1a')
        .text(d.companyName, CX, y, { width: W, align: 'center', characterSpacing: 1 });
      y += 30;
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#888888')
        .text(d.storeName, CX, y, { width: W, align: 'center' });
      y += 14;
      doc.font('Helvetica').fontSize(8).fillColor('#aaaaaa')
        .text(d.storeAddress, CX, y, { width: W, align: 'center' });
      y += doc.heightOfString(d.storeAddress, { width: W }) + 14;

      // bottom thin gold rule
      doc.rect(CX, y, W, 0.5).fillColor('#c9a84c').fill();
      y += 20;

      // Invoice title
      doc.font('Helvetica').fontSize(10).fillColor('#888888')
        .text('INVOICE', CX, y, { width: W, align: 'center', characterSpacing: 5 });
      y += 22;

      // Two-column meta
      const leftMeta = (label, val) => {
        doc.font('Helvetica').fontSize(8).fillColor('#aaaaaa').text(label, CX, y, { continued: true });
        doc.font('Helvetica-Bold').fillColor('#333333').text('  ' + val);
        y += 14;
      };
      leftMeta('Date', d.date);
      leftMeta('Invoice', d.invoiceNumber);
      leftMeta('Guest', d.customerName);
      leftMeta('Covers', d.totalItems === 1 ? '1 Guest' : `${d.totalItems} Guests`);
      y += 10;

      // thin rule
      doc.rect(CX, y, W, 0.5).fillColor('#dddddd').fill();
      y += 20;

      // Items — minimal, no boxes
      d.items.forEach((item, idx) => {
        const isLast = idx === d.items.length - 1;
        doc.font('Helvetica').fontSize(10).fillColor('#222222').text(item.name, CX, y);
        doc.font('Helvetica').fontSize(10).fillColor('#444444')
          .text(`${item.rate.toFixed(2)}`, CX, y, { width: W, align: 'right' });
        y += 15;

        if (item.quantity > 1) {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor('#aaaaaa')
            .text(`  × ${item.quantity}`, CX, y);
          y += 12;
        }
        if (!isLast) y += 4;
      });

      y += 14;
      doc.rect(CX, y, W, 0.5).fillColor('#dddddd').fill();
      y += 16;

      // Totals — right-aligned block
      const fdTotal = (label, val, bold, gold) => {
        const fnt = bold ? 'Helvetica-Bold' : 'Helvetica';
        const sz = bold ? 12 : 9;
        const clr = gold ? '#c9a84c' : (bold ? '#111111' : '#666666');
        doc.font(fnt).fontSize(sz).fillColor(clr).text(label, CX, y);
        doc.font(fnt).fontSize(sz).fillColor(clr).text(val, CX, y, { width: W, align: 'right' });
        y += bold ? 18 : 14;
      };

      fdTotal(`Service CGST  ${d.cgstRate}%`, `${d.totalCGST.toFixed(2)}`);
      fdTotal(`Service SGST  ${d.sgstRate}%`, `${d.totalSGST.toFixed(2)}`);
      y += 6;
      doc.rect(CX, y, W, 0.5).fillColor('#c9a84c').fill();
      y += 10;
      fdTotal('Total', `INR  ${d.amountPayable.toFixed(2)}`, true, true);
      y += 4;
      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#bbbbbb')
        .text(`( ${convertToWords(d.amountPayable)} )`, CX, y, { width: W, align: 'right' });
      y += 20;

      // Payment line
      doc.font('Helvetica').fontSize(8).fillColor('#888888')
        .text(`Settled by  ${d.paymentMethod}${d.transactionRefNo ? ' — Ref ' + d.transactionRefNo : ''}`, CX, y, { width: W, align: 'center' });
      y += 24;

      // closing rule pair
      doc.rect(CX, y, W, 0.5).fillColor('#c9a84c').fill();
      y += 10;
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#aaaaaa')
        .text('Thank you for dining with us. It was a pleasure to serve you.', CX, y, { width: W, align: 'center' });
      y += 14;
      doc.font('Helvetica').fontSize(7).fillColor('#cccccc')
        .text(`${d.customerCarePhone}  ·  ${d.customerCareEmail}`, CX, y, { width: W, align: 'center' });
      y += 12;
      doc.rect(CX, y, W, 0.5).fillColor('#c9a84c').fill();

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (error) { reject(error); }
  });
}

module.exports = { generateInvoicePDF, DEFAULT_VALUES, LAYOUTS };