# DutyTime data model

Every new collection starts with `duty_time_`. Shared collections remain compatible with the other apps.

| Collection | Document identity | Purpose |
| --- | --- | --- |
| `users_new` | Existing IDs; lookup by `uid` | Shared name, email, company, department, profile photo; prefer canonical UID documents; otherwise use a unique uid query result. Existing duplicate legacy rows are not modified |
| `company` | Existing IDs | Workspace names |
| `station`, `position` | Existing IDs | Shared station and position options |
| `duty_time_user_data` | Firebase UID | Trusted company membership, duty-specific position, enabled flag, manager role, manager UID array |
| `duty_time_settings` | Company ID | Whether manual check-in/out times are allowed |
| `duty_time_stations` | UUID or company/shared-station ID | Additional stations and DutyTime-only overrides for shared stations |
| `duty_time_auto_checkouts` | UID + active-session ID | Original check-in, system cutoff, pending status, affected dates, actual checkout and correction actor |
| `duty_time_state` | UID | Current active session or null; serialized by Firestore transactions |
| `duty_time_days` | UID + date | Sessions, pending/recorded/rejected status, close flag, revision |
| `duty_time_audit` | Operation UUID | Manager identity, reason, before/after sessions, timestamp and resulting status |
| `duty_time_admin_audit` | Auto ID | Duty role/membership changes |
| `duty_time_operations` | Actor UID + request UUID | Idempotent mutation outcome and payload hash |
| `duty_time_reports` | Request UUID + date | Immutable report snapshot, recipient identities, delivery lease, provider ID, attempts and state |

New day records use the session’s saved station time zone; legacy sessions without a zone retain EAT (`Africa/Nairobi`) dates. Session start/end values are epoch milliseconds; server time is authoritative unless company settings permit manual times. Midnight boundaries split a continuous session across day records. Overtime above 12 hours is summed per day, never netted against shorter days.

Mutations read active state and affected day records before writing. The same transaction saves session changes, operation identity, and outgoing report. Manager changes require the expected day revision and cannot race silently with another review. Audit records are separate from day documents to avoid unbounded document growth.

Queries for a month use document-ID ordering rather than requiring a composite index. The server also verifies each returned document belongs to the requested UID. Client Firestore access to duty collections is denied; Firebase Admin SDK calls are authorized in `lib/server/access.ts` and `lib/policy.ts`.

The baseline shared rules still allow signed-in clients broad access to existing non-duty collections. This change deliberately does not redesign security for the handover or risk apps. It isolates duty membership so these shared permissions cannot be used to self-assign a duty manager role or alter duty records.

Automatic-checkout sessions carry `autoCheckoutId` and `autoCheckoutPending`. A day with unresolved automatic sessions has `pending_checkout` status; its other confirmed sessions still contribute to totals. See `automatic-checkout.md`.

`duty_time_station_contacts/{companyId}_{stationId}` stores a company-scoped station contact map, with department keys and name/email/phone values. Legacy originals are retained in `duty_time_station_contacts_backup` by the migration. `duty_time_settings.alertEmails` holds additional recipients for both overtime and rest alerts. These alerts use deterministic records in `duty_time_reports`. See `duty-rest-and-stations.md`.
