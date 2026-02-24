# Sync-V Stage 1 — Improvements Catalog

Issues and improvements identified during codebase review. Organized by priority within each module.

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| Critical | 3     | Security vulnerabilities that must be fixed before any non-local deployment |
| High     | 8     | Bugs and security gaps that affect correctness or safety |
| Medium   | 12    | Code quality, robustness, and maintainability issues |
| Low      | 10    | Minor improvements, cleanup, and best practices |

---

## Critical

### C1. Open user registration allows unauthenticated admin creation
- **Module**: Backend — `src/routes/auth.ts`
- **Issue**: `POST /api/auth/register` only checks authorization when a token IS present. If no `Authorization` header is sent, anyone can register a user with `role: "admin"`.
- **Impact**: Complete auth bypass. Any anonymous caller can create admin accounts.
- **Fix**: Require authentication for all registration attempts unless the `users` table is empty (first-user bootstrap).

### C2. SHA256 password hashing is unsalted and fast
- **Module**: Backend — `src/middleware/auth.ts`
- **Issue**: Passwords are hashed with `crypto.createHash('sha256')` — no salt, no key stretching. Vulnerable to rainbow tables and brute force.
- **Fix**: Replace with `bcrypt` (cost factor 12+) or `argon2`. Already noted as planned in CONTEXT.md but no implementation exists.

### C3. AES IV generated with non-cryptographic PRNG
- **Module**: Drive — `src/EncryptedStorage.cpp`
- **Issue**: `std::mt19937` (Mersenne Twister) is used to generate AES-CBC initialization vectors. MT is predictable — an attacker who observes a few IVs can predict future ones, undermining CBC confidentiality.
- **Fix**: Use platform CSPRNG: `BCryptGenRandom()` on Windows, `/dev/urandom` on POSIX.

---

## High

### H1. Path containment check has prefix-ambiguity bug
- **Module**: Drive — `src/WiFiServer.cpp`, `isPathSafe()`
- **Issue**: The canonical path containment check uses substring comparison:
  ```cpp
  resolvedStr.substr(0, rootStr.size()) != rootStr
  ```
  If `rootDir_` is `/tmp/data`, a file at `/tmp/dataextra/secret.txt` passes the check because `"/tmp/dataextra/..."` starts with `"/tmp/data"`.
- **Fix**: Append the path separator before comparing:
  ```cpp
  std::string rootPrefix = rootStr + static_cast<char>(fs::path::preferred_separator);
  if (resolvedStr != rootStr && resolvedStr.substr(0, rootPrefix.size()) != rootPrefix)
      return false;
  ```

### H2. AES key shorter than 32 bytes is silently zero-padded
- **Module**: Drive — `src/EncryptedStorage.cpp`
- **Issue**: Keys shorter than 32 bytes are padded with null bytes. A 1-byte key becomes effectively a 1-byte key followed by 31 zeros — catastrophically weak. No warning or error is raised.
- **Fix**: Throw `std::invalid_argument` if key length is not exactly 32 bytes.

### H3. AES key material not zeroed on destruction
- **Module**: Drive — `src/EncryptedStorage.cpp`
- **Issue**: The `key_` vector holding cryptographic key material is not cleared when the `EncryptedStorage` object is destroyed. Key material can linger in freed heap memory.
- **Fix**: Add a destructor: `~EncryptedStorage() { std::fill(key_.begin(), key_.end(), uint8_t{0}); }`

### H4. FirmwareReceiver::receive() has no filename validation
- **Module**: Drive — `src/FirmwareReceiver.cpp`
- **Issue**: Unlike `WiFiServer::receiveFirmware()` which calls `isPathSafe()`, `FirmwareReceiver::receive()` performs no filename validation. A caller passing `"../../../etc/cron.d/evil"` would write outside `stagingDir_`.
- **Fix**: Apply the same path-safety validation used in WiFiServer, or extract `isPathSafe()` into a shared utility.

### H5. Password comparison uses `===` (not timing-safe)
- **Module**: Backend — `src/middleware/auth.ts`
- **Issue**: `verifyPassword()` compares password hashes with JavaScript `===`, which is vulnerable to timing oracle attacks.
- **Fix**: Use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.

### H6. No global Express error handler
- **Module**: Backend — `src/index.ts`
- **Issue**: No `app.use((err, req, res, next) => {...})` is registered. Unhandled errors in route handlers return Express's default HTML error page instead of JSON.
- **Fix**: Add a global error handler that returns `{ error: "Internal server error" }` with status 500.

### H7. FirmwareService.onProgress() leaks callbacks
- **Module**: Mobile — `src/services/FirmwareService.ts`
- **Issue**: `onProgress()` pushes callbacks into an array with no way to remove them. In `FirmwareUpdate.tsx`, each `handleDownload()` call registers another callback. After N downloads, N duplicate progress events fire per tick.
- **Fix**: Return an unsubscribe function from `onProgress()` (matching the pattern in `NetworkService.onStateChange()`), or replace with a single `setProgressCallback()` setter.

