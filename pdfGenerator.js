const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// ─── Design tokens ──────────────────────────────────────────────────────────
const PW    = 595.28;
const PH    = 841.89;
const ML    = 28;
const MR    = 28;
const CW    = PW - ML - MR;  // 539.28
const BRAND = '#C41E3A';
const DARK  = '#8B0000';
const LIGHT = '#FFF5F5';
const GRAY  = '#F7F7F7';
const DGRAY = '#EEEEEE';
const LINE  = '#CCCCCC';
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const LW    = 0.5;

// ─── Default values ──────────────────────────────────────────────────────────
const DEFAULT_VALUES = {
  invoiceNumber: '435/2526/131636',
  date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
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
  customerName: 'Guest Customer',
  customerPhone: '9876543210',
  orderNo: 'C001',
  tokenNo: '001',
  cashierId: '4006239',
  cashierName: 'CASHIER',
  returnedAgainst: 'null',
  items: [
    { code: 'H000073', name: 'MASALA DOSA',    quantity: 1, rate: 230.00, hsnSac: '996331' },
    { code: 'H000051', name: 'CHOLEY BHATURE', quantity: 1, rate: 184.00, hsnSac: '996331' }
  ],
  cgstRate: 2.50,
  sgstRate: 2.50,
  paymentMethod: 'Cash',
  transactionRefNo: '',
  serialNo: '',
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
    'Total Invoice amount is rounded off to next nearest rupees for cash transaction.'
  ],
  customerCarePhone: '011-47685219',
  customerCareEmail: 'CustomerCare@haldiram.com'
};

// ─── Drawing helpers ─────────────────────────────────────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function strokeRect(doc, x, y, w, h, color, lineWidth) {
  doc.save().lineWidth(lineWidth || LW).rect(x, y, w, h).strokeColor(color || LINE).stroke().restore();
}

function hLine(doc, y, x1, x2, color, lw) {
  doc.save().lineWidth(lw || LW).moveTo(x1 || ML, y).lineTo(x2 || (PW - MR), y).strokeColor(color || LINE).stroke().restore();
}

function vLine(doc, x, y1, y2, color, lw) {
  doc.save().lineWidth(lw || LW).moveTo(x, y1).lineTo(x, y2).strokeColor(color || LINE).stroke().restore();
}

function txt(doc, text, x, y, opts) {
  const o = opts || {};
  doc.fillColor(o.color || BLACK)
     .fontSize(o.size || 7.5)
     .font(o.bold ? 'Helvetica-Bold' : 'Helvetica')
     .text(String(text), x, y, {
       width:    o.width,
       align:    o.align || 'left',
       lineBreak: false,
     });
}

