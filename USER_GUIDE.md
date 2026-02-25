# Sync-V — User Guide

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Setup](#2-project-setup)
3. [Building & Testing Each Module](#3-building--testing-each-module)
4. [Mobile App Usage](#4-mobile-app-usage)
5. [Backend API Usage](#5-backend-api-usage)
6. [Drive Module Usage](#6-drive-module-usage)
7. [Common Workflows](#7-common-workflows)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

### Drive Module (C++)
- CMake 3.14+
- C++17 compiler (MSVC 2022, GCC 9+, or Clang 10+)
- Internet connection for initial GoogleTest download

### Mobile App (TypeScript)
- Node.js 18+ and npm
- (For device deployment: React Native CLI, Android SDK or Xcode)

### Backend (TypeScript)
- Node.js 18+ and npm
- SQLite is bundled via `better-sqlite3` (no separate install needed)

---

## 2. Project Setup

Clone or copy the repository, then install dependencies for each module:

```bash
# Install mobile dependencies
cd mobile && npm install

# Install backend dependencies
cd ../backend && npm install

# Install integration test dependencies
cd ../integration && npm install

# Configure Drive build
cd ../drive && cmake -B build
```

---

## 3. Building & Testing Each Module

### Drive (C++)

```bash
cd drive

# Build
cmake --build build --config Release

# Run all tests
cd build && ctest --output-on-failure -C Release
```

Expected output: `100% tests passed, 0 tests failed out of 7`

### Mobile App (TypeScript)

```bash
cd mobile

# Run tests with coverage report
npx jest --coverage

# Run tests in watch mode during development
npx jest --watch
```

Expected: 11 test suites, 119 tests passing, ~69% statement coverage.

### Backend (TypeScript)

```bash
cd backend

# Run tests with coverage report
npx jest --coverage

# Type-check without running
npx tsc --noEmit
```

Expected: 35 test suites, 459 tests passing, ~86% statement coverage.

### Integration Tests

```bash
cd integration

# Run cross-module integration tests
npx jest
```

Expected: 5 test suites, 23 tests passing.

### Run Everything at Once

```bash
# From repository root
cd drive/build && ctest --output-on-failure -C Release && cd ../..
cd mobile && npx jest --coverage && cd ..
cd backend && npx jest --coverage && cd ..
cd integration && npx jest && cd ..
```

---

## 4. Mobile App Usage

### Screen Overview

#### Dashboard
The main screen showing system status at a glance:
- **Connection badges**: Shows Drive, Cloud, and network connection status with color-coded indicators (green = connected, red = disconnected)
- **Statistics cards**: Files on drive, pending uploads, available firmware updates
- **Quick actions**: Tap any card to navigate to Devices, Logs, Firmware, or Settings

#### Device List
View devices connected to the Sync-V Drive:
- Shows device ID, type, firmware version, and custom metadata fields
- Green dot indicates online status
- Pull down to refresh device list
- If drive is not connected, shows a connection prompt with retry button

#### Log Upload
Manage log file uploads from drive to cloud:
- **Upload All**: Uploads all pending logs in one action
- **Process Queue**: Retries failed/queued uploads (shown when items are queued)
- Per-log actions:
  - **Upload**: Send individual log to cloud (encrypted)
  - **Purge**: Remove local copy after confirmed cloud upload
- Status badges show current state: Pending (amber), Uploaded (green), Failed (red), Purged (gray)

#### Firmware Update
Check for and apply firmware updates:
- **Check for Updates**: Queries cloud for available firmware packages
- Each update shows: version number, device type, file size, release date, description
- **Download**: Fetch firmware from cloud (progress bar shown)
- **Transfer to Drive**: Send downloaded firmware to Sync-V Drive for application
- Real-time progress tracking for both download and transfer phases

#### Settings
Configure app behavior:
- **Drive Connection**: Set IP address and port for Sync-V Drive
- **Upload Preferences**: Toggle auto-upload when online, toggle log encryption
- **Network Status**: View current connection state, drive/cloud reachability
- **About**: App version and build info

---

## 5. Backend API Usage

The backend runs as a Node.js Express server with SQLite storage.

### Starting the Backend

```bash
cd backend
npm install         # Install dependencies
npx tsc             # Compile TypeScript
node dist/index.js  # Start server on port 3000
```

Environment variables:
- `PORT` — Server port (default: 3000)
- `JWT_SECRET` — JWT signing secret (default: dev secret)
- `DB_PATH` — SQLite file path (default: `:memory:`)
- `SEED_DEMO_DATA` — Set to `true` to seed demo data on startup (Docker/Railway)

### Seeding Demo Data

```bash
cd backend
npx tsc && node dist/seed.js
```

This creates:
- **Platform admin**: `platform-admin` / `admin123`
- **Acme Industries** (pro plan): admin (`admin`/`admin123`), technician (`tech1`/`tech123`), viewer (`viewer1`/`viewer123`)
- 4 devices, 8 logs, 2 firmware packages, 2 clusters
- 3 AI anomalies, 4 health scores, 8 log summaries, 1 webhook (`anomaly.detected` + `log.uploaded`)
- **Beta Corp** (free plan): admin (`beta-admin`/`beta123`)

### REST API Quick Reference

All `/api/*` routes (except auth) require a `Bearer` token in the `Authorization` header.

#### Authentication
```bash
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret123", "role": "admin"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret123"}'
# → {"token": "eyJ...", "user": {"id": "...", "username": "admin", "role": "admin"}}
```

#### Devices
```bash
TOKEN="eyJ..."

# Register a device
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "PUMP-001", "name": "Main Cooling Pump", "type": "typeA", "status": "online"}'

# List all devices
curl http://localhost:3000/api/devices -H "Authorization: Bearer $TOKEN"

# Get by ID
curl http://localhost:3000/api/devices/PUMP-001 -H "Authorization: Bearer $TOKEN"

# Filter by type or status
curl http://localhost:3000/api/devices/type/typeA -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/devices/status/online -H "Authorization: Bearer $TOKEN"
```

#### Logs
```bash
# Upload a log
curl -X POST http://localhost:3000/api/logs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "PUMP-001", "filename": "sensor.csv", "size": 4096, "checksum": "<64-char-hex>", "rawData": "..."}'

# List all logs
curl http://localhost:3000/api/logs -H "Authorization: Bearer $TOKEN"

# Verify integrity
curl "http://localhost:3000/api/logs/verify/<logId>?checksum=<hex>" -H "Authorization: Bearer $TOKEN"
```

#### Firmware
```bash
# Upload firmware (admin/technician only)
curl -X POST http://localhost:3000/api/firmware \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": "2.0.0", "deviceType": "typeA", "filename": "fw.bin", "size": 10240, "sha256": "<64-char-hex>"}'

# Get latest for device type
curl http://localhost:3000/api/firmware/device/typeA/latest -H "Authorization: Bearer $TOKEN"
```

#### Dashboard
```bash
# Fleet overview
curl http://localhost:3000/api/dashboard/overview -H "Authorization: Bearer $TOKEN"

# Device detail with logs
curl http://localhost:3000/api/dashboard/device/PUMP-001 -H "Authorization: Bearer $TOKEN"
```

### Programmatic Usage

The backend also exports `createApp()` for embedding or testing:

```typescript
import { createApp } from './index';

const { app, db } = createApp('./data/syncv.db');
app.listen(3000);
```

### Web Admin Dashboard

The backend includes built-in web dashboards at `/dashboard` and `/dashboard/platform/`.

1. Start the server: `node dist/index.js`
2. Open `http://localhost:3000/` in your browser (redirects to `/dashboard/`)
3. Login with an org user (e.g. `admin` / `admin123`)
4. Navigate between: **Overview**, **Devices**, **Logs**, **Firmware**, **AI Insights**, **Clusters**, **Team**, **Webhooks**, **Audit**, **Usage**

#### Platform Admin Dashboard

1. Open `http://localhost:3000/dashboard/platform/`
2. Login with the platform admin (e.g. `platform-admin` / `admin123`)
3. Manage organizations, users, quotas, and view platform-wide audit logs

The dashboards use the same REST API endpoints and JWT authentication as the mobile app.

### AI Endpoints

```bash
# List anomalies (paginated)
curl "http://localhost:3000/api/ai/anomalies?page=1&limit=10" -H "Authorization: Bearer $TOKEN"

# Resolve an anomaly
curl -X POST http://localhost:3000/api/ai/anomalies/<id>/resolve -H "Authorization: Bearer $TOKEN"

# Get fleet health scores
curl http://localhost:3000/api/ai/health -H "Authorization: Bearer $TOKEN"

# Refresh health scores (rate-limited: 60s cooldown)
curl -X POST http://localhost:3000/api/ai/health/refresh -H "Authorization: Bearer $TOKEN"

# Get log AI summary
curl http://localhost:3000/api/ai/summary/<logId> -H "Authorization: Bearer $TOKEN"

# Get AI overview (avg health, anomaly counts, attention needed)
curl http://localhost:3000/api/dashboard/ai-overview -H "Authorization: Bearer $TOKEN"
```

### WebSocket Real-Time Alerts

Connect to receive live anomaly and health update notifications:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?token=<JWT>');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: 'connected' | 'anomaly.detected' | 'health.updated'
  console.log(msg.type, msg.data);
};
```

---

## 6. Drive Module Usage

The drive module is a C++ static library. Link `syncv_drive` in your CMake project.

### Log Collection
```cpp
#include "LogCollector.h"

syncv::LogCollector collector;
auto logs = collector.collectFromDirectory("/device/logs", true);  // recursive

for (const auto& log : logs) {
    std::cout << log.filename << " (" << log.fileSize << " bytes)\n";
    // log.content contains file data
}
```

### Hashing & Verification
```cpp
#include "HashVerifier.h"

syncv::HashVerifier verifier;
std::string hash = verifier.hashFile("/path/to/file.bin");
bool valid = verifier.verifyFile("/path/to/file.bin", expectedHash);
```

### Encrypted Storage
```cpp
#include "EncryptedStorage.h"

syncv::EncryptedStorage storage("32-byte-encryption-key-here!!!!!");

std::string encrypted = storage.encrypt("sensitive log data");
std::string decrypted = storage.decrypt(encrypted);

storage.storeToFile("/secure/data.enc", "plaintext data");
std::string loaded = storage.loadFromFile("/secure/data.enc");
```

### Metadata Parsing
```cpp
#include "MetadataExtractor.h"

syncv::MetadataExtractor extractor;

// Parse built-in format
auto meta = extractor.extract("device_id=PUMP-001\nfirmware_version=1.0\n", "typeA");

// Register custom parser
extractor.registerParser("myDevice", [](const std::string& raw) {
    syncv::DeviceMetadata m;
    // ... custom parsing ...
    return m;
});
```

### Firmware Workflow
```cpp
#include "FirmwareReceiver.h"

syncv::FirmwareReceiver receiver("/staging", "/installed");

receiver.receive("fw.bin", firmwareData);

if (receiver.verifyIntegrity("fw.bin", expectedHash)) {
    receiver.apply("fw.bin");
    // Status: Applied
}
```

---

## 7. Common Workflows

### Collect Logs from a Device
1. Connect mobile phone to Sync-V Drive Wi-Fi
2. Open app → Dashboard → tap "Upload Logs"
3. Pull down to refresh — logs from drive appear
4. Tap "Upload All" or upload individually
5. After cloud confirmation, tap "Purge" to free drive space

### Apply a Firmware Update
1. Ensure mobile has internet connectivity
2. Open app → Dashboard → tap "Firmware"
3. Tap "Check for Updates"
4. Tap "Download" on available update (progress bar shown)
5. Connect to Sync-V Drive Wi-Fi
6. Tap "Transfer to Drive" (progress bar shown)
7. Drive verifies hash and applies update

### Register a New Device Type
1. Write a parser function (C++ on drive, TypeScript on mobile/backend)
2. Register it: `extractor.registerParser("newType", parserFn)`
3. No other code changes needed — the system handles new types automatically

---

## 8. Troubleshooting

### Drive tests fail to build
- Ensure CMake 3.14+ and a C++17 compiler are installed
- On first build, GoogleTest is downloaded from GitHub — check internet connectivity
- If using MSVC, build in Release mode: `cmake --build build --config Release`

### Mobile tests fail
- Run `npm install` to ensure all dependencies are installed
- Check Node.js version: `node --version` (requires 18+)
- Clear Jest cache: `npx jest --clearCache`

### Backend tests fail
- `better-sqlite3` requires native compilation; ensure build tools are available
- On Windows: Visual Studio Build Tools with C++ workload
- Run `npm rebuild better-sqlite3` if native module is corrupt

### Integration tests fail
- Ensure both `mobile/` and `backend/` have `npm install` completed
- Integration tests import from sibling directories — don't move the folder structure

### "Cannot find module" errors
- Check `tsconfig.json` path mappings match directory structure
- Run `npx tsc --noEmit` to see TypeScript compilation errors
