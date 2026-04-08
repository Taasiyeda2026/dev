# Dashboard Taasiyeda (P-2026)

## Overview
A management dashboard for educational activities, courses, and instructors. The system manages a "Single Source of Truth" (`DATA_MASTER`) stored in Google Sheets and handles workflow requests for updating records, managing course meetings, and tracking financial statuses.

## Architecture
- **Frontend:** Vanilla JavaScript SPA (ES Modules), served as static files from the `frontend/` directory.
- **Backend:** Google Apps Script (GAS) deployed separately, accessed via a Web App URL. Not hosted in this Replit environment.
- **Database:** Google Sheets (DATA_MASTER, PERMISSIONS, EDIT_REQUESTS sheets).

## Project Structure
```
.
├── server.js              # Simple Node.js static file server for dev
├── frontend/              # Client-side SPA
│   ├── index.html         # Main entry point (RTL, Hebrew)
│   ├── app.js             # Main app logic and UI rendering
│   ├── api.js             # API client for GAS Web App
│   ├── state.js           # User session state management
│   ├── data-engine.js     # Client-side data fetching and caching
│   ├── data-contracts.js  # Shared constants and field mappings
│   ├── styles.css         # Stylesheet
│   ├── sw.js              # Service Worker (PWA)
│   └── assets/            # Icons and images
├── Config.gs              # GAS: Global configuration and sheet mappings
├── Core.gs                # GAS: doGet/doPost entry points and routing
├── Logic.gs               # GAS: Core business logic
├── Utils.gs               # GAS: Helper functions
└── appsscript.json        # GAS manifest
```

## Running Locally
- Workflow: `Start application` → `node server.js`
- Serves the `frontend/` directory on `0.0.0.0:5000`

## Deployment
- Type: Static site
- Public directory: `frontend/`
- No build step required (no bundler/transpiler)

## Authentication
- Login via Employee ID + Entry Code checked against the `PERMISSIONS` Google Sheet via GAS API