### H8. Chart.js CDN script lacks Subresource Integrity hash
- **Module**: Backend — `src/public/overview.html`
- **Issue**: Chart.js is loaded from `cdn.jsdelivr.net` without an `integrity` attribute. A CDN compromise would allow arbitrary script injection into the dashboard.
- **Fix**: Add `integrity="sha384-..."` and `crossorigin="anonymous"` to the `<script>` tag.

---

## Medium

### M1. No database indexes on frequently filtered columns
- **Module**: Backend — `src/models/Database.ts`
- **Issue**: No secondary indexes exist. Queries on `logs.device_id`, `devices.status`, `devices.type`, `firmware.device_type`, and `logs.checksum` perform full table scans.
- **Fix**: Add `CREATE INDEX IF NOT EXISTS` statements for these columns in `initializeDatabase()`.

### M2. UNIQUE constraint detection is fragile
- **Module**: Backend — `src/routes/devices.ts`
- **Issue**: Duplicate device detection checks `err.message?.includes('UNIQUE constraint')`, coupling to SQLite's English error message format.
- **Fix**: Check `err.code === 'SQLITE_CONSTRAINT_UNIQUE'` (supported by better-sqlite3).

### M3. Rate limiter memory grows without eviction
- **Module**: Backend — `src/middleware/auth.ts`
- **Issue**: The `Map<string, number[]>` of request timestamps grows unboundedly. Stale entries for clients that have not been seen remain in the Map indefinitely.
- **Fix**: Add periodic cleanup (e.g., delete keys with no timestamps within the current window).

### M4. Static file path is fragile post-build
- **Module**: Backend — `src/index.ts`
- **Issue**: `path.join(__dirname, '..', 'src', 'public')` works during development but relies on the compiled `dist/` directory being a sibling of `src/`. A different working directory or deployment layout would break static file serving.
- **Fix**: Copy `public/` into `dist/` during the build step, then use `path.join(__dirname, 'public')`.

### M5. Settings screen is not wired to services
- **Module**: Mobile — `src/screens/Settings.tsx`
- **Issue**: The IP address and port fields are local `useState` values that are never passed to `DriveCommService`. Changing them has no effect on actual connectivity.
- **Fix**: Emit changes via a callback prop or write to a shared config store that `DriveCommService` reads.

### M6. FirmwareUpdate.tsx hardcodes device type and discards download data
- **Module**: Mobile — `src/screens/FirmwareUpdate.tsx`
- **Issue**: `checkForUpdates('typeA', '1.0.0')` ignores the actual connected device. `handleTransfer` passes the literal string `'FIRMWARE_DATA'` instead of the downloaded binary.
- **Fix**: Read device type/version from the connected device's metadata. Pass the actual downloaded data (or its local path) to `transferToDrive()`.

### M7. DeviceList creates MetadataParserRegistry on every render
- **Module**: Mobile — `src/screens/DeviceList.tsx`
- **Issue**: `new MetadataParserRegistry()` is called inside the component body without `useMemo`. A new registry is created on every render cycle.
- **Fix**: Wrap in `useMemo(() => new MetadataParserRegistry(), [])`.

### M8. No API pagination
- **Module**: Backend — `src/routes/devices.ts`, `logs.ts`, `firmware.ts`
- **Issue**: `GET /api/devices`, `GET /api/logs`, and `GET /api/firmware` return all records in one response. The web dashboard does client-side pagination (50/page) but still loads everything from the server.
- **Fix**: Add `?page=N&limit=N` query parameters with server-side `LIMIT/OFFSET`.

### M9. `rawData` is accepted but silently discarded
- **Module**: Backend — `src/services/LogIngestion.ts`
- **Issue**: The log ingestion endpoint accepts `rawData` in the request body but never stores it. The `raw_path` field points to a location that never exists on disk.
- **Fix**: Either store the raw data to disk at `raw_path`, or remove `rawData` from the request schema and document `raw_path` as a placeholder for Stage 2.

### M10. Empty-string sentinel in Drive error returns
- **Module**: Drive — `src/HashVerifier.cpp`, `src/EncryptedStorage.cpp`
- **Issue**: `hashFile()`, `loadFromFile()`, and `decrypt()` return `""` on failure. An empty file or empty plaintext also returns `""`, making errors indistinguishable from valid results.
- **Fix**: Return `std::optional<std::string>` (available in C++17) to distinguish "error" from "empty result".

### M11. `WiFiServer::receiveFirmware()` does not check authentication
- **Module**: Drive — `src/WiFiServer.cpp`
- **Issue**: `receiveFirmware()` writes data to `rootDir_/firmware/` without verifying that the caller is authenticated. Authentication is only checked in `getFileContent()` and `getFileList()`.
- **Fix**: Add an `authenticate()` precondition to `receiveFirmware()`, or require callers to authenticate before calling it.

### M12. `TransferManager::retryWithBackoff` has potential undefined behavior
- **Module**: Drive — `src/TransferManager.cpp`
- **Issue**: `int backoffMs = baseBackoffMs_ * (1 << attempt)` — if `attempt >= 31`, left-shifting into the sign bit of a signed `int` is undefined behavior.
- **Fix**: Use `unsigned` for the shift, or cap `attempt` at a safe maximum.

