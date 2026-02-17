import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { db } from './lib/db.js';
import dashboardRoutes from './routes/dashboard.js';
import assetRoutes from './routes/assets.js';
import liabilityRoutes from './routes/liabilities.js';
import transactionRoutes from './routes/transactions.js';
import reminderRoutes from './routes/reminders.js';
import settingRoutes from './routes/settings.js';
import marketRatesRoutes from './routes/marketRates.js';
import authRoutes from './routes/auth.js';
import requireAuth from './middleware/requireAuth.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  const counts = {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    assets: db.prepare('SELECT COUNT(*) as c FROM assets').get().c,
    liabilities: db.prepare('SELECT COUNT(*) as c FROM liabilities').get().c,
    reminders: db.prepare('SELECT COUNT(*) as c FROM reminders').get().c
  };
  res.json({ ok: true, counts });
});

app.use('/api/auth', authRoutes);

app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/assets', requireAuth, assetRoutes);
app.use('/api/liabilities', requireAuth, liabilityRoutes);
app.use('/api/transactions', requireAuth, transactionRoutes);
app.use('/api/reminders', requireAuth, reminderRoutes);
app.use('/api/settings', requireAuth, settingRoutes);
app.use('/api/market-rates', requireAuth, marketRatesRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
