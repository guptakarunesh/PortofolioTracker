# Indian Investment Portfolio Tracker App

Full-stack mobile app code for the Indian investment tracker project.

## Project Structure

- `/Users/gkarunes/Documents/New project/backend` - Express + SQLite API
- `/Users/gkarunes/Documents/New project/mobile` - Expo React Native mobile app
- `/Users/gkarunes/Documents/New project/Indian_Investment_Portfolio_Tracker.xlsx` - Excel tracker file

## Backend Setup

1. `cd /Users/gkarunes/Documents/New project/backend`
2. `npm install`
3. `npm run seed`
4. `npm run dev`

Backend runs on `http://localhost:4000`.

### Support Console (Admin)

Built-in support admins are seeded automatically:
- `Admin1 / Pass1`
- `Admin2 / Pass2`
- `Admin3 / Pass3`

Use `Forgot Password` in `/support` to generate reset code and set a new password.

Open support UI:
- `GET /support`

Support API base:
- `POST /api/support/auth/login`
- `POST /api/support/auth/forgot-password`
- `POST /api/support/auth/reset-password`
- `POST /api/support/auth/logout` (requires support bearer token)
- `GET /api/support/health` (requires support bearer token)
- `GET /api/support/users?query=...`
- `GET /api/support/users/:id/overview`
- `GET /api/support/users/:id/history`
- `GET /api/support/users/:id/agent-context`
- `POST /api/support/users/:id/actions`

### Backend Tests

- Run all backend tests: `npm test` (in `/backend`)
- Tests use an isolated SQLite database via `DB_PATH` and mock OTP echo via `OTP_TEST_ECHO=1`.

### OTP Login Configuration (India)

Configure OTP delivery via environment variables:
- `OTP_PROVIDER=firebase` (recommended) or `msg91_v5`, `msg91_legacy`, `gupshup_template`, `mock`
- For Firebase phone auth:
  - `FIREBASE_WEB_API_KEY=...`
  - Optional: `FIREBASE_TENANT_ID=...`
  - Optional: `FIREBASE_AUTH_BASE_URL=https://identitytoolkit.googleapis.com/v1`
  - Send `firebase_recaptcha_token` in OTP request payload (`/api/auth/otp/send`, `/api/auth/mpin/reset/request`, `/api/auth/security-pin/reset/request`)
  - Mobile client reCAPTCHA config (Expo) uses:
    - `EXPO_PUBLIC_FIREBASE_API_KEY`
    - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
    - `EXPO_PUBLIC_FIREBASE_APP_ID`
    - Optional: `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` (defaults to `<projectId>.firebaseapp.com`)
- `MSG91_AUTH_KEY=...`
- `MSG91_TEMPLATE_ID=...`
- Optional: `MSG91_SENDER_ID=...`
- For Gupshup template SMS (set `OTP_PROVIDER=gupshup_template`):
  - `GUPSHUP_API_KEY=...`
  - `GUPSHUP_USER_ID=...`
  - `GUPSHUP_TEMPLATE_ID=...`
  - `GUPSHUP_SENDER_ID=...`
- Optional: `OTP_EXPIRY_MINUTES=10`
- Optional: `OTP_RESEND_COOLDOWN_SECONDS=30`
- Optional: `OTP_MAX_ATTEMPTS=5`
- Optional: `OTP_LENGTH=6`
- Optional: `OTP_COUNTRY_CODE=91`

### Subscription Payments (Cashfree)

The app now supports Cashfree PG for subscription checkout.

Backend env (`backend/.env`):
- `PAYMENT_PROVIDER=cashfree`
- `CASHFREE_ENV=sandbox` (or `production`)
- `CASHFREE_APP_ID=...`
- `CASHFREE_SECRET_KEY=...`
- Optional: `CASHFREE_API_VERSION=2023-08-01`
- Optional: `CASHFREE_RETURN_URL=https://.../api/subscription/cashfree/return?order_id={order_id}`
- Optional: `CASHFREE_NOTIFY_URL=https://...` (webhook URL)

Flow:
- `POST /api/subscription/cashfree/order` creates an order and returns checkout URL.
- App opens Cashfree checkout in browser.
- App calls `POST /api/subscription/cashfree/verify` to confirm payment and activate plan.

## Mobile Setup

1. `cd /Users/gkarunes/Documents/New project/mobile`
2. `npm install`
3. Optional: set API URL for physical device:
   - `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:4000 npm start`
4. `npm start`

Default API behavior:
- Android emulator: `http://10.0.2.2:4000`
- iOS simulator/web: `http://localhost:4000`

### Mobile Tests

- Run all mobile tests: `npm test` (in `/mobile`)

## Implemented Features

- Mobile-number account creation and login (MPIN based)
- Family access sharing with read/write/admin roles (Premium only)
- Per-user data isolation (assets, liabilities, transactions, reminders, settings)
- Dashboard: total assets, liabilities, net worth, asset allocation
- Assets CRUD (create/list now; update/delete APIs available on backend)
- Liabilities CRUD (create/list now; update/delete APIs available on backend)
- Transactions logging
- Reminders with status updates
- Settings for market rates and personal goals
- SQLite persistence with seed data mapped to your investment categories

## API Endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET/POST/PUT/DELETE /api/family`
- `GET /api/family/access`
- `DELETE /api/family/invites/:id`
- `POST /api/family/invites/:id/resend`
- `GET /api/family/audit`
- `GET /api/dashboard/summary`
- `GET/POST/PUT/DELETE /api/assets`
- `GET/POST/PUT/DELETE /api/liabilities`
- `GET/POST/DELETE /api/transactions`
- `GET/POST/DELETE /api/reminders`
- `PATCH /api/reminders/:id/status`
- `GET/PUT /api/settings`
- `GET /api/ai/insights`

Note: `POST /api/auth/register` now requires a `country` field (used to set the preferred currency).

### AI Insights (Optional)

Set `OPENAI_API_KEY` on the backend (env var or `backend/.env`) to enable `/api/ai/insights`. The app will:
- Summarize your current portfolio allocation (educational only, not investment advice)
- Use OpenAI web search to surface recent macro/geopolitical context (may be incomplete/outdated)

Optional: set `OPENAI_MODEL` (defaults to `gpt-5`).

Example `backend/.env`:
```
OPENAI_API_KEY=sk-...redacted...
OPENAI_MODEL=gpt-5
```

## Demo Account (after seeding)

- Mobile: `9999999999`
- MPIN: `1234`

# PortofolioTracker
Portofolio Tracker
