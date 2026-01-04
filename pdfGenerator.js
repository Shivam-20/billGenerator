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
 * Generates a Haldiram-style Tax Invoice PDF
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

      // Calculate item amounts and taxes
      invoiceData.items = invoiceData.items.map(item => {
        const amount = item.quantity * item.rate;
        const taxableAmount = amount / (1 + (invoiceData.cgstRate + invoiceData.sgstRate) / 100);
        const cgst = taxableAmount * (invoiceData.cgstRate / 100);
        const sgst = taxableAmount * (invoiceData.sgstRate / 100);
        return {
          ...item,
          amount: amount,
          cgst: cgst,
          sgst: sgst,
          taxableAmount: taxableAmount
        };
      });

      // Calculate totals
      const totalAmount = invoiceData.items.reduce((sum, item) => sum + item.amount, 0);
      const totalTaxableAmount = invoiceData.items.reduce((sum, item) => sum + item.taxableAmount, 0);
      const totalCGST = invoiceData.items.reduce((sum, item) => sum + item.cgst, 0);
      const totalSGST = invoiceData.items.reduce((sum, item) => sum + item.sgst, 0);
      const totalItems = invoiceData.items.reduce((sum, item) => sum + item.quantity, 0);

      invoiceData.totalAmount = totalAmount;
      invoiceData.totalTaxableAmount = totalTaxableAmount;
      invoiceData.totalCGST = totalCGST;
      invoiceData.totalSGST = totalSGST;
      invoiceData.totalItems = totalItems;
      invoiceData.amountPayable = Math.round(totalAmount * 100) / 100;

      const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4',
        bufferPages: true
      });
      
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let currentY = 30;

      // Draw the invoice sections
      currentY = drawHeader(doc, invoiceData, currentY);
      currentY = drawCustomerOrderSection(doc, invoiceData, currentY);
      currentY = drawItemsTable(doc, invoiceData, currentY);
      currentY = drawTotalsSection(doc, invoiceData, currentY);
      currentY = drawTaxBreakdown(doc, invoiceData, currentY);
      currentY = drawPaymentSection(doc, invoiceData, currentY);
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

function drawHeader(doc, data, startY) {
  let currentY = startY;
  
  // Haldiram Logo Image - use custom logo if provided, otherwise use default
  const logoPath = data.logoPath || require('path').join(__dirname, 'haldiram-logo.png');
  
  try {
    // Try to get image dimensions if it's the default logo
    if (!data.logoPath) {
      const logoX = (doc.page.width - 278) / 2; // Center the 278px wide logo
      doc.image(logoPath, logoX, currentY);
      currentY += 77;
    } else {
      // For custom uploaded logos, center with auto-sizing
      const logoX = (doc.page.width - 278) / 2;
      doc.image(logoPath, logoX, currentY, { width: 278, fit: [278, 100] });
      currentY += 77;
    }
  } catch (err) {
    // Fallback to text if image not found
    doc.fillColor('#D32F2F')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Haldirams', 30, currentY, { align: 'center', width: 535 });
    currentY += 28;
  }

  // Title
  doc.fillColor('#000000')
     .fontSize(11)
     .font('Helvetica-Bold')
     .text('Restaurant Service(Tax-Invoice)', 30, currentY, { align: 'center', width: 535 });
  currentY += 16;

  // Company Name
  doc.fontSize(9)
     .font('Helvetica-Bold')
     .text(data.companyName, 30, currentY, { align: 'center', width: 535 });
  currentY += 12;

  // Store Name
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .text(data.storeName, 30, currentY, { align: 'center', width: 535 });
  currentY += 11;

  // Store Address
  doc.fontSize(7)
     .font('Helvetica')
     .text(data.storeAddress, 30, currentY, { align: 'center', width: 535 });
  currentY += 10;

  // Phone
  doc.text(`Ph No. : ${data.storePhone}`, 30, currentY, { align: 'center', width: 535 });
  currentY += 10;

  // GSTIN
  doc.font('Helvetica-Bold')
     .text(`GSTIN No. ${data.gstin}`, 30, currentY, { align: 'center', width: 535 });
  currentY += 12;

  // Registered Address and other details
  doc.fontSize(6).font('Helvetica-Bold');
  doc.text('Registered Address:', 30, currentY);
  
  doc.font('Helvetica');
  doc.text(data.registeredAddress, 100, currentY, { width: 200 });
  doc.text(`State Code: ${data.stateCode}`, 340, currentY);
  currentY += 9;
  
  doc.text(`CIN: ${data.cin}`, 340, currentY);
  currentY += 9;
  
  doc.text(`FSSAI NO: ${data.fssaiNo}`, 340, currentY);
  currentY += 12;

  // Horizontal line
  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 5;

  return currentY;
}

