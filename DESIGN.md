# Sync-V — Design Document

## 1. System Overview

Sync-V is a three-tier industrial IoT pipeline for secure data transfer between heterogeneous field devices and a centralized fleet management system.

```
┌──────────┐     ┌─────────────┐     ┌──────────┐     ┌───────────┐
│  Device   │────▸│  Sync-V     │◂───▸│  Mobile  │◂───▸│   Cloud   │
│ (sensor,  │     │  Drive      │     │  App     │     │  Backend  │
│  PLC,     │     │  (C++ on    │     │  (React  │     │  (Node.js │
│  motor)   │     │   Pi2W)     │     │  Native) │     │  +SQLite) │
└──────────┘     └─────────────┘     └──────────┘     └───────────┘
                  ▲ Encrypted         ▲ Wi-Fi           ▲ HTTPS
                  ▲ at rest           ▲ local            ▲ Internet
```

### Data Flows

**A. Log Collection (field → cloud)**
```
Device → Drive (collect + hash + encrypt) → Mobile (fetch over Wi-Fi) → Cloud (upload + index)
```

**B. Firmware Updates (cloud → field)**
```
Cloud (signed package) → Mobile (download) → Drive (verify + apply) → Device
```

---

## 2. Drive Module (C++)

The drive runs on resource-constrained hardware (Raspberry Pi Zero 2W or similar). It is the secure intermediary between devices and the mobile app.

### 2.1 LogCollector
- **Purpose**: Scan device filesystems for log files of any format.
- **Design**: Uses `std::filesystem` directory iteration. Supports recursive and non-recursive modes. Reads entire files into memory as `LogEntry` structs containing filename, content, full path, and size.
- **Limitation**: Files are loaded entirely into RAM. For very large logs, a streaming approach would be needed.

### 2.2 HashVerifier
- **Purpose**: SHA256 hashing for integrity verification.
- **Design**: Pure C++ implementation — no OpenSSL or external crypto dependency. This ensures portability to bare-metal and embedded targets.
- **Key detail**: `verifyFile()` uses constant-time comparison to prevent timing attacks.
- **API**:
  - `hashString(data)` → hex string
  - `hashFile(path)` → hex string (streams in 8KB chunks)
  - `verifyFile(path, expectedHash)` → bool

### 2.3 EncryptedStorage
- **Purpose**: AES-256-CBC encryption for data at rest.
- **Design**: Pure C++ AES implementation with SBOX/InvSBOX tables, MixColumns using Galois Field multiplication. Random IV per encryption via `std::random_device`. PKCS7 padding.
- **Security properties**:
  - Random IV → same plaintext produces different ciphertext each time
  - Key derived from 32-byte input string
  - Ciphertext format: `[16-byte IV][encrypted blocks...]`
- **API**:
  - `encrypt(plaintext)` / `decrypt(ciphertext)` — in-memory
  - `storeToFile(path, plaintext)` / `loadFromFile(path)` — disk persistence

### 2.4 MetadataExtractor
- **Purpose**: Parse device-specific metadata formats into a common schema.
- **Design**: Registry pattern. Built-in parsers for two formats:
  - **Type A**: Line-delimited `key=value` format
  - **Type B**: Flat JSON objects (`{"id":"...","fw":"..."}`)
- **Extensibility**: `registerParser(deviceType, parserFunction)` adds support for new device types at runtime.
- **Output schema**: `DeviceMetadata { deviceId, deviceType, firmwareVersion, fields, parseSuccessful }`

