# DutyTime

A mobile and desktop duty roster for the existing Kasas Firebase project. Built with Next.js, React, TypeScript, and shadcn/ui styling.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000 and sign in using an existing Firebase email/password account. The app no longer uses demo records or local-storage duty sessions.

Production verification uses a separate build directory so an open development server is unaffected:

```sh
npm run build
npm start
npm test
npm run lint
```

## Environment

`.env.local` is ignored by Git. It needs:

- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- Optional public Firebase storage and messaging settings already present in the supplied config
- `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON service-account credentials, server only
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: server-only report delivery settings; the sender must be allowed by your Resend account

Never put the service account or Resend key in a `NEXT_PUBLIC_` variable. The service-account module imports `server-only` and is used only by API routes. Resend keys are never returned to the browser.

## Initial setup

The current project has already had the rules published and 116 memberships initialized. See `docs/setup-status.md` for the completed setup and validation limits. The commands below remain available for future onboarding.

1. Publish `firestore.rules` in the Firebase console. It preserves the existing apps’ access and prevents direct client reads/writes of top-level `duty_time_` collections. All DutyTime data access goes through the authenticated Next.js server API. The original rules are retained in `docs/firestore.rules.before-duty-time` for comparison.
2. Run `node scripts/firebase-tools.cjs seed-memberships`. This verifies that the live rules match the prepared file before creating missing `duty_time_user_data` memberships. Existing profiles and existing duty settings are never overwritten. Initial memberships have no manager privileges or assignments.
3. `david@acuvera.com` has been explicitly granted `duty_time_admin: true`, preserving its other claims. Sign in to open Administration, assign line managers, and set duty-specific positions.
4. Confirm Resend’s sender domain is verified. On check-out, the app saves a report with the duty transaction, then attempts delivery. Reports without an assigned manager or working email configuration remain visible in Administration → Reports for retry.

For future explicitly authorized admins: `node scripts/firebase-tools.cjs grant-admin account@example.com`.

The supplied service account can read current rules but was denied the Rules API test permission. The console can compile and publish the file. The setup helper refuses to overwrite live rules that changed after inspection.

## Features

- Existing Firebase sign-in, sign-out, and password reset
- Existing `users_new`, `company`, `station`, and `position` data
- Persistent server-stored timer; the open-session clock shows all elapsed hours since check-in, including across midnight, reloads, and suspended tabs. Today’s totals and overtime are tracked separately.
- Per-company manual-time settings, validated by the server
- Station-local dates and times, UTC/Zulu displays, and sessions crossing local midnight
- Per-day overtime above eight hours, calendar navigation, session detail sheets, CSV export
- Missed-entry requests only for dates without a duty document, with required reasons
- Assigned line managers can review requests and edit recorded hours with immutable audit records
- Final daily reports through Close for the day
- Admin user creation, duty roles, multiple searchable line-manager selection, station management, and shared-password updates
- Resend reports with session tables, daily totals, overtime, a durable delivery record, and retry controls

## Boundaries

Existing user profiles are read without altering their fields; new Firebase users get a compatible `users_new` profile. Duty membership stores the trusted company association separately, so editing a shared profile cannot grant access to another company. A company mismatch fails closed for administrator review.

Duty administrators are checked against the current Firebase custom claim on every request. Users cannot approve or edit their own sessions. Shared account password changes affect all apps and revoke existing refresh tokens; the UI explains this explicitly.

Report state `sent` means Resend accepted the email, not confirmed inbox delivery. The scheduled cutoff/report worker is deployed and enabled in `europe-west1`, running every minute; pending/failed reports can also be retried in Administration. See `docs/automatic-checkout.md`. No test email is sent to real line managers during development checks.

## Automatic checkout

The default cutoff is 7pm in the checked-in station’s local time, with per-user line-manager overrides. Late check-ins are blocked. Automatic sessions remain **Pending actual checkout** until the user or manager records the actual finish time; both receive automatic and corrected email notifications. See [automatic checkout setup](docs/automatic-checkout.md) for deployment and behavior.

## Validation

`npm test` covers timezone boundaries, overnight splits, overlap/future-time rejection, fragmented totals, daily overtime, pending/rejected exclusion, CSV injection escaping, and role/company authorization policy.

Browser tests run against the production app on port 3100:

```sh
npm start -- --port 3100
npx playwright test
```

They use mock Firebase accounts and API records for authenticated UI workflows, and exercise the real API’s unauthenticated rejection. Configure `PLAYWRIGHT_CHROME_PATH` if Chrome is installed outside the default macOS location. Real check-in/approval/email delivery should be verified with designated accounts after managers are assigned; automated checks do not alter production duty records.

Implementation references: [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Firestore server-side access](https://firebase.google.com/docs/firestore/security/rules-structure), [Resend sending API](https://resend.com/docs/api-reference/emails/send-email).

Duty now uses a **12-hour daily threshold** and **8-hour rest before the next duty day**. Admins configure shared alert recipients, station time zones, and named station contacts. See [duty, rest, and station setup](docs/duty-rest-and-stations.md).
