# Sync-V Multi-Tenant Cloud Platform — Architecture Document

## Overview

The Sync-V backend is a multi-tenant platform where a **Platform Admin** manages multiple customer organizations, each with isolated data, users, devices, and quotas. Organizations cannot see each other's data, and the platform admin is explicitly blocked from accessing sensitive org data (logs, firmware, PSK).

## Role Hierarchy

```
platform_admin (level 4) — manages orgs, plans, quotas. NO access to org data
org_admin      (level 3) — manages users, devices, clusters, API keys, webhooks within org
technician     (level 2) — field ops: log upload, firmware update, device registration
viewer         (level 1) — read-only dashboard access within org
```

Higher roles inherit lower-level permissions structurally, but **platform_admin is restricted from org-sensitive routes** via the `requireOrgAccess` middleware.

## Permission Matrix

| Action                     | platform_admin | org_admin | technician | viewer |
|----------------------------|:-:|:-:|:-:|:-:|
| Create/manage organizations | Y | - | - | - |
| View platform overview      | Y | - | - | - |
| View structural audit log   | Y | - | - | - |
| Change org plans/quotas     | Y | - | - | - |
| Suspend/activate orgs       | Y | - | - | - |
| **View/download logs**      | **N** | Y | Y | Y |
| **Upload firmware**         | **N** | Y | Y | - |
| **Set/rotate PSK**          | **N** | Y | Y | - |
| **View raw device data**    | **N** | Y | Y | Y |
| Manage org users            | Y* | Y | - | - |
| Manage API keys             | - | Y | - | - |
| Manage webhooks             | - | Y | - | - |
| View org audit log          | - | Y | - | - |
| Register devices            | - | Y | Y | - |
| View devices/dashboard      | - | Y | Y | Y |

\* Platform admin can create users in a specified org via `/api/platform/organizations/:id/users`.

## Data Isolation Model

Every data table includes an `org_id` foreign key:

```
organizations ──┬── users (org_id)
                ├── devices (org_id, cluster_id)
                ├── clusters (org_id)
                ├── logs (org_id)
                ├── firmware (org_id)
                ├── api_keys (org_id)
                ├── webhooks (org_id)
                └── audit_logs (org_id)
```

**Enforcement**: The `req.orgId` is injected from the JWT token (or API key record) by the auth middleware. All model queries filter by `org_id`. There is no way for one org's token to query another org's data.

**Platform admin tokens** have no `orgId` — they are blocked from org-data routes by `requireOrgAccess` middleware returning 403.

## Authentication

### JWT Tokens

```
POST /api/auth/login → { token, user }
```

Token payload: `{ userId, username, role, orgId?, iat, exp }`

- `orgId` is included for all roles except `platform_admin`
- Default expiry: 24 hours
- Configurable via `AuthService` constructor

### API Keys

Org-scoped API keys for programmatic access:

```
Authorization: Bearer svk_<random-hex>
```

- Prefix `svk_` identifies API key auth vs JWT
- Key is SHA256-hashed before storage (plaintext shown once at creation)
- Scoped to the creating org
- Permissions array restricts allowed operations

### Bootstrap Flow

```
POST /api/auth/bootstrap → creates first platform_admin (one-time, only when no users exist)
```

## Organization Quotas

| Plan       | Devices | Storage     | Users     |
|------------|---------|-------------|-----------|
| free       | 5       | 100 MB      | 3         |
| pro        | 100     | 10 GB       | 25        |
| enterprise | 500     | 100 GB      | Unlimited |

Enforced by `QuotaService` before create operations. At 80% usage, a `quota.warning` webhook event fires. At 100%, the operation returns 403.

## Webhook Events

Webhooks are configured per-org with HMAC-SHA256 signed payloads.

| Event              | Trigger                          |
|--------------------|----------------------------------|
| `device.online`    | Device status changed to online  |
| `device.offline`   | Device status changed to offline |
| `log.uploaded`     | New log ingested                 |
| `firmware.uploaded` | New firmware package uploaded   |
| `psk.rotated`      | Device PSK changed              |
| `user.created`     | New user added to org           |
| `quota.warning`    | Quota usage exceeds 80%         |
| `quota.exceeded`   | Quota limit reached             |

