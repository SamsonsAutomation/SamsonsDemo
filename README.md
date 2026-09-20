# Samson's Automation Unified v8

This project combines all three branches in one GitHub Pages repository:

1. `/` — public Samson's Automation marketing site + EmailJS inquiry form.
2. `/demo/` — safe public demo using browser-local fake data only.
3. `/app/` — secure multi-tenant company admin + employee portal backed by Cloudflare Worker + D1.

## Security / tenant isolation
Protected API endpoints never accept an `organization_id` from the browser. The Worker authenticates the session, derives the organization from the signed-in user, and every protected resource query includes that organization ID. Resource lookups use both the resource ID **and** the authenticated organization ID. This is the primary control preventing one company from retrieving another company's leads, employees, clock entries, payroll summaries, or settings.

Employee sessions can access only `/api/me`, their own clock/PIN endpoints, and their own recent entries. Admin endpoints require `role=admin`.

Credentials are PBKDF2-SHA256 hashed with a per-user random salt and server-only `PIN_PEPPER`. The Worker uses 100,000 PBKDF2 iterations because Cloudflare Workers Web Crypto rejects higher PBKDF2 iteration counts in this runtime. Employee PINs are never stored or returned after initial creation/reset.

## Updating from the working Unified v7 build
If Unified v7 is already working with your live D1 database, **no database migration is required for v8**. Manager clock-in/out uses the existing time-entry and audit tables.

From the `worker` folder:

```powershell
npm install
npx wrangler deploy
```

Then replace/push the GitHub Pages frontend files. Confirm the backend at:

`https://samsons-timeclock-api.samsons-worker.workers.dev/api/health`

The response should include `version: "v8-manager-clock"`. Your existing `BOOTSTRAP_KEY`, `PIN_PEPPER`, D1 database, businesses, employees, leads, and time records remain intact.

### If you are upgrading directly from v6
Run the existing v7 migration once before deploying v8:

```powershell
npm install
npx wrangler d1 execute samsons-timeclock --remote --file=./migration-v7.sql
npx wrangler deploy
```

## Fresh database instead
For a new D1 database, run `schema.sql` instead of the migration:

```powershell
npx wrangler d1 execute samsons-timeclock --remote --file=./schema.sql
```

## GitHub Pages
Upload the **contents** of this folder to the root of your `SamsonsAutomation` repository. GitHub Pages should remain `main / (root)`.

URLs will be approximately:

- Main site: `https://samsonsautomation.github.io/SamsonsAutomation/`
- Demo: `https://samsonsautomation.github.io/SamsonsAutomation/demo/`
- Company admin: `https://samsonsautomation.github.io/SamsonsAutomation/app/admin.html`
- Employee clock: `https://samsonsautomation.github.io/SamsonsAutomation/app/employee.html`
- Internal onboarding: `https://samsonsautomation.github.io/SamsonsAutomation/app/setup.html`

`app/config.js` is already pointed at your current public Worker URL. A Worker URL is not a secret.

## Onboarding a new business
Use the protected setup page with your server-side `BOOTSTRAP_KEY` to create each business. Give each one a human-readable unique code such as `klein-electric` or `smith-landscaping`.

The bootstrap call creates a new organization and its first admin. From that point the company's manager creates employees and receives each generated username/PIN once.

Do **not** make a separate Worker or database for each business. The organization/tenant ID separates them inside one service. Indexes on organization + date/status keep queries narrow as the number of companies grows.

## Performance design
- Admin tabs fetch data only when opened instead of downloading every company dataset at login.
- Lead results are capped and cursor-paginated.
- Time-entry and payroll queries require a date range and reject ranges over 45 days.
- SQL indexes begin with `organization_id` for lead, time, and audit access.
- The browser never downloads records belonging to other businesses.
- Overview uses database aggregates and small previews rather than loading full tables.

This is appropriate for an early production pilot. As volume grows, add scheduled cleanup of expired sessions, Cloudflare rate limiting/WAF rules, automated backups/export, and stronger observability.


## Manager clock overrides
Admins can now clock an individual employee in or out from either **Employees** or **Time Clock**. The clock button stays in the same position and changes label based on the employee's current state.

Manager actions bypass the employee GPS requirement because they are explicit administrative overrides. They are written to `time_entry_audit` with the authenticated admin user ID and surfaced in the Time Clock table as **Manager clock-in** and/or **Manager clock-out**. Payroll reads the resulting real time entry normally.

The endpoint still enforces tenant isolation: the employee lookup, open time-entry lookup, update, and audit row are all scoped to the organization derived from the signed-in admin session. An admin cannot clock an employee belonging to another company by changing an ID in the browser.

## Payroll note
Payroll Ready calculates recorded hours, overtime using the configured threshold, hourly rate, and estimated gross wages. It deliberately does **not** perform tax withholding, filings, deductions, benefits, or direct deposit. Export the CSV to the client's actual payroll provider.

## EmailJS
The public root site retains the existing EmailJS IDs and customer auto-reply workflow. No Gmail password is stored in this repository.
