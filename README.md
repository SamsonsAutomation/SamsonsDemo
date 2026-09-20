# Samson's Automation Unified v10.1

This version keeps everything built so far and adds a Samson-only **platform owner console**, per-business feature privileges, package/subscription state, terms acceptance, package upgrades/downgrades, cancellation handling, manual Cash App/Venmo payment tracking, and an optional recurring Venmo billing integration through PayPal's vault APIs.


## v10.1 manager quick-clock update

Business admins now have a dedicated **Quick Clock** roster at the top of the Employees tab. It lists every employee in that tenant with name, role, username, current clock status, last clock event, and a one-click **Clock in / Clock out** action.

The existing Time Clock page still contains historical punches and audited correction tools. The new quick-clock action does not replace history editing; it is for creating a live manager-approved punch immediately.

Manager punches are written as real `time_entries` and are audit-logged as **Manager clock-in override** or **Manager clock-out override**, so payroll calculations include them while the source remains distinguishable from employee GPS punches.

Tenant isolation remains server-side. The manager-clock endpoint looks up the employee with both the employee ID and the organization from the authenticated admin session. A browser cannot clock an employee belonging to another company by changing an ID.

**No new D1 migration is required for the v10 → v10.1 quick-clock UI update.** If you are upgrading directly from v9, run `migration-v10.sql` once as described below.

## Site structure

- `/` — public Samson's Automation marketing site + EmailJS inquiry form.
- `/terms.html` — general subscription/billing terms.
- `/demo/` — public fake-data product demo.
- `/app/admin.html` — authenticated company admin dashboard.
- `/app/employee.html` — authenticated employee mobile clock.
- `/app/setup.html` — protected new-business onboarding.
- `/owner/` — Samson-only platform owner console.
- `/owner/setup.html` — one-time platform-owner account setup.
- `/worker/` — Cloudflare Worker + D1 schema/migrations.

## Important payment reality

The software intentionally does **not** pretend Cash App can be used for unattended recurring monthly charges. Square's Cash App Pay APIs do not allow a buyer's Cash App account to be stored on file for future charges, and Square subscription checkout does not support Cash App Pay for subscription payments.

Therefore v10 supports:

- **Automatic recurring monthly billing:** Venmo through a securely vaulted PayPal payment token, once PayPal enables PayPal/Venmo vaulting on the merchant account.
- **Manual Cash App payment:** exact amount + configured cashtag/link, with Samson confirming receipt in the Owner Console before package access activates.
- **Manual Venmo payment:** exact amount + configured handle, with Samson confirming receipt.

Automatic Venmo funds settle to the **PayPal Business merchant account represented by the Worker credentials**. For security, the PayPal client secret is never editable in the web dashboard. Changing the true automatic-payment merchant account requires replacing the Worker secrets. The Owner Console can change the Cash App/Venmo handles used for manual payments and the merchant display label.

## Package defaults

The database migration seeds these packages:

| Package | Monthly | Included |
|---|---:|---|
| Timekeeping | $49 | Timekeeping + Mobile Clocking |
| Payroll Workflow | $59 | Manager Timekeeping + Payroll Ready |
| Lead Management | $89 | Lead Management |
| Timekeeping + Payroll | $99 | Timekeeping + Mobile Clocking + Payroll Ready |
| Leads + Timekeeping | $119 | Leads + Timekeeping + Mobile Clocking |
| Leads + Payroll | $119 | Leads + Manager Timekeeping + Payroll Ready |
| Complete Operations | $169 | All four feature switches |

The platform-owner dashboard can manually enable/disable **Timekeeping, Payroll, Mobile Clocking, and Lead Management** for any business independently of these package defaults.

## Security / tenant isolation

Client-protected endpoints still never trust an `organization_id` sent by the browser. The Worker gets the organization from the authenticated session and scopes all employee, lead, time, payroll, settings, billing, and subscription records to that organization.

The Samson-only Owner Console uses a separate `platform_admins` / `platform_sessions` authentication system. This is the only UI intentionally allowed to query across organizations.

Feature privileges are enforced **server-side**. Hiding a tab is only a convenience; calling a disabled feature's endpoint directly also returns `403`.

Passwords and employee PINs remain PBKDF2-SHA256 hashes with random salts plus the server-only `PIN_PEPPER`. Raw credentials are not stored.

## Upgrade from your current working database

### 1. Back up first

Before running a production migration, export/backup D1 from the Cloudflare dashboard or Wrangler.

### 2. Copy your Wrangler config

The ZIP contains `worker/wrangler.toml.example`. Keep using your working `wrangler.toml`, but add the v10 items shown below.

Your D1 binding remains:

