# Worthio Smoke Test Checklist

Use this checklist for preprod smoke testing against:

- Backend: `https://portofoliotracker-preprod.onrender.com`
- Mobile: local Android build / installed APK / physical device build

## Preconditions

- Render deploy is live and `/health` returns `200`
- Mobile app is pointed to Render preprod, not local `10.0.2.2:4000`
- Test account is available
- If testing payments, use the intended preprod payment environment

## 1. Backend Reachability

- Open `/health`
- Confirm response is `200`
- Confirm app can load without connection or session errors

## 2. Auth

- Fresh install launch
- Splash -> auth handoff looks correct
- Register flow works
- Login flow works
- OTP errors are shown cleanly
- Privacy modal opens and closes correctly
- Biometric button appears only on login flow, not register

## 3. Dashboard

- Dashboard loads after login
- Net worth summary renders
- Portfolio Highlights segmented control works:
  - `Allocation`
  - `Targets`
  - `Trend`
- Net Worth Trend opens on Basic plan

## 4. Assets

- Add an asset successfully
- Asset list renders current assets
- Basic usage line is visible
- On Basic plan, asset cap behavior works
- Upgrade CTA opens Manage Plan when limit is hit

## 5. Liabilities

- Add liabilities successfully
- Liability list renders current liabilities
- Usage line is visible in `Current Liabilities`
- On Basic plan, 6th liability is blocked
- Upgrade CTA opens Manage Plan when limit is hit

## 6. Premium Locks

- Locked `Targets` opens premium modal
- Locked `Reminders` opens premium modal
- Locked `AI Insights` opens premium modal
- Premium modal actions work:
  - `Close`
  - `Go Premium`
- `Go Premium` opens Manage Plan

## 7. Manage Plan / Subscription

- `Manage Plan` screen opens correctly
- Header alignment is correct
- Current plan badge is visible
- Basic and Premium cards render correctly in dark mode
- Basic and Premium cards render correctly in light mode
- `Worthio Feature List` is visible
- `Net Worth Trend` is listed for both Basic and Premium
- `More Assets & Liabilities` is shown as one feature item

## 8. Checkout

- Start checkout from Manage Plan
- Cashfree page opens
- Cancelled checkout returns control to the app
- Checkout does not get stuck after cancel
- Back behavior does not trap the user in checkout

## 9. Reminders

- Bottom nav label stays one line
- Premium badge is visible on locked reminder nav item
- Locked reminder tap opens premium modal

## 10. Account Page

- Account page loads in both dark and light mode
- All Account page buttons are readable in dark mode
- `Worthio Support` label is correct
- Subscription section opens Manage Plan correctly
- Start Tour works
- Legal links open correctly:
  - Privacy
  - Terms
- Data rights actions render correctly
- Logout works
- Biometric enable/disable controls behave correctly
- MPIN reset / OTP reset UI opens correctly if available

## 11. Navigation / Visual Consistency

- Bottom nav icons and labels are clearly visible
- Intro cards align to full content width
- Buttons follow the same rounded rectangle style across screens
- Login page layout is correct in:
  - fresh
  - returning
- Home page logo placement is correct

## 12. Optional Scripted API Smoke

For backend API sanity checks, use:

```bash
bash scripts/render-smoke.sh
```

Optional OTP-only run:

```bash
TEST_MOBILE=9999999999 OTP_ONLY=1 RUN_OTP=1 bash scripts/render-smoke.sh
```

## Sign-off

Mark smoke complete only if:

- auth works
- assets/liabilities work
- Basic limits are enforced
- Net Worth Trend works on Basic
- premium locks route correctly
- subscription flow and cancel flow behave correctly
- Account page actions are readable and functional