---

## Low

### L1. `isValidSha256` rejects uppercase hex
- **Module**: Backend — `src/utils/validation.ts`
- **Issue**: The regex `/^[0-9a-f]{64}$/` only accepts lowercase. SHA256 hashes are case-insensitive; tools like Windows `certutil` produce uppercase output.
- **Fix**: Use `/^[0-9a-fA-F]{64}$/` or normalize to lowercase before validation.

### L2. Device status has no allowed-value constraint
- **Module**: Backend — `src/routes/devices.ts`
- **Issue**: `PATCH /api/devices/:id/status` accepts any string. Only `online`, `offline`, and `unknown` are rendered meaningfully in the dashboard.
- **Fix**: Validate against an enum of allowed statuses.

### L3. No CMake compiler warning flags
- **Module**: Drive — `CMakeLists.txt`
- **Issue**: No `-Wall -Wextra -Werror` (GCC/Clang) or `/W4 /WX` (MSVC) are set.
- **Fix**: Add warning flags conditionally based on compiler ID.

### L4. Path alias configuration is unused
- **Module**: Mobile — `tsconfig.json`, `jest.config.js`
- **Issue**: Path aliases (`@services/*`, `@parsers/*`, `@types/*`, `@utils/*`, `@screens/*`) are configured in both TypeScript and Jest config but never used — all imports use relative paths.
- **Fix**: Either adopt the aliases in source files or remove the dead configuration.

### L5. Screen components have zero test coverage
- **Module**: Mobile — `src/screens/*.tsx`
- **Issue**: All five screens (~850 lines) are completely untested. The reported "96% coverage" excludes screen code because no test imports them.
- **Fix**: Add screen tests using `@testing-library/react-native` for component rendering and interaction testing.

### L6. Hardcoded safe-area insets in screens
- **Module**: Mobile — `src/screens/*.tsx`
- **Issue**: Status bar offsets use hardcoded `paddingTop: 52` / `paddingTop: 48` values. Different device families (iPhone SE, Pro Max, Android variants) have different inset heights.
- **Fix**: Use `expo-safe-area-context` with `useSafeAreaInsets()`.

### L7. Screens bypass COLORS theme module
- **Module**: Mobile — `src/screens/LogsUpload.tsx`, `FirmwareUpdate.tsx`, `Settings.tsx`
- **Issue**: Three of five screens use raw hex color strings (`'#6366f1'`, `'#ef4444'`, etc.) instead of importing from `src/theme/colors.ts`. Only `Dashboard.tsx`, `DeviceList.tsx`, and `AppNavigator.tsx` use the theme.
- **Fix**: Replace hardcoded hex values with `COLORS.*` imports in the remaining screens.

### L8. JWT stored in localStorage (web dashboard)
- **Module**: Backend — `src/public/js/auth.js`
- **Issue**: JWT is stored in `localStorage`, which is accessible to any JavaScript on the page. A XSS vulnerability would allow token exfiltration.
- **Tradeoff**: This is the standard SPA pattern. HttpOnly cookies are more secure but add CSRF complexity. Document the tradeoff; fix if XSS prevention cannot be guaranteed.

### L9. No client-side JWT expiry check (web dashboard)
- **Module**: Backend — `src/public/js/auth.js`
- **Issue**: `AUTH.isLoggedIn()` only checks `!!localStorage.getItem('syncv_jwt')`. Expired tokens are still considered valid until a 401 is received from the server.
- **Fix**: Decode the JWT payload client-side and check `exp` before making API calls.

### L10. Google Fonts loaded from external CDN
- **Module**: Backend — `src/public/*.html`
- **Issue**: Google Fonts are loaded on every page, adding a network dependency and leaking client IP addresses to Google.
- **Fix**: Self-host the font files, or use system fonts to remove the external dependency.

---

## Not Issues (Intentional Design Decisions)

These were evaluated and determined to be acceptable for Stage 1:

| Item | Rationale |
|------|-----------|
| DeviceRegistry is a pass-through to DeviceModel | Reserves space for future business logic (caching, events). Acceptable indirection. |
| DashboardService reads models directly (bypasses services) | Read-only aggregation. Pragmatic for dashboard queries. |
| Mobile services use mock implementations | Intentional — real HTTP/USB wiring is a future task. Mock injection enables TDD. |
| No CI/CD pipeline | Local-only project in Stage 1. Add when deployment is needed. |
| No DELETE routes exposed | Models have `delete()` methods. Routes will be added when the UI needs them. |
| SQLite only | Adequate for development. PostgreSQL swap planned for production. |
| No CORS headers | Dashboard is same-origin (served by Express). Add if frontend is ever separated. |
| Hand-rolled JSON parser in MetadataExtractor (C++) | Intentionally limited to flat objects for embedded IoT use. |
| AES-CBC without authentication tag (AEAD) | Acceptable for local at-rest encryption in Stage 1. AES-GCM is a Stage 2 upgrade. |
| `FirmwareReceiver` uses string concatenation for paths | Works correctly on both platforms for the current use case. Minor style inconsistency. |
