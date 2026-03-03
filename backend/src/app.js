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

app.use('/legal', legalRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/subscription', requireAuth, attachAccountContext, subscriptionRoutes);

app.use('/api/dashboard', requireAuth, attachAccountContext, dashboardRoutes);
app.use('/api/assets', requireAuth, attachAccountContext, assetRoutes);
app.use('/api/liabilities', requireAuth, attachAccountContext, liabilityRoutes);
app.use('/api/reminders', requireAuth, attachAccountContext, reminderRoutes);
app.use('/api/market-rates', requireAuth, attachAccountContext, marketRatesRoutes);
app.use('/api/fx', requireAuth, attachAccountContext, fxRatesRoutes);
app.use('/api/performance', requireAuth, attachAccountContext, performanceRoutes);
app.use('/api/family', requireAuth, attachAccountContext, familyRoutes);
app.use('/api/settings', requireAuth, settingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/user', requireAuth, userRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
