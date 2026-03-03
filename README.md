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

### Backend Tests

- Run all backend tests: `npm test` (in `/backend`)
- Tests use an isolated SQLite database via `DB_PATH` and mock OTP echo via `OTP_TEST_ECHO=1`.

### OTP Login Configuration (India)

Configure OTP delivery via environment variables (default provider is `msg91_v5`):
- `OTP_PROVIDER=msg91_v5` (or `msg91_legacy`, or `mock` for local testing)
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

## Demo Account (after seeding)

- Mobile: `9999999999`
- MPIN: `1234`

# PortofolioTracker
Portofolio Tracker
