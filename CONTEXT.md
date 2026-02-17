# Sync-V — Context Document

Quick-start reference for resuming development on the Sync-V project.

## What Is Sync-V?

Sync-V is an industrial IoT data pipeline that moves data between field devices, a local intermediary (the "Drive"), a mobile app, and a cloud backend.

```
Device <---> [Sync-V Drive] <--Wi-Fi--> [Mobile App] <--Internet--> [Cloud Backend]
```

**Stage 1** (this codebase) handles secure log collection, firmware distribution, and fleet metadata. It is deployable independently — AI processing (Stage 2) plugs in later without refactoring.

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
| `WiFiServer.cpp/.h`     | Local Wi-Fi API for mobile communication   |
| `FirmwareReceiver.cpp/.h`| Receive, verify, apply firmware updates   |
| `TransferManager.cpp/.h`| Resumable transfers with retry/backoff     |

### Mobile (`mobile/src/`)
| File                          | Purpose                                |
|-------------------------------|----------------------------------------|
| `services/NetworkService.ts`  | Network state detection + listeners    |
| `services/DriveCommService.ts`| Drive discovery + file operations      |
| `services/LogsService.ts`     | Offline upload queue + status tracking |
| `services/FirmwareService.ts` | Firmware download/transfer + progress  |
| `parsers/MetadataParser.ts`   | Extensible metadata parser registry    |
| `utils/hash.ts`               | SHA256 implementation for verification |
| `screens/*.tsx`               | Dashboard, DeviceList, LogsUpload, FirmwareUpdate, Settings |

### Backend (`backend/src/`)
| File                              | Purpose                            |
|-----------------------------------|------------------------------------|
| `index.ts`                        | Express app factory + server entry |
| `models/Database.ts`              | SQLite schema + initialization     |
| `models/Device.ts`                | Device CRUD operations             |
| `models/Log.ts`                   | Log record CRUD                    |
| `models/Firmware.ts`              | Firmware package CRUD              |
| `services/DeviceRegistry.ts`      | Device registration + queries      |
| `services/LogIngestion.ts`        | Log upload with validation + dedup |
| `services/FirmwareDistribution.ts`| Firmware versioning + distribution |
| `services/DashboardService.ts`    | Fleet overview + aggregation       |
| `routes/devices.ts`               | REST routes: device CRUD           |
| `routes/logs.ts`                  | REST routes: log ingestion         |
| `routes/firmware.ts`              | REST routes: firmware distribution |
| `routes/auth.ts`                  | REST routes: login + registration  |
| `routes/dashboard.ts`             | REST routes: fleet overview        |
| `middleware/auth.ts`              | JWT auth + role hierarchy + rate limiter |
| `middleware/authMiddleware.ts`    | Express JWT middleware wrapper      |
| `utils/validation.ts`            | SHA256/filename/deviceId validators |

## Architecture Decisions

1. **Device-agnostic**: Modular parsers — new device type = add one parser function
2. **Secure by default**: AES-256-CBC at rest, constant-time hash comparisons, path traversal protection
3. **Offline-first mobile**: Upload queue with retry; works without cloud connectivity
4. **Raw + metadata separation**: Logs stored as raw files with separate checksum records — AI can index metadata without touching raw data
5. **No external crypto deps in Drive**: Pure SHA256 and AES implementations for embedded portability

## Test Coverage

| Module      | Suites | Tests | Statement Coverage |
|-------------|--------|-------|--------------------|
| Drive (C++) | 7      | ~50   | N/A (GoogleTest)   |
| Mobile      | 5      | 43    | 95.9%              |
| Backend     | 7      | 89    | 87.8%              |
| Integration | 4      | 18    | N/A (cross-module) |

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
- SQLite for dev only — swap to PostgreSQL for production fleet scale
