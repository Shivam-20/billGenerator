# Implementation Plan - Improve Food Bill Gen

## Goal Description
Revamp the Food Bill Generator with a modern, premium UI, adding a live PDF preview feature and real-time editing capabilities. Improve server robustness and security as a foundation.

## User Review Required
> [!NOTE]
> Adding new dependencies: `morgan`, `helmet`, `dotenv` (backend).
> Frontend will be updated to a modern split-screen layout (Form + Live Preview).
> No breaking changes to the API are planned.

## Proposed Changes

### Configuration
#### [MODIFY] [package.json](file:///media/system04/4E36DB0524ADCE651/Project/BIll/Food/package.json)
- Add dependencies: `morgan`, `helmet`, `dotenv`.

### Server Logic
#### [MODIFY] [server.js](file:///media/system04/4E36DB0524ADCE651/Project/BIll/Food/server.js)
- Import and configure `dotenv` at the top.
- Add `helmet` middleware for security.
- Add `morgan` middleware for request logging.
- Refactor `/api/invoices` route to use `fs.promises`.
- Add global error handling.

### Frontend
#### [MODIFY] [index.html](file:///media/system04/4E36DB0524ADCE651/Project/BIll/Food/public/index.html)
- **Structure**: Implement a split-screen layout:
    - **Left Panel**: Scrollable form for invoice details (Company, Customer, Items, etc.).
    - **Right Panel**: Fixed real-time PDF preview (using an iframe or PDF viewer).
- **Styling**: Use modern CSS (Grid/Flexbox) with a "premium" aesthetic (modern fonts, subtle shadows, clean inputs).
- **Interactivity**:
    - Add "Live Preview" toggle (updates PDF on form change with debounce).
    - Dynamic "Add Item" functionality.
    - specialized input fields for current date/time.

#### [NEW] [script.js](file:///media/system04/4E36DB0524ADCE651/Project/BIll/Food/public/script.js)
- Extract inline scripts from `index.html`.
- Implement debounced API call to `/api/generate-invoice` for live preview.
- Handle form updates and "Add Item" logic.

#### [NEW] [style.css](file:///media/system04/4E36DB0524ADCE651/Project/BIll/Food/public/style.css)
- Externalize styles.
- Define variables for colors/fonts.
- Implement responsive design (stack panels on mobile).


## Verification Plan

### Automated Tests
- Run existing PDF generation tests:
    ```bash
    node test.js
    ```
- Create and run a new API test script `test-api.js` (I will create this) to verify endpoints return 200 OK and expected JSON structure.

### Manual Verification
- Start the server: `npm start`
- Visit `http://localhost:3000` to ensure frontend loads.
- Generate an invoice via the UI (if applicable) or API to verify end-to-end flow.
