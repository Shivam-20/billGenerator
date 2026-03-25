---
name: copilot-instructions
description: "Workspace instructions for GitHub Copilot Chat and local agents"
---

Purpose
- Provide concise, high-value guidance for Copilot Chat and local agents working on this repository.

How I can help
- Run, build, and test the app; explain code; suggest code changes; produce small patches; and generate example prompts.

Quick start (commands)
- Install: `npm install`
- Start (production): `npm start`
- Dev (auto-reload): `npm run dev`
- Test: `npm test`

Repository quick links
- Main server: [server.js](server.js)
- PDF logic: [pdfGenerator.js](pdfGenerator.js)
- Frontend: [public/index.html](public/index.html)
- Tests: [test.js](test.js)
- Package metadata: [package.json](package.json)
- Primary docs: [README.md](README.md)

Key conventions
- Default port: 3000 (see `server.js`).
- Generated PDFs stored under `invoices/` (ensure write permissions).
- Default values and API contract are documented in [README.md](README.md).
- Use `nodemon` for local development (`npm run dev`).

Agent behavior guidelines
- Link to authoritative docs instead of copying long sections from `README.md`.
- When suggesting code changes, prefer minimal, focused patches using apply_patch.
- Ask clarifying questions before making assumptions about environment-specific changes (ports, paths, secrets).

Example prompts
- "Run the tests and open failures, then suggest a fix for the first failing test."
- "Add server-side validation to `POST /api/generate-invoice` to require `customerName`."
- "Create an endpoint that returns the most recent 10 invoice filenames."

Where to find more
- Full project details and API usage: [README.md](README.md)

If you want, I can now: update this file with more repo-specific links, run the test suite, or create an `AGENTS.md` variant scoped to frontend/backend. Please tell me which next step you prefer.