// ─── Main generator ──────────────────────────────────────────────────────────
async function generateInvoicePDF(data, outputPath) {
  data = data || {};
  return new Promise(async function(resolve, reject) {
    try {
      const d = Object.assign({}, DEFAULT_VALUES, data, {
        items: (data.items && data.items.length > 0) ? data.items : DEFAULT_VALUES.items,
        termsAndConditions: data.termsAndConditions || DEFAULT_VALUES.termsAndConditions,
      });

      // ── Tax calculations ──
      d.items = d.items.map(function(item) {
        var amount   = item.quantity * item.rate;
        var taxable  = amount / (1 + (d.cgstRate + d.sgstRate) / 100);
        var cgst     = taxable * d.cgstRate / 100;
        var sgst     = taxable * d.sgstRate / 100;
        return Object.assign({}, item, { amount: amount, taxable: taxable, cgst: cgst, sgst: sgst });
      });
      d.totalAmount  = d.items.reduce(function(s, i) { return s + i.amount;   }, 0);
      d.totalTaxable = d.items.reduce(function(s, i) { return s + i.taxable;  }, 0);
      d.totalCGST    = d.items.reduce(function(s, i) { return s + i.cgst;     }, 0);
      d.totalSGST    = d.items.reduce(function(s, i) { return s + i.sgst;     }, 0);
      d.totalItems   = d.items.reduce(function(s, i) { return s + i.quantity; }, 0);
      d.amountPayable = Math.round(d.totalAmount * 100) / 100;

      const doc    = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      var y = 0;
      y = drawHeader(doc, d, y);
      y = drawMetaSection(doc, d, y);
      y = drawItemsTable(doc, d, y);
      y = drawSummaryBlock(doc, d, y);
      y = drawPaymentSection(doc, d, y);
      y = drawTermsSection(doc, d, y);
      await drawFooter(doc, d, y);

      doc.end();
      stream.on('finish', function() { resolve(outputPath); });
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// ─── Header ──────────────────────────────────────────────────────────────────
function drawHeader(doc, d, startY) {
  var y = startY;

  // 4pt brand strip at very top
  fillRect(doc, 0, 0, PW, 4, BRAND);
  y = 6;

  // ── Logo ──
  var logoPath = d.logoPath || path.join(__dirname, 'haldiram-logo.png');
  var logoW = 260;
  try {
    doc.image(logoPath, (PW - logoW) / 2, y, { width: logoW, fit: [logoW, 75] });
    y += 78;
  } catch (e) {
    fillRect(doc, ML, y, CW, 22, LIGHT);
    doc.fillColor(BRAND).fontSize(15).font('Helvetica-Bold')
       .text('HALDIRAMS', ML, y + 4, { width: CW, align: 'center' });
    y += 26;
  }

  // ── Title ──
  doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold')
     .text('Restaurant Service  (Tax-Invoice)', ML, y, { width: CW, align: 'center' });
  y += 14;

  // ── Company name ──
  doc.fontSize(8.5).font('Helvetica-Bold')
     .text(d.companyName, ML, y, { width: CW, align: 'center' });
  y += 12;

  // ── Store name ──
  doc.fontSize(8).font('Helvetica-Bold')
     .text(d.storeName, ML, y, { width: CW, align: 'center' });
  y += 11;

  // ── Store address ──
  doc.fillColor('#333').fontSize(7).font('Helvetica')
     .text(d.storeAddress, ML, y, { width: CW, align: 'center' });
  y += 10;

  // ── Phone + GSTIN ──
  doc.font('Helvetica-Bold').fillColor(BLACK)
     .text('Ph No. : ' + d.storePhone + '   |   GSTIN No. : ' + d.gstin, ML, y, { width: CW, align: 'center' });
  y += 11;

  // ── Small details row ──
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#444')
     .text('Regd. Address :', ML, y);
  doc.font('Helvetica').fillColor('#555')
     .text(d.registeredAddress, ML + 68, y, { width: 200, lineBreak: false });

  doc.font('Helvetica-Bold').fillColor('#444')
     .text('State Code : ' + d.stateCode, ML + 280, y, { lineBreak: false });
  y += 9;
  doc.font('Helvetica-Bold').text('CIN : ' + d.cin, ML + 280, y, { lineBreak: false });
  y += 9;
  doc.font('Helvetica-Bold').text('FSSAI No. : ' + d.fssaiNo, ML + 280, y, { lineBreak: false });
  y += 13;

  // ── Brand divider (2pt) ──
  fillRect(doc, ML, y, CW, 2, BRAND);
  y += 6;

  return y;
}

// ─── Meta Section ────────────────────────────────────────────────────────────
function drawMetaSection(doc, d, startY) {
  var y    = startY;
  var ROW  = 11;
  var ROWS = 6;
  var BOX_H = ROW * ROWS + 10;

  fillRect(doc, ML, y, CW, BOX_H, GRAY);
  strokeRect(doc, ML, y, CW, BOX_H, LINE, 0.5);
  vLine(doc, ML + 265, y, y + BOX_H, LINE, 0.5);
  y += 5;

  var LX = ML + 4;
  var RX = ML + 270;
  var LW2 = 257;
  var RW2 = CW - 270;

  function kv(label, val, x, yy, w) {
    doc.fillColor('#555').fontSize(7).font('Helvetica-Bold')
       .text(label, x, yy, { width: 80, lineBreak: false });
    doc.fillColor(BLACK).font('Helvetica')
       .text(String(val), x + 82, yy, { width: w - 84, lineBreak: false });
  }

  kv('Customer Name :', d.customerName,   LX, y, LW2); kv('Invoice No. :',    d.invoiceNumber, RX, y, RW2); y += ROW;
  kv('Customer Ph. :', d.customerPhone,   LX, y, LW2); kv('Store ID / POS :',d.storeId + ' / ' + d.posNo, RX, y, RW2); y += ROW;
  kv('Order No. :',    d.orderNo,         LX, y, LW2); kv('Date & Time :',    d.date,          RX, y, RW2); y += ROW;
  kv('Token No. :',    d.tokenNo,         LX, y, LW2); kv('Place of Supply :',d.placeOfSupply, RX, y, RW2); y += ROW;
  kv('SAC Code :',     d.sacCode,         LX, y, LW2); kv('Cashier :',        d.cashierName + ' (' + d.cashierId + ')', RX, y, RW2); y += ROW;
  kv('Ret. Against :', d.returnedAgainst, LX, y, LW2);
  y += ROW + 5;

  fillRect(doc, ML, y, CW, 2, BRAND);
  y += 6;
  return y;
}

// ─── Items Table ─────────────────────────────────────────────────────────────
function drawItemsTable(doc, d, startY) {
  var y = startY;

  // Column layout — total must equal CW = 539.28
  // Name:200 Qty:40 Rate:65 CGST:65 SGST:65 Amt:104.28  (≈539)
  var C = {
    name:   { x: ML,       w: 200 },
    qty:    { x: ML+200,   w: 40  },
    rate:   { x: ML+240,   w: 65  },
    cgst:   { x: ML+305,   w: 65  },
    sgst:   { x: ML+370,   w: 65  },
    amount: { x: ML+435,   w: CW - 407 },
  };

  var HDR_H = 20;
  fillRect(doc, ML, y, CW, HDR_H, BRAND);

  // Header text
  function hdr(text, col, align) {
    doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold')
       .text(text, col.x + 3, y + 6, { width: col.w - 6, align: align || 'left', lineBreak: false });
  }
  hdr('ITEM NAME / CODE', C.name);
  hdr('QTY',    C.qty,    'right');
  hdr('RATE',   C.rate,   'right');
  hdr('CGST\n@' + d.cgstRate + '%', C.cgst,   'right');
  hdr('SGST\n@' + d.sgstRate + '%', C.sgst,   'right');
  hdr('AMOUNT (Rs)', C.amount, 'right');

  // Column separator lines in header
  [C.qty, C.rate, C.cgst, C.sgst, C.amount].forEach(function(col) {
    vLine(doc, col.x, y, y + HDR_H, 'rgba(255,255,255,0.25)', 0.5);
  });
  y += HDR_H;

  // ── Item rows ──
  d.items.forEach(function(item, idx) {
    var ITEM_H = 22;
    var bg = idx % 2 === 0 ? WHITE : LIGHT;
    fillRect(doc, ML, y, CW, ITEM_H, bg);
    strokeRect(doc, ML, y, CW, ITEM_H, LINE, 0.5);
    [C.qty, C.rate, C.cgst, C.sgst, C.amount].forEach(function(col) {
      vLine(doc, col.x, y, y + ITEM_H, LINE, 0.5);
    });

    var numY = y + 7;
    // Item code (small, bold)
    doc.fillColor('#666').fontSize(6).font('Helvetica-Bold')
       .text(item.code || '', C.name.x + 3, y + 3, { width: C.name.w - 6, lineBreak: false });
    // Item name
    doc.fillColor(BLACK).fontSize(7.5).font('Helvetica')
       .text(item.name, C.name.x + 3, y + 11, { width: C.name.w - 6, lineBreak: false });
    // HSN
    doc.fillColor('#888').fontSize(6).font('Helvetica')
       .text('HSN:' + (item.hsnSac || d.sacCode), C.name.x + 3, y + 15, { lineBreak: false });

    doc.fillColor(BLACK).fontSize(7.5);
    doc.font('Helvetica')    .text(String(item.quantity),    C.qty.x    + 3, numY, { width: C.qty.w    - 6, align: 'right', lineBreak: false });
    doc.font('Helvetica')    .text(item.rate.toFixed(2),     C.rate.x   + 3, numY, { width: C.rate.w   - 6, align: 'right', lineBreak: false });
    doc.font('Helvetica')    .text(item.cgst.toFixed(2),     C.cgst.x   + 3, numY, { width: C.cgst.w   - 6, align: 'right', lineBreak: false });
    doc.font('Helvetica')    .text(item.sgst.toFixed(2),     C.sgst.x   + 3, numY, { width: C.sgst.w   - 6, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').text(item.amount.toFixed(2),  C.amount.x + 3, numY, { width: C.amount.w - 6, align: 'right', lineBreak: false });
    y += ITEM_H;
  });

  // ── Total row ──
  var TOT_H = 16;
  fillRect(doc, ML, y, CW, TOT_H, LIGHT);
  strokeRect(doc, ML, y, CW, TOT_H, BRAND, 1);
  [C.qty, C.rate, C.cgst, C.sgst, C.amount].forEach(function(col) {
    vLine(doc, col.x, y, y + TOT_H, BRAND, 0.5);
  });
  doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold');
  doc.text('TOTAL', C.name.x + 3, y + 4, { width: C.name.w - 6, lineBreak: false });
  doc.text(String(d.totalItems),           C.qty.x    + 3, y + 4, { width: C.qty.w    - 6, align: 'right', lineBreak: false });
  doc.text('',                             C.rate.x   + 3, y + 4, { width: C.rate.w   - 6, lineBreak: false });
  doc.text(d.totalCGST.toFixed(2),         C.cgst.x   + 3, y + 4, { width: C.cgst.w   - 6, align: 'right', lineBreak: false });
  doc.text(d.totalSGST.toFixed(2),         C.sgst.x   + 3, y + 4, { width: C.sgst.w   - 6, align: 'right', lineBreak: false });
  doc.text(d.totalAmount.toFixed(2),       C.amount.x + 3, y + 4, { width: C.amount.w - 6, align: 'right', lineBreak: false });
  y += TOT_H + 8;

  return y;
}

// ─── Summary + Tax Block ─────────────────────────────────────────────────────
function drawSummaryBlock(doc, d, startY) {
  var y = startY;

  var TAX_W  = 245;
  var SUM_X  = ML + TAX_W + 10;
  var SUM_W  = CW - TAX_W - 10;
  var ROW_H  = 13;

  // ── Left: Tax breakdown ──
  var ty = y;
  fillRect(doc, ML, ty, TAX_W, ROW_H, DGRAY);
  strokeRect(doc, ML, ty, TAX_W, ROW_H, LINE, 0.5);
  doc.fillColor('#333').fontSize(7).font('Helvetica-Bold')
     .text('TAX BREAKDOWN', ML + 3, ty + 3, { width: TAX_W - 6, lineBreak: false });
  ty += ROW_H;

  // Tax sub-header cols
  var tc = [
    { label: 'TYPE',         x: ML,       w: 42  },
    { label: 'TAXABLE AMT',  x: ML + 42,  w: 68  },
    { label: 'RATE',         x: ML + 110, w: 45  },
    { label: 'TAX AMOUNT',   x: ML + 155, w: 90  },
  ];
  // Total: 42+68+45+90 = 245 ✓
  fillRect(doc, ML, ty, TAX_W, ROW_H, DGRAY);
  tc.forEach(function(c) {
    strokeRect(doc, c.x, ty, c.w, ROW_H, LINE, 0.5);
    doc.fillColor('#444').fontSize(6.5).font('Helvetica-Bold')
       .text(c.label, c.x + 2, ty + 3, { width: c.w - 4, lineBreak: false });
  });
  ty += ROW_H;

  [
    { type: 'CGST', rate: d.cgstRate, amt: d.totalCGST },
    { type: 'SGST', rate: d.sgstRate, amt: d.totalSGST },
  ].forEach(function(row) {
    tc.forEach(function(c) {
      strokeRect(doc, c.x, ty, c.w, ROW_H, LINE, 0.5);
    });
    doc.fillColor(BLACK).fontSize(7).font('Helvetica');
    doc.text(row.type,                       tc[0].x + 2, ty + 3, { width: tc[0].w - 4, lineBreak: false });
    doc.text(d.totalTaxable.toFixed(2),      tc[1].x + 2, ty + 3, { width: tc[1].w - 4, align: 'right', lineBreak: false });
    doc.text(row.rate.toFixed(2) + '%',      tc[2].x + 2, ty + 3, { width: tc[2].w - 4, align: 'right', lineBreak: false });
    doc.text(row.amt.toFixed(2),             tc[3].x + 2, ty + 3, { width: tc[3].w - 4, align: 'right', lineBreak: false });
    ty += ROW_H;
  });
  // Total tax row
  fillRect(doc, ML, ty, TAX_W, ROW_H, DGRAY);
  tc.forEach(function(c) { strokeRect(doc, c.x, ty, c.w, ROW_H, LINE, 0.5); });
  doc.fillColor(DARK).fontSize(7).font('Helvetica-Bold');
  doc.text('TOTAL', tc[0].x + 2, ty + 3, { lineBreak: false });
  doc.text((d.totalCGST + d.totalSGST).toFixed(2), tc[3].x + 2, ty + 3, { width: tc[3].w - 4, align: 'right', lineBreak: false });
  ty += ROW_H;

  // ── Right: Bill summary ──
  var sy = y;
  fillRect(doc, SUM_X, sy, SUM_W, ROW_H, DGRAY);
  strokeRect(doc, SUM_X, sy, SUM_W, ROW_H, LINE, 0.5);
  doc.fillColor('#333').fontSize(7).font('Helvetica-Bold')
     .text('BILL SUMMARY', SUM_X + 3, sy + 3, { width: SUM_W - 6, lineBreak: false });
  sy += ROW_H;

  [
    { label: 'Subtotal (Taxable)',          value: d.totalTaxable.toFixed(2) },
    { label: 'CGST @ ' + d.cgstRate + '%', value: d.totalCGST.toFixed(2)   },
    { label: 'SGST @ ' + d.sgstRate + '%', value: d.totalSGST.toFixed(2)   },
  ].forEach(function(row) {
    strokeRect(doc, SUM_X, sy, SUM_W, ROW_H, LINE, 0.5);
    doc.fillColor('#444').fontSize(7).font('Helvetica')
       .text(row.label, SUM_X + 3, sy + 3, { width: SUM_W - 65, lineBreak: false });
    doc.fillColor(BLACK)
       .text(row.value, SUM_X + SUM_W - 62, sy + 3, { width: 58, align: 'right', lineBreak: false });
    sy += ROW_H;
  });

  // Amount payable (highlighted)
  fillRect(doc, SUM_X, sy, SUM_W, 18, BRAND);
  doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
     .text('AMOUNT PAYABLE', SUM_X + 4, sy + 5, { width: SUM_W - 75, lineBreak: false });
  doc.fillColor(WHITE).fontSize(9)
     .text('Rs ' + d.amountPayable.toFixed(2), SUM_X + SUM_W - 75, sy + 5, { width: 71, align: 'right', lineBreak: false });
  sy += 18;

  var bottomY = Math.max(ty, sy) + 8;

  // ── Amount in words (full-width) ──
  var words = convertToWords(d.amountPayable);
  fillRect(doc, ML, bottomY, CW, 16, GRAY);
  strokeRect(doc, ML, bottomY, CW, 16, LINE, 0.5);
  doc.fillColor('#333').fontSize(7).font('Helvetica-Bold')
     .text('Amount in Words :', ML + 4, bottomY + 4, { width: 92, lineBreak: false });
  doc.fillColor(BLACK).font('Helvetica')
     .text(words, ML + 96, bottomY + 4, { width: CW - 100, lineBreak: false });
  bottomY += 16 + 8;

  fillRect(doc, ML, bottomY, CW, 2, BRAND);
  bottomY += 6;

  return bottomY;
}

// ─── Payment Section ─────────────────────────────────────────────────────────
function drawPaymentSection(doc, d, startY) {
  var y = startY;

  // Header
  fillRect(doc, ML, y, CW, 14, BRAND);
  doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold')
     .text('PAYMENT DETAILS', ML + 4, y + 3, { lineBreak: false });
  y += 14;

  // Column definitions — total = CW = 539.28
  // Tender:100 Amount:80 Serial:90 TransRef:145 Items:124.28
  var pc = [
    { label: 'TENDER',         x: ML,        w: 100  },
    { label: 'AMOUNT (Rs)',    x: ML + 100,  w: 80   },
    { label: 'SERIAL NO.',     x: ML + 180,  w: 90   },
    { label: 'TRANS. REF NO.', x: ML + 270,  w: 145  },
    { label: 'ITEMS',          x: ML + 415,  w: CW - 387 },
  ];
  var COL_H = 13;

  // Column headers
  pc.forEach(function(col) {
    fillRect(doc, col.x, y, col.w, COL_H, DGRAY);
    strokeRect(doc, col.x, y, col.w, COL_H, LINE, 0.5);
    doc.fillColor('#333').fontSize(6.5).font('Helvetica-Bold')
       .text(col.label, col.x + 2, y + 3, { width: col.w - 4, lineBreak: false });
  });
  y += COL_H;

  // Values
  var vals = [d.paymentMethod, d.amountPayable.toFixed(2), d.serialNo || '', d.transactionRefNo || '', String(d.totalItems)];
  pc.forEach(function(col, i) {
    strokeRect(doc, col.x, y, col.w, COL_H, LINE, 0.5);
    doc.fillColor(BLACK).fontSize(7.5).font('Helvetica')
       .text(vals[i], col.x + 2, y + 3, { width: col.w - 4, lineBreak: false });
  });
  y += COL_H + 8;

  return y;
}

// ─── Terms & Conditions ──────────────────────────────────────────────────────
function drawTermsSection(doc, d, startY) {
  var y = startY;

  // Customer care strip
  fillRect(doc, ML, y, CW, 14, GRAY);
  strokeRect(doc, ML, y, CW, 14, LINE, 0.5);
  doc.fillColor('#555').fontSize(7).font('Helvetica')
     .text('Customer Care: ' + d.customerCarePhone + '   |   ' + d.customerCareEmail,
           ML + 4, y + 3, { width: CW - 8, align: 'center', lineBreak: false });
  y += 14 + 5;

  doc.fillColor(BLACK).fontSize(7.5).font('Helvetica-Bold').text('Terms and Conditions', ML, y);
  y += 11;

  doc.fontSize(6).font('Helvetica').fillColor('#444');
  d.termsAndConditions.forEach(function(term, i) {
    doc.text((i + 1) + '. ' + term, ML, y, { width: CW });
    y += doc.currentLineHeight() + 2;
  });
  y += 5;

  return y;
}

// ─── Footer ──────────────────────────────────────────────────────────────────
async function drawFooter(doc, d, startY) {
  var y = startY;

  doc.fillColor('#666').fontSize(7).font('Helvetica')
     .text('Scan QR to verify this invoice', ML, y, { width: CW, align: 'center', lineBreak: false });
  y += 12;

  var qrSize = 80;
  var qrX    = (PW - qrSize) / 2;
  var qrData = 'Invoice:' + d.invoiceNumber + '|Date:' + d.date + '|Amt:' + d.amountPayable + '|Store:' + d.storeId;
  try {
    var buf = await QRCode.toBuffer(qrData, { width: qrSize, margin: 1 });
    doc.image(buf, qrX, y, { width: qrSize, height: qrSize });
  } catch (e) {
    strokeRect(doc, qrX, y, qrSize, qrSize, LINE, 0.5);
  }
  y += qrSize + 8;

  fillRect(doc, ML, y, CW, 1.5, BRAND);
  y += 5;

  doc.fillColor(BLACK).fontSize(7).font('Helvetica-Bold')
     .text('This is a system-generated Invoice and does not require any signature.', ML, y, { width: CW, align: 'center', lineBreak: false });
  y += 10;
  doc.fillColor('#666').fontSize(6.5).font('Helvetica')
     .text('Tax payable on reverse charge: No', ML, y, { width: CW, align: 'center', lineBreak: false });
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

module.exports = { generateInvoicePDF: generateInvoicePDF, DEFAULT_VALUES: DEFAULT_VALUES };
