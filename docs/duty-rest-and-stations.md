# Duty limits, rest, and stations

Daily confirmed duty now uses a 12-hour threshold. Multiple sessions are summed. Strictly exceeding twelve hours turns the calendar day red and queues one overtime alert per user/local date. The running session is included (up to its cutoff); the scheduled worker checks every minute. Exceeding twelve hours does not itself stop work. The station-local daily cutoff still applies. Pending actual-checkout hours stay provisional until corrected.

The next local duty day's first check-in requires eight elapsed hours since the latest checkout. Same-day breaks remain permitted. Check-in is rejected server-side, including manually entered times, with a persistent explanation in the UI and a saved rest alert. At exactly eight hours, check-in is allowed. A previous day's pending automatic checkout requires its actual end to be recorded first. Rest is computed from UTC timestamps across station changes. Repeated denied attempts for the same prior checkout/local date generate one alert.

## Admin controls

- Administration → Settings → Duty & rest alerts: a searchable multi-select picker for enabled company users and station contacts (station + department + email), plus manually entered email addresses. Selected addresses appear as removable tags; duplicate addresses are combined, with a maximum of 50. Both alert types include eligible assigned line managers, this list, and Maintenance/Operations contacts at the relevant stations. Stored as `alertEmails` in `duty_time_settings/{company}`. Empty lists are allowed; recipient-less alerts remain blocked for admin retry.
- Administration → Stations → select station: IANA time zone, e.g. `Africa/Nairobi` or `Africa/Juba`. Stored in the DutyTime station record, without modifying the shared station collection. Existing unconfigured stations initially retain Africa/Nairobi; administrators should configure each non-Nairobi station before use. Existing session timestamps/time zones are preserved.
- The station editor also manages named contacts with an email and/or phone. Save new stations before adding contacts. Each `duty_time_station_contacts/{companyId}_{stationId}` contains `company`, `stationId`, `schemaVersion: 2`, and a `contacts` map keyed by department. Each entry stores `name`, `email`, `phone`, and a stable `department` value, with update attribution. Existing duplicate department contacts are preserved under suffixed keys. All CRUD operations require same-company admin access. Contact changes create admin audit entries. Maintenance and Operations contact entries are automatic alert recipients for their station. Routing uses the stable department value (`maintenance` or `operations`); legacy records are read compatibly during migration. Other contact types can be selected in the alert recipient picker. The selected email addresses are saved; a later directory email change requires updating the saved recipient selection.

## Time storage

`start` and `end` remain UTC epoch milliseconds (the existing storage format). New sessions additionally snapshot the station's IANA `timeZone`; splitting, manual time entry, and cutoff computation use it. Old sessions without a zone use their original Africa/Nairobi interpretation. Local and Zulu times appear in session details, reports, and CSV exports. No historical timestamp migration is performed. Invalid or ambiguous daylight-saving local times are rejected rather than silently shifted.

The 19:00 default and manager's user-specific clock override are interpreted in the checked-in station's local zone. Changing a station's zone applies to future sessions; changing the user's cutoff updates an open session using its saved zone.

Alerts share `duty_time_reports` with ordinary reports, using `overtime_alert` and `rest_alert` kinds, deterministic IDs, delivery leases, and Resend idempotency. Ordinary checkout email recipients remain unchanged. Provider acceptance is tracked separately from inbox delivery.

## Validation and activation

38 unit tests and 11 browser tests passed, including alert deduplication, recipient eligibility, rest boundaries, station-local cutoffs, Zulu displays, contact management, and red overtime days. App and function production builds passed. The scheduled function update deployed successfully on 8 September 2026 at 20:25 EAT. The 20:26 EAT scheduled execution returned HTTP 200 and logged zero failures. The web app changes are in the local workspace; this deployment updated the Cloud Function only.

Station routing: overtime alerts snapshot all station IDs represented in that day’s sessions when the alert is first raised. Rest alerts snapshot the station selected for the denied check-in, even though no session was created. Rest attempts at different stations have separate deduplication keys so each station is notified. Station contacts are company-scoped and resolved at delivery time; duplicate addresses across all recipient sources are combined. Already accepted reports are not resent.

The station-recipient worker update deployed on 8 September 2026 at 20:47 UTC. Its 20:48 UTC scheduled execution returned HTTP 200 and logged zero failures. All 40 unit tests and the app/function production builds passed for this update.

The station editor opens as a bottom sheet with its own scroll area, keyboard focus containment, Escape dismissal, and mobile safe-area padding. Contact migration is implemented by `scripts/migrate-station-contacts.ts` (dry-run by default; `--apply` converts records transactionally). Original documents are backed up in `duty_time_station_contacts_backup` before removal from the active collection. Canonical station maps take precedence over legacy records, including when all contacts have been removed.

On 9 September 2026 the station-map reader was deployed and the migration applied: two legacy contact documents became one company/station document containing two contacts. Both originals were backed up and their names, emails, and phone values verified; zero legacy records remained in the active collection. The 05:40 UTC scheduled worker run returned HTTP 200 with zero failures. Validation included 44 unit tests, three relevant browser checks (including mobile bottom-sheet placement), and successful app/function production builds. Web UI changes remain in the local workspace.

## Manuals and deactivation

User guide and Admin manual are available as application tabs and sidebar items. The user guide is also public at `/guide` for sign-in help. Admin manual content is served by `/api/manual` only after verifying the current Firebase user's `duty_time_admin` claim; ordinary users do not see its tab/sidebar link.

Administration supports deactivation/reactivation of users, stations, and station contacts rather than permanent deletion. Contact entries retain their keys and details with `active: false`; new automatic alerts and recipient search exclude inactive contacts. Explicitly selected additional email addresses remain independent and must be removed from the alert list separately if no longer wanted. Contact status changes are audited. No administrative delete-contact endpoint remains.

Main application navigation still switches React state within `/`; it does not change URL paths. Manual contents links use section anchors. `/guide` is a standalone route accessible before authentication.

The deactivation-aware worker deployment was verified on 9 September 2026: function ACTIVE, scheduler ENABLED every minute, and the latest three completed runs reported zero failures. Verification can be repeated with `node scripts/verify-duty-worker.cjs` using the authorized Firebase CLI account. The manual/deactivation changes passed 45 unit tests; all 13 browser scenarios passed across the initial run and the focused mobile-layout rerun. The temporary verification script was replaced with this project-owned read-only script.
