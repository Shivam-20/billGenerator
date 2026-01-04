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

/**
 * Generates a Haldiram-style Tax Invoice PDF - Clean Borders Version
 */
async function generateInvoicePDF(data = {}, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      // Merge provided data with defaults
      const invoiceData = {
        ...DEFAULT_VALUES,
        ...data,
        items: data.items && data.items.length > 0 ? data.items : DEFAULT_VALUES.items,
        termsAndConditions: data.termsAndConditions || DEFAULT_VALUES.termsAndConditions
      };

      // Calculate item amounts and taxes (Rate is Taxable Value - Exclusive)
      invoiceData.items = invoiceData.items.map(item => {
        const amount = item.quantity * item.rate;
        const taxableAmount = amount;
        const cgst = taxableAmount * (invoiceData.cgstRate / 100);
        const sgst = taxableAmount * (invoiceData.sgstRate / 100);
        return {
          ...item,
          amount: amount,
          cgst: cgst,
          sgst: sgst,
          taxableAmount: taxableAmount,
          totalLineAmount: taxableAmount + cgst + sgst
        };
      });

      // Calculate totals
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
      invoiceData.amountPayable = grandTotal; // No rounding

      const doc = new PDFDocument({
        margin: 30,
        size: 'A4',
        bufferPages: true
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let currentY = 30;

      // Draw sections
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

module.exports = { generateInvoicePDF, DEFAULT_VALUES };