### 2.5 WiFiServer
- **Purpose**: HTTP-like API served over local Wi-Fi for mobile communication.
- **Design**: File serving from a root directory with strict path validation:
  - Rejects `..`, `/`, `\`, null bytes, drive letters, hidden files
  - Resolves paths via `std::filesystem::weakly_canonical` to verify containment
- **Authentication**: Pre-shared token with constant-time comparison. Token must be >= 16 characters.
- **API**:
  - `getFileList()` → list of available files
  - `getFileContent(filename)` → file data
  - `receiveFirmware(filename, data)` → store incoming firmware

### 2.6 FirmwareReceiver
- **Purpose**: Staged firmware receive → verify → apply workflow.
- **Design**: Two-directory model:
  - `staging/` — incoming, unverified firmware
  - `installed/` — verified, applied firmware
- **State machine**: `NotFound → Received → Verified → Applied` (or `Failed`)
- **Safety**: `apply()` requires prior `verifyIntegrity()` call — cannot apply unverified firmware.

### 2.7 TransferManager
- **Purpose**: Reliable file transfer with resume, retry, and progress.
- **Design**:
  - Chunked transfers (configurable chunk size, default 64KB)
  - Resume via `recordPartialTransfer()` + `resumeTransfer()` — appends from offset
  - Exponential backoff retry via `retryWithBackoff(operation)`
  - Progress callback with monotonically increasing percentage
  - Transfer speed measurement (bytes/second)

---

## 3. Mobile App (React Native + TypeScript)

### 3.1 Architecture

Services use dependency injection for testability. All services have mock capabilities for testing without hardware.

```
AppNavigator
├── DashboardScreen     — Fleet overview, connection status, quick actions
├── DeviceListScreen    — Device discovery + metadata display
├── LogsUploadScreen    — Log list, upload, queue management, purge
├── FirmwareUpdateScreen — Update check, download, transfer with progress
└── SettingsScreen      — Connection config, upload preferences, network status
```

### 3.2 NetworkService
- Tracks `isConnected`, `connectionType`, `isDriveReachable`, `isCloudReachable`
- Listener pattern with unsubscribe support
- Protected callback execution (one listener error doesn't break others)

### 3.3 DriveCommService
- Discovers drive on local Wi-Fi (mock: `setMockDriveAddress`)
- File list + content retrieval from drive
- Firmware transfer to drive
- Custom `DriveConnectionError` for connection failure handling

### 3.4 LogsService
- **Offline queue**: When cloud is unreachable, uploads are queued with retry tracking
- **Queue processing**: `processUploadQueue()` with per-item attempt counting
- **Status tracking**: Per-log status (`pending → uploading → uploaded → purged`)
- **Purge safety**: Only uploaded logs can be purged

### 3.5 FirmwareService
- Update availability check by device type + current version
- Download with progress callbacks
- Transfer to drive with progress callbacks
- SHA256 integrity verification

### 3.6 MetadataParserRegistry
- Same extensible pattern as Drive's C++ extractor
- Built-in TypeA (key=value) and TypeB (JSON) parsers
- Custom parsers via `registerParser()`

### 3.7 UI Design Principles
- **Color scheme**: Indigo (#6366f1) primary, slate grays for text, white cards on light gray background
- **Status indicators**: Color-coded badges (green=ok, amber=warning, red=error)
- **Card-based layout**: Information grouped into white rounded cards with subtle shadows
- **Pull-to-refresh**: All list screens support pull-to-refresh
- **Empty states**: Informative messages with action buttons when no data
- **Progress feedback**: Real-time progress bars for firmware operations

---

## 4. Cloud Backend (Node.js + TypeScript + SQLite)

### 4.1 Database Schema

```sql
devices (id, name, type, status, firmware_version, last_seen, metadata JSON, timestamps)
logs    (id, device_id FK, filename, size, checksum, raw_path, metadata JSON, uploaded_at)
firmware(id, version, device_type, filename, size, sha256, description, release_date, timestamps)
users   (id, username UNIQUE, password_hash, role, created_at)
```

- `metadata` fields store heterogeneous device data as JSON strings
- `raw_path` separates log storage location from metadata — AI can index metadata without touching raw files

### 4.2 DeviceRegistry Service
- Register devices with type, status, firmware version, and arbitrary metadata
- Query by type, status, or ID
- Merge-update metadata (existing fields preserved, new fields added)

### 4.3 LogIngestion Service
- Validates: SHA256 format (regex: `/^[0-9a-f]{64}$/`), filename safety, positive size
- Deduplicates by checksum
- Stores raw path reference + metadata separately
- Integrity verification by log ID + checksum

### 4.4 FirmwareDistribution Service
- Upload signed firmware packages with version + device type
- Query available firmware by device type
- Get latest version per device type (ordered by release_date DESC, rowid DESC)
- Download verification by ID + SHA256

### 4.5 Auth & Authorization
- **JWT-based**: Tokens with configurable expiry (default 24h)
- **Role hierarchy**: `admin (3) > technician (2) > viewer (1)` — higher roles inherit lower permissions
- **Password hashing**: SHA256 for dev (replace with bcrypt for production)
- **Rate limiter**: Sliding window per client ID, configurable max requests and window size

### 4.6 Dashboard Service
- Fleet overview: total/online/offline devices, total logs, device types
- Per-device detail: device record + log count + recent logs
- Firmware status summary: counts by device type
- Log upload history: ordered by upload time

### 4.7 Input Validation (`utils/validation.ts`)
- `isValidSha256(hash)` — regex validation for hex SHA256
- `isValidDeviceId(id)` — alphanumeric + hyphens/underscores, max 128 chars
- `isValidFilename(filename)` — rejects traversal, separators, null bytes, drive letters

### 4.8 Express REST API (`index.ts` + `routes/`)

The backend exposes a RESTful API via Express. `createApp(dbPath?)` returns an Express app + database handle for both production use and testing.

**Middleware chain**: JSON body parser (10MB limit) → Rate limiter → Auth (per-route)

| Route                                   | Method | Auth      | Description                     |
|-----------------------------------------|--------|-----------|---------------------------------|
| `/health`                               | GET    | None      | Health check                    |
| `/api/auth/login`                       | POST   | None      | Authenticate, get JWT           |
| `/api/auth/register`                    | POST   | Optional  | Register new user               |
| `/api/devices`                          | GET    | viewer+   | List all devices                |
| `/api/devices`                          | POST   | viewer+   | Register a device               |
| `/api/devices/type/:type`               | GET    | viewer+   | Filter devices by type          |
| `/api/devices/status/:status`           | GET    | viewer+   | Filter devices by status        |
| `/api/devices/:id`                      | GET    | viewer+   | Get device by ID                |
| `/api/devices/:id/metadata`             | PATCH  | viewer+   | Update device metadata          |
| `/api/devices/:id/status`               | PATCH  | viewer+   | Update device status            |
| `/api/logs`                             | GET    | viewer+   | List all logs                   |
| `/api/logs`                             | POST   | viewer+   | Ingest a log                    |
| `/api/logs/device/:deviceId`            | GET    | viewer+   | Logs for a device               |
| `/api/logs/verify/:logId?checksum=`     | GET    | viewer+   | Verify log integrity            |
| `/api/firmware`                         | GET    | viewer+   | List all firmware               |
| `/api/firmware`                         | POST   | tech+     | Upload firmware package         |
| `/api/firmware/device/:type`            | GET    | viewer+   | Firmware for device type        |
| `/api/firmware/device/:type/latest`     | GET    | viewer+   | Latest firmware for type        |
| `/api/firmware/verify/:id?sha256=`      | GET    | viewer+   | Verify firmware integrity       |
| `/api/firmware/:id`                     | GET    | viewer+   | Get firmware by ID              |
| `/api/dashboard/overview`               | GET    | viewer+   | Fleet overview                  |
| `/api/dashboard/device/:id`             | GET    | viewer+   | Device detail with logs         |
| `/api/dashboard/firmware`               | GET    | viewer+   | Firmware status summary         |
| `/api/dashboard/logs`                   | GET    | viewer+   | Log upload history              |

---

## 5. Integration Test Coverage

| Test Suite               | What It Validates                                           |
|--------------------------|-------------------------------------------------------------|
| `mobile_drive.test.ts`   | Discovery, metadata parsing, firmware transfer, reconnection|
| `mobile_cloud.test.ts`   | Log upload, firmware download, offline queue auto-retry     |
| `firmware_e2e.test.ts`   | Full pipeline: cloud → mobile → drive; drive → mobile → cloud |
| `failure_simulation.test.ts` | Network loss, corruption detection, service degradation  |

---

## 6. Security Model

| Layer           | Mechanism                          | Status        |
|-----------------|------------------------------------|---------------|
| Drive at rest   | AES-256-CBC with random IV         | Implemented   |
| Drive Wi-Fi     | Pre-shared token, constant-time    | Implemented   |
| Hash comparison | Constant-time XOR                  | Implemented   |
| Path safety     | Canonical path resolution + deny list | Implemented |
| Cloud auth      | JWT with role hierarchy            | Implemented   |
| Cloud rate limit| Sliding window per client          | Implemented   |
| Input validation| SHA256 format, filename, device ID | Implemented   |
| TLS/HTTPS       | Not yet (Stage 2)                  | Planned       |
| Password storage| bcrypt (currently SHA256 for dev)  | Planned       |

---

## 7. Stage 2 Extension Points

| Extension              | Integration Point                                         |
|------------------------|-----------------------------------------------------------|
| AI anomaly detection   | Read from `logs` table metadata; add `/ai/anomalies` route |
| Predictive maintenance | Read from `devices` table; add `/ai/predictions` route     |
| Edge AI on Drive       | Add parser module to MetadataExtractor registry            |
| Real-time streaming    | Add WebSocket endpoint to backend                          |
| Production database    | Swap SQLite for PostgreSQL; same model interfaces          |
| TLS on Drive Wi-Fi     | Wrap WiFiServer with mbedTLS                               |
