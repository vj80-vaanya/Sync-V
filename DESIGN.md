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
                  ▲ AES-256-CBC       ▲ Opaque blob     ▲ HTTPS
                  ▲ E2E encrypt       ▲ passthrough      ▲ Decrypt
```

### Data Flows

**A. Log Collection — E2E Encrypted (field → cloud)**
```
Device → Drive (collect + AES-256-CBC encrypt with per-device PSK)
       → Mobile (fetch opaque base64 blob over Wi-Fi — NO decryption)
       → Cloud (receive blob + look up PSK by deviceId + decrypt + store plaintext)
```

**B. Firmware Updates — Two-Phase (cloud → field)**
```
Phase 1: Cloud → Mobile (download firmware, store locally)
Phase 2: Mobile → Drive (deliver when connected, delete local copy on success)
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
- **E2E Encryption**: When an encryption key is configured via `setEncryptionKey(hexKey)`, all file content returned by `getFileContent()` is encrypted with AES-256-CBC (random IV) and base64-encoded before serving. Mobile receives opaque blobs — never plaintext. Without a key, raw data is returned (backwards-compatible).
- **API**:
  - `getFileList()` → list of available files
  - `getFileContent(filename)` → encrypted base64 blob (or raw if no key)
  - `receiveFirmware(filename, data)` → store incoming firmware
  - `setEncryptionKey(hexKey)` → enable AES-256-CBC encryption
  - `isEncryptionEnabled()` → check if encryption is active

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

### 3.4 LogsService (Opaque Blob Router)
- **E2E passthrough**: Receives pre-encrypted base64 blobs from drive — no decryption, no key access
- **Storage**: Opaque blobs persisted to SecureStore filesystem with metadata only (filename, size, deviceId)
- **Upload**: Forwards `{ deviceId, rawData: "<base64 blob>" }` to cloud — cloud decrypts server-side
- **Checksum**: SHA256 computed on the encrypted blob (not plaintext) for deduplication
- **Offline queue**: When cloud is unreachable, uploads are queued with retry tracking (max 3 attempts)
- **Auto-delete**: Blobs permanently deleted from device after successful cloud upload
- **Status tracking**: Per-log status (`pending → uploading → uploaded → purged`)

### 3.5 FirmwareService (Two-Phase Delivery)
- **Phase 1 — Download**: `downloadFirmware(pkg)` fetches from cloud `GET /api/firmware/:id/download`, stores locally
- **Phase 2 — Deliver**: `deliverToDrive(pkg)` sends stored firmware to drive, deletes local copy on success
- **Separation**: Download and deliver are independent actions — user controls when each happens
- **Failure handling**: Local copy preserved if drive transfer fails; retry without re-download
- **Progress callbacks**: Tracks downloading, transferring, and complete phases
- **SHA256 integrity verification**: Validates firmware hash before transfer

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

### 4.1 Multi-Tenancy Architecture

The backend is a multi-tenant platform with organization isolation. Every data record is scoped to an organization via `org_id` foreign keys.

**Role hierarchy**: `platform_admin (4) > org_admin (3) > technician (2) > viewer (1)`

- **Platform admin**: Manages organizations, plans, and quotas. **Cannot** access org-sensitive data (logs, firmware, PSK).
- **Org admin**: Full control within their organization — users, devices, clusters, API keys, webhooks.
- **Technician**: Field operations — log upload, firmware update, device registration.
- **Viewer**: Read-only dashboard access within their organization.

Data isolation is enforced at the middleware level: JWT tokens carry `orgId`, and all model queries filter by it. The `requireOrgAccess` middleware blocks platform admins from org-data routes. The `requirePlatformAdmin` middleware restricts platform management routes.

### 4.2 Database Schema

```sql
-- Core tables
organizations (id, name, slug UNIQUE, plan, max_devices, max_storage_bytes, max_users, status, timestamps)
users         (id, username UNIQUE, password_hash, role, org_id FK, created_at, updated_at)
devices       (id, name, type, status, firmware_version, last_seen, metadata JSON, org_id FK, cluster_id FK, timestamps)
logs          (id, device_id FK, filename, size, checksum, raw_path, metadata JSON, org_id FK, uploaded_at)
firmware      (id, version, device_type, filename, size, sha256, description, org_id FK, release_date, timestamps)
device_keys   (device_id PK FK→devices, psk TEXT, created_at, rotated_at)

-- Multi-tenant tables
clusters      (id, org_id FK, name, description, timestamps)
audit_logs    (id, org_id FK, actor_id, actor_type, action, target_type, target_id, details JSON, ip_address, created_at)
api_keys      (id, org_id FK, name, key_hash, key_prefix, permissions JSON, last_used_at, created_by, created_at)
webhooks      (id, org_id FK, url, secret, events JSON, is_active, last_triggered_at, failure_count, created_at)
```

