# Continue development on a new computer

The `migrate` branch preserves the current development snapshot. It includes the
local page formatting and removal of the in-app User guide/Admin manual navigation.
Review that removal before merging this branch into `main`; the manual files still
exist. The production fixes already committed to `main` are included here too.

## Restore the workspace

Install Git and Node.js 22.12 or newer within the Node.js 22 release line, with npm.
Set up GitHub SSH access for the new computer, then run:

```sh
git clone --branch migrate git@github.com:skylurk/duty-time.git
cd duty-time
npm ci
npm --prefix functions ci
```

Transfer `.env.local` from the old computer to the project root using a secure
file transfer or password manager. This file contains Firebase server credentials
and Resend configuration and is intentionally excluded from GitHub. Preserve its
contents exactly, including the service-account JSON. If you use local environment
files under `functions/`, transfer those separately too.

```sh
npm run dev
```

Open http://localhost:3000. This configuration connects to the existing Firebase
project and its live data. There is no local database to copy, and no need to rerun
membership setup, contact migrations, rule deployment, or administrator grants.
Existing Vercel deployments and scheduled Firebase functions continue running
independently of the old computer.

## Check the restored setup

```sh
npm test
npm run build
node --no-experimental-require-module scripts/check-production-api.cjs
npm --prefix functions run build
```

Dependencies and generated output (`node_modules`, `.next`, `.next-dev`, and
`functions/lib`) are rebuilt locally; they do not need to be copied.
Next.js regenerates `next-env.d.ts` for the active build directory.

For future Firebase deployments, install the Firebase CLI and sign in on the new
computer. CLI login sessions and SSH private keys are not stored in this repository.
Keep Vercel's production branch set to `main`; merge reviewed changes there when
they are ready for production.