```toml
[[d1_databases]]
binding = "DB"
database_name = "samsons-timeclock"
database_id = "YOUR_EXISTING_DATABASE_ID"
```

Add PayPal environment mode and the hourly billing cron:

```toml
[vars]
ALLOWED_ORIGINS = "https://samsonsautomation.github.io,http://localhost:5500,http://127.0.0.1:5500"
SESSION_HOURS = "12"
PAYPAL_ENV = "sandbox"

[triggers]
crons = ["17 * * * *"]
```

If your existing `wrangler.toml` already has `[vars]`, merge the values; do not create two `[vars]` sections.

### 3. Install dependencies

From the `worker` folder:

```powershell
npm install
npx wrangler whoami
```

### 4. If you are upgrading from v9, run the v10 migration ONCE

```powershell
npx wrangler d1 execute samsons-timeclock --remote --file=./migration-v10.sql
```

Do **not** run `migration-v10.sql` twice because it contains `ALTER TABLE ... ADD COLUMN` statements.

Existing v9 businesses are given access to the four existing modules during migration so the update does not unexpectedly remove working features. New businesses created after v10 start with no paid feature access until a package is purchased or Samson grants privileges.

If your remote D1 database already has the v10 billing/platform tables because you previously deployed v10, **skip this migration entirely**. The v10.1 quick-clock improvement requires only frontend/Worker deployment, not schema changes.

### 5. Create the platform-owner setup secret

```powershell
npx wrangler secret put PLATFORM_BOOTSTRAP_KEY
```

Use a long random value and save it in your password manager. It is used one time to create the Samson platform-owner account.

Your existing secrets remain:

```text
BOOTSTRAP_KEY
PIN_PEPPER
```

### 6. Deploy the Worker

```powershell
npx wrangler deploy
```

Confirm:

```text
https://samsons-timeclock-api.samsons-worker.workers.dev/api/health
```

It should report version `v10-platform-billing`.

### 7. Push the frontend to GitHub Pages

Replace the contents of the GitHub Pages repository with the contents of this v10.1 folder, commit, and push.

Do not upload `node_modules` or any secret files.

## Create your Owner Console account

After Worker + frontend deployment, visit:

```text
https://samsonsautomation.github.io/SamsonsAutomation/owner/setup.html
```

Enter:

- `PLATFORM_BOOTSTRAP_KEY`
- your display name
- your chosen owner username
- a strong password (10+ characters; longer recommended)

The setup endpoint refuses to create another owner after one platform-admin account already exists.

Then use:

```text
https://samsonsautomation.github.io/SamsonsAutomation/owner/
```

From this dashboard you can:

- see every business and tenant code;
- see active employee count;
- see current subscription/package/monthly amount;
- manually turn Timekeeping on/off;
- manually turn Payroll Ready on/off;
- manually turn Mobile Clocking on/off;
- manually turn Lead Management on/off;
- confirm pending manual Cash App/Venmo payments;
- update Cash App and manual Venmo display handles;
- see whether automatic Venmo billing credentials are configured.

## Company billing flow

Company admins now have a **Plan & Billing** tab.

When a package is selected, the customer sees:

- package name;
- exact monthly recurring price;
- included features;
- amount due immediately;
- whether the change is immediate or next-renewal;
- cancellation terms;
- a checkbox stating that the administrator accepts the terms and authorizes payment.

That exact package name, price, feature set, terms version, authorization text, user, and timestamp are written to `terms_acceptances`.

### Upgrades

If an active client paid $49 for the current month and upgrades to $169, the immediate amount due is:

```text
$169 - $49 = $120
```

After successful payment, access changes immediately and later renewals are $169/month.

This intentionally follows the model you requested: the amount already paid in the current billing period is credited against the full price of the upgrade. It is **not** day-by-day proration.

### Downgrades

A lower-priced package has no immediate charge/refund. It is stored as `pending_package_id` and takes effect at the next renewal.

### Cancellation

When a client presses Cancel Renewal:

- `auto_renew` is turned off immediately;
- the scheduler excludes that subscription from future automatic charges;
- current paid access remains through `current_period_end`;
- when the period expires, the subscription is marked canceled and package entitlements are turned off.

The displayed/accepted terms state that cancellation at least 24 hours before the scheduled renewal guarantees no further charge. The software actually turns auto-renew off as soon as cancellation is recorded, which is stricter than that minimum promise.

## Automatic Venmo recurring billing setup

### Important eligibility

PayPal must approve your business account for saving PayPal/Venmo payment methods. Venmo vaulting is US-only and Venmo support in PayPal's sandbox is limited, so final Venmo testing may require the live environment/account approval.

In the PayPal Developer Dashboard:

1. Create/select your production REST app.
2. Enable **Save payment methods** / vaulting.
3. Enable PayPal and Venmo payment methods where available.
4. Complete any merchant eligibility review PayPal requests.