- `metadata` fields store heterogeneous device data as JSON strings
- `raw_path` separates log storage location from metadata — AI can index metadata without touching raw data
- `device_keys` stores per-device pre-shared keys (PSK) for E2E decryption — write-only (never returned in API responses)
- `org_id` on all data tables enforces tenant isolation
- `clusters` groups devices within an organization for fleet management

### 4.3 DeviceRegistry Service
- Register devices with type, status, firmware version, and arbitrary metadata
- Query by type, status, or ID
- Merge-update metadata (existing fields preserved, new fields added)

### 4.4 LogIngestion Service (E2E Decryption)
- Validates: SHA256 format (regex: `/^[0-9a-f]{64}$/`), filename safety, positive size
- **E2E decryption**: On ingest, looks up PSK by `deviceId` in `device_keys` table. If PSK exists and payload passes `isEncryptedPayload()`, decrypts AES-256-CBC → stores plaintext. Checksum recomputed from plaintext.
- **Backwards-compatible**: If no PSK or payload isn't encrypted, stores data as-is
- **Graceful failure**: If decryption throws (wrong key, corrupted data), falls back to storing raw data
- Deduplicates by checksum
- Integrity verification by log ID + checksum

### 4.5 FirmwareDistribution Service
- Upload signed firmware packages with version + device type
- Query available firmware by device type
- Get latest version per device type (ordered by release_date DESC, rowid DESC)
- Download verification by ID + SHA256

### 4.6 Auth & Authorization
- **Dual auth**: JWT tokens + API keys (`svk_` prefix, SHA256-hashed for storage)
- **Role hierarchy**: `platform_admin (4) > org_admin (3) > technician (2) > viewer (1)` — higher roles inherit lower permissions
- **Org isolation**: JWT tokens carry `orgId`; all queries filter by it; `requireOrgAccess` middleware blocks platform admins from org data
- **Bootstrap**: `POST /api/auth/bootstrap` creates the first platform admin (one-time, only when no users exist)
- **Password hashing**: SHA256 for dev (replace with bcrypt for production)
- **Rate limiter**: Sliding window per client ID, configurable max requests and window size

### 4.7 Dashboard Service
- Fleet overview: total/online/offline devices, total logs, device types (org-scoped)
- Per-device detail: device record + log count + recent logs
- Firmware status summary: counts by device type
- Log upload history: ordered by upload time
- Cluster dashboard: cluster detail with device count, online count, recent logs

### 4.8 Platform Services
- **AuditService**: Logs all operations (user, device, firmware, PSK, cluster, webhook, API key events). Platform admin sees structural events only; org admin sees all org events.
- **WebhookDispatcher**: HMAC-SHA256 signed HTTP POST to registered URLs on events (device.online, log.uploaded, firmware.uploaded, psk.rotated, quota.warning, etc.). Auto-disables after 10 consecutive failures.
- **QuotaService**: Enforces per-org limits (devices, storage, users) based on plan tier (free/pro/enterprise). Fires `quota.warning` at 80% and `quota.exceeded` at 100%.
- **PlatformDashboardService**: Cross-org aggregation — total orgs, devices, users, plan distribution, per-org usage summaries with quota percentages.

### 4.9 Input Validation (`utils/validation.ts`)
- `isValidSha256(hash)` — regex validation for hex SHA256
- `isValidDeviceId(id)` — alphanumeric + hyphens/underscores, max 128 chars
- `isValidFilename(filename)` — rejects traversal, separators, null bytes, drive letters

### 4.10 Express REST API (`index.ts` + `routes/`)

The backend exposes a RESTful API via Express. `createApp(dbPath?)` returns an Express app + database handle for both production use and testing.

**Middleware chain**: JSON body parser (10MB limit) → Rate limiter → Auth (per-route) → Org scoping

