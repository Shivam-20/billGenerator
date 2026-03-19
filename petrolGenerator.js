const PDFDocument = require('pdfkit');
const fs = require('fs');
const QRCode = require('qrcode');

// ─── Thermal page dimensions (80mm) ─────────────────────────────────────────
const TW  = 226.77;  // 80mm in points
const TM  = 9;       // left/right margin
const TCW = TW - TM * 2;  // usable width = 208.77

// ─── Oil company branding ────────────────────────────────────────────────────
const BRANDS = {
  HP:       { full: 'Hindustan Petroleum Corporation Ltd.', primary: '#004F9F', accent: '#FDB913', light: '#E8F0FE' },
  IOCL:     { full: 'Indian Oil Corporation Limited',       primary: '#C41230', accent: '#003399', light: '#FEE8EC' },
  BPCL:     { full: 'Bharat Petroleum Corporation Ltd.',    primary: '#E05206', accent: '#003A70', light: '#FEF0E8' },
  Shell:    { full: 'Shell India Markets Pvt. Limited',     primary: '#DD1D21', accent: '#FBCE07', light: '#FEE8E8' },
  Essar:    { full: 'Essar Oil Limited',                    primary: '#004B87', accent: '#F7A600', light: '#E8F0FE' },
  Reliance: { full: 'Reliance Industries Limited',          primary: '#003478', accent: '#E31837', light: '#E8EEF8' },
};
const DEFAULT_BRAND = { full: 'Fuel Station', primary: '#1a237e', accent: '#FF8F00', light: '#E8EAF6' };

function brand(name) { return BRANDS[name] || DEFAULT_BRAND; }

// ─── Default values ──────────────────────────────────────────────────────────
const PETROL_DEFAULT_VALUES = {
  billNumber:    'RCP-2526-001',
  date:          new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  oilCompany:    'HP',
  pumpName:      'Sharma Filling Station',
  dealerCode:    'DLR-HP-12345',
  pumpAddress:   'NH-8, Near Toll Plaza, Gurugram, Haryana - 122001',
  pumpPhone:     '9876543210',
  gstin:         '06AAACP1234K1ZX',
  stateCode:     '06',
  licenseNo:     'HR/PD/2020/00123',
  attendantName: 'Ravi Kumar',
  attendantId:   'ATT001',
  nozzleNo:      '01',
  pumpNo:        'P-1',
  customerName:  'Guest Customer',
  vehicleNumber: 'HR 26 AB 1234',
  cgstRate:      0,
  sgstRate:      0,
  items: [
    { product: 'Petrol (MS)', hsnCode: '27101230', quantity: 5.000, ratePerLitre: 94.72 }
  ],
  paymentMethod:    'Cash',
  transactionRefNo: '',
  taxNote: 'Price is inclusive of all applicable Central Excise Duty, State VAT and other taxes levied by Central/State Government.',
};

// ─── Page height estimator ───────────────────────────────────────────────────
function estimateHeight(d) {
  var h = 5;
  h += 80;              // header (brand bar + company name + address)
  h += 18;              // GSTIN strip
  h += 22;              // title bar
  h += 10;              // separator
  h += 70;              // receipt meta (6 rows)
  h += 10;              // separator
  h += 14;              // items table header
  h += d.items.length * 18;  // item rows
  h += 10;              // separator
  if (d.cgstRate > 0 || d.sgstRate > 0) h += 60; // tax breakdown
  h += 10;              // separator
  h += 34;              // total box
  h += 22;              // amount in words
  h += 10;              // separator
  h += 30;              // payment
  h += 10;              // separator
  h += 40;              // tax note
  h += 10;              // separator
  if (d.includeQR !== false) h += 88;  // QR code
  h += 32;              // footer
  h += 15;              // bottom padding
  return Math.ceil(h);
}

