const path = require('path');
const { generateInvoicePDF, DEFAULT_VALUES } = require('./pdfGenerator');

// Test 1: Generate PDF with default values (Haldiram format)
async function test1() {
  console.log('\n=== Test 1: Generate PDF with DEFAULT values (Haldiram format) ===');
  try {
    const outputPath = path.join(__dirname, 'test-default-invoice.pdf');
    await generateInvoicePDF({}, outputPath);
    console.log('✓ Default invoice generated successfully!');
    console.log('  File:', outputPath);
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Test 2: Generate PDF with partial custom values
async function test2() {
  console.log('\n=== Test 2: Generate PDF with PARTIAL custom values ===');
  try {
    const customData = {
      invoiceNumber: '999/2526/TEST01',
      customerName: 'John Doe',
      customerPhone: '9988776655',
      orderNo: 'C999',
      tokenNo: '999',
      items: [
        { code: 'H000100', name: 'BUTTER CHICKEN', quantity: 2, rate: 350, hsnSac: '996331' },
        { code: 'H000101', name: 'NAAN', quantity: 4, rate: 40, hsnSac: '996331' },
        { code: 'H000102', name: 'DAL MAKHANI', quantity: 1, rate: 250, hsnSac: '996331' }
      ]
    };
    
    const outputPath = path.join(__dirname, 'test-partial-invoice.pdf');
    await generateInvoicePDF(customData, outputPath);
    console.log('✓ Partial custom invoice generated successfully!');
    console.log('  File:', outputPath);
    console.log('  Custom fields: invoiceNumber, customerName, customerPhone, items');
    console.log('  Default fields: All other fields');
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Test 3: Generate PDF matching original Haldiram invoice
async function test3() {
  console.log('\n=== Test 3: Generate PDF matching ORIGINAL Haldiram invoice ===');
  try {
    const customData = {
      invoiceNumber: '435/2526/131636',
      date: '01-01-2026 17:25 PM',
      customerName: 'void@razorpay.c',
      customerPhone: '9716458523',
      orderNo: 'C253',
      tokenNo: '498',
      cashierId: '4006239',
      cashierName: 'ANUJ',
      paymentMethod: 'Pine Lab UPI',
      items: [
        { code: 'H000073', name: 'MASALA DOSA', quantity: 1, rate: 230.00, hsnSac: '996331' },
        { code: 'H000051', name: 'CHOLEY BHATURE', quantity: 1, rate: 184.00, hsnSac: '996331' },
        { code: 'H000053', name: 'ALOO TIKKI WITH DAHI', quantity: 1, rate: 142.00, hsnSac: '996331' }
      ]
    };
    
    const outputPath = path.join(__dirname, 'test-full-invoice.pdf');
    await generateInvoicePDF(customData, outputPath);
    console.log('✓ Full invoice (matching original) generated successfully!');
    console.log('  File:', outputPath);
    console.log('  Matches original Haldiram invoice format');
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Test 4: Generate PDF with empty items (should use defaults)
async function test4() {
  console.log('\n=== Test 4: Generate PDF with EMPTY items (should use defaults) ===');
  try {
    const customData = {
      invoiceNumber: 'INV-2024-003',
      customerName: 'Test Customer',
      items: [] // Empty items array
    };
    
    const outputPath = path.join(__dirname, 'test-empty-items-invoice.pdf');
    await generateInvoicePDF(customData, outputPath);
    console.log('✓ Invoice with empty items generated successfully!');
    console.log('  File:', outputPath);
    console.log('  Items: Used default items because input was empty');
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Test 5: Generate PDF with only invoice number (all others default)
async function test5() {
  console.log('\n=== Test 5: Generate PDF with ONLY invoice number ===');
  try {
    const customData = {
      invoiceNumber: 'MINIMAL-001'
    };
    
    const outputPath = path.join(__dirname, 'test-minimal-invoice.pdf');
    await generateInvoicePDF(customData, outputPath);
    console.log('✓ Minimal invoice generated successfully!');
    console.log('  File:', outputPath);
    console.log('  Custom: invoiceNumber only');
    console.log('  Default: Everything else');
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║     PDF Invoice Generator - Test Suite            ║');
  console.log('╚════════════════════════════════════════════════════╝');
  
  await test1();
  await test2();
  await test3();
  await test4();
  await test5();
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('All tests completed!');
  console.log('Check the generated PDF files to verify the output.');
  console.log('═══════════════════════════════════════════════════\n');
}

// Run tests
runAllTests().catch(console.error);
