# Sync-V — Context Document

Quick-start reference for resuming development on the Sync-V project.

## What Is Sync-V?

Sync-V is an industrial IoT data pipeline that moves data between field devices, a local intermediary (the "Drive"), a mobile app, and a cloud backend.

```
Device <---> [Sync-V Drive] <--Wi-Fi--> [Mobile App] <--Internet--> [Cloud Backend]
```

**Stage 1** (this codebase) handles secure log collection with E2E encryption, firmware distribution, and fleet metadata. It is deployable independently — AI processing (Stage 2) plugs in later without refactoring.

**E2E encryption model**: Drive encrypts with AES-256-CBC using a per-device pre-shared key (PSK). Mobile is a dumb router — stores/forwards opaque encrypted blobs without any key access. Cloud decrypts using the device's PSK from a `device_keys` table.

## Repository Layout

```
C:\SyncV\
├── drive/          C++ (Sync-V Drive — runs on Pi2W or similar embedded)
├── mobile/         TypeScript (React Native mobile app — service layer + UI)
├── backend/        TypeScript (Node.js cloud/on-prem API + SQLite)
├── integration/    TypeScript (cross-module integration tests)
├── CONTEXT.md      This file
├── DESIGN.md       Architecture & component design
└── USER_GUIDE.md   Setup, build, and usage instructions
```

## Tech Stack

| Module     | Language   | Framework         | Tests          | DB       |
|------------|------------|-------------------|----------------|----------|
| Drive      | C++17      | CMake + raw libs  | GoogleTest     | Files    |
| Mobile     | TypeScript | React Native      | Jest + ts-jest | —        |
| Backend    | TypeScript | Node.js + Express | Jest + ts-jest | SQLite   |

## How to Build & Test

```bash
# Drive (C++)
cd drive && cmake -B build && cmake --build build --config Release
cd build && ctest --output-on-failure -C Release

# Mobile (TypeScript)
cd mobile && npm install && npx jest --coverage

# Backend (TypeScript)
cd backend && npm install && npx jest --coverage

# Integration
cd integration && npm install && npx jest
```

## Key Files by Module

### Drive (`drive/src/`)
| File                    | Purpose                                    |
|-------------------------|--------------------------------------------|
| `LogCollector.cpp/.h`   | Reads logs from device filesystem          |
| `HashVerifier.cpp/.h`   | SHA256 hashing (pure C++, no OpenSSL)      |
| `EncryptedStorage.cpp/.h`| AES-256-CBC encrypt/decrypt at rest       |
| `MetadataExtractor.cpp/.h`| Pluggable device metadata parsers        |
| `WiFiServer.cpp/.h`     | Local Wi-Fi API + E2E encryption for mobile|
| `FirmwareReceiver.cpp/.h`| Receive, verify, apply firmware updates   |
| `TransferManager.cpp/.h`| Resumable transfers with retry/backoff     |

### Mobile (`mobile/src/`)
| File                          | Purpose                                |
|-------------------------------|----------------------------------------|
| `services/NetworkService.ts`  | Network state detection + listeners    |
| `services/DriveCommService.ts`| Drive discovery + file operations      |
| `services/LogsService.ts`     | Opaque blob router + offline queue     |
| `services/FirmwareService.ts` | Two-phase firmware download/deliver    |
| `parsers/MetadataParser.ts`   | Extensible metadata parser registry    |
| `utils/hash.ts`               | SHA256 implementation for verification |
| `screens/*.tsx`               | Dashboard, DeviceList, LogsUpload, FirmwareUpdate, Settings |

