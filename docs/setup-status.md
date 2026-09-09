# Setup status

Completed in this workspace:

- Connected the existing Firebase project using the supplied server credentials.
- Verified the user-published Firestore rules match `firestore.rules` before initializing memberships.
- Created 116 separate DutyTime memberships for the existing unique users. Shared profiles were not edited or deleted; canonical UID documents resolve the two duplicate legacy mappings.
- Granted `duty_time_admin: true` to the explicitly selected account, `david@acuvera.com`, preserving existing custom claims.
- Wired report delivery to `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Resend identifies the supplied key as sending-only. Its permission does not allow checking domain verification; no test email was sent.
- Production build and TypeScript checks passed. Twelve unit tests and four browser tests passed. Browser account workflows use mock data; unauthenticated API rejection exercises the real local server.
- Dependency audit found zero vulnerabilities after the compatible dependency overrides.
- Checked compiled client assets: no supplied service-account private key or Resend API key was present.

Next, sign in as the administrator and use Administration → Users to mark line managers and assign each member's managers. Verify a real check-in/check-out with designated accounts and confirm its Resend report reaches the intended managers. Report failures are retained under Administration → Reports.

The final browser rerun was not completed: automatic approval review blocked restarting the temporary local verification server because the account usage limit was reached. Earlier browser tests and the final production build had passed. No live duty sessions or test emails were created during validation.
