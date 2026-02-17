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

## Mobile Setup

1. `cd /Users/gkarunes/Documents/New project/mobile`
2. `npm install`
3. Optional: set API URL for physical device:
   - `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:4000 npm start`
4. `npm start`

Default API behavior:
- Android emulator: `http://10.0.2.2:4000`
- iOS simulator/web: `http://localhost:4000`

## Implemented Features

- Mobile-number account creation and login (MPIN based)
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
- `GET /api/auth/me`
- `POST /api/auth/logout`
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