#### Public Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check |
| `/api/auth/bootstrap` | POST | Create first platform admin (one-time) |
| `/api/auth/login` | POST | Authenticate, get JWT with orgId |

#### Platform Admin Routes (`requirePlatformAdmin`)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/platform/overview` | GET | Platform-wide stats |
| `/api/platform/organizations` | GET/POST | List/create organizations |
| `/api/platform/organizations/:id` | GET/PATCH/DELETE | Org detail/update/delete |
| `/api/platform/organizations/:id/suspend` | PATCH | Suspend org |
| `/api/platform/organizations/:id/activate` | PATCH | Reactivate org |
| `/api/platform/organizations/:id/users` | POST | Create user in org |
| `/api/platform/audit` | GET | Structural audit events |

#### Org Admin Routes (`requireAuth('org_admin')`)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/org/users` | GET/POST | List/create team members |
| `/api/org/users/:userId` | PATCH/DELETE | Update role/remove user |
| `/api/org/api-keys` | GET/POST | List/create API keys |
| `/api/org/api-keys/:keyId` | DELETE | Revoke API key |
| `/api/org/webhooks` | GET/POST | List/create webhooks |
| `/api/org/webhooks/:id` | PATCH/DELETE | Update/delete webhook |
| `/api/org/audit` | GET | Org audit log |
| `/api/org/usage` | GET | Quota usage summary |
| `/api/auth/register` | POST | Register user in own org |

#### Cluster Routes (`requireAuth('viewer')`, org-scoped)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/clusters` | GET/POST | List/create clusters |
| `/api/clusters/:id` | GET/PATCH/DELETE | Cluster detail/update/delete |
| `/api/clusters/:id/devices` | POST | Assign devices |
| `/api/clusters/:id/devices/:deviceId` | DELETE | Remove device |
| `/api/clusters/:id/dashboard` | GET | Cluster dashboard |

#### Device Routes (`requireAuth('viewer')`, org-scoped)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/devices` | GET/POST | List/register devices |
| `/api/devices/type/:type` | GET | Filter by type |
| `/api/devices/status/:status` | GET | Filter by status |
| `/api/devices/:id` | GET | Get device by ID |
| `/api/devices/:id/metadata` | PATCH | Update metadata |
| `/api/devices/:id/status` | PATCH | Update status |
| `/api/devices/:id/psk` | PATCH/DELETE | Set/rotate/revoke PSK |

#### Log Routes (`requireAuth('viewer')` + `requireOrgAccess`)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/logs` | GET/POST | List/ingest logs |
| `/api/logs/:id` | GET | Get log by ID |
| `/api/logs/:id/raw` | GET | Download raw content |
| `/api/logs/device/:deviceId` | GET | Logs for a device |
| `/api/logs/filters` | GET | Available filter values |
| `/api/logs/verify/:logId` | GET | Verify integrity |

#### Firmware Routes (`requireAuth('viewer')` + `requireOrgAccess`)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/firmware` | GET/POST | List/upload firmware |
| `/api/firmware/device/:type` | GET | Firmware for device type |
| `/api/firmware/device/:type/latest` | GET | Latest firmware |
| `/api/firmware/verify/:id` | GET | Verify integrity |
| `/api/firmware/:id` | GET | Get firmware by ID |
| `/api/firmware/:id/download` | GET | Download firmware (base64) |
| `/api/firmware/:id` | DELETE | Delete firmware |

#### Dashboard Routes (`requireAuth('viewer')` + `requireOrgAccess`)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/dashboard/overview` | GET | Fleet overview (org-scoped) |
| `/api/dashboard/device/:id` | GET | Device detail with logs |
| `/api/dashboard/firmware` | GET | Firmware status summary |
| `/api/dashboard/logs` | GET | Log upload history |
| `/api/dashboard/clusters` | GET | Cluster summary |

### 4.11 Web Admin Dashboards (`public/`)

Multi-page web dashboards served by `express.static` at `/dashboard`. No build step — vanilla HTML/CSS/JS using `fetch()` to call the REST API.