### Backend (`backend/src/`)
| File                              | Purpose                            |
|-----------------------------------|------------------------------------|
| `index.ts`                        | Express app factory + server entry |
| `models/Database.ts`              | SQLite schema + initialization (10 tables) |
| `models/Device.ts`                | Device CRUD (org-scoped)           |
| `models/Log.ts`                   | Log record CRUD (org-scoped)       |
| `models/Firmware.ts`              | Firmware package CRUD (org-scoped) |
| `models/User.ts`                  | User CRUD with org membership      |
| `models/Organization.ts`          | Organization CRUD + usage stats    |
| `models/Cluster.ts`               | Device cluster management          |
| `models/AuditLog.ts`              | Audit trail storage + querying     |
| `models/ApiKey.ts`                | API key CRUD (SHA256 hashed)       |
| `models/Webhook.ts`               | Webhook config + failure tracking  |
| `models/DeviceKey.ts`             | Per-device PSK CRUD (device_keys)  |
| `services/DeviceRegistry.ts`      | Device registration + queries      |
| `services/LogIngestion.ts`        | Log upload + E2E decryption + dedup|
| `services/FirmwareDistribution.ts`| Firmware versioning + distribution |
| `services/DashboardService.ts`    | Fleet overview + aggregation (org-scoped) |
| `services/AuditService.ts`        | Audit logging for all operations   |
| `services/WebhookDispatcher.ts`   | HMAC-signed webhook delivery       |
| `services/QuotaService.ts`        | Per-org resource limit enforcement |
| `services/PlatformDashboardService.ts` | Cross-org platform stats      |
| `utils/encryption.ts`             | AES-256-CBC decryption utility     |
| `utils/validation.ts`             | SHA256/filename/deviceId validators|
| `routes/auth.ts`                  | Bootstrap, login, register         |
| `routes/platform.ts`              | Platform admin org management      |
| `routes/org.ts`                   | Org admin: users, API keys, webhooks |
| `routes/clusters.ts`              | Cluster CRUD + device assignment   |
| `routes/devices.ts`               | Device CRUD (org-scoped + quota)   |
| `routes/logs.ts`                  | Log ingestion (org-scoped)         |
| `routes/firmware.ts`              | Firmware distribution (org-scoped) |
| `routes/dashboard.ts`             | Fleet overview (org-scoped)        |
| `middleware/auth.ts`              | JWT + API key auth, role hierarchy, rate limiter |
| `middleware/authMiddleware.ts`    | Dual auth middleware, requireOrgAccess, requirePlatformAdmin |
| `public/`                         | Org admin web dashboard (12 pages) |
| `public/platform/`                | Platform admin web dashboard (5 pages) |
| `docs/platform-plan.md`           | Full platform architecture document|

## Architecture Decisions

1. **E2E encryption**: Drive encrypts with per-device PSK → mobile routes opaque blobs → cloud decrypts. Mobile never holds keys or sees plaintext.
2. **Per-device PSK isolation**: Each drive has a unique 32-byte key. Compromise of one drive doesn't expose data from others.
3. **Device-agnostic**: Modular parsers — new device type = add one parser function
4. **Secure by default**: AES-256-CBC encryption, constant-time hash comparisons, path traversal protection
5. **Offline-first mobile**: Upload queue with retry; works without cloud connectivity
6. **Two-phase firmware**: Download from cloud and deliver to drive are separate user actions — works across connectivity gaps
7. **Raw + metadata separation**: Logs stored as raw files with separate checksum records — AI can index metadata without touching raw data
8. **No external crypto deps in Drive**: Pure SHA256 and AES implementations for embedded portability
9. **Multi-tenant isolation**: All data tables have `org_id` FK. JWT tokens carry orgId. All queries filter by org. Platform admin cannot access org-sensitive data.
10. **Dual authentication**: JWT tokens for interactive users + API keys (`svk_` prefix) for programmatic access, both resolved in the same middleware
11. **Quota enforcement**: Per-org resource limits (devices, storage, users) by plan tier, enforced before create operations
12. **Audit trail**: All significant operations logged with actor, action, target, and IP. Platform admin sees structural events only; org admin sees all org events.
13. **Webhook delivery**: HMAC-SHA256 signed payloads, auto-disable after 10 consecutive failures

## Test Coverage

| Module      | Suites | Tests | Statement Coverage |
|-------------|--------|-------|--------------------|
| Drive (C++) | 7      | ~56   | N/A (GoogleTest)   |
| Mobile      | 11     | 119   | ~96%               |
| Backend     | 29     | 386   | ~85%               |
| Integration | 5      | 23    | N/A (cross-module) |

Backend test categories: model CRUD, service logic, route handlers, auth/permissions, org isolation, quota enforcement, webhook dispatch.

## Stage 2 Integration Points

When adding AI processing later:
- Read from the same `logs` and `devices` tables
- Add `/ai/anomalies` and `/ai/predictions` endpoints to backend
- Drive's `MetadataExtractor` can host an edge AI parser module
- Cloud `LogIngestion` already indexes metadata for AI queries

## Known Limitations (Stage 1)

- Mobile services use mock implementations for network I/O (real HTTP/USB not yet wired)
- Password hashing uses SHA256 (swap to bcrypt for production)
- No HTTPS/TLS on Drive Wi-Fi server (add in Stage 2)
- No certificate pinning on mobile → cloud HTTPS connection
- SQLite for dev only — swap to PostgreSQL for production fleet scale
- Webhook delivery is fire-and-forget (no persistent retry queue)

## PlantUML Diagrams (`mobile/docs/`)

| File | Description |
|------|-------------|
| `system-architecture.puml` | Component diagram: Drive encryption, Mobile opaque router, Cloud decryption |
| `security-flow.puml` | Sequence diagram: E2E encrypted log collection, firmware two-phase delivery |
| `security-threats.puml` | Threat model: per-node threats and mitigations |
