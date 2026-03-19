# Copilot Instructions for Food Bill PDF Generator

## Build, Test, and Lint Commands

- **Install dependencies:**
  ```bash
  npm install
  ```
- **Start server:**
  ```bash
  npm start
  ```
- **Development mode (auto-reload):**
  ```bash
  npm run dev
  ```
- **Run all tests:**
  ```bash
  npm test
  ```
- **Run a single test:**
  Edit `test.js` to comment/uncomment the desired test function, then run:
  ```bash
  node test.js
  ```
- **Linting:**
  _No linter configured by default._

## High-Level Architecture

- **Express.js server** (`server.js`): Serves REST API endpoints and static frontend.
- **PDF Generation** (`pdfGenerator.js`): Contains logic for creating Haldiram-style invoice PDFs. Merges user data with defaults, calculates taxes, and formats output.
- **Frontend** (`public/index.html`): Responsive web form for invoice entry, item management, and PDF generation. Communicates with backend via API.
- **Test Suite** (`test.js`): Generates sample invoices with various data scenarios and verifies output files.
- **Invoice Storage**: Generated PDFs are saved in the `invoices/` directory.

## Key Conventions

- **Default Value System:**
  - All invoice fields have defaults (see `pdfGenerator.js`). If a field is missing, the default is used—no errors for missing fields.
  - Frontend can load defaults via `/api/defaults`.
- **Invoice Data Structure:**
  - Follows the Haldiram invoice format, including company, store, customer, items, and payment details.
  - Items must include `code`, `name`, `quantity`, `rate`, and `hsnSac`.
- **API Endpoints:**
  - `/api/generate-invoice` (POST): Generates a PDF from JSON data.
  - `/api/defaults` (GET): Returns default invoice values.
  - `/api/download/:filename` and `/api/view/:filename`: Download or view generated PDFs.
  - `/api/upload-logo` (POST): Uploads a logo image for invoice branding.
- **Testing:**
  - `test.js` generates 5 standard test PDFs. Use `verify.js` to check output files.
- **Frontend/Backend Sync:**
  - Frontend field names and backend data structure must match for correct PDF output.
- **Styling:**
  - Primary color: `#c41e3a` (Haldiram red). Alternating row colors in item tables.
- **File/Directory Requirements:**
  - `invoices/` and `uploads/` directories are auto-created if missing.

---

This file summarizes build/test commands, architecture, and key conventions for Copilot and future contributors. Would you like to adjust anything or add coverage for other areas (e.g., deployment, advanced customization)?
