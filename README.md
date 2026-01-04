# Food Bill PDF Generator

A Node.js application for generating professional food invoices/bills in PDF format with a web-based frontend interface.

## Features

✅ **Dynamic PDF Generation** - Generate invoices with custom or default values
✅ **Web Interface** - Beautiful, responsive frontend form
✅ **RESTful API** - Complete API for invoice management
✅ **Default Values** - Automatically uses defaults if values not provided
✅ **Professional Format** - Styled invoices with logo and proper formatting
✅ **GST/Tax Support** - Built-in tax calculation
✅ **Multiple Items** - Add unlimited items to invoice
✅ **Download & View** - View PDF in browser or download

## Installation

1. **Install Dependencies**
```bash
npm install
```

2. **Run the Application**
```bash
npm start
```

3. **For Development (with auto-reload)**
```bash
npm run dev
```

4. **Run Tests**
```bash
npm test
```

## Usage

### Web Interface

1. Open browser and navigate to: `http://localhost:3000`
2. Fill in the invoice details (or click "Load Defaults")
3. Add items to the invoice
4. Click "Generate Invoice"
5. View or download the generated PDF

### API Endpoints

#### 1. Health Check
```
GET /api/health
```

#### 2. Get Default Values
```
GET /api/defaults
```

#### 3. Generate Invoice
```
POST /api/generate-invoice
Content-Type: application/json

{
  "invoiceNumber": "INV-001",
  "customerName": "John Doe",
  "items": [
    {
      "name": "Item 1",
      "quantity": 2,
      "price": 100,
      "total": 200
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invoice generated successfully",
  "filename": "invoice123456789.pdf",
  "downloadUrl": "/api/download/invoice123456789.pdf"
}
```

#### 4. Download Invoice
```
GET /api/download/:filename
```

#### 5. View Invoice in Browser
```
GET /api/view/:filename
```

#### 6. List All Invoices
```
GET /api/invoices
```

## Default Values

If any field is not provided, the following defaults are used:

```javascript
{
  invoiceNumber: 'INV-001',
  date: Current Date,
  customerName: 'Guest Customer',
  customerPhone: '+91 9876543210',
  customerAddress: 'Default Address, City, State',
  items: [
    { name: 'Default Item 1', quantity: 1, price: 100, total: 100 },
    { name: 'Default Item 2', quantity: 2, price: 50, total: 100 }
  ],
  subtotal: 200,
  tax: 36, // 18% GST
  discount: 0,
  total: 236,
  restaurantName: 'Food Paradise',
  restaurantAddress: '123 Main Street, City, State - 123456',
  restaurantPhone: '+91 1234567890',
  restaurantEmail: 'info@foodparadise.com',
  restaurantGSTIN: '22AAAAA0000A1Z5',
  paymentMethod: 'Cash',
  notes: 'Thank you for your business!'
}
```

## Invoice Data Structure

```javascript
{
  // Restaurant Details
  "restaurantName": "Food Paradise",
  "restaurantAddress": "123 Main Street, City",
  "restaurantPhone": "+91 1234567890",
  "restaurantEmail": "info@restaurant.com",
  "restaurantGSTIN": "22AAAAA0000A1Z5",
  
  // Invoice Details
  "invoiceNumber": "INV-001",
  "date": "04/01/2026",
  "paymentMethod": "Cash",
  
  // Customer Details
  "customerName": "John Doe",
  "customerPhone": "+91 9876543210",
  "customerAddress": "Customer Address",
  
  // Items
  "items": [
    {
      "name": "Item Name",
      "quantity": 2,
      "price": 100,
      "total": 200
    }
  ],
  
  // Financial Details
  "subtotal": 200,      // Auto-calculated if not provided
  "tax": 36,            // Auto-calculated (18%) if not provided
  "discount": 0,
  "total": 236,         // Auto-calculated if not provided
  
  // Additional
  "notes": "Thank you for your business!"
}
```

## Testing

### Automated Tests

Run the test suite to generate sample invoices:

```bash
npm test
```

This will generate 5 test PDFs:
1. `test-default-invoice.pdf` - All default values
2. `test-partial-invoice.pdf` - Partial custom values
3. `test-full-invoice.pdf` - All custom values
4. `test-empty-items-invoice.pdf` - Empty items (uses defaults)
5. `test-minimal-invoice.pdf` - Only invoice number provided

### Manual Testing

1. **Test with Frontend:**
   - Open `http://localhost:3000`
   - Try different combinations of filled/empty fields
   - Verify defaults are used for empty fields

2. **Test with API:**
```bash
# Generate invoice with partial data
curl -X POST http://localhost:3000/api/generate-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceNumber": "TEST-001",
    "customerName": "Test User"
  }'

# Get defaults
curl http://localhost:3000/api/defaults

# List all invoices
curl http://localhost:3000/api/invoices
```

## File Structure

```
Food/
├── package.json              # Dependencies and scripts
├── server.js                 # Express server and API endpoints
├── pdfGenerator.js           # PDF generation logic
├── test.js                   # Test suite
├── README.md                 # This file
├── public/
│   └── index.html           # Web interface
├── invoices/                # Generated invoices (auto-created)
└── node_modules/            # Dependencies (after npm install)
```

## Features Details

### 1. Default Value System
- Every field has a default value
- If frontend doesn't pass a value, default is used
- No errors for missing fields

### 2. PDF Formatting
- Professional header with logo placeholder
- Color-coded sections
- Responsive table layout
- GST/Tax information
- Payment details
- Notes section

### 3. Frontend Features
- Responsive design
- Dynamic item rows (add/remove)
- Auto-calculation of totals
- Date picker
- Form validation
- Loading indicators
- Success/error messages
- Direct PDF preview

### 4. API Features
- RESTful endpoints
- JSON responses
- Error handling
- File management
- CORS enabled

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Dependencies

- **express**: Web server framework
- **pdfkit**: PDF generation library
- **cors**: Cross-origin resource sharing
- **nodemon**: Development auto-reload (dev dependency)

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, change it in `server.js`:
```javascript
const PORT = process.env.PORT || 3001; // Change to different port
```

### PDF Not Generating
1. Check if `invoices/` directory exists
2. Verify write permissions
3. Check server console for errors

### Frontend Not Loading
1. Ensure server is running (`npm start`)
2. Check if `public/index.html` exists
3. Verify no firewall blocking port 3000

## License

ISC

## Author

Created for Food Paradise Restaurant
