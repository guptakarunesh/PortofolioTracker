# Pre-Production Testing Setup (Cloud + Physical Devices)

This setup keeps development local, but moves testing to a cloud backend so physical phone testing does not depend on laptop networking.

## 1) Deploy Backend to Render (Free)

This repo includes `render.yaml` for one-click setup.

1. Push code to GitHub.
2. In Render, create service from repo.
3. Render will detect `render.yaml` and create:
   - `networth-manager-backend-preprod`
4. In Render service env vars, set secrets:
   - `FIREBASE_WEB_API_KEY`
   - `CASHFREE_APP_ID`
   - `CASHFREE_SECRET_KEY`
   - optional: `CASHFREE_NOTIFY_URL`
   - optional invoice fields:
     - `RECEIPT_SUPPLIER_NAME`
     - `RECEIPT_SUPPLIER_GSTIN`
     - `RECEIPT_SUPPLIER_ADDRESS`
     - `RECEIPT_SUPPLIER_STATE_CODE`
     - `RECEIPT_SAC_CODE`

Health check:

`https://<your-render-domain>/health`

## 2) Use Cloud Backend in Local Expo Go

From `mobile`:

```bash
EXPO_PUBLIC_API_BASE_URL="https://<your-render-domain>" npm run start:preprod
```

Scan QR in Expo Go on iPhone/Android.

## 3) Build Internal Test App (Recommended for reliable phone testing)

From `mobile`:

```bash
npx eas build --platform ios --profile preprod
npx eas build --platform android --profile preprod
```

Before building, replace placeholder in `mobile/eas.json`:

`EXPO_PUBLIC_API_BASE_URL=https://your-backend-preprod.onrender.com`

## 4) Notes

- Render free instances can sleep; first request may be slow.
- `DB_PATH` in `render.yaml` is `/tmp/portfolio.db` (ephemeral).
- For persistent preprod data, move DB to managed Postgres later.