Payload format:
```json
{
  "event": "log.uploaded",
  "orgId": "org-123",
  "data": { ... },
  "timestamp": "2026-02-25T12:00:00.000Z"
}
```

Signature header: `X-SyncV-Signature: sha256=<HMAC-SHA256(body, webhook_secret)>`

Auto-disable after 10 consecutive failures.

## Audit Log Events

### Org-level events (visible to org_admin)
`user.create`, `user.delete`, `user.role_change`, `device.register`, `device.update`, `psk.set`, `psk.rotate`, `psk.revoke`, `log.upload`, `log.delete`, `firmware.upload`, `firmware.delete`, `cluster.create`, `cluster.update`, `cluster.delete`, `apikey.create`, `apikey.revoke`, `webhook.create`, `webhook.delete`

### Structural events (visible to platform_admin)
`org.create`, `org.update`, `org.suspend`, `org.activate`, `org.plan_change`, `user.create`, `user.delete`, `user.role_change`

## API Route Catalog

### Platform Admin Routes (`/api/platform/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | Platform-wide stats |
| GET | `/organizations` | List all orgs with usage |
| POST | `/organizations` | Create organization |
| GET | `/organizations/:id` | Org detail (metadata only) |
| PATCH | `/organizations/:id` | Update org |
| PATCH | `/organizations/:id/suspend` | Suspend org |
| PATCH | `/organizations/:id/activate` | Reactivate org |
| DELETE | `/organizations/:id` | Delete org |
| GET | `/audit` | Structural audit events |
| POST | `/organizations/:id/users` | Create user in org |

### Org Management Routes (`/api/org/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List team members |
| POST | `/users` | Create user |
| PATCH | `/users/:userId` | Update role |
| DELETE | `/users/:userId` | Remove user |
| GET | `/api-keys` | List API keys |
| POST | `/api-keys` | Create API key |
| DELETE | `/api-keys/:keyId` | Revoke API key |
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Create webhook |
| PATCH | `/webhooks/:id` | Update webhook |
| DELETE | `/webhooks/:id` | Delete webhook |
| GET | `/audit` | Org audit log |
| GET | `/usage` | Quota usage summary |

### Cluster Routes (`/api/clusters/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List org clusters |
| POST | `/` | Create cluster |
| GET | `/:id` | Cluster detail |
| PATCH | `/:id` | Update cluster |
| DELETE | `/:id` | Delete cluster |
| POST | `/:id/devices` | Assign devices |
| DELETE | `/:id/devices/:deviceId` | Remove device |
| GET | `/:id/dashboard` | Cluster dashboard |

### Existing Routes (now org-scoped)
All device, log, firmware, and dashboard routes filter by `req.orgId`. Log and firmware routes block `platform_admin` via `requireOrgAccess`.

## Database Tables

### New Tables
- `organizations` — id, name, slug (unique), plan, max_devices, max_storage_bytes, max_users, status, timestamps
- `clusters` — id, org_id (FK), name, description, timestamps
- `audit_logs` — id, org_id, actor_id, actor_type, action, target_type, target_id, details (JSON), ip_address, created_at
- `api_keys` — id, org_id (FK), name, key_hash, key_prefix, permissions (JSON), last_used_at, created_by, created_at
- `webhooks` — id, org_id (FK), url, secret, events (JSON), is_active, last_triggered_at, failure_count, created_at

### Modified Tables
- `users` — added `org_id`, `updated_at`
- `devices` — added `org_id`, `cluster_id`
- `logs` — added `org_id`
- `firmware` — added `org_id`

## Test Coverage

29 test suites, 386 tests, ~85% statement coverage.

Key test categories:
- **Model tests**: CRUD for all 10 models
- **Service tests**: Quota enforcement, webhook dispatch, audit logging, platform dashboard
- **Route tests**: All route handlers with auth/permission checks
- **Isolation tests**: Org A vs org B data separation, platform admin blocking