// ─── Drawing helpers (thermal) ────────────────────────────────────────────────
function tfill(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}
function tLine(doc, y, style) {
  doc.save();
  if (style === 'solid') {
    doc.lineWidth(0.5).moveTo(TM, y).lineTo(TW - TM, y).strokeColor('#AAAAAA').stroke();
  } else if (style === 'double') {
    doc.lineWidth(0.8).strokeColor('#000000');
    doc.moveTo(TM, y).lineTo(TW - TM, y).stroke();
    doc.moveTo(TM, y + 3).lineTo(TW - TM, y + 3).stroke();
  } else {
    doc.lineWidth(0.4).moveTo(TM, y).lineTo(TW - TM, y).strokeColor('#AAAAAA').dash(2, { space: 2 }).stroke().undash();
  }
  doc.restore();
  return y + (style === 'double' ? 8 : 6);
}
function tCenter(doc, text, y, size, bold, color) {
  doc.fillColor(color || '#000000')
     .fontSize(size || 7)
     .font(bold ? 'Helvetica-Bold' : 'Helvetica')
     .text(text, TM, y, { width: TCW, align: 'center', lineBreak: false });
  return y;
}
function tLeft(doc, label, value, y) {
  doc.fillColor('#555').fontSize(6.5).font('Helvetica-Bold')
     .text(label, TM, y, { width: 58, lineBreak: false });
  doc.fillColor('#000').font('Helvetica')
     .text(String(value), TM + 60, y, { width: TCW - 60, lineBreak: false });
}
function tRow(doc, label, value, y) {
  doc.fillColor('#555').fontSize(6.5).font('Helvetica-Bold')
     .text(label, TM, y, { width: TCW / 2 - 2, lineBreak: false });
  doc.fillColor('#000').font('Helvetica')
     .text(String(value), TM + TCW / 2, y, { width: TCW / 2, lineBreak: false });
}

