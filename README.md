# Samson's Automation Demo v6 — secure employee clock + GPS

This project contains two layers:

1. **The existing public sales demo** (`index.html`) for leads, timekeeping, and payroll-ready totals.
2. **A real shared employee clock starter** (`admin.html` + `employee.html`) backed by a Cloudflare Worker + D1 database.

The secure clock is intentionally **not implemented with localStorage**. A phone and a manager's PC need shared server-side data, and employee credentials must not live in public GitHub JavaScript.

## What the secure clock now supports

- Employee login from a phone using company link + username + 5-digit PIN.
- Every clock-in and clock-out requires the employee to be signed in **and** grant browser GPS access.
- Manager can turn the location boundary on/off.
- Even with the boundary off, GPS is still required and recorded at the clock event.
- Manager can set the approved latitude/longitude and allowed radius in meters.
- Employee is rejected if the GPS boundary is enabled and the clock event is outside the radius.
- Boss/admin can add, edit, remove/restore employees, edit usernames, and set/reset employee PINs.
- Initial username is generated from a shortened name (for example `Chris Walker` -> `cwalker`; collisions get a number).
- Initial PIN is a random 5-digit number and is displayed **once** after creation/reset.
- PINs/passwords are never stored in plaintext. The Worker stores a salted PBKDF2-SHA256 hash using a server-only pepper.
- Five failed logins temporarily lock the account for 10 minutes.
- Employees can change their own 5-digit PIN after signing in.
- Removing an employee disables their login but preserves historical time entries.
- GPS is collected only on Clock In / Clock Out, not continuously.

## Important security behavior

Because PINs are hashed, the boss cannot later "view" an employee's existing PIN. That would require storing a recoverable/plaintext secret, which this project deliberately does not do. The boss can see/edit the username and can **reset or set a new PIN**.

A 5-digit PIN has limited entropy. This starter mitigates that with server-side hashing, a secret pepper, session authentication, and temporary lockout after failed attempts. For a larger deployment, consider 6+ digits, MFA, or device verification.

## Public demo test

The original demo still runs by opening `index.html` or using Live Server. The secure clock pages will show a setup warning until you configure the backend.

---

# Deploy the secure backend (Cloudflare Worker + D1)

Cloudflare's D1 database is bound to the Worker and queried server-side. Your GitHub Pages site only receives the public Worker URL; it never receives the database or server secrets.

## 1. Install Node.js

You already need Node only for deploying the backend. From the `worker` folder:

```bash
npm install
```

## 2. Sign in to Cloudflare Wrangler

```bash
npx wrangler login
```

## 3. Create the D1 database

```bash
npx wrangler d1 create samsons-timeclock
```

Wrangler prints a `database_id`.

Copy `worker/wrangler.toml.example` to:

```text
worker/wrangler.toml
```

Put the database ID into the D1 section.

## 4. Add two server-only secrets

Run these from the `worker` folder:

```bash
npx wrangler secret put BOOTSTRAP_KEY
npx wrangler secret put PIN_PEPPER
```

For each prompt, paste a long random value (30+ random characters is good). **Never place either secret in GitHub or `config.js`.**

`BOOTSTRAP_KEY` authorizes creation of a company/boss account. `PIN_PEPPER` is mixed into every credential hash and stays only on the server.

## 5. Create the database tables

```bash
npx wrangler d1 execute samsons-timeclock --remote --file=./schema.sql
```

## 6. Deploy the Worker

```bash
npx wrangler deploy
```

Cloudflare returns a URL similar to:

```text
https://samsons-timeclock-api.YOUR-SUBDOMAIN.workers.dev
```

## 7. Put only the public Worker URL in `config.js`

Edit:

```js
window.SAMSONS_CLOCK_CONFIG = {
  API_BASE_URL: "https://samsons-timeclock-api.YOUR-SUBDOMAIN.workers.dev",
  COMPANY_SLUG: "samsons-demo"
};
```

The Worker URL is public by design. The `BOOTSTRAP_KEY`, `PIN_PEPPER`, and database binding are the secrets and remain server-side.

## 8. Upload the updated site files to GitHub Pages

Copy the contents of this project into your existing demo repository, commit, and push.

## 9. Create the first company/boss login

Open:

```text
https://YOUR-GITHUB-PAGES-URL/setup.html
```

Enter the `BOOTSTRAP_KEY` you created in step 4, then choose:

- company name
- company code (`samsons-demo`, `acme-electric`, etc.)
- boss/admin name
- admin username
- strong admin password (10+ characters)

The setup key is not saved by the page.

## 10. Add employees

Sign into:

```text
admin.html?company=YOUR-COMPANY-CODE
```

Press **Add employee**. The backend creates a shortened username plus a random 5-digit PIN. Copy the one-time credentials before closing the window.

## 11. Set the worksite GPS rule

In the manager console:

1. Press **Use my current location** while standing at the desired site, or enter coordinates manually.
2. Set a radius such as 100–200 meters.
3. Turn on **Require employees to be inside this location boundary**.
4. Save.

If the boundary is off, employees still have to grant GPS and their clock event location is still recorded; the API simply does not reject them for being outside a radius.

## 12. Test from a phone

Use the employee portal link shown in the manager console. It looks like:

```text
https://YOUR-GITHUB-PAGES-URL/employee.html?company=YOUR-COMPANY-CODE
```

On the phone:

1. Sign in with the generated employee username and PIN.
2. Press **Clock In**.
3. The phone/browser will request Location permission.
4. Allow it.
5. If the geofence is enabled, the server checks the GPS coordinates against the configured radius.
6. Clock out the same way.

GitHub Pages uses HTTPS, which is required by modern browsers for geolocation.

## CORS / custom domain

`worker/wrangler.toml` includes:

```toml
ALLOWED_ORIGINS = "https://samsonsautomation.github.io,http://localhost:5500,http://127.0.0.1:5500"
```

If you later move the demo to a custom domain, add its **origin** (for example `https://demo.samsonsautomation.com`) to that comma-separated value and deploy the Worker again.

## Privacy note

Employee location is sensitive. The current design collects a location only when an employee intentionally presses Clock In or Clock Out; it does not continuously track them. A production customer should clearly disclose this policy to employees and decide an appropriate retention policy for location records.

## What still belongs in a later production phase

- Boss/admin password change/recovery flow
- Multiple manager accounts and permissions
- Audit log for manager edits
- Pay-period configuration and approved timesheet locking
- Manual clock corrections with a reason + audit history
- Map preview of clock events
- Custom-domain same-site session cookies instead of browser session storage
- Stronger PIN/MFA policy for larger deployments
