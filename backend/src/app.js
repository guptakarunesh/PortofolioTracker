import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { db } from './lib/db.js';
import dashboardRoutes from './routes/dashboard.js';
import assetRoutes from './routes/assets.js';
import liabilityRoutes from './routes/liabilities.js';
import reminderRoutes from './routes/reminders.js';
import settingRoutes from './routes/settings.js';
import marketRatesRoutes from './routes/marketRates.js';
import fxRatesRoutes from './routes/fxRates.js';
import performanceRoutes from './routes/performance.js';
import reportRoutes from './routes/reports.js';
import familyRoutes from './routes/family.js';
import legalRoutes from './routes/legal.js';
import userRoutes from './routes/user.js';
import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import aiRoutes from './routes/ai.js';
import notificationRoutes from './routes/notifications.js';
import { supportApiRouter, supportConsoleRouter } from './routes/support.js';
import requireAuth from './middleware/requireAuth.js';
import { attachAccountContext } from './middleware/accountAccess.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use((req, res, next) => {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';

  if (process.env.NODE_ENV === 'production' && !isLocal && proto !== 'https') {
    return res.status(426).json({ error: 'HTTPS is required' });
  }

  if (proto === 'https' || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return next();
});

app.get('/health', (_req, res) => {
  const counts = {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    assets: db.prepare('SELECT COUNT(*) as c FROM assets').get().c,
    liabilities: db.prepare('SELECT COUNT(*) as c FROM liabilities').get().c,
    reminders: db.prepare('SELECT COUNT(*) as c FROM reminders').get().c
  };
  res.json({ ok: true, counts });
});

app.get('/cashfree/checkout-page', (req, res) => {
  const sessionId = String(req.query?.session_id || '').trim();
  if (!sessionId) {
    return res.status(400).send('Missing session_id');
  }
  const env = String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
  const secureUrl =
    env === 'production' || env === 'prod'
      ? 'https://api.cashfree.com/pg/view/sessions/checkout'
      : 'https://sandbox.cashfree.com/pg/view/sessions/checkout';
  const sessionEscaped = sessionId
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cashfree Checkout</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background:#0b1020; color:#fff;">
    <p style="padding:16px; margin:0;">Redirecting to secure payment...</p>
    <form id="redirectForm" action="${secureUrl}" method="post">
      <input type="hidden" name="payment_session_id" value="${sessionEscaped}" />
      <input type="hidden" name="platform" value="iosx-react-native" />
    </form>
    <script>
      (function() {
        var form = document.getElementById('redirectForm');
        var meta = { userAgent: window.navigator.userAgent || '' };
        var sorted = Object.keys(meta).sort().reduce(function(out, key){ out[key] = meta[key]; return out; }, {});
        var browserMeta = btoa(JSON.stringify(sorted));
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'browser_meta';
        input.value = browserMeta;
        form.appendChild(input);
        form.submit();
      })();
    </script>
  </body>
</html>`);
});

app.get('/cashfree/return', (req, res) => {
  const appReturn = String(req.query?.app_return_url || '').trim();
  const orderId = String(req.query?.order_id || '').trim();
  const orderStatus = String(req.query?.order_status || '').trim();
  const plan = String(req.query?.plan || '').trim();
  if (!appReturn) {
    return res
      .status(200)
      .send('<html><body style="font-family:sans-serif;padding:16px;">Payment received. Return to app to continue.</body></html>');
  }
  let openUrl = appReturn;
  try {
    const sep = appReturn.includes('?') ? '&' : '?';
    openUrl =
      `${appReturn}${sep}` +
      `order_id=${encodeURIComponent(orderId)}` +
      `&order_status=${encodeURIComponent(orderStatus)}` +
      `&plan=${encodeURIComponent(plan)}`;
  } catch (_e) {
    openUrl = appReturn;
  }
  const safeOpenUrl = openUrl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safePayloadJson = JSON.stringify({
    type: 'cashfree_return',
    order_id: orderId,
    order_status: orderStatus,
    plan
  }).replace(/</g, '\\u003c');
  return res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Return To Networth Manager</title>
  </head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0b1020;color:#fff;padding:20px;">
    <h3 style="margin:0 0 10px;">Payment Response Received</h3>
    <p style="margin:0 0 14px;">Order ID: ${orderId || '-'}</p>
    <p style="margin:0 0 20px;">Status: ${orderStatus || '-'}</p>
    <a href="${safeOpenUrl}" style="display:inline-block;padding:10px 14px;background:#f3b219;color:#111;border-radius:8px;text-decoration:none;font-weight:700;">Return To App</a>
    <script>
      (function() {
        var payload = ${safePayloadJson};
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (_e) {}
        }
        setTimeout(function(){ window.location.href = "${safeOpenUrl}"; }, 500);
      })();
    </script>
  </body>
</html>`);
});

app.use('/legal', legalRoutes);
app.use('/support', supportConsoleRouter);
app.use('/api/support', supportApiRouter);
app.use('/api/auth', authRoutes);
app.use('/api/subscription', requireAuth, attachAccountContext, subscriptionRoutes);
app.use('/api/ai', requireAuth, attachAccountContext, aiRoutes);

app.use('/api/dashboard', requireAuth, attachAccountContext, dashboardRoutes);
app.use('/api/assets', requireAuth, attachAccountContext, assetRoutes);
app.use('/api/liabilities', requireAuth, attachAccountContext, liabilityRoutes);
app.use('/api/reminders', requireAuth, attachAccountContext, reminderRoutes);
app.use('/api/market-rates', requireAuth, attachAccountContext, marketRatesRoutes);
app.use('/api/fx', requireAuth, attachAccountContext, fxRatesRoutes);
app.use('/api/performance', requireAuth, attachAccountContext, performanceRoutes);
app.use('/api/family', requireAuth, attachAccountContext, familyRoutes);
app.use('/api/settings', requireAuth, settingRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/user', requireAuth, userRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