// ─── Main generator ──────────────────────────────────────────────────────────
async function generatePetrolPDF(data, outputPath) {
  data = data || {};
  return new Promise(async function(resolve, reject) {
    try {
      var d = Object.assign({}, PETROL_DEFAULT_VALUES, data, {
        items:    (data.items && data.items.length > 0) ? data.items : PETROL_DEFAULT_VALUES.items,
        cgstRate: (data.cgstRate !== undefined) ? data.cgstRate : PETROL_DEFAULT_VALUES.cgstRate,
        sgstRate: (data.sgstRate !== undefined) ? data.sgstRate : PETROL_DEFAULT_VALUES.sgstRate,
      });

      // Calculate amounts
      var hasTax = d.cgstRate > 0 || d.sgstRate > 0;
      d.items = d.items.map(function(item) {
        var qty    = parseFloat(item.quantity)    || 0;
        var rate   = parseFloat(item.ratePerLitre) || 0;
        var amount = Math.round(qty * rate * 100) / 100;
        var taxable = amount, cgst = 0, sgst = 0;
        if (hasTax) {
          taxable = amount / (1 + (d.cgstRate + d.sgstRate) / 100);
          cgst    = taxable * d.cgstRate / 100;
          sgst    = taxable * d.sgstRate / 100;
        }
        return Object.assign({}, item, { quantity: qty, ratePerLitre: rate, amount: amount, taxable: taxable, cgst: cgst, sgst: sgst });
      });
      d.totalAmount  = Math.round(d.items.reduce(function(s, i) { return s + i.amount;  }, 0) * 100) / 100;
      d.totalQty     = d.items.reduce(function(s, i) { return s + i.quantity; }, 0);
      d.totalTaxable = d.items.reduce(function(s, i) { return s + i.taxable;  }, 0);
      d.totalCGST    = d.items.reduce(function(s, i) { return s + i.cgst;     }, 0);
      d.totalSGST    = d.items.reduce(function(s, i) { return s + i.sgst;     }, 0);

      var pageH  = estimateHeight(d);
      var doc    = new PDFDocument({ size: [TW, pageH], margin: 0, autoFirstPage: false });
      doc.addPage({ size: [TW, pageH] });

      var stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      var y = 0;
      y = drawTHeader(doc, d, y);
      y = drawTMeta(doc, d, y);
      y = drawTItems(doc, d, y);
      y = drawTTaxAndTotal(doc, d, y);
      y = drawTPayment(doc, d, y);
      y = drawTNote(doc, d, y);
      await drawTFooter(doc, d, y);

      doc.end();
      stream.on('finish', function() { resolve(outputPath); });
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// ─── Header ──────────────────────────────────────────────────────────────────
function drawTHeader(doc, d, startY) {
  var b = brand(d.oilCompany);
  var y = startY;

  // Full-width brand background
  tfill(doc, 0, y, TW, 72, b.primary);

  // Company badge (left)
  doc.save().roundedRect(TM, y + 8, 38, 28, 4).fill(b.accent).restore();
  doc.fillColor(b.primary).fontSize(10).font('Helvetica-Bold')
     .text(d.oilCompany, TM, y + 17, { width: 38, align: 'center', lineBreak: false });

  // Company full name + pump name (right of badge)
  doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold')
     .text(b.full, TM + 44, y + 9, { width: TCW - 44, lineBreak: false });
  doc.fontSize(8.5).font('Helvetica-Bold')
     .text(d.pumpName, TM + 44, y + 20, { width: TCW - 44, lineBreak: false });
  doc.fontSize(5.5).font('Helvetica')
     .text(d.pumpAddress, TM + 44, y + 32, { width: TCW - 44 });
  doc.fontSize(6).font('Helvetica')
     .text('Ph: ' + d.pumpPhone + '  |  Dealer: ' + d.dealerCode, TM, y + 56, { width: TCW, align: 'center', lineBreak: false });
  y += 72;

  // GSTIN strip (light accent background)
  tfill(doc, 0, y, TW, 18, b.light || '#F0F4FF');
  doc.fillColor(b.primary).fontSize(6).font('Helvetica-Bold')
     .text('GSTIN: ' + d.gstin + '   |   State: ' + (d.stateCode || '—'), TM, y + 5, { width: TCW, align: 'center', lineBreak: false });
  doc.fillColor(b.primary).fontSize(5.5).font('Helvetica')
     .text('License: ' + (d.licenseNo || '—'), TM, y + 11, { width: TCW, align: 'center', lineBreak: false });
  y += 18;

  // Title bar
  tfill(doc, 0, y, TW, 20, b.primary);
  doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
     .text('RETAIL OUTLET RECEIPT', TM, y + 6, { width: TCW, align: 'center', lineBreak: false });
  y += 20 + 6;

  return y;
}

// ─── Receipt Meta ─────────────────────────────────────────────────────────────
function drawTMeta(doc, d, startY) {
  var y = startY;
  var H = TCW / 2;

  tLeft(doc, 'Receipt No :',  d.billNumber,   y);  y += 10;
  tLeft(doc, 'Date :',        d.date,          y);  y += 10;

  // Two-column row
  doc.fillColor('#555').fontSize(6.5).font('Helvetica-Bold').text('Vehicle No :', TM, y, { width: H - 2, lineBreak: false });
  doc.fillColor('#000').font('Helvetica').text(d.vehicleNumber, TM + 42, y, { width: H - 44, lineBreak: false });
  doc.fillColor('#555').font('Helvetica-Bold').text('Pump/Nozzle :', TM + H + 2, y, { width: H - 2, lineBreak: false });
  doc.fillColor('#000').font('Helvetica').text(d.pumpNo + ' / ' + d.nozzleNo, TM + H + 48, y, { width: H - 50, lineBreak: false });
  y += 10;

  tLeft(doc, 'Customer :',   d.customerName,                       y);  y += 10;
  tLeft(doc, 'Attendant :',  d.attendantName + ' (' + d.attendantId + ')', y); y += 12;

  y = tLine(doc, y, 'dashed');
  return y;
}

// ─── Items Table ─────────────────────────────────────────────────────────────
function drawTItems(doc, d, startY) {
  var y = startY;
  var b = brand(d.oilCompany);

  // TCW = 208.77  →  Product:82  Qty:32  Rate:42  Amt:52.77
  var cols = [
    { label: 'PRODUCT',   x: TM,       w: 82,  align: 'left'  },
    { label: 'QTY(L)',    x: TM + 82,  w: 32,  align: 'right' },
    { label: 'RATE',      x: TM + 114, w: 42,  align: 'right' },
    { label: 'AMOUNT',    x: TM + 156, w: TCW - 147, align: 'right' },
  ];

  // Header
  tfill(doc, TM, y, TCW, 14, b.primary);
  doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
  cols.forEach(function(c) {
    doc.text(c.label, c.x + 2, y + 4, { width: c.w - 4, align: c.align, lineBreak: false });
  });
  y += 14;

  tLine(doc, y, 'solid');  y += 3;

  // Item rows
  d.items.forEach(function(item, i) {
    if (i % 2 === 0) tfill(doc, TM, y - 1, TCW, 16, '#F4F7FC');
    doc.fillColor('#000').fontSize(7);
    doc.font('Helvetica')      .text(item.product,                  cols[0].x + 2, y, { width: cols[0].w - 4, lineBreak: false });
    doc.font('Helvetica')      .text(item.quantity.toFixed(3),       cols[1].x + 2, y, { width: cols[1].w - 4, align: 'right', lineBreak: false });
    doc.font('Helvetica')      .text(item.ratePerLitre.toFixed(2),   cols[2].x + 2, y, { width: cols[2].w - 4, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold') .text(item.amount.toFixed(2),         cols[3].x + 2, y, { width: cols[3].w - 4, align: 'right', lineBreak: false });
    y += 16;

    // HSN code below product name (small)
    doc.fillColor('#888').fontSize(5.5).font('Helvetica')
       .text('HSN: ' + (item.hsnCode || '27101230'), cols[0].x + 2, y - 6, { lineBreak: false });
  });

  y = tLine(doc, y, 'dashed');
  return y;
}

// ─── Tax Breakdown + Total ────────────────────────────────────────────────────
function drawTTaxAndTotal(doc, d, startY) {
  var y = startY;
  var b = brand(d.oilCompany);
  var hasTax = d.cgstRate > 0 || d.sgstRate > 0;

  // GST breakdown (if rates provided)
  if (hasTax) {
    tCenter(doc, 'TAX BREAKDOWN', y, 6.5, true, '#444444');
    y += 10;

    function taxRow(label, val) {
      doc.fillColor('#555').fontSize(6.5).font('Helvetica')
         .text(label, TM, y, { width: TCW - 55, lineBreak: false });
      doc.fillColor('#000').font('Helvetica-Bold')
         .text(val, TM, y, { width: TCW, align: 'right', lineBreak: false });
      y += 9;
    }
    taxRow('Taxable Amount :',               'Rs ' + d.totalTaxable.toFixed(2));
    taxRow('CGST @ ' + d.cgstRate + '% :',  'Rs ' + d.totalCGST.toFixed(2));
    taxRow('SGST @ ' + d.sgstRate + '% :',  'Rs ' + d.totalSGST.toFixed(2));
    taxRow('Total Tax :',                    'Rs ' + (d.totalCGST + d.totalSGST).toFixed(2));
    y = tLine(doc, y, 'dashed');
  }

  // Total box
  tfill(doc, TM, y, TCW, 32, b.primary);
  doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold')
     .text('TOTAL AMOUNT', TM, y + 5, { width: TCW, align: 'center', lineBreak: false });
  doc.fontSize(13).font('Helvetica-Bold')
     .text('Rs ' + d.totalAmount.toFixed(2), TM, y + 16, { width: TCW, align: 'center', lineBreak: false });
  y += 32 + 5;

  // Amount in words
  var words = convertToWords(d.totalAmount);
  doc.fillColor('#444').fontSize(6).font('Helvetica')
     .text(words, TM, y, { width: TCW, align: 'center' });
  y += doc.heightOfString(words, { width: TCW, fontSize: 6 }) + 8;

  y = tLine(doc, y, 'dashed');
  return y;
}

// ─── Payment ──────────────────────────────────────────────────────────────────
function drawTPayment(doc, d, startY) {
  var y = startY;

  doc.fillColor('#333').fontSize(7).font('Helvetica-Bold')
     .text('PAYMENT MODE :', TM, y, { width: TCW / 2, lineBreak: false });
  doc.fillColor('#000').font('Helvetica')
     .text(d.paymentMethod, TM + 72, y, { lineBreak: false });
  y += 10;

  if (d.transactionRefNo) {
    doc.fillColor('#333').font('Helvetica-Bold').text('REF NO. :', TM, y, { width: TCW / 2, lineBreak: false });
    doc.fillColor('#000').font('Helvetica').text(d.transactionRefNo, TM + 52, y, { lineBreak: false });
    y += 10;
  }

  y = tLine(doc, y, 'dashed');
  return y;
}

// ─── Tax note ─────────────────────────────────────────────────────────────────
function drawTNote(doc, d, startY) {
  var y = startY;

  doc.fillColor('#777').fontSize(5.5).font('Helvetica')
     .text(d.taxNote, TM, y, { width: TCW, align: 'center' });
  y += doc.heightOfString(d.taxNote, { width: TCW, fontSize: 5.5 }) + 8;

  y = tLine(doc, y, 'dashed');
  return y;
}

// ─── Footer ───────────────────────────────────────────────────────────────────
async function drawTFooter(doc, d, startY) {
  var y = startY;

  // QR code (optional — skip if includeQR === false)
  if (d.includeQR !== false) {
    tCenter(doc, 'Scan to verify this receipt', y, 6, false, '#888');
    y += 9;
    var qrSize = 65;
    var qrX    = (TW - qrSize) / 2;
    var qrData = 'Receipt:' + d.billNumber + '|Vehicle:' + d.vehicleNumber + '|Amt:' + d.totalAmount + '|Pump:' + d.pumpName;
    try {
      var buf = await QRCode.toBuffer(qrData, { width: qrSize, margin: 1 });
      doc.image(buf, qrX, y, { width: qrSize, height: qrSize });
    } catch (e) {
      doc.save().lineWidth(0.5).rect(qrX, y, qrSize, qrSize).strokeColor('#CCCCCC').stroke().restore();
    }
    y += qrSize + 8;
  }

  tCenter(doc, '- - - Thank You! Please Visit Again - - -', y, 7, false, '#555');  y += 10;
  tCenter(doc, 'System-generated receipt. No signature required.', y, 6, false, '#888');
}

// ─── Number to words ─────────────────────────────────────────────────────────
function convertToWords(num) {
  var ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
              'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  var tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  var r = Math.floor(num);
  var p = Math.round((num - r) * 100);
  function ch(n) {
    if (!n) return '';
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + ch(n%100) : '');
  }
  function cv(n) {
    if (!n) return 'Zero';
    if (n < 1000)     return ch(n);
    if (n < 100000)   return ch(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + ch(n%1000) : '');
    if (n < 10000000) return ch(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + cv(n%100000) : '');
    return ch(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + cv(n%10000000) : '');
  }
  var res = 'Rupees ' + cv(r);
  if (p > 0) res += ' and Paise ' + cv(p);
  return res + ' Only';
}

module.exports = { generatePetrolPDF: generatePetrolPDF, PETROL_DEFAULT_VALUES: PETROL_DEFAULT_VALUES };