### Add Worker secrets

From `worker`:

```powershell
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
```

For production webhooks also create a webhook in PayPal pointed at:

```text
https://samsons-timeclock-api.samsons-worker.workers.dev/api/paypal/webhook
```

Subscribe at minimum to the payment-token-created event used by your vault integration, then store the webhook ID:

```powershell
npx wrangler secret put PAYPAL_WEBHOOK_ID
```

### Sandbox vs live

During development:

```toml
PAYPAL_ENV = "sandbox"
```

When your live account is approved and you have thoroughly tested the integration, use:

```toml
PAYPAL_ENV = "live"
```

Then redeploy:

```powershell
npx wrangler deploy
```

Never put the PayPal client secret in `app/config.js`, GitHub, or browser JavaScript.

### How the automatic billing flow works

1. Client selects a package and accepts the exact billing terms.
2. The Worker calculates the immediate amount due.
3. For a first automatic Venmo payment, the Worker creates a PayPal/Venmo approval order that requests permission to save the Venmo method for recurring prepaid charges.
4. Venmo/PayPal handles payer approval.
5. The Worker captures the approved initial payment and stores only the provider's vaulted token/customer ID, never the customer's Venmo password/account credentials.
6. Cloudflare's hourly cron checks subscriptions whose `next_charge_at` is due.
7. Only active, auto-renewing, non-canceled subscriptions are considered.
8. The saved token is charged for the agreed monthly amount.
9. A successful renewal advances the paid period by one month.
10. A failed renewal is marked `past_due` and its next retry is moved 24 hours ahead instead of retrying constantly.

## Cash App

The Owner Console can set the manual Cash App cashtag/link. A company can select Manual Cash App at checkout and the system records an exact pending amount. Access does not activate until you open the business in the Owner Console and click **Mark paid**.

This is deliberately manual. Do not advertise Cash App as an auto-renew method in this build.

## Changing where payments go

### Manual Cash App / manual Venmo

Open:

```text
/owner/ → Billing Settings
```

Change the handles and save. New manual payment instructions use those values.

### Automatic Venmo

Automatic Venmo settlement belongs to the PayPal Business merchant represented by `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.

Changing that destination requires replacing the Worker secrets with credentials for the other approved merchant account and redeploying. The browser dashboard intentionally cannot modify secrets that control where unattended recurring charges settle.

## New-business onboarding process

A repeatable client onboarding flow is:

1. Use `/app/setup.html` with `BOOTSTRAP_KEY` to create the business and first admin.
2. Use a recognizable tenant code, for example `klein-electric`.
3. New v10/v10.1 tenants start with no paid modules enabled.
4. Have the owner sign into `/app/admin.html?company=klein-electric`.
5. They open **Plan & Billing** and select/authorize a package, or you manually grant trial/custom access from `/owner/`.
6. Once Timekeeping/Mobile Clocking is enabled, the manager can create employee accounts.
7. The **Employees** tab immediately shows the full company roster and the Quick Clock action. A manager can clock an employee in or out with one click; the action is audit-logged and feeds payroll automatically.
8. Employee credentials are generated once; only hashes are stored afterward.
9. The manager configures GPS/geofence settings if Mobile Clocking is included.
10. The employee receives the company-specific mobile portal link.
11. Historical punches remain editable from **Time Clock** with a required correction reason, so manual live punches and later corrections stay separate and auditable.
12. For custom contracts or complimentary access, use Owner Console privilege switches instead of editing the database by hand.

## Scale / performance behavior

The tenant-scaling design from v9 remains:

- client APIs derive the organization from the authenticated session;
- no client list query reads every company's data;
- leads are cursor-paginated;
- payroll and time queries are date-range constrained;
- organization/date/status indexes narrow the D1 scans;
- overview returns aggregates and small previews;
- billing scheduler processes due subscriptions in bounded batches;
- the Owner Console is the only cross-tenant area and its business list is capped;
- adding business #100 does not make business #1 download business #2–#100's records.

Before very large production volume, add Cloudflare rate limiting/WAF policies, automated D1 backups/exports, structured error monitoring, billing retry limits/dunning emails, and provider-specific reconciliation reports.

## Files that must never contain secrets

Do not put secrets in:

- `app/config.js`
- HTML files
- client JavaScript
- GitHub commits
- `wrangler.toml` if the repository is public

Use `npx wrangler secret put ...` for credentials.

## Legal note

`terms.html` and the checkout authorization are a practical starting structure, not legal advice. Before relying on the terms for a commercial subscription business, have a Maine/US attorney review them, especially cancellation, refunds, dispute handling, privacy/GPS, and recurring-payment authorization language.