function drawCustomerOrderSection(doc, data, startY) {
  let currentY = startY;
  
  doc.fontSize(7).font('Helvetica');

  // Row 1
  doc.text(`Customer Name: ${data.customerName}`, 30, currentY);
  doc.text(`INVOICE NO.: ${data.invoiceNumber}`, 350, currentY);
  currentY += 10;

  // Row 2
  doc.text(`Customer No.: ${data.customerPhone}`, 30, currentY);
  doc.text(`Store ID: ${data.storeId}`, 350, currentY);
  doc.text(`POS NO.: ${data.posNo}`, 450, currentY);
  currentY += 12;

  // Row 3
  doc.text(`ORDER NO.: ${data.orderNo}`, 30, currentY);
  doc.text(data.date, 350, currentY);
  doc.text(`Place of supply. : ${data.placeOfSupply}`, 450, currentY);
  currentY += 10;

  // Row 4
  doc.text(`TOKEN NO.: ${data.tokenNo}`, 30, currentY);
  doc.text(`Cashier ID: ${data.cashierId}`, 350, currentY);
  currentY += 10;

  // Row 5
  doc.text(`SAC CODE.: ${data.sacCode}`, 30, currentY);
  doc.text(`Cashier Name: ${data.cashierName}`, 350, currentY);
  currentY += 10;

  // Row 6
  doc.text(`Returned Against: ${data.returnedAgainst}`, 30, currentY);
  currentY += 12;

  // Horizontal line
  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 5;

  return currentY;
}

function drawItemsTable(doc, data, startY) {
  let currentY = startY;
  
  // Table Header
  doc.fontSize(7).font('Helvetica-Bold');
  
  doc.text('ITEM_NAME', 30, currentY);
  doc.text('DISCOUNT_DESCRIPTION', 120, currentY);
  doc.text('TAX', 280, currentY);
  doc.text('QTY', 420, currentY, { width: 30, align: 'right' });
  doc.text('RATE', 470, currentY, { width: 50, align: 'right' });
  doc.text('AMOUNT', 520, currentY, { width: 45, align: 'right' });
  currentY += 12;

  // Header line
  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 5;

  // Items
  doc.font('Helvetica').fontSize(7);

  data.items.forEach((item) => {
    // Item code
    doc.font('Helvetica-Bold').text(item.code || 'H000000', 30, currentY);
    currentY += 10;
    
    // Item name with quantity, rate, amount on same line
    doc.font('Helvetica').text(item.name, 30, currentY);
    doc.text(item.quantity.toString(), 420, currentY, { width: 30, align: 'right' });
    doc.text(item.rate.toFixed(2), 470, currentY, { width: 50, align: 'right' });
    doc.text(item.amount.toFixed(2), 520, currentY, { width: 45, align: 'right' });
    currentY += 10;
    
    // Tax details on separate line
    const cgstText = `CGST(${data.cgstRate.toFixed(2)}%) ${item.cgst.toFixed(2)} SGST(${data.sgstRate.toFixed(2)}%) ${item.sgst.toFixed(2)}`;
    doc.text(cgstText, 30, currentY);
    currentY += 10;
    
    // HSN/SAC
    doc.text(`HSN/SAC: ${item.hsnSac || data.sacCode}`, 30, currentY);
    currentY += 15;
  });

  // Bottom line
  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 8;

  return currentY;
}

function drawTotalsSection(doc, data, startY) {
  let currentY = startY;
  
  doc.fontSize(9).font('Helvetica-Bold');
  
  // Total Bill Amount
  doc.text('Total Bill Amount', 30, currentY);
  doc.text(`INR ${data.totalAmount.toFixed(1)}`, 480, currentY, { width: 75, align: 'right' });
  currentY += 14;

  // Amount Payable
  doc.text('Amount Payable', 30, currentY);
  doc.text(`INR ${data.amountPayable.toFixed(2)}`, 480, currentY, { width: 75, align: 'right' });
  currentY += 14;

  // Amount in words
  doc.font('Helvetica').fontSize(8);
  doc.text('Amount in words', 30, currentY);
  doc.text(convertToWords(data.amountPayable), 110, currentY, { width: 400 });
  currentY += 15;

  // Line
  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 8;

  return currentY;
}