#### Org Dashboard (`public/`)
| Page | File | Purpose |
|------|------|---------|
| Login | `index.html` | JWT authentication, auto-redirect |
| Overview | `overview.html` | Fleet stats with cluster summary + quota usage |
| Devices | `devices.html` | Device list with type/status/cluster filters |
| Device Detail | `device-detail.html` | Single device metadata + recent logs |
| Logs | `logs.html` | Log browser with device filter, pagination |
| Firmware | `firmware.html` | Firmware list + upload form (admin/tech) |
| Clusters | `clusters.html` | Cluster management + device assignment |
| Team | `team.html` | User management: create, role change, remove |
| API Keys | `api-keys.html` | API key management: create (show once), revoke |
| Webhooks | `webhooks.html` | Webhook configuration: URL, events, test |
| Audit Log | `audit.html` | Org audit log with date/action filters |
| Usage | `usage.html` | Quota usage dashboard with progress bars |

#### Platform Dashboard (`public/platform/`)
| Page | File | Purpose |
|------|------|---------|
| Login | `index.html` | Platform admin login |
| Overview | `overview.html` | Total orgs, devices, users, plan distribution |
| Organizations | `organizations.html` | Org list with usage bars, create/edit |
| Org Detail | `org-detail.html` | Single org: quotas, user count, device count |
| Audit Log | `audit.html` | Structural audit log with date filters |

**Design**: Indigo (#6366f1) primary, slate grays, white cards with 12px radius — matches mobile app. Quota bars: green < 60%, amber < 80%, red >= 80%.
**Auth**: JWT in localStorage, `Bearer` header on all API calls, auto-logout on 401.

---

## 5. Integration Test Coverage

| Test Suite               | What It Validates                                           |
|--------------------------|-------------------------------------------------------------|
| `mobile_drive.test.ts`   | Discovery, metadata parsing, firmware transfer, reconnection|
| `mobile_cloud.test.ts`   | Log upload, firmware download, offline queue auto-retry     |
| `firmware_e2e.test.ts`   | Full pipeline: cloud → mobile → drive; drive → mobile → cloud |
| `failure_simulation.test.ts` | Network loss, corruption detection, service degradation  |
| `corrupted_data_e2e.test.ts` | Hash tampering, zero-size files, malformed metadata, injection |

---

## 6. Security Model

| Layer           | Mechanism                          | Status        |
|-----------------|------------------------------------|---------------|
| **E2E encryption** | **Drive encrypts (AES-256-CBC + PSK) → Mobile routes opaque blob → Cloud decrypts** | **Implemented** |
| Per-device PSK  | Each drive has unique 32-byte key; compromise of one drive doesn't expose others | Implemented |
| Drive at rest   | AES-256-CBC with random IV         | Implemented   |
| Drive Wi-Fi     | Pre-shared token, constant-time    | Implemented   |
| Mobile isolation| No keys, no decryption, opaque blob storage only, auto-delete after upload | Implemented |
| Hash comparison | Constant-time XOR                  | Implemented   |
| Path safety     | Canonical path resolution + deny list | Implemented |
| Cloud auth      | JWT + API keys, 4-tier role hierarchy | Implemented |
| Multi-tenancy   | Org isolation via org_id + middleware  | Implemented |
| Platform boundary| Platform admin blocked from org data  | Implemented |
| Audit logging   | All operations logged per org         | Implemented |
| Cloud rate limit| Sliding window per client          | Implemented   |
| Cloud decryption| PSK lookup by deviceId → AES-256-CBC decrypt → store plaintext | Implemented |
| Input validation| SHA256 format, filename, device ID | Implemented   |
| TLS/HTTPS       | Not yet (Stage 2)                  | Planned       |
| Password storage| bcrypt (currently SHA256 for dev)  | Planned       |
| Cert pinning    | Mobile → Cloud TLS pinning         | Planned       |
| Webhook signing | HMAC-SHA256 for webhook payloads   | Implemented   |
| Quota enforcement| Per-org resource limits            | Implemented   |

### 6.1 E2E Encryption Wire Format

```
Drive side:   plaintext → AES-256-CBC(plaintext, PSK, random_IV) → [16-byte IV][ciphertext] → base64 encode
Transport:    base64 string over HTTP (drive→mobile) and HTTPS (mobile→cloud)
Cloud side:   base64 decode → split IV (first 16 bytes) + ciphertext → AES-256-CBC decrypt → PKCS7 unpad → plaintext
```

Mobile never holds a PSK and cannot decrypt any log data. It stores, forwards, and deletes opaque blobs.

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