function drawTaxBreakdown(doc, data, startY) {
  let currentY = startY;
  
  // Tax table header
  doc.fontSize(7).font('Helvetica-Bold');
  
  doc.text('TAX', 30, currentY);
  doc.text('TAXABLE AMT', 100, currentY);
  doc.text('RATE', 180, currentY);
  doc.text('TAX AMOUNT', 240, currentY);
  currentY += 10;

  doc.moveTo(30, currentY).lineTo(320, currentY).stroke();
  currentY += 5;

  // CGST
  doc.font('Helvetica').fontSize(7);
  doc.text('CGST', 30, currentY);
  doc.text(data.totalTaxableAmount.toFixed(2), 100, currentY);
  doc.text(`${data.cgstRate.toFixed(2)}%`, 180, currentY);
  doc.text(data.totalCGST.toFixed(2), 240, currentY);
  currentY += 12;

  // SGST
  doc.text('SGST', 30, currentY);
  doc.text(data.totalTaxableAmount.toFixed(2), 100, currentY);
  doc.text(`${data.sgstRate.toFixed(2)}%`, 180, currentY);
  doc.text(data.totalSGST.toFixed(2), 240, currentY);
  currentY += 10;

  doc.moveTo(30, currentY).lineTo(320, currentY).stroke();
  currentY += 10;

  return currentY;
}

function drawPaymentSection(doc, data, startY) {
  let currentY = startY;
  
  // Payment header
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Tender', 30, currentY);
  doc.text('Amount', 120, currentY);
  doc.text('Serial No.', 200, currentY);
  doc.text('Transaction Ref No.', 300, currentY);
  doc.text('Item Purchased', 480, currentY);
  currentY += 10;

  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 5;

  // Payment details
  doc.font('Helvetica').fontSize(7);
  doc.text(data.paymentMethod, 30, currentY);
  doc.text(data.amountPayable.toFixed(2), 120, currentY);
  doc.text(data.serialNo || '', 200, currentY);
  doc.text(data.transactionRefNo || '', 300, currentY);
  doc.text(data.totalItems.toString(), 505, currentY);
  currentY += 12;

  doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
  currentY += 10;

  return currentY;
}

function drawTermsAndConditions(doc, data, startY) {
  let currentY = startY;
  
  // Customer care info
  doc.fontSize(7).font('Helvetica');
  doc.text(`For any queries, please call Customer Care or email us- ${data.customerCarePhone}`, 30, currentY, { align: 'center', width: 535 });
  currentY += 10;
  doc.text(data.customerCareEmail, 30, currentY, { align: 'center', width: 535 });
  currentY += 12;

  // Terms header
  doc.font('Helvetica-Bold').fontSize(8);
  doc.text('Terms and Conditions', 30, currentY);
  currentY += 12;

  // Terms list
  doc.font('Helvetica').fontSize(6);
  
  data.termsAndConditions.forEach((term) => {
    doc.text(term, 30, currentY, { width: 535 });
    currentY += 9;
  });

  currentY += 5;
  return currentY;
}

async function drawFooter(doc, data, startY) {
  let currentY = startY;

  // QR Code text
  doc.fontSize(7).font('Helvetica');
  doc.text('Scan below QR to get bill info', 30, currentY, { align: 'center', width: 535 });
  currentY += 10;

  // Generate and embed actual QR code
  const qrSize = 80;
  const qrX = (doc.page.width - qrSize) / 2;
  
  // Create QR code data with invoice info
  const qrData = `Invoice: ${data.invoiceNumber}\nDate: ${data.date}\nAmount: INR ${data.amountPayable}\nStore: ${data.storeId}`;
  
  try {
    // Generate QR code as buffer
    const qrBuffer = await QRCode.toBuffer(qrData, { 
      width: qrSize, 
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    doc.image(qrBuffer, qrX, currentY, { width: qrSize, height: qrSize });
  } catch (err) {
    // Fallback to placeholder if QR generation fails
    doc.rect(qrX, currentY, qrSize, qrSize).stroke();
  }
  
  currentY += qrSize + 10;

  // System generated message
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('This is a system-generated Invoice and does not require any signature.', 30, currentY, { align: 'center', width: 535 });
  currentY += 10;

  doc.font('Helvetica').fontSize(7);
  doc.text('Whether the tax is payable on reverse charge. Yes/No', 30, currentY, { align: 'center', width: 535 });
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
